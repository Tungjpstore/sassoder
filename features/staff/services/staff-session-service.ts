import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import type { z } from "zod";
import { headers } from "next/headers";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assessAttendanceDeviceTrust } from "@/features/staff/services/staff-device-trust-service";
import type { staffSessionForceLogoutSchema, staffSessionHeartbeatSchema } from "@/lib/validators";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { assertStaffOwnerMutationAllowed } from "@/services/staff-owner-boundary-service";
import type { SessionProfile } from "@/types/domain";

type StaffSessionHeartbeatInput = z.infer<typeof staffSessionHeartbeatSchema>;
type StaffSessionForceLogoutInput = z.infer<typeof staffSessionForceLogoutSchema>;

type StaffMemberSessionRow = {
  id: string;
  user_id: string;
  full_name: string;
  employment_status: "active" | "suspended" | "resigned";
  archived_at: string | null;
};

type StaffSessionRow = {
  id: string;
  restaurant_id: string;
  staff_member_id: string;
  staff_user_id: string;
  branch_id: string | null;
  device_fingerprint: string | null;
  forced_logout_at: string | null;
  last_seen_at: string;
};

type StaffAttendanceSessionTokenPayload = {
  restaurantId: string;
  userId: string;
  staffMemberId: string;
  staffSessionId: string;
  deviceFingerprint: string;
  issuedAt: string;
};

const attendanceSessionTokenMaxAgeMs = 26 * 60 * 60 * 1000;

function isMissingSessionSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_sessions|staff_members|device_fingerprint/i.test(message);
}

async function requestHeadersSnapshot() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: requestHeaders.get("cf-connecting-ip") || requestHeaders.get("x-real-ip") || forwardedFor || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || null
  };
}

function deviceNameFromInput(input: StaffSessionHeartbeatInput, userAgent: string | null) {
  if (input.deviceName?.trim()) return input.deviceName.trim();
  if (!userAgent) return input.sessionType === "mobile" ? "Thiết bị mobile" : "Dashboard";
  if (/iPhone|Android|Mobile/i.test(userAgent)) return "Thiết bị mobile";
  if (/Macintosh/i.test(userAgent)) return "Mac desktop";
  if (/Windows/i.test(userAgent)) return "Windows desktop";
  return "Dashboard";
}

function scopedStaffLoginPath(restaurantSlug: string) {
  const slug = restaurantSlug.trim().toLowerCase();
  return /^[a-z0-9-]{2,80}$/.test(slug) ? `/staff/${slug}/login` : "/staff/login";
}

function attendanceSessionSecret() {
  const secret = process.env.STAFF_ATTENDANCE_SESSION_SECRET?.trim();

  if (!secret && process.env.NODE_ENV === "production") {
    throw new AppError("Thiếu STAFF_ATTENDANCE_SESSION_SECRET để ký phiên chấm công nhân viên.", 503);
  }

  return secret || "logivn-dev-staff-attendance-session-secret";
}

async function revokeStaffAuthSession({
  supabase,
  restaurantId,
  staffMemberId,
  revokedAt
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  revokedAt: string;
}) {
  const result = await supabase
    .from("staff_members")
    .update({ auth_revoked_at: revokedAt })
    .eq("restaurant_id", restaurantId)
    .eq("id", staffMemberId);
  if (result.error) throw new AppError("Không thể thu hồi phiên xác thực nhân viên.", 503);
}

function encodeTokenPayload(payload: StaffAttendanceSessionTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signTokenPayload(encodedPayload: string) {
  return createHmac("sha256", attendanceSessionSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createStaffAttendanceSessionToken(payload: StaffAttendanceSessionTokenPayload) {
  const encodedPayload = encodeTokenPayload(payload);
  return `sas_v1.${encodedPayload}.${signTokenPayload(encodedPayload)}`;
}

function verifyStaffAttendanceSessionToken(token: string) {
  const [version, encodedPayload, signature] = token.split(".");
  if (version !== "sas_v1" || !encodedPayload || !signature) return null;
  if (!safeEqual(signTokenPayload(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<StaffAttendanceSessionTokenPayload>;
    if (!payload.restaurantId || !payload.userId || !payload.staffMemberId || !payload.staffSessionId || !payload.deviceFingerprint || !payload.issuedAt) return null;
    return payload as StaffAttendanceSessionTokenPayload;
  } catch {
    return null;
  }
}

async function resolveCurrentStaffMember({
  supabase,
  restaurantId,
  userId
}: {
  supabase: any;
  restaurantId: string;
  userId: string;
}) {
  const result = await supabase
    .from("staff_members")
    .select("id,user_id,full_name,employment_status,archived_at")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    if (isMissingSessionSchema(result.error)) {
      throw new AppError("Chưa có hồ sơ nhân sự để ghi nhận hiện diện.", 404);
    }
    throw result.error;
  }

  const member = result.data as StaffMemberSessionRow | null;
  if (!member || member.archived_at || member.employment_status !== "active") {
    throw new AppError("Hồ sơ nhân sự không khả dụng để ghi nhận hiện diện.", 403);
  }

  return member;
}

export async function recordStaffSessionHeartbeat({
  session,
  input
}: {
  session: SessionProfile;
  input: StaffSessionHeartbeatInput;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const staffMember = await resolveCurrentStaffMember({
    supabase,
    restaurantId: session.restaurantId,
    userId: session.userId
  });
  const { ipAddress, userAgent } = await requestHeadersSnapshot();
  const now = new Date().toISOString();
  const branchId = input.branchId || (await ensureDefaultStoreBranch(session.restaurantId))?.id || null;

  const existingResult = await supabase
    .from("staff_sessions")
    .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,device_fingerprint,forced_logout_at,last_seen_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("staff_user_id", session.userId)
    .eq("device_fingerprint", input.deviceFingerprint)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingResult.error && !isMissingSessionSchema(existingResult.error)) {
    throw existingResult.error;
  }

  const existing = existingResult.data as StaffSessionRow | null;
  if (existing?.forced_logout_at) {
    return {
      sessionId: existing.id,
      forcedLogout: true,
      forcedLogoutAt: existing.forced_logout_at,
      lastSeenAt: existing.last_seen_at,
      deviceTrust: {
        status: "blocked" as const,
        deviceId: null,
        fingerprint: input.deviceFingerprint,
        trustedForAttendance: false,
        restrictionActive: true,
        approvalRequired: false,
        blocked: true,
        message: "Phiên thiết bị đã bị buộc đăng xuất.",
        flags: ["forced_logout"]
      }
    };
  }

  const payload = {
    restaurant_id: session.restaurantId,
    staff_member_id: staffMember.id,
    staff_user_id: session.userId,
    branch_id: branchId,
    session_type: input.sessionType,
    login_method: input.loginMethod,
    device_fingerprint: input.deviceFingerprint,
    device_name: deviceNameFromInput(input, userAgent),
    ip_address: ipAddress,
    user_agent: userAgent,
    last_seen_at: now,
    metadata: {
      ...input.metadata,
      userRole: session.role,
      restaurantSlug: session.restaurant.slug
    }
  };

  let staffSession: StaffSessionRow;
  if (existing?.id) {
    const updateResult = await supabase
      .from("staff_sessions")
      .update(payload)
      .eq("restaurant_id", session.restaurantId)
      .eq("id", existing.id)
      .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,device_fingerprint,forced_logout_at,last_seen_at")
      .single();

    if (updateResult.error) throw updateResult.error;
    staffSession = updateResult.data as StaffSessionRow;
  } else {
    const insertResult = await supabase
      .from("staff_sessions")
      .insert({
        ...payload,
        started_at: now
      })
      .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,device_fingerprint,forced_logout_at,last_seen_at")
      .single();

    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        const retryResult = await supabase
          .from("staff_sessions")
          .update(payload)
          .eq("restaurant_id", session.restaurantId)
          .eq("staff_user_id", session.userId)
          .eq("device_fingerprint", input.deviceFingerprint)
          .is("forced_logout_at", null)
          .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,device_fingerprint,forced_logout_at,last_seen_at")
          .single();
        if (retryResult.error) throw retryResult.error;
        staffSession = retryResult.data as StaffSessionRow;
      } else {
        throw insertResult.error;
      }
    } else {
      staffSession = insertResult.data as StaffSessionRow;
    }
  }

  const memberUpdate = await supabase
    .from("staff_members")
    .update({ last_seen_at: now })
    .eq("restaurant_id", session.restaurantId)
    .eq("id", staffMember.id);

  if (memberUpdate.error && !isMissingSessionSchema(memberUpdate.error)) throw memberUpdate.error;

  const deviceTrust = await assessAttendanceDeviceTrust({
    supabase,
    restaurantId: session.restaurantId,
    staffMemberId: staffMember.id,
    branchId,
    deviceInfo: {
      deviceFingerprint: input.deviceFingerprint,
      userAgent,
      deviceName: payload.device_name
    },
    sessionId: staffSession.id
  });

  return {
    sessionId: staffSession.id,
    attendanceSessionToken: createStaffAttendanceSessionToken({
      restaurantId: session.restaurantId,
      userId: session.userId,
      staffMemberId: staffMember.id,
      staffSessionId: staffSession.id,
      deviceFingerprint: input.deviceFingerprint,
      issuedAt: now
    }),
    forcedLogout: false,
    forcedLogoutAt: null,
    lastSeenAt: staffSession.last_seen_at,
    deviceTrust
  };
}

export async function assertActiveStaffDeviceSession({
  session,
  deviceFingerprint,
  attendanceSessionToken,
  requireSignedToken = false
}: {
  session: SessionProfile;
  deviceFingerprint?: string | null;
  attendanceSessionToken?: string | null;
  requireSignedToken?: boolean;
}) {
  const fingerprint = deviceFingerprint?.trim();
  if (!fingerprint) {
    if (requireSignedToken) throw new AppError("Thiết bị chưa có fingerprint hợp lệ để chấm công.", 401);
    return;
  }

  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("staff_sessions")
    .select("id,staff_member_id,forced_logout_at,last_seen_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("staff_user_id", session.userId)
    .eq("device_fingerprint", fingerprint)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isMissingSessionSchema(result.error)) {
      if (requireSignedToken) throw new AppError("Chưa có schema phiên thiết bị để xác minh chấm công.", 503);
      return;
    }
    throw result.error;
  }

  const staffSession = result.data as (StaffSessionRow & { staff_member_id: string }) | null;
  if (!staffSession) {
    if (requireSignedToken) throw new AppError("Phiên thiết bị chưa được xác thực. Vui lòng mở lại app nhân viên.", 401);
    return;
  }

  if (staffSession.forced_logout_at) {
    throw new AppError("Phiên thiết bị đã bị quản lý đăng xuất. Vui lòng đăng nhập lại.", 401);
  }

  if (!requireSignedToken) return;

  const token = attendanceSessionToken?.trim();
  if (!token) throw new AppError("Thiếu mã phiên thiết bị để xác minh chấm công.", 401);

  const payload = verifyStaffAttendanceSessionToken(token);
  const issuedAtMs = payload ? new Date(payload.issuedAt).getTime() : Number.NaN;
  const expired = !Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > attendanceSessionTokenMaxAgeMs;
  if (
    !payload ||
    expired ||
    payload.restaurantId !== session.restaurantId ||
    payload.userId !== session.userId ||
    payload.staffMemberId !== staffSession.staff_member_id ||
    payload.staffSessionId !== staffSession.id ||
    payload.deviceFingerprint !== fingerprint
  ) {
    throw new AppError("Phiên thiết bị chấm công không hợp lệ hoặc đã hết hạn. Vui lòng mở lại app nhân viên.", 401);
  }
}

export async function forceStaffSessionLogout({
  restaurantId,
  restaurantSlug,
  actorUserId,
  input
}: {
  restaurantId: string;
  restaurantSlug: string;
  actorUserId: string;
  input: StaffSessionForceLogoutInput;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();

  const targetResult = input.sessionId
    ? await supabase
      .from("staff_sessions")
      .select("staff_user_id,staff_member_id")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.sessionId)
      .maybeSingle()
    : await supabase
      .from("staff_members")
      .select("user_id")
      .eq("restaurant_id", restaurantId)
      .eq("id", input.staffMemberId)
      .maybeSingle();

  if (targetResult.error) throw new AppError("Không xác thực được tài khoản của phiên cần đăng xuất.", 400);
  const targetUserId = input.sessionId ? targetResult.data?.staff_user_id : targetResult.data?.user_id;
  const targetStaffMemberId = input.sessionId ? targetResult.data?.staff_member_id : input.staffMemberId;
  if (!targetUserId) throw new AppError("Không tìm thấy tài khoản của phiên cần đăng xuất.", 404);
  if (!targetStaffMemberId) throw new AppError("Không tìm thấy hồ sơ nhân viên của phiên cần đăng xuất.", 404);

  await assertStaffOwnerMutationAllowed({
    supabase,
    restaurantId,
    actorUserId,
    targetUserId,
    action: "buộc đăng xuất"
  });

  let query = supabase
    .from("staff_sessions")
    .update({
      forced_logout_at: now,
      metadata: {
        forcedLogoutReason: input.reason || "Buộc đăng xuất từ Staff Operations",
        forcedBy: actorUserId
      }
    })
    .eq("restaurant_id", restaurantId)
    .is("forced_logout_at", null);

  if (input.sessionId) query = query.eq("id", input.sessionId);
  if (input.staffMemberId) query = query.eq("staff_member_id", input.staffMemberId);

  const result = await query.select("id,staff_member_id,staff_user_id,branch_id,device_fingerprint,last_seen_at");
  if (result.error) throw result.error;

  const sessions = (result.data ?? []) as Array<{
    id: string;
    staff_member_id: string;
    staff_user_id: string;
    branch_id: string | null;
    device_fingerprint: string | null;
    last_seen_at: string;
  }>;

  // Supabase access tokens remain valid until expiry. Bump the staff auth
  // epoch even when the client never registered a staff_sessions row.
  await revokeStaffAuthSession({
    supabase,
    restaurantId,
    staffMemberId: targetStaffMemberId,
    revokedAt: now
  });

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    branchId: sessions[0]?.branch_id ?? null,
    entityType: "staff_session",
    entityId: input.sessionId || input.staffMemberId || null,
    action: "staff_sessions.force_logout",
    severity: "warning",
    reason: input.reason || "Buộc đăng xuất từ Staff Operations",
    afterState: {
      forcedAt: now,
      sessions
    },
    metadata: {
      source: "staff_session_service",
      sessionCount: sessions.length
    }
  });

  await Promise.all(
    [...new Set([targetUserId, ...sessions.map((item) => item.staff_user_id)])].map((userId) =>
      supabase.from("notifications").insert({
        restaurant_id: restaurantId,
        user_id: userId,
        type: "staff_session_forced_logout",
        title: "Phiên làm việc đã bị đăng xuất",
        body: input.reason || "Quản lý đã buộc đăng xuất phiên làm việc của bạn.",
        action_url: scopedStaffLoginPath(restaurantSlug),
        status: "unread",
        payload: {
          forcedAt: now,
          reason: input.reason || null
        }
      })
    )
  );

  return {
    forcedAt: now,
    affectedSessions: sessions.length
  };
}
