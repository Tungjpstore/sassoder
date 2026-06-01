import "server-only";

import { createHash, createHmac, randomBytes } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type DashboardSession = {
  userId: string;
  restaurantId: string;
};

type StaffAttendanceQrTokenCreateInput = {
  branchId: string;
  expiresInMinutes: number;
  mode?: "single_use" | "daily_branch";
};

type ValidateStaffAttendanceQrTokenInput = {
  supabase: any;
  restaurantId: string;
  branchId: string;
  token?: string | "";
  usedAt: Date;
  clock: "in" | "out";
  staffMemberId: string;
};

type StaffAttendanceQrTokenRow = {
  id: string;
  restaurant_id: string;
  branch_id: string;
  token_hash: string;
  token_mode: "single_use" | "daily_branch";
  qr_date: string | null;
  expires_at: string;
  revoked_at: string | null;
  consumed_at: string | null;
  consumed_by_staff_member_id: string | null;
  usage_limit: number | null;
  usage_count: number;
};

const dailyBranchQrValiditySeconds = 90;

function isMissingQrTokenSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_attendance_qr_tokens|token_hash|consumed_at|token_mode|qr_date/i.test(message);
}

function hashAttendanceQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRawAttendanceQrToken() {
  return `stqr_${randomBytes(32).toString("base64url")}`;
}

function dailyQrSecret() {
  const staffQrSecret = process.env.STAFF_ATTENDANCE_QR_SECRET?.trim();
  if (staffQrSecret) return staffQrSecret;

  if (process.env.NODE_ENV === "production") {
    throw new AppError("Thiếu STAFF_ATTENDANCE_QR_SECRET để tạo QR chấm công an toàn.", 503);
  }

  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "logivn-dev-attendance-daily-qr-secret";
}

function dateKeyInVietnam(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function createDailyRawAttendanceQrToken({ restaurantId, branchId, qrDate, nonce }: { restaurantId: string; branchId: string; qrDate: string; nonce: string }) {
  const signature = createHmac("sha256", dailyQrSecret())
    .update(`${restaurantId}:${branchId}:${qrDate}:${nonce}:attendance`)
    .digest("base64url")
    .slice(0, 48);
  return `stqr_day_${qrDate.replace(/-/g, "")}_${nonce}_${signature}`;
}

function resolveQrExpiry({ mode, now, expiresInMinutes }: { mode: "single_use" | "daily_branch"; now: Date; expiresInMinutes: number }) {
  if (mode === "daily_branch") {
    return new Date(now.getTime() + dailyBranchQrValiditySeconds * 1000);
  }
  return new Date(now.getTime() + expiresInMinutes * 60_000);
}

function normalizeBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}`;
}

function buildAttendanceUrl({ baseUrl, branchId, restaurantSlug, token }: { baseUrl: string; branchId: string; restaurantSlug: string; token: string }) {
  const mobileNext = new URL("/dashboard/staff/mobile", normalizeBaseUrl(baseUrl));
  mobileNext.searchParams.set("tab", "attendance");
  mobileNext.searchParams.set("qr", token);
  mobileNext.searchParams.set("branch", branchId);

  const loginUrl = new URL(`/staff/${restaurantSlug}/login`, normalizeBaseUrl(baseUrl));
  loginUrl.searchParams.set("next", `${mobileNext.pathname}${mobileNext.search}`);
  return loginUrl.toString();
}

export async function createStaffAttendanceQrToken({
  session,
  input,
  baseUrl
}: {
  session: DashboardSession;
  input: StaffAttendanceQrTokenCreateInput;
  baseUrl: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const [branchResult, restaurantResult] = await Promise.all([
    supabase
      .from("store_branches")
      .select("id,name,is_active")
      .eq("restaurant_id", session.restaurantId)
      .eq("id", input.branchId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("slug")
      .eq("id", session.restaurantId)
      .maybeSingle()
  ]);

  if (branchResult.error) throw branchResult.error;
  if (restaurantResult.error) throw restaurantResult.error;
  const branch = branchResult.data as { id: string; name: string; is_active: boolean } | null;
  const restaurant = restaurantResult.data as { slug: string | null } | null;
  if (!branch || !branch.is_active) throw new AppError("Chi nhánh tạo QR không khả dụng.", 404);
  if (!restaurant?.slug) throw new AppError("Chưa có mã quán để tạo link QR cho nhân viên.", 422);

  const mode = input.mode ?? "daily_branch";
  const now = new Date();
  const qrDate = dateKeyInVietnam(now);
  const validFrom = now;
  const expiresAt = resolveQrExpiry({ mode, now, expiresInMinutes: input.expiresInMinutes });
  const nonce = randomBytes(12).toString("base64url");
  const token = mode === "daily_branch"
    ? createDailyRawAttendanceQrToken({ restaurantId: session.restaurantId, branchId: branch.id, qrDate, nonce })
    : createRawAttendanceQrToken();
  const tokenHash = hashAttendanceQrToken(token);
  const attendanceUrl = buildAttendanceUrl({ baseUrl, branchId: branch.id, restaurantSlug: restaurant.slug, token });
  const qrImageUrl = `/api/admin/staff-operations/attendance-qr-tokens/qr-image?size=360&data=${encodeURIComponent(attendanceUrl)}`;

  if (mode === "daily_branch") {
    const existingResult = await supabase
      .from("staff_attendance_qr_tokens")
      .select("id,branch_id,expires_at,created_at,token_hash")
      .eq("restaurant_id", session.restaurantId)
      .eq("branch_id", branch.id)
      .eq("purpose", "attendance")
      .eq("token_mode", "daily_branch")
      .eq("qr_date", qrDate)
      .is("revoked_at", null)
      .maybeSingle();

    if (existingResult.error) {
      if (isMissingQrTokenSchema(existingResult.error)) {
        throw new AppError("Chưa có migration QR chấm công rotating. Vui lòng cập nhật database trước khi tạo mã.", 503);
      }
      throw existingResult.error;
    }

    if (existingResult.data?.id) {
      const updateResult = await supabase
        .from("staff_attendance_qr_tokens")
        .update({
          token_hash: tokenHash,
          valid_from: validFrom.toISOString(),
          expires_at: expiresAt.toISOString(),
          consumed_at: null,
          consumed_by_staff_member_id: null,
          last_used_at: null,
          usage_count: 0,
          metadata: {
            baseUrl: normalizeBaseUrl(baseUrl),
            qrDate,
            nonce,
            resetPolicy: "rotating_90s",
            rotationSeconds: dailyBranchQrValiditySeconds
          }
        })
        .eq("restaurant_id", session.restaurantId)
        .eq("id", existingResult.data.id)
        .select("id,branch_id,expires_at,created_at")
        .single();

      if (updateResult.error) throw updateResult.error;

      return {
        id: updateResult.data.id as string,
        branchId: branch.id,
        branchName: branch.name,
        token,
        attendanceUrl,
        qrImageUrl,
        expiresAt: updateResult.data.expires_at as string,
        createdAt: updateResult.data.created_at as string,
        mode,
        qrDate
      };
    }
  }

  const insertResult = await supabase
    .from("staff_attendance_qr_tokens")
    .insert({
      restaurant_id: session.restaurantId,
      branch_id: branch.id,
      token_hash: tokenHash,
      token_mode: mode,
      qr_date: mode === "daily_branch" ? qrDate : null,
      purpose: "attendance",
      valid_from: validFrom.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by: session.userId,
      metadata: {
        baseUrl: normalizeBaseUrl(baseUrl),
        qrDate: mode === "daily_branch" ? qrDate : null,
        nonce: mode === "daily_branch" ? nonce : null,
        resetPolicy: mode === "daily_branch" ? "rotating_90s" : "single_use",
        rotationSeconds: mode === "daily_branch" ? dailyBranchQrValiditySeconds : null
      }
    })
    .select("id,branch_id,expires_at,created_at")
    .single();

  if (insertResult.error) {
    if (isMissingQrTokenSchema(insertResult.error)) {
      throw new AppError("Chưa có migration QR chấm công. Vui lòng cập nhật database trước khi tạo mã.", 503);
    }
    throw insertResult.error;
  }

  return {
    id: insertResult.data.id as string,
    branchId: branch.id,
    branchName: branch.name,
    token,
    attendanceUrl,
    qrImageUrl,
    expiresAt: insertResult.data.expires_at as string,
    createdAt: insertResult.data.created_at as string,
    mode,
    qrDate: mode === "daily_branch" ? qrDate : null
  };
}

export async function validateStaffAttendanceQrToken({
  supabase,
  restaurantId,
  branchId,
  token,
  usedAt,
  clock,
  staffMemberId
}: ValidateStaffAttendanceQrTokenInput) {
  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    throw new AppError("Vui lòng quét QR chấm công tại chi nhánh trước khi thao tác.", 422);
  }

  const tokenHash = hashAttendanceQrToken(normalizedToken);
  const result = await supabase
    .from("staff_attendance_qr_tokens")
    .select("id,restaurant_id,branch_id,token_hash,token_mode,qr_date,expires_at,revoked_at,consumed_at,consumed_by_staff_member_id,usage_limit,usage_count")
    .eq("restaurant_id", restaurantId)
    .eq("branch_id", branchId)
    .eq("token_hash", tokenHash)
    .eq("purpose", "attendance")
    .lte("valid_from", usedAt.toISOString())
    .gt("expires_at", usedAt.toISOString())
    .is("revoked_at", null)
    .maybeSingle();

  if (result.error) {
    if (isMissingQrTokenSchema(result.error)) {
      throw new AppError("Chưa có migration QR chấm công. Vui lòng cập nhật database trước khi dùng QR.", 503);
    }
    throw result.error;
  }

  const qrToken = result.data as StaffAttendanceQrTokenRow | null;
  if (!qrToken) {
    throw new AppError("Mã QR chấm công không hợp lệ, sai chi nhánh hoặc đã hết hạn.", 403);
  }

  const tokenMode = qrToken.token_mode ?? "single_use";
  if (tokenMode !== "daily_branch" && qrToken.consumed_at) {
    throw new AppError("Mã QR chấm công đã được sử dụng. Vui lòng quét mã mới.", 409);
  }
  if (qrToken.usage_limit !== null && (qrToken.usage_count ?? 0) >= qrToken.usage_limit) {
    throw new AppError("Mã QR chấm công đã đạt giới hạn sử dụng trong ngày.", 409);
  }

  let updateQuery = supabase
    .from("staff_attendance_qr_tokens")
    .update({
      consumed_at: tokenMode === "daily_branch" ? qrToken.consumed_at : usedAt.toISOString(),
      consumed_by_staff_member_id: tokenMode === "daily_branch" ? qrToken.consumed_by_staff_member_id : staffMemberId,
      last_used_at: usedAt.toISOString(),
      usage_count: (qrToken.usage_count ?? 0) + 1,
      metadata: {
        lastClock: clock,
        lastStaffMemberId: staffMemberId,
        lastUsedMode: tokenMode,
        qrDate: qrToken.qr_date
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", qrToken.id);

  if (tokenMode !== "daily_branch") updateQuery = updateQuery.is("consumed_at", null);

  const updateResult = await updateQuery
    .select("id")
    .maybeSingle();

  if (updateResult.error && !isMissingQrTokenSchema(updateResult.error)) {
    throw updateResult.error;
  }
  if (!updateResult.data?.id) {
    throw new AppError(tokenMode === "daily_branch" ? "Mã QR chấm công chưa cập nhật được lượt dùng. Vui lòng thử lại." : "Mã QR chấm công đã được sử dụng. Vui lòng quét mã mới.", 409);
  }

  return {
    id: qrToken.id,
    branchId: qrToken.branch_id,
    expiresAt: qrToken.expires_at,
    mode: tokenMode,
    qrDate: qrToken.qr_date
  };
}
