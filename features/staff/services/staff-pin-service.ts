import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { AppError } from "@/lib/response";
import { checkPersistentAuthRateLimit } from "@/lib/auth-rate-limit";
import { buildStaffPinAttemptRateLimitInputs, buildStaffPinUnknownRateLimitInput } from "@/lib/staff-pin-abuse";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";

const pinHashPrefix = "scrypt:v1";
const maxPinAttempts = 5;
const pinLockMs = 10 * 60 * 1000;

type StaffPinRestaurantRow = {
  id: string;
  slug: string;
  name: string;
  platform_status: "active" | "deleted" | null;
};

type StaffPinMemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  pin_hash: string | null;
  pin_attempts: number;
  pin_locked_until: string | null;
  employment_status: "active" | "suspended" | "resigned";
  archived_at: string | null;
};

type StaffPinUserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF";
  account_status: "active" | "blocked" | null;
  restaurant_id: string;
};

function pinSecret() {
  const secret =
    process.env.STAFF_PIN_PEPPER?.trim() ||
    process.env.AUTH_RATE_LIMIT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret && process.env.NODE_ENV === "production") {
    throw new AppError("Chưa cấu hình STAFF_PIN_PEPPER để bảo vệ đăng nhập PIN.", 500);
  }

  return secret || "logivn-local-staff-pin-pepper";
}

export function normalizeStaffPin(pin: string) {
  return pin.trim().replace(/\s/g, "");
}

export function assertStaffPinPolicy(pin: string) {
  const normalized = normalizeStaffPin(pin);
  if (!/^\d{4,8}$/.test(normalized)) {
    throw new AppError("PIN cần gồm 4-8 chữ số.", 422);
  }
  if (/^(\d)\1+$/.test(normalized)) {
    throw new AppError("PIN không nên là một chữ số lặp lại.", 422);
  }
  if ("0123456789".includes(normalized) || "9876543210".includes(normalized)) {
    throw new AppError("PIN không nên là dãy số quá dễ đoán.", 422);
  }
  return normalized;
}

export function staffPinLookupHash(restaurantId: string, pin: string) {
  return createHmac("sha256", pinSecret()).update(`${restaurantId}:${normalizeStaffPin(pin)}`).digest("hex");
}

export function hashStaffPin(pin: string) {
  const normalized = assertStaffPinPolicy(pin);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(`${pinSecret()}:${normalized}`, salt, 64).toString("hex");
  return {
    pinHash: `${pinHashPrefix}:${salt}:${hash}`,
    normalizedPin: normalized
  };
}

export function verifyStaffPin(pin: string, storedHash: string | null | undefined) {
  if (!storedHash?.startsWith(`${pinHashPrefix}:`)) return false;
  const [, , salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(`${pinSecret()}:${normalizeStaffPin(pin)}`, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function requestContext() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: requestHeaders.get("cf-connecting-ip") || requestHeaders.get("x-real-ip") || forwardedFor || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || null
  };
}

async function createSupabaseSessionFromVerifiedPin(email: string) {
  await expireSupabaseAuthSessionCookies();

  const admin = createAdminSupabaseClient();
  const server = await createServerSupabaseClient({ ignoreAuthSession: true });
  const linkResult = await admin.auth.admin.generateLink({
    type: "magiclink",
    email
  });

  const token = linkResult.data.properties?.email_otp;
  if (linkResult.error || !token) {
    throw new AppError(linkResult.error?.message || "Không tạo được phiên đăng nhập PIN.", 400);
  }

  const verificationTypes = ["email", "magiclink"] as const;
  let lastError: string | null = null;
  for (const type of verificationTypes) {
    const { data, error } = await server.auth.verifyOtp({
      email,
      token,
      type
    });

    if (!error && data.user) return data.user;
    lastError = error?.message ?? lastError;
  }

  throw new AppError(lastError || "Không khôi phục được phiên đăng nhập PIN.", 401);
}

async function resolveRestaurantBySlug(supabase: any, restaurantSlug: string) {
  const slug = restaurantSlug.trim().toLowerCase();
  if (!slug) throw new AppError("Cần mã quán để đăng nhập bằng PIN.", 422);

  const result = await supabase
    .from("restaurants")
    .select("id,slug,name,platform_status")
    .eq("slug", slug)
    .maybeSingle();

  if (result.error) throw new AppError("Không tải được quán để đăng nhập PIN.", 400);

  const restaurant = result.data as StaffPinRestaurantRow | null;
  if (!restaurant || restaurant.platform_status === "deleted") {
    throw new AppError("Không tìm thấy quán cho mã đăng nhập này.", 404);
  }

  return restaurant;
}

async function assertStaffPinAttemptBudget(restaurantId: string, context: Awaited<ReturnType<typeof requestContext>>) {
  const checks = await Promise.all(
    buildStaffPinAttemptRateLimitInputs({
      restaurantId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }).map((input) => checkPersistentAuthRateLimit(input))
  );

  if (checks.some((allowed) => !allowed)) {
    throw new AppError("Bạn thử PIN quá nhanh. Vui lòng chờ một chút rồi thử lại.", 429);
  }
}

async function recordPinFailure({
  supabase,
  restaurantId,
  member,
  reason,
  context
}: {
  supabase: any;
  restaurantId: string;
  member: StaffPinMemberRow;
  reason: string;
  context: Awaited<ReturnType<typeof requestContext>>;
}) {
  const nextAttempts = Math.min(maxPinAttempts, (member.pin_attempts ?? 0) + 1);
  const lockedUntil = nextAttempts >= maxPinAttempts ? new Date(Date.now() + pinLockMs).toISOString() : null;

  await supabase
    .from("staff_members")
    .update({
      pin_attempts: nextAttempts,
      pin_locked_until: lockedUntil
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", member.id);

  await writeStaffActivityLog({
    restaurantId,
    entityType: "staff_member",
    entityId: member.id,
    action: lockedUntil ? "staff_auth.pin_locked" : "staff_auth.pin_failed",
    severity: lockedUntil ? "critical" : "warning",
    reason,
    afterState: {
      staffMemberId: member.id,
      attempts: nextAttempts,
      lockedUntil
    },
    metadata: {
      source: "pin_login",
      userAgent: context.userAgent
    },
    ipAddress: context.ipAddress,
    deviceInfo: {
      userAgent: context.userAgent
    }
  });

  if (lockedUntil) {
    throw new AppError("PIN đã bị khoá tạm thời vì nhập sai nhiều lần. Vui lòng thử lại sau 10 phút hoặc liên hệ quản lý.", 423);
  }
}

async function recordUnknownPinFailure({
  restaurant,
  context
}: {
  restaurant: StaffPinRestaurantRow;
  context: Awaited<ReturnType<typeof requestContext>>;
}) {
  const allowed = await checkPersistentAuthRateLimit(buildStaffPinUnknownRateLimitInput({
    restaurantId: restaurant.id,
    ipAddress: context.ipAddress
  }));

  await writeStaffActivityLog({
    restaurantId: restaurant.id,
    entityType: "staff_auth",
    entityId: null,
    action: allowed ? "staff_auth.pin_unknown_failed" : "staff_auth.pin_unknown_locked",
    severity: allowed ? "warning" : "critical",
    reason: "PIN không khớp nhân sự nào trong quán.",
    metadata: {
      source: "pin_login",
      restaurantSlug: restaurant.slug,
      userAgent: context.userAgent
    },
    ipAddress: context.ipAddress,
    deviceInfo: {
      userAgent: context.userAgent
    }
  });

  if (!allowed) {
    throw new AppError("Bạn thử PIN không tồn tại quá nhiều lần. Vui lòng chờ 10 phút hoặc liên hệ quản lý.", 423);
  }
}

export async function loginWithStaffPin({
  restaurantSlug,
  pin
}: {
  restaurantSlug: string;
  pin: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const context = await requestContext();
  const normalizedPin = assertStaffPinPolicy(pin);
  const restaurant = await resolveRestaurantBySlug(supabase, restaurantSlug);
  await assertStaffPinAttemptBudget(restaurant.id, context);
  const lookupHash = staffPinLookupHash(restaurant.id, normalizedPin);

  const memberResult = await supabase
    .from("staff_members")
    .select("id,user_id,full_name,pin_hash,pin_attempts,pin_locked_until,employment_status,archived_at")
    .eq("restaurant_id", restaurant.id)
    .eq("pin_lookup_hash", lookupHash)
    .maybeSingle();

  if (memberResult.error) throw new AppError("Không kiểm tra được PIN nhân sự.", 400);

  const member = memberResult.data as StaffPinMemberRow | null;
  if (!member) {
    await recordUnknownPinFailure({
      restaurant,
      context
    });
    throw new AppError("PIN hoặc mã quán không đúng.", 401);
  }

  if (member.pin_locked_until && new Date(member.pin_locked_until).getTime() > Date.now()) {
    throw new AppError("PIN đang bị khoá tạm thời. Vui lòng thử lại sau ít phút hoặc liên hệ quản lý.", 423);
  }

  if (!verifyStaffPin(normalizedPin, member.pin_hash)) {
    await recordPinFailure({
      supabase,
      restaurantId: restaurant.id,
      member,
      reason: "PIN không khớp hash bảo mật.",
      context
    });
    throw new AppError("PIN hoặc mã quán không đúng.", 401);
  }

  if (member.archived_at || member.employment_status !== "active") {
    await recordPinFailure({
      supabase,
      restaurantId: restaurant.id,
      member,
      reason: "Hồ sơ nhân sự không còn hoạt động.",
      context
    });
    throw new AppError("Tài khoản nhân sự không còn hoạt động.", 403);
  }

  const userResult = await supabase
    .from("users")
    .select("id,email,role,account_status,restaurant_id")
    .eq("id", member.user_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (userResult.error) throw new AppError("Không tải được tài khoản nhân sự.", 400);
  const user = userResult.data as StaffPinUserRow | null;
  if (!user || user.account_status === "blocked") {
    throw new AppError("Tài khoản nhân sự đang bị khoá.", 403);
  }

  await createSupabaseSessionFromVerifiedPin(user.email.toLowerCase());

  const now = new Date().toISOString();
  await supabase
    .from("staff_members")
    .update({
      pin_attempts: 0,
      pin_locked_until: null,
      pin_last_success_at: now,
      last_seen_at: now
    })
    .eq("restaurant_id", restaurant.id)
    .eq("id", member.id);

  await writeStaffActivityLog({
    restaurantId: restaurant.id,
    actorUserId: user.id,
    entityType: "staff_member",
    entityId: member.id,
    action: "staff_auth.pin_login",
    severity: "info",
    reason: "Đăng nhập vận hành bằng PIN.",
    afterState: {
      staffMemberId: member.id,
      restaurantSlug: restaurant.slug,
      loginAt: now
    },
    metadata: {
      source: "pin_login",
      restaurantName: restaurant.name,
      userAgent: context.userAgent
    },
    ipAddress: context.ipAddress,
    deviceInfo: {
      userAgent: context.userAgent
    }
  });

  return {
    userId: user.id,
    restaurantSlug: restaurant.slug,
    staffMemberId: member.id,
    fullName: member.full_name
  };
}
