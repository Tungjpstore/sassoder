import "server-only";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { loginWithPassword } from "@/services/auth-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { assertStaffOwnerMutationAllowed } from "@/services/staff-owner-boundary-service";
import type { SessionProfile } from "@/types/domain";

type StaffAppMemberRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  full_name: string;
  employee_code: string;
  employment_status: "active" | "suspended" | "resigned";
  archived_at: string | null;
  must_change_app_password: boolean;
  first_login_at: string | null;
  app_password_attempts: number | null;
  app_password_locked_until: string | null;
  app_password_last_failed_at: string | null;
  auth_revoked_at: string | null;
};

type StaffAppUserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF";
  restaurant_id: string;
  account_status: "active" | "blocked" | null;
};

type StaffAppRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  platform_status: "active" | "suspended" | "deleted" | null;
};

const STAFF_APP_PASSWORD_LOCK_MINUTES = 10;

async function requestContext() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: requestHeaders.get("cf-connecting-ip") || requestHeaders.get("x-real-ip") || forwardedFor || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || null
  };
}

export function normalizeStaffEmployeeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function createTemporaryStaffAppPassword() {
  return `LogiVN-${randomBytes(12).toString("base64url")}9aA`;
}

async function findStaffByEmployeeCode(employeeCode: string) {
  const supabase = createAdminSupabaseClient() as any;
  const normalizedCode = normalizeStaffEmployeeCode(employeeCode);

  const memberResult = await supabase
    .from("staff_members")
    .select("id,restaurant_id,user_id,full_name,employee_code,employment_status,archived_at,must_change_app_password,first_login_at,app_password_attempts,app_password_locked_until,app_password_last_failed_at,auth_revoked_at")
    .eq("employee_code", normalizedCode)
    .maybeSingle();

  if (memberResult.error) throw new AppError("Không kiểm tra được mã nhân viên.", 400);
  const member = memberResult.data as StaffAppMemberRow | null;
  if (!member) return { member: null, user: null, restaurant: null };

  const [userResult, restaurantResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,email,role,restaurant_id,account_status")
      .eq("id", member.user_id)
      .eq("restaurant_id", member.restaurant_id)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("id,name,slug,platform_status")
      .eq("id", member.restaurant_id)
      .maybeSingle()
  ]);

  if (userResult.error) throw new AppError("Không tải được tài khoản nhân viên.", 400);
  if (restaurantResult.error) throw new AppError("Không tải được quán của nhân viên.", 400);

  return {
    member,
    user: userResult.data as StaffAppUserRow | null,
    restaurant: restaurantResult.data as StaffAppRestaurantRow | null
  };
}

function assertActiveStaffAccount(record: {
  member: StaffAppMemberRow | null;
  user: StaffAppUserRow | null;
  restaurant: StaffAppRestaurantRow | null;
}): asserts record is { member: StaffAppMemberRow; user: StaffAppUserRow; restaurant: StaffAppRestaurantRow } {
  const { member, user, restaurant } = record;
  if (!member || !user || !restaurant) {
    throw new AppError("Mã nhân viên hoặc mật khẩu không đúng.", 401);
  }
  if (restaurant.platform_status === "deleted") {
    throw new AppError("Quán không còn hoạt động trên LogiVN.", 403);
  }
  if (user.account_status === "blocked" || member.archived_at || member.employment_status !== "active") {
    throw new AppError("Tài khoản nhân viên đang bị khóa hoặc đã nghỉ việc.", 403);
  }
}

function isPasswordLockActive(member: StaffAppMemberRow) {
  return Boolean(member.app_password_locked_until && new Date(member.app_password_locked_until).getTime() > Date.now());
}

async function recordStaffPasswordFailure({
  supabase,
  member,
  user,
  context
}: {
  supabase: any;
  member: StaffAppMemberRow;
  user: StaffAppUserRow;
  context: Awaited<ReturnType<typeof requestContext>>;
}) {
  const failureResult = await supabase.rpc("record_staff_auth_failure", {
    p_restaurant_id: member.restaurant_id,
    p_staff_member_id: member.id,
    p_auth_kind: "password"
  });
  if (failureResult.error || !failureResult.data?.[0]) {
    throw new AppError("Không ghi nhận được lần đăng nhập thất bại. Vui lòng thử lại.", 503);
  }
  const nextAttempts = Number(failureResult.data[0].attempts ?? 0);
  const lockedUntil = failureResult.data[0].locked_until as string | null;
  const now = new Date().toISOString();

  await writeStaffActivityLog({
    restaurantId: member.restaurant_id,
    actorUserId: user.id,
    entityType: "staff_member",
    entityId: member.id,
    action: lockedUntil ? "staff_auth.password_locked" : "staff_auth.password_failed",
    severity: lockedUntil ? "critical" : "warning",
    reason: lockedUntil ? "Tài khoản nhân viên bị khóa tạm do nhập sai mật khẩu nhiều lần." : "Mật khẩu app nhân viên không đúng.",
    afterState: {
      failedAttempts: nextAttempts,
      lockedUntil
    },
    metadata: {
      source: "staff_app_password_login",
      employeeCode: member.employee_code,
      userAgent: context.userAgent
    },
    ipAddress: context.ipAddress,
    deviceInfo: { userAgent: context.userAgent }
  });

  if (lockedUntil) {
    throw new AppError(`Tài khoản tạm khóa ${STAFF_APP_PASSWORD_LOCK_MINUTES} phút do nhập sai nhiều lần. Chủ quán có thể cấp lại mật khẩu trong HR.`, 429);
  }
}

export async function loginWithStaffAppPassword({
  employeeCode,
  password
}: {
  employeeCode: string;
  password: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const context = await requestContext();
  const record = await findStaffByEmployeeCode(employeeCode);

  assertActiveStaffAccount(record);
  const member = record.member;
  const user = record.user;
  const restaurant = record.restaurant;

  if (isPasswordLockActive(member)) {
    await writeStaffActivityLog({
      restaurantId: member.restaurant_id,
      actorUserId: user.id,
      entityType: "staff_member",
      entityId: member.id,
      action: "staff_auth.password_lock_blocked",
      severity: "warning",
      reason: "Đăng nhập bị chặn vì tài khoản đang khóa tạm.",
      metadata: {
        source: "staff_app_password_login",
        employeeCode: member.employee_code,
        lockedUntil: member.app_password_locked_until,
        userAgent: context.userAgent
      },
      ipAddress: context.ipAddress,
      deviceInfo: { userAgent: context.userAgent }
    });
    throw new AppError("Tài khoản nhân viên đang tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau hoặc nhờ chủ quán cấp lại mật khẩu.", 429);
  }

  try {
    await loginWithPassword(user.email, password);
  } catch {
    await recordStaffPasswordFailure({ supabase, member, user, context });
    throw new AppError("Mã nhân viên hoặc mật khẩu không đúng.", 401);
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    last_seen_at: now,
    app_password_attempts: 0,
    app_password_locked_until: null,
    app_password_last_failed_at: null,
    auth_revoked_at: null
  };
  if (!member.first_login_at) updatePayload.first_login_at = now;

  const sessionMemberUpdate = await supabase
    .from("staff_members")
    .update(updatePayload)
    .eq("restaurant_id", member.restaurant_id)
    .eq("id", member.id);
  if (sessionMemberUpdate.error) {
    await expireSupabaseAuthSessionCookies();
    throw new AppError("Không hoàn tất được phiên đăng nhập nhân viên.", 503);
  }

  await writeStaffActivityLog({
    restaurantId: member.restaurant_id,
    actorUserId: user.id,
    entityType: "staff_member",
    entityId: member.id,
    action: "staff_auth.password_login",
    severity: "info",
    reason: "Đăng nhập app nhân viên bằng mã nhân viên và mật khẩu.",
    afterState: {
      staffMemberId: member.id,
      employeeCode: member.employee_code,
      loginAt: now
    },
    metadata: {
      source: "staff_app_password_login",
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      userAgent: context.userAgent
    },
    ipAddress: context.ipAddress,
    deviceInfo: { userAgent: context.userAgent }
  });

  return {
    userId: user.id,
    staffMemberId: member.id,
    employeeCode: member.employee_code,
    mustChangePassword: member.must_change_app_password,
    restaurantSlug: restaurant.slug
  };
}

export async function getStaffPasswordGateForSession(session: SessionProfile) {
  if (session.role !== "STAFF") return { mustChangePassword: false, staffMemberId: null, employeeCode: null };

  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("staff_members")
    .select("id,employee_code,must_change_app_password,archived_at,employment_status")
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (result.error) {
    throw new AppError("Không xác thực được trạng thái mật khẩu nhân viên.", 503);
  }
  if (!result.data) {
    // Owner accounts may use the staff workspace without a staff-member row
    // on legacy tenants; the temporary-password gate only applies to STAFF.
    if (session.role !== "STAFF") {
      return { mustChangePassword: false, staffMemberId: null, employeeCode: null };
    }
    throw new AppError("Hồ sơ nhân viên không còn hoạt động.", 403);
  }
  const member = result.data as Pick<StaffAppMemberRow, "id" | "employee_code" | "must_change_app_password" | "archived_at" | "employment_status">;
  if (member.archived_at || member.employment_status !== "active") {
    throw new AppError("Hồ sơ nhân viên không còn hoạt động.", 403);
  }

  return {
    mustChangePassword: Boolean(member.must_change_app_password),
    staffMemberId: member.id,
    employeeCode: member.employee_code
  };
}

export async function changeOwnStaffAppPassword({
  session,
  currentPassword,
  newPassword
}: {
  session: SessionProfile;
  currentPassword: string;
  newPassword: string;
}) {
  const supabase = await createServerSupabaseClient();
  const verifyResult = await supabase.auth.signInWithPassword({
    email: session.email.toLowerCase(),
    password: currentPassword
  });

  if (verifyResult.error || !verifyResult.data.user) {
    throw new AppError("Mật khẩu hiện tại không đúng.", 401);
  }

  const updateResult = await supabase.auth.updateUser({ password: newPassword });
  if (updateResult.error) {
    throw new AppError(updateResult.error.message || "Không đổi được mật khẩu app.", 400);
  }

  const admin = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const memberResult = await admin
    .from("staff_members")
    .update({
      must_change_app_password: false,
      app_password_changed_at: now,
      first_login_at: now,
      last_seen_at: now,
      app_password_attempts: 0,
      app_password_locked_until: null,
      app_password_last_failed_at: null,
      auth_revoked_at: null
    })
    .eq("restaurant_id", session.restaurantId)
    .eq("user_id", session.userId)
    .select("id,employee_code")
    .maybeSingle();

  if (memberResult.error) throw new AppError("Đã đổi mật khẩu nhưng không cập nhật được hồ sơ nhân viên.", 400);

  await supabase.auth.signOut({ scope: "others" });

  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    entityType: "staff_member",
    entityId: memberResult.data?.id ?? null,
    action: "staff_auth.password_changed",
    severity: "info",
    reason: "Nhân viên đổi mật khẩu app.",
    metadata: {
      source: "staff_app_password_change",
      employeeCode: memberResult.data?.employee_code ?? null
    }
  });
}

export async function resetStaffAppPassword({
  restaurantId,
  userId,
  actorUserId,
  reason
}: {
  restaurantId: string;
  userId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  await assertStaffOwnerMutationAllowed({
    supabase,
    restaurantId,
    actorUserId,
    targetUserId: userId,
    action: "đặt lại mật khẩu"
  });
  const [userResult, memberResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,email,account_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("staff_members")
      .select("id,employee_code,full_name,archived_at,employment_status,role_code")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (userResult.error) throw new AppError("Không tải được tài khoản nhân viên.", 400);
  if (memberResult.error) throw new AppError("Không tải được hồ sơ nhân viên.", 400);
  if (
    !userResult.data
    || userResult.data.account_status === "blocked"
    || !memberResult.data
    || memberResult.data.archived_at
    || memberResult.data.employment_status !== "active"
  ) {
    throw new AppError("Không tìm thấy nhân viên đang hoạt động để đặt lại mật khẩu.", 404);
  }

  const temporaryPassword = createTemporaryStaffAppPassword();
  const now = new Date().toISOString();
  // Close the app auth epoch before changing the credential. If the auth
  // provider update fails, existing sessions stay blocked and can recover via
  // a fresh credential check instead of remaining silently active.
  const revokeResult = await supabase
    .from("staff_members")
    .update({
      must_change_app_password: true,
      app_password_reset_at: now,
      app_password_attempts: 0,
      app_password_locked_until: null,
      app_password_last_failed_at: null,
      auth_revoked_at: now
    })
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId);
  if (revokeResult.error) throw new AppError("Không thể thu hồi phiên trước khi đặt lại mật khẩu.", 503);

  const authResult = await supabase.auth.admin.updateUserById(userId, {
    password: temporaryPassword
  });

  if (authResult.error) throw new AppError(authResult.error.message || "Không đặt lại được mật khẩu app.", 400);

  const sessionsResult = await supabase
    .from("staff_sessions")
    .update({
      forced_logout_at: now,
      metadata: {
        forcedLogoutReason: reason || "Chủ quán đặt lại mật khẩu app nhân viên.",
        forcedBy: actorUserId,
        source: "staff_app_password_reset"
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", memberResult.data.id)
    .is("forced_logout_at", null);
  if (sessionsResult.error) throw new AppError("Không thể đóng các phiên cũ của nhân viên.", 503);

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    entityType: "staff_member",
    entityId: memberResult.data.id,
    action: "staff_auth.password_reset",
    severity: "warning",
    reason: reason || "Chủ quán đặt lại mật khẩu app nhân viên.",
    afterState: {
      employeeCode: memberResult.data.employee_code,
      resetAt: now,
      mustChangePassword: true
    },
    metadata: { source: "staff_owner_password_reset" }
  });

  return {
    employeeCode: memberResult.data.employee_code as string,
    temporaryPassword,
    staffName: memberResult.data.full_name as string
  };
}
