import "server-only";

import { createHash, randomBytes } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type DashboardSession = {
  userId: string;
  restaurantId: string;
};

type StaffAttendanceQrTokenCreateInput = {
  branchId: string;
  expiresInMinutes: number;
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
  expires_at: string;
  revoked_at: string | null;
  consumed_at: string | null;
  consumed_by_staff_member_id: string | null;
  usage_count: number;
};

function isMissingQrTokenSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_attendance_qr_tokens|token_hash|consumed_at/i.test(message);
}

function hashAttendanceQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createRawAttendanceQrToken() {
  return `stqr_${randomBytes(32).toString("base64url")}`;
}

function normalizeBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}`;
}

function buildAttendanceUrl({ baseUrl, branchId, token }: { baseUrl: string; branchId: string; token: string }) {
  const attendanceUrl = new URL("/dashboard/staff/mobile", normalizeBaseUrl(baseUrl));
  attendanceUrl.searchParams.set("qr", token);
  attendanceUrl.searchParams.set("branch", branchId);
  return attendanceUrl.toString();
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
  const branchResult = await supabase
    .from("store_branches")
    .select("id,name,is_active")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", input.branchId)
    .maybeSingle();

  if (branchResult.error) throw branchResult.error;
  const branch = branchResult.data as { id: string; name: string; is_active: boolean } | null;
  if (!branch || !branch.is_active) throw new AppError("Chi nhánh tạo QR không khả dụng.", 404);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInMinutes * 60_000);
  const token = createRawAttendanceQrToken();
  const attendanceUrl = buildAttendanceUrl({ baseUrl, branchId: branch.id, token });
  const qrImageUrl = `/api/admin/staff-operations/attendance-qr-tokens/qr-image?size=360&data=${encodeURIComponent(attendanceUrl)}`;

  const insertResult = await supabase
    .from("staff_attendance_qr_tokens")
    .insert({
      restaurant_id: session.restaurantId,
      branch_id: branch.id,
      token_hash: hashAttendanceQrToken(token),
      purpose: "attendance",
      valid_from: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by: session.userId,
      metadata: {
        baseUrl: normalizeBaseUrl(baseUrl)
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
    createdAt: insertResult.data.created_at as string
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
    .select("id,restaurant_id,branch_id,expires_at,revoked_at,consumed_at,consumed_by_staff_member_id,usage_count")
    .eq("restaurant_id", restaurantId)
    .eq("branch_id", branchId)
    .eq("token_hash", tokenHash)
    .eq("purpose", "attendance")
    .lte("valid_from", usedAt.toISOString())
    .gt("expires_at", usedAt.toISOString())
    .is("revoked_at", null)
    .is("consumed_at", null)
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

  const updateResult = await supabase
    .from("staff_attendance_qr_tokens")
    .update({
      consumed_at: usedAt.toISOString(),
      consumed_by_staff_member_id: staffMemberId,
      last_used_at: usedAt.toISOString(),
      usage_count: (qrToken.usage_count ?? 0) + 1,
      metadata: {
        lastClock: clock,
        lastStaffMemberId: staffMemberId
      }
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", qrToken.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (updateResult.error && !isMissingQrTokenSchema(updateResult.error)) {
    throw updateResult.error;
  }
  if (!updateResult.data?.id) {
    throw new AppError("Mã QR chấm công đã được sử dụng. Vui lòng quét mã mới.", 409);
  }

  return {
    id: qrToken.id,
    branchId: qrToken.branch_id,
    expiresAt: qrToken.expires_at
  };
}
