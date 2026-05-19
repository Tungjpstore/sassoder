import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";

type StaffDeviceStatus = "assigned" | "returned" | "lost" | "maintenance";
type StaffDeviceType = "phone" | "tablet" | "pos" | "cash_drawer" | "other";

type StaffDeviceTrustRow = {
  id: string;
  staff_member_id: string | null;
  branch_id?: string | null;
  device_name: string;
  device_type: StaffDeviceType;
  status: StaffDeviceStatus;
  device_fingerprint: string | null;
  trusted_for_attendance: boolean;
  trusted_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
};

export type StaffAttendanceDeviceTrust = {
  status: "trusted" | "known" | "needs_approval" | "blocked" | "missing" | "unavailable";
  deviceId: string | null;
  fingerprint: string | null;
  trustedForAttendance: boolean;
  restrictionActive: boolean;
  approvalRequired: boolean;
  blocked: boolean;
  message: string;
  flags: string[];
};

const fingerprintPattern = /^[a-zA-Z0-9._:-]{12,160}$/;

function isMissingDeviceTrustSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_devices|device_fingerprint|trusted_for_attendance|last_seen_at/i.test(message);
}

export function normalizeDeviceFingerprint(value: unknown) {
  if (typeof value !== "string") return null;
  const fingerprint = value.trim();
  return fingerprintPattern.test(fingerprint) ? fingerprint : null;
}

export function deviceFingerprintFromInfo(deviceInfo: Record<string, unknown> | null | undefined) {
  return normalizeDeviceFingerprint(
    deviceInfo?.deviceFingerprint ??
      deviceInfo?.fingerprint ??
      deviceInfo?.device_fingerprint
  );
}

function deviceTypeFromUserAgent(userAgent: string | null | undefined): StaffDeviceType {
  if (!userAgent) return "other";
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/iPhone|Android|Mobile/i.test(userAgent)) return "phone";
  return "other";
}

function deviceNameFromInput({ deviceName, userAgent }: { deviceName?: string | null; userAgent?: string | null }) {
  if (deviceName?.trim()) return deviceName.trim().slice(0, 160);
  if (/iPhone/i.test(userAgent ?? "")) return "iPhone nhân viên";
  if (/Android/i.test(userAgent ?? "")) return "Android nhân viên";
  if (/iPad/i.test(userAgent ?? "")) return "iPad nhân viên";
  return "Thiết bị nhân viên";
}

async function readTrustedRowsForStaff({
  supabase,
  restaurantId,
  staffMemberId
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
}) {
  const result = await supabase
    .from("staff_devices")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .eq("trusted_for_attendance", true)
    .eq("status", "assigned")
    .is("revoked_at", null)
    .not("device_fingerprint", "is", null)
    .limit(3);

  if (result.error) {
    if (isMissingDeviceTrustSchema(result.error)) return null;
    throw result.error;
  }

  return (result.data ?? []) as Array<{ id: string }>;
}

async function readDeviceByFingerprint({
  supabase,
  restaurantId,
  fingerprint
}: {
  supabase: any;
  restaurantId: string;
  fingerprint: string;
}) {
  const result = await supabase
    .from("staff_devices")
    .select("id,staff_member_id,branch_id,device_name,device_type,status,device_fingerprint,trusted_for_attendance,trusted_at,revoked_at,last_seen_at")
    .eq("restaurant_id", restaurantId)
    .eq("device_fingerprint", fingerprint)
    .is("revoked_at", null)
    .maybeSingle();

  if (result.error) {
    if (isMissingDeviceTrustSchema(result.error)) return "schema_missing" as const;
    throw result.error;
  }

  return (result.data as StaffDeviceTrustRow | null) ?? null;
}

export async function recordStaffDeviceSeen({
  supabase,
  restaurantId,
  staffMemberId,
  branchId,
  fingerprint,
  deviceName,
  userAgent,
  sessionId,
  metadata
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  branchId?: string | null;
  fingerprint: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!fingerprint) return null;

  const now = new Date().toISOString();
  const existing = await readDeviceByFingerprint({ supabase, restaurantId, fingerprint });
  if (existing === "schema_missing") return null;

  const payload: Record<string, unknown> = {
    staff_member_id: existing?.staff_member_id ?? staffMemberId,
    branch_id: branchId ?? existing?.branch_id ?? null,
    last_seen_at: now,
    metadata: {
      ...(metadata ?? {}),
      autoObserved: true,
      lastUserAgent: userAgent ?? null
    }
  };
  if (sessionId) payload.last_staff_session_id = sessionId;

  if (existing?.id) {
    const updateResult = await supabase
      .from("staff_devices")
      .update(payload)
      .eq("restaurant_id", restaurantId)
      .eq("id", existing.id);
    if (updateResult.error && !isMissingDeviceTrustSchema(updateResult.error)) throw updateResult.error;
    return existing.id as string;
  }

  const insertResult = await supabase
    .from("staff_devices")
    .insert({
      restaurant_id: restaurantId,
      staff_member_id: staffMemberId,
      branch_id: branchId ?? null,
      device_name: deviceNameFromInput({ deviceName, userAgent }),
      device_type: deviceTypeFromUserAgent(userAgent),
      device_fingerprint: fingerprint,
      issued_at: new Date().toISOString().slice(0, 10),
      status: "assigned",
      trusted_for_attendance: false,
      last_seen_at: now,
      last_staff_session_id: sessionId ?? null,
      note: "Tự ghi nhận từ Staff mobile/PWA.",
      metadata: {
        ...(metadata ?? {}),
        autoObserved: true,
        firstUserAgent: userAgent ?? null
      }
    })
    .select("id")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      const retry = await readDeviceByFingerprint({ supabase, restaurantId, fingerprint });
      return typeof retry === "object" && retry ? retry.id : null;
    }
    if (isMissingDeviceTrustSchema(insertResult.error)) return null;
    throw insertResult.error;
  }

  return insertResult.data.id as string;
}

export async function assessAttendanceDeviceTrust({
  supabase,
  restaurantId,
  staffMemberId,
  branchId,
  deviceInfo,
  sessionId
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  branchId?: string | null;
  deviceInfo: Record<string, unknown>;
  sessionId?: string | null;
}): Promise<StaffAttendanceDeviceTrust> {
  const fingerprint = deviceFingerprintFromInfo(deviceInfo);
  const userAgent = typeof deviceInfo.userAgent === "string" ? deviceInfo.userAgent : null;
  const trustedRows = await readTrustedRowsForStaff({ supabase, restaurantId, staffMemberId });

  if (trustedRows === null) {
    return {
      status: "unavailable",
      deviceId: null,
      fingerprint,
      trustedForAttendance: false,
      restrictionActive: false,
      approvalRequired: false,
      blocked: false,
      message: "Chưa bật schema thiết bị tin cậy.",
      flags: []
    };
  }

  const restrictionActive = trustedRows.length > 0;
  if (!fingerprint) {
    return {
      status: restrictionActive ? "needs_approval" : "missing",
      deviceId: null,
      fingerprint: null,
      trustedForAttendance: false,
      restrictionActive,
      approvalRequired: restrictionActive,
      blocked: false,
      message: restrictionActive ? "Thiết bị thiếu fingerprint, cần quản lý duyệt." : "Thiết bị chưa gửi fingerprint.",
      flags: ["missing_device_fingerprint"]
    };
  }

  await recordStaffDeviceSeen({
    supabase,
    restaurantId,
    staffMemberId,
    branchId,
    fingerprint,
    userAgent,
    sessionId,
    metadata: {
      source: "attendance"
    }
  });

  const device = await readDeviceByFingerprint({ supabase, restaurantId, fingerprint });
  if (device === "schema_missing") {
    return {
      status: "unavailable",
      deviceId: null,
      fingerprint,
      trustedForAttendance: false,
      restrictionActive: false,
      approvalRequired: false,
      blocked: false,
      message: "Chưa bật schema thiết bị tin cậy.",
      flags: []
    };
  }

  if (!device) {
    return {
      status: restrictionActive ? "needs_approval" : "known",
      deviceId: null,
      fingerprint,
      trustedForAttendance: false,
      restrictionActive,
      approvalRequired: restrictionActive,
      blocked: false,
      message: restrictionActive ? "Thiết bị chưa nằm trong danh sách tin cậy." : "Thiết bị đã ghi nhận.",
      flags: restrictionActive ? ["untrusted_device"] : []
    };
  }

  const assignedToOtherStaff = Boolean(device.staff_member_id && device.staff_member_id !== staffMemberId);
  const blocked = device.status === "lost" || device.status === "maintenance" || assignedToOtherStaff;
  const trustedForAttendance = Boolean(
    device.trusted_for_attendance &&
      device.status === "assigned" &&
      device.staff_member_id === staffMemberId &&
      !device.revoked_at
  );
  const approvalRequired = restrictionActive && !trustedForAttendance && !blocked;
  const flags = [
    ...(trustedForAttendance ? [] : ["untrusted_device"]),
    ...(assignedToOtherStaff ? ["device_assigned_to_other_staff"] : []),
    ...(device.status === "lost" ? ["lost_device"] : []),
    ...(device.status === "maintenance" ? ["maintenance_device"] : [])
  ];

  return {
    status: blocked ? "blocked" : trustedForAttendance ? "trusted" : approvalRequired ? "needs_approval" : "known",
    deviceId: device.id,
    fingerprint,
    trustedForAttendance,
    restrictionActive,
    approvalRequired,
    blocked,
    message: blocked
      ? "Thiết bị đang bị khoá hoặc gán cho nhân sự khác."
      : trustedForAttendance
        ? "Thiết bị đã được duyệt chấm công."
        : approvalRequired
          ? "Thiết bị cần quản lý duyệt trước khi payroll."
          : "Thiết bị đã ghi nhận.",
    flags
  };
}

export async function updateStaffDeviceAttendanceTrust({
  supabase = createAdminSupabaseClient() as any,
  restaurantId,
  actorUserId,
  input
}: {
  supabase?: any;
  restaurantId: string;
  actorUserId: string;
  input: {
    deviceId: string;
    trustedForAttendance: boolean;
    reason?: string | "";
  };
}) {
  const deviceResult = await supabase
    .from("staff_devices")
    .select("id,staff_member_id,branch_id,device_name,device_fingerprint,trusted_for_attendance,status,revoked_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", input.deviceId)
    .maybeSingle();

  if (deviceResult.error) throw deviceResult.error;
  const device = deviceResult.data as (StaffDeviceTrustRow & { branch_id: string | null }) | null;
  if (!device) throw new AppError("Không tìm thấy thiết bị nhân sự.", 404);
  if (input.trustedForAttendance && !device.device_fingerprint) {
    throw new AppError("Thiết bị cần fingerprint trước khi duyệt chấm công.", 422);
  }
  if (device.status !== "assigned") {
    throw new AppError("Chỉ thiết bị đang cấp mới được duyệt chấm công.", 422);
  }

  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("staff_devices")
    .update({
      trusted_for_attendance: input.trustedForAttendance,
      trusted_at: input.trustedForAttendance ? now : null,
      revoked_at: null,
      note: input.reason || null
    })
    .eq("restaurant_id", restaurantId)
    .eq("id", input.deviceId)
    .select("id,staff_member_id,branch_id,device_name,device_fingerprint,trusted_for_attendance,status,revoked_at")
    .single();

  if (updateResult.error) throw updateResult.error;

  await writeStaffActivityLog({
    restaurantId,
    actorUserId,
    branchId: device.branch_id ?? null,
    entityType: "staff_device",
    entityId: device.id,
    action: input.trustedForAttendance ? "staff_device.trust_attendance" : "staff_device.revoke_attendance_trust",
    severity: input.trustedForAttendance ? "info" : "warning",
    reason: input.reason || null,
    beforeState: device,
    afterState: updateResult.data,
    metadata: {
      staffMemberId: device.staff_member_id,
      deviceFingerprint: device.device_fingerprint
    }
  });

  return updateResult.data;
}
