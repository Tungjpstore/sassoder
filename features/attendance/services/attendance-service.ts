import "server-only";

import { validateStaffAttendanceQrToken } from "@/features/attendance/services/attendance-qr-service";
import { evaluateAttendanceAnomaly } from "@/features/attendance/services/attendance-anomaly-engine";
import { assessAttendanceDeviceTrust, type StaffAttendanceDeviceTrust } from "@/features/staff/services/staff-device-trust-service";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ensureDefaultStoreBranch } from "@/services/branch-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";
import { getRestaurantEntitlement } from "@/services/subscription-service";

type DashboardSession = {
  userId: string;
  restaurantId: string;
  role: "ADMIN" | "STAFF";
};

type AttendanceSource = "gps" | "qr" | "manual" | "offline_sync";

type AttendanceCaptureInput = {
  staffMemberId?: string | "";
  branchId?: string | "";
  lat?: number;
  lng?: number;
  accuracyMeters?: number;
  capturedAt?: string;
  deviceInfo: Record<string, unknown>;
  qrToken?: string | "";
  note?: string | "";
};

type AttendanceClockInInput = AttendanceCaptureInput & {
  shiftAssignmentId?: string | "";
  source: AttendanceSource;
  offlineQueueKey?: string | "";
};

type AttendanceClockOutInput = AttendanceCaptureInput & {
  attendanceLogId?: string | "";
  source: AttendanceSource;
};

type AttendanceApprovalReviewInput = {
  decision: "approved" | "rejected";
  note?: string;
};

type StaffMemberRow = {
  id: string;
  user_id: string;
  full_name: string;
  restaurant_id: string;
  employment_status: "active" | "suspended" | "resigned";
  gps_radius_meters: number;
  archived_at: string | null;
};

type BranchRow = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  is_primary: boolean;
};

type BranchAssignmentRow = {
  branch_id: string;
  assignment_status: "active" | "paused" | "ended";
  ended_at: string | null;
  is_primary: boolean;
};

type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  branch_id: string | null;
  staff_member_id?: string;
  scheduled_date: string;
  status: "scheduled" | "confirmed" | "swapped" | "cancelled" | "completed";
};

type ShiftRow = {
  id: string;
  start_time: string;
  end_time: string;
  allowed_late_minutes: number;
  overtime_threshold_minutes: number;
  attendance_radius_meters: number;
};

type AttendanceLogRow = {
  id: string;
  restaurant_id: string;
  staff_member_id: string;
  staff_user_id: string;
  branch_id: string | null;
  shift_id: string | null;
  shift_assignment_id: string | null;
  attendance_state: "on_time" | "late" | "early_leave" | "overtime" | "absent";
  approval_state: "auto_approved" | "pending" | "approved" | "rejected";
  clock_in_at: string;
  clock_out_at: string | null;
  late_minutes: number;
  overtime_minutes: number;
  anomaly_score: number;
  anomaly_flags: string[];
};

type ApprovalRow = {
  id: string;
  restaurant_id: string;
  attendance_log_id: string | null;
  staff_member_id: string;
  branch_id: string | null;
  request_type: "outside_location" | "attendance_edit" | "overtime" | "shift_override" | "manual_clock_in" | "leave_request" | "shift_swap" | "device_restriction";
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  requested_payload?: Record<string, unknown> | null;
  requested_by?: string | null;
};

type OperationalApprovalSideEffectPlan =
  | {
      kind: "leave_request";
      fromDate: string;
      toDate: string;
      leaveType: string;
      payrollImpact: string;
    }
  | {
      kind: "shift_swap";
      shiftAssignmentId: string;
      targetStaffMemberId: string | null;
      targetStaffUserId: string | null;
      shiftName: string | null;
    }
  | {
      kind: "overtime";
      overtimeDate: string;
      overtimeMinutes: number;
      payrollImpact: string;
    };

type ShiftContext = {
  assignment: ShiftAssignmentRow | null;
  shift: ShiftRow | null;
};

type ResolvedBranchContext = {
  branch: BranchRow;
  requiresApproval: boolean;
  approvalReason: string | null;
};

type GpsEvaluation = {
  distanceMeters: number | null;
  radiusMeters: number;
  valid: boolean;
};

const vietnamTimeZone = "Asia/Ho_Chi_Minh";
const staleOfflineThresholdMs = 24 * 60 * 60 * 1000;
const maxOfflineBackfillMs = 24 * 60 * 60 * 1000;
const maxTrustedClientCaptureAgeMs = 15 * 60 * 1000;
const maxClockSkewMs = 5 * 60 * 1000;

function isMissingStaffOperationsSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /staff_|attendance_|shift_|notifications/i.test(error.message ?? "");
}

function throwDataError(error: { message?: string } | null | undefined, fallback: string) {
  if (error) throw new AppError(error.message || fallback, 400);
}

function dateKeyInVietnam(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: vietnamTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function vietnamDateTime(isoDate: string, time: string) {
  return new Date(`${isoDate}T${time.slice(0, 8)}+07:00`);
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function dateToDayNumber(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86_400_000);
}

function shiftInterval(shift: Pick<ShiftRow, "start_time" | "end_time">, scheduledDate: string) {
  const dayStart = dateToDayNumber(scheduledDate) * 24 * 60;
  const start = dayStart + timeToMinutes(shift.start_time);
  const rawEnd = dayStart + timeToMinutes(shift.end_time);
  return {
    start,
    end: rawEnd <= start ? rawEnd + 24 * 60 : rawEnd
  };
}

function shiftsOverlap(
  left: Pick<ShiftRow, "start_time" | "end_time">,
  leftDate: string,
  right: Pick<ShiftRow, "start_time" | "end_time">,
  rightDate: string
) {
  const leftInterval = shiftInterval(left, leftDate);
  const rightInterval = shiftInterval(right, rightDate);
  return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function assertClockOutAfterClockIn(clockInAt: string, clockOutAt: Date) {
  if (clockOutAt.getTime() <= new Date(clockInAt).getTime()) {
    throw new AppError("Thời gian kết ca phải sau thời gian vào ca.", 409);
  }
}

function parseClientCapturedAt(value: string | undefined) {
  if (!value) return null;
  const capturedAt = new Date(value);
  if (Number.isNaN(capturedAt.getTime())) throw new AppError("Thời gian chấm công không hợp lệ.", 422);
  const now = Date.now();
  if (capturedAt.getTime() > now + maxClockSkewMs) {
    throw new AppError("Thời gian thiết bị đang lệch tương lai. Vui lòng kiểm tra đồng hồ máy.", 409);
  }
  return capturedAt;
}

function normalizeCapturedAt(value: string | undefined, source: "gps" | "qr" | "manual" | "offline_sync") {
  const clientCapturedAt = parseClientCapturedAt(value);
  const now = Date.now();

  if (source !== "offline_sync" && clientCapturedAt && now - clientCapturedAt.getTime() > maxTrustedClientCaptureAgeMs) {
    throw new AppError("Thời gian chấm công đã cũ. Vui lòng thao tác lại hoặc đồng bộ bằng chế độ offline.", 409);
  }

  if (source === "offline_sync") {
    if (!clientCapturedAt) throw new AppError("Dữ liệu offline cần thời gian chấm công gốc.", 422);
    if (now - clientCapturedAt.getTime() > maxOfflineBackfillMs) {
      throw new AppError("Dữ liệu chấm công offline đã quá cũ để đồng bộ tự động.", 409);
    }
    return clientCapturedAt;
  }

  return new Date(now);
}

function haversineMeters(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function evaluateGps({
  lat,
  lng,
  branch,
  radiusMeters
}: {
  lat?: number;
  lng?: number;
  branch: BranchRow;
  radiusMeters: number;
}): GpsEvaluation {
  if (lat === undefined || lng === undefined) {
    return {
      distanceMeters: null,
      radiusMeters,
      valid: true
    };
  }

  if (branch.latitude === null || branch.longitude === null) {
    return {
      distanceMeters: null,
      radiusMeters,
      valid: true
    };
  }

  const distanceMeters = haversineMeters(
    { lat, lng },
    {
      lat: Number(branch.latitude),
      lng: Number(branch.longitude)
    }
  );

  return {
    distanceMeters,
    radiusMeters,
    valid: distanceMeters <= radiusMeters
  };
}

function assertGpsWithinAttendanceRadius({
  session,
  source,
  gps
}: {
  session: DashboardSession;
  source: AttendanceSource;
  gps: GpsEvaluation;
}) {
  if (source !== "gps" || session.role === "ADMIN") return;

  if (gps.distanceMeters === null) {
    throw new AppError("GPS chưa đủ dữ liệu chi nhánh hoặc thiết bị để xác minh chấm công.", 409);
  }

  if (gps.valid) return;

  const distanceLabel =
    gps.distanceMeters === null
      ? "không xác định"
      : gps.distanceMeters >= 1000
        ? `${(gps.distanceMeters / 1000).toFixed(1)}km`
        : `${gps.distanceMeters}m`;

  throw new AppError(`GPS ngoài phạm vi chấm công (${distanceLabel}/${gps.radiusMeters}m). Vui lòng đứng tại chi nhánh hoặc quét QR tại quán.`, 409);
}

function computeClockInTiming(capturedAt: Date, shift: ShiftRow | null, scheduledDate: string | null) {
  if (!shift || !scheduledDate) {
    return {
      lateMinutes: 0,
      state: "on_time" as const
    };
  }

  const expectedStart = vietnamDateTime(scheduledDate, shift.start_time);
  const graceDeadline = new Date(expectedStart.getTime() + shift.allowed_late_minutes * 60_000);
  const lateMinutes = capturedAt > graceDeadline ? minutesBetween(expectedStart, capturedAt) : 0;
  return {
    lateMinutes,
    state: lateMinutes > 0 ? ("late" as const) : ("on_time" as const)
  };
}

function computeClockOutTiming({
  clockInAt,
  clockOutAt,
  currentState,
  shift,
  scheduledDate
}: {
  clockInAt: string;
  clockOutAt: Date;
  currentState: AttendanceLogRow["attendance_state"];
  shift: ShiftRow | null;
  scheduledDate: string | null;
}) {
  const workMinutes = minutesBetween(new Date(clockInAt), clockOutAt);
  if (!shift || !scheduledDate) {
    return {
      workMinutes,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      state: currentState
    };
  }

  const expectedStart = vietnamDateTime(scheduledDate, shift.start_time);
  const endDate = shift.end_time <= shift.start_time ? addDays(scheduledDate, 1) : scheduledDate;
  const expectedEnd = vietnamDateTime(endDate, shift.end_time);
  const earlyLeaveMinutes = clockOutAt < expectedEnd ? minutesBetween(clockOutAt, expectedEnd) : 0;
  const overtimeMinutes =
    clockOutAt.getTime() > expectedEnd.getTime() + shift.overtime_threshold_minutes * 60_000
      ? minutesBetween(expectedEnd, clockOutAt)
      : 0;

  let state = currentState;
  if (overtimeMinutes > 0) state = "overtime";
  else if (earlyLeaveMinutes > 0 && clockOutAt > expectedStart) state = "early_leave";

  return {
    workMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    state
  };
}

function scoreAnomalies({
  gps,
  accuracyMeters,
  source,
  capturedAt,
  lateMinutes,
  workMinutes
}: {
  gps: GpsEvaluation;
  accuracyMeters?: number;
  source: "gps" | "qr" | "manual" | "offline_sync";
  capturedAt: Date;
  lateMinutes?: number;
  workMinutes?: number;
}) {
  const flags: string[] = [];
  let score = 0;

  if (!gps.valid) {
    flags.push("outside_location");
    score += 45;
  }

  if (accuracyMeters !== undefined && accuracyMeters > 120) {
    flags.push("weak_gps_accuracy");
    score += 15;
  }

  if (source === "offline_sync") {
    flags.push("offline_sync");
    score += 15;
    if (Date.now() - capturedAt.getTime() > staleOfflineThresholdMs) {
      flags.push("stale_offline_queue");
      score += 25;
    }
  }

  if (source === "manual") {
    flags.push("manual_attendance");
    score += 20;
  }

  if ((lateMinutes ?? 0) > 0) {
    flags.push("late_attendance");
    score += Math.min(25, Math.ceil((lateMinutes ?? 0) / 10) * 5);
  }

  if ((workMinutes ?? 0) > 16 * 60) {
    flags.push("impossible_long_shift");
    score += 40;
  }

  return {
    score: Math.min(100, score),
    flags
  };
}

function trustedDeviceBypass(): StaffAttendanceDeviceTrust {
  return {
    status: "trusted",
    deviceId: null,
    fingerprint: null,
    trustedForAttendance: true,
    restrictionActive: false,
    approvalRequired: false,
    blocked: false,
    message: "Thao tác quản trị thủ công.",
    flags: []
  };
}

function mergeAnomalyFlags(...groups: string[][]) {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

async function readStaffMember(supabase: any, session: DashboardSession, staffMemberId?: string) {
  let query = supabase
    .from("staff_members")
    .select("id,user_id,full_name,restaurant_id,employment_status,gps_radius_meters,archived_at")
    .eq("restaurant_id", session.restaurantId);

  query = staffMemberId ? query.eq("id", staffMemberId) : query.eq("user_id", session.userId);
  const result = await query.maybeSingle();

  if (result.error) {
    if (isMissingStaffOperationsSchema(result.error)) {
      throw new AppError("Chưa khởi tạo dữ liệu Staff Operations. Vui lòng chạy migration trước.", 503);
    }
    throwDataError(result.error, "Không tải được hồ sơ nhân sự.");
  }

  const staff = result.data as StaffMemberRow | null;
  if (!staff) throw new AppError("Tài khoản này chưa có hồ sơ nhân sự vận hành.", 403);
  if (staffMemberId && staff.user_id !== session.userId && session.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền chấm công thay nhân sự khác.", 403);
  }
  if (staff.employment_status !== "active" || staff.archived_at) {
    throw new AppError("Hồ sơ nhân sự không còn hoạt động.", 403);
  }
  return staff;
}

function assertAttendanceActorScope({
  session,
  staff,
  source
}: {
  session: DashboardSession;
  staff: StaffMemberRow;
  source: AttendanceSource;
}) {
  if (staff.user_id === session.userId) return;
  if (session.role !== "ADMIN") throw new AppError("Bạn không có quyền chấm công thay nhân sự khác.", 403);
  if (source !== "manual") {
    throw new AppError("Chấm công thay nhân sự khác phải dùng nguồn thủ công để tránh dùng sai GPS thiết bị.", 422);
  }
}

async function readBranchAssignments(supabase: any, restaurantId: string, staffMemberId: string) {
  const result = await supabase
    .from("staff_branch_assignments")
    .select("branch_id,assignment_status,ended_at,is_primary")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId);

  if (result.error) throwDataError(result.error, "Không tải được phân chi nhánh.");
  return (result.data ?? []) as BranchAssignmentRow[];
}

async function hasShiftAssignmentForBranch({
  supabase,
  restaurantId,
  staffMemberId,
  branchId,
  capturedAt
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  branchId: string;
  capturedAt: Date;
}) {
  const scheduledDate = dateKeyInVietnam(capturedAt);
  const result = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .in("status", ["scheduled", "confirmed", "swapped"])
    .gte("scheduled_date", addDays(scheduledDate, -1))
    .lte("scheduled_date", addDays(scheduledDate, 1))
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .limit(1)
    .maybeSingle();

  if (result.error) throwDataError(result.error, "Không kiểm tra được ca xoay chi nhánh.");
  return Boolean(result.data?.id);
}

async function resolveBranch({
  supabase,
  session,
  staff,
  branchId,
  capturedAt
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  branchId?: string;
  capturedAt: Date;
}): Promise<ResolvedBranchContext> {
  const defaultBranch = await ensureDefaultStoreBranch(session.restaurantId);
  const assignments = await readBranchAssignments(supabase, session.restaurantId, staff.id);
  const activeAssignments = assignments.filter((assignment) => assignment.assignment_status === "active" && !assignment.ended_at);
  const assignedBranchIds = new Set(activeAssignments.map((assignment) => assignment.branch_id));
  const targetBranchId = branchId || activeAssignments.find((assignment) => assignment.is_primary)?.branch_id || defaultBranch?.id;

  let query = supabase
    .from("store_branches")
    .select("id,name,latitude,longitude,is_active,is_primary")
    .eq("restaurant_id", session.restaurantId)
    .eq("is_active", true);

  if (targetBranchId) {
    query = query.eq("id", targetBranchId).maybeSingle();
  } else {
    query = query.order("is_primary", { ascending: false }).limit(1).maybeSingle();
  }

  const result = await query;
  if (result.error) throwDataError(result.error, "Không tải được chi nhánh chấm công.");

  const branch = result.data as BranchRow | null;
  if (!branch) throw new AppError("Không tìm thấy chi nhánh chấm công đang hoạt động.", 404);

  if (session.role === "ADMIN") {
    return {
      branch,
      requiresApproval: false,
      approvalReason: null
    };
  }

  if (activeAssignments.length === 0) {
    return {
      branch,
      requiresApproval: true,
      approvalReason: "Nhân sự chưa được gán chi nhánh cố định, ghi nhận như ca đột xuất."
    };
  }

  if (assignedBranchIds.size > 0 && !assignedBranchIds.has(branch.id)) {
    const hasRotatedShift = await hasShiftAssignmentForBranch({
      supabase,
      restaurantId: session.restaurantId,
      staffMemberId: staff.id,
      branchId: branch.id,
      capturedAt
    });

    return {
      branch,
      requiresApproval: !hasRotatedShift,
      approvalReason: hasRotatedShift ? null : "Nhân sự chấm công tại chi nhánh chưa được phân công, ghi nhận như xoay ca đột xuất."
    };
  }

  return {
    branch,
    requiresApproval: false,
    approvalReason: null
  };
}

async function resolveShiftContext({
  supabase,
  restaurantId,
  staffMemberId,
  branchId,
  shiftAssignmentId,
  capturedAt
}: {
  supabase: any;
  restaurantId: string;
  staffMemberId: string;
  branchId: string;
  shiftAssignmentId?: string;
  capturedAt: Date;
}): Promise<ShiftContext> {
  const scheduledDate = dateKeyInVietnam(capturedAt);
  let assignmentQuery = supabase
    .from("shift_assignments")
    .select("id,shift_id,branch_id,scheduled_date,status")
    .eq("restaurant_id", restaurantId)
    .eq("staff_member_id", staffMemberId)
    .in("status", ["scheduled", "confirmed", "swapped"]);

  if (shiftAssignmentId) {
    assignmentQuery = assignmentQuery.eq("id", shiftAssignmentId).maybeSingle();
  } else {
    assignmentQuery = assignmentQuery.eq("scheduled_date", scheduledDate).or(`branch_id.is.null,branch_id.eq.${branchId}`).limit(1).maybeSingle();
  }

  const assignmentResult = await assignmentQuery;
  if (assignmentResult.error) throwDataError(assignmentResult.error, "Không tải được ca được phân công.");

  const assignment = assignmentResult.data as ShiftAssignmentRow | null;
  if (!assignment) return { assignment: null, shift: null };

  const shiftResult = await supabase
    .from("shifts")
    .select("id,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters")
    .eq("restaurant_id", restaurantId)
    .eq("id", assignment.shift_id)
    .maybeSingle();

  if (shiftResult.error) throwDataError(shiftResult.error, "Không tải được cấu hình ca làm.");

  return {
    assignment,
    shift: (shiftResult.data as ShiftRow | null) ?? null
  };
}

async function insertActivityLog({
  session,
  staffMemberId,
  branchId,
  entityType,
  entityId,
  action,
  severity,
  reason,
  beforeState,
  afterState,
  deviceInfo,
  metadata
}: {
  supabase: any;
  session: DashboardSession;
  staffMemberId?: string | null;
  branchId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  severity: "info" | "warning" | "critical";
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  deviceInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  await writeStaffActivityLog({
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    branchId: branchId ?? null,
    entityType,
    entityId: entityId ?? null,
    action,
    severity,
    reason: reason || null,
    beforeState,
    afterState,
    deviceInfo,
    metadata: {
      ...(metadata ?? {}),
      targetStaffMemberId: staffMemberId ?? null
    }
  });
}

async function insertNotification({
  supabase,
  restaurantId,
  userId,
  type,
  title,
  body,
  payload
}: {
  supabase: any;
  restaurantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}) {
  const result = await supabase.from("notifications").insert({
    restaurant_id: restaurantId,
    user_id: userId ?? null,
    type,
    title,
    body,
    payload,
    status: "unread"
  });

  if (result.error && !isMissingStaffOperationsSchema(result.error)) {
    throwDataError(result.error, "Không tạo được thông báo vận hành.");
  }
}

function approvalReviewTitle(requestType: ApprovalRow["request_type"], status: "approved" | "rejected") {
  const approved = status === "approved";
  if (requestType === "leave_request") return approved ? "Yêu cầu nghỉ phép đã được duyệt" : "Yêu cầu nghỉ phép bị từ chối";
  if (requestType === "shift_swap") return approved ? "Yêu cầu đổi ca đã được duyệt" : "Yêu cầu đổi ca bị từ chối";
  if (requestType === "overtime") return approved ? "Tăng ca đã được duyệt" : "Tăng ca bị từ chối";
  if (requestType === "device_restriction") return approved ? "Thiết bị chấm công đã được duyệt" : "Thiết bị chấm công bị từ chối";
  return approved ? "Chấm công đã được duyệt" : "Chấm công bị từ chối";
}

function payloadText(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function payloadNumber(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function readStaffNotificationTarget(supabase: any, restaurantId: string, staffMemberId: string) {
  const result = await supabase
    .from("staff_members")
    .select("user_id,full_name")
    .eq("restaurant_id", restaurantId)
    .eq("id", staffMemberId)
    .maybeSingle();

  if (result.error) throwDataError(result.error, "Không tải được nhân sự nhận thông báo.");
  return result.data as { user_id: string | null; full_name: string | null } | null;
}

async function validateTargetShiftSwap({
  supabase,
  session,
  approval,
  shiftAssignmentId,
  targetStaffMemberId
}: {
  supabase: any;
  session: DashboardSession;
  approval: ApprovalRow;
  shiftAssignmentId: string;
  targetStaffMemberId: string | null;
}) {
  const assignmentResult = await supabase
    .from("shift_assignments")
    .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", shiftAssignmentId)
    .maybeSingle();

  if (assignmentResult.error) throwDataError(assignmentResult.error, "Không tải được ca đổi.");
  const assignment = assignmentResult.data as Required<Pick<ShiftAssignmentRow, "id" | "shift_id" | "branch_id" | "staff_member_id" | "scheduled_date" | "status">> | null;
  if (!assignment) throw new AppError("Không tìm thấy ca đổi.", 404);
  if (assignment.status === "cancelled" || assignment.status === "completed") {
    throw new AppError("Ca đổi đã bị huỷ hoặc đã hoàn tất.", 409);
  }
  if (assignment.staff_member_id !== approval.staff_member_id) {
    throw new AppError("Ca đổi không còn thuộc nhân sự gửi yêu cầu.", 409);
  }

  const shiftResult = await supabase
    .from("shifts")
    .select("id,start_time,end_time,name")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", assignment.shift_id)
    .maybeSingle();

  if (shiftResult.error) throwDataError(shiftResult.error, "Không tải được mẫu ca đổi.");
  const shift = shiftResult.data as (ShiftRow & { name?: string | null }) | null;
  if (!shift) throw new AppError("Không tìm thấy mẫu ca đổi.", 404);

  let targetStaffUserId: string | null = null;
  if (targetStaffMemberId) {
    if (targetStaffMemberId === approval.staff_member_id) {
      throw new AppError("Người nhận đổi ca phải khác nhân sự gửi yêu cầu.", 409);
    }

    const targetStaff = await readStaffNotificationTarget(supabase, session.restaurantId, targetStaffMemberId);
    if (!targetStaff) throw new AppError("Không tìm thấy nhân sự nhận đổi ca.", 404);
    targetStaffUserId = targetStaff.user_id;

    const existingAssignmentsResult = await supabase
      .from("shift_assignments")
      .select("id,shift_id,scheduled_date,status")
      .eq("restaurant_id", session.restaurantId)
      .eq("staff_member_id", targetStaffMemberId)
      .gte("scheduled_date", addDays(assignment.scheduled_date, -1))
      .lte("scheduled_date", addDays(assignment.scheduled_date, 1))
      .neq("id", assignment.id)
      .in("status", ["scheduled", "confirmed", "swapped"]);

    if (existingAssignmentsResult.error) throwDataError(existingAssignmentsResult.error, "Không kiểm tra được lịch người nhận ca.");
    const existingAssignments = (existingAssignmentsResult.data ?? []) as ShiftAssignmentRow[];
    const existingShiftIds = [...new Set(existingAssignments.map((item) => item.shift_id))];

    if (existingShiftIds.length > 0) {
      const existingShiftsResult = await supabase
        .from("shifts")
        .select("id,start_time,end_time")
        .in("id", existingShiftIds);

      if (existingShiftsResult.error) throwDataError(existingShiftsResult.error, "Không kiểm tra được giờ ca người nhận.");
      const existingShiftById = new Map(((existingShiftsResult.data ?? []) as ShiftRow[]).map((item) => [item.id, item]));
      const overlappedAssignment = existingAssignments.find((item) => {
        const existingShift = existingShiftById.get(item.shift_id);
        return existingShift ? shiftsOverlap(shift, assignment.scheduled_date, existingShift, item.scheduled_date) : false;
      });

      if (overlappedAssignment) {
        throw new AppError("Người nhận đổi ca đang có ca trùng giờ.", 409);
      }
    }
  }

  return {
    targetStaffUserId,
    shiftName: shift.name ?? null
  };
}

async function prepareOperationalApprovalSideEffect({
  supabase,
  session,
  approval,
  nextStatus
}: {
  supabase: any;
  session: DashboardSession;
  approval: ApprovalRow;
  nextStatus: "approved" | "rejected";
}): Promise<OperationalApprovalSideEffectPlan | null> {
  if (nextStatus !== "approved") return null;
  const payload = approval.requested_payload ?? {};

  if (approval.request_type === "leave_request") {
    const fromDate = payloadText(payload, "fromDate");
    const toDate = payloadText(payload, "toDate") ?? fromDate;
    if (!fromDate || !toDate) throw new AppError("Yêu cầu nghỉ phép thiếu khoảng ngày.", 422);
    if (toDate < fromDate) throw new AppError("Khoảng ngày nghỉ phép không hợp lệ.", 422);

    return {
      kind: "leave_request",
      fromDate,
      toDate,
      leaveType: payloadText(payload, "leaveType") ?? "unpaid",
      payrollImpact: payloadText(payload, "payrollImpact") ?? "unpaid_leave"
    };
  }

  if (approval.request_type === "shift_swap") {
    const shiftAssignmentId = payloadText(payload, "shiftAssignmentId");
    if (!shiftAssignmentId) throw new AppError("Yêu cầu đổi ca thiếu mã ca.", 422);

    const targetStaffMemberId = payloadText(payload, "targetStaffMemberId");
    const target = await validateTargetShiftSwap({
      supabase,
      session,
      approval,
      shiftAssignmentId,
      targetStaffMemberId
    });

    return {
      kind: "shift_swap",
      shiftAssignmentId,
      targetStaffMemberId,
      targetStaffUserId: target.targetStaffUserId,
      shiftName: target.shiftName
    };
  }

  if (approval.request_type === "overtime") {
    const overtimeDate = payloadText(payload, "overtimeDate") ?? payloadText(payload, "fromDate") ?? dateKeyInVietnam(new Date());
    const overtimeMinutes = payloadNumber(payload, "overtimeMinutes") ?? 0;
    if (overtimeMinutes <= 0) throw new AppError("Yêu cầu tăng ca thiếu số phút hợp lệ.", 422);

    return {
      kind: "overtime",
      overtimeDate,
      overtimeMinutes,
      payrollImpact: payloadText(payload, "payrollImpact") ?? "overtime_payable"
    };
  }

  return null;
}

async function applyOperationalApprovalSideEffect({
  supabase,
  session,
  approval,
  plan,
  note
}: {
  supabase: any;
  session: DashboardSession;
  approval: ApprovalRow;
  plan: OperationalApprovalSideEffectPlan | null;
  note?: string;
}) {
  if (!plan) return null;

  if (plan.kind === "leave_request") {
    const updateResult = await supabase
      .from("shift_assignments")
      .update({
        status: "cancelled",
        note: `Nghỉ phép đã duyệt: ${note || approval.reason || plan.leaveType}`
      })
      .eq("restaurant_id", session.restaurantId)
      .eq("staff_member_id", approval.staff_member_id)
      .gte("scheduled_date", plan.fromDate)
      .lte("scheduled_date", plan.toDate)
      .in("status", ["scheduled", "confirmed", "swapped"])
      .select("id,shift_id,staff_member_id,scheduled_date,status,note");

    if (updateResult.error) throwDataError(updateResult.error, "Không cập nhật được lịch nghỉ phép.");

    return {
      kind: plan.kind,
      cancelledShiftAssignmentIds: (updateResult.data ?? []).map((item: { id: string }) => item.id),
      fromDate: plan.fromDate,
      toDate: plan.toDate,
      leaveType: plan.leaveType,
      payrollImpact: plan.payrollImpact
    };
  }

  if (plan.kind === "shift_swap") {
    const updatePayload: Record<string, unknown> = {
      status: "swapped",
      source: "swap",
      note: note || approval.reason || "Đổi ca đã được duyệt"
    };

    if (plan.targetStaffMemberId) {
      updatePayload.staff_member_id = plan.targetStaffMemberId;
    }

    const updateResult = await supabase
      .from("shift_assignments")
      .update(updatePayload)
      .eq("restaurant_id", session.restaurantId)
      .eq("id", plan.shiftAssignmentId)
      .select("id,shift_id,branch_id,staff_member_id,scheduled_date,status,source,note")
      .maybeSingle();

    if (updateResult.error) throwDataError(updateResult.error, "Không cập nhật được ca đổi.");

    if (plan.targetStaffUserId && updateResult.data) {
      await insertNotification({
        supabase,
        restaurantId: session.restaurantId,
        userId: plan.targetStaffUserId,
        type: "shift_swap_assigned",
        title: "Bạn vừa nhận ca đổi",
        body: `${plan.shiftName ?? "Ca làm"} ngày ${updateResult.data.scheduled_date}`,
        payload: {
          approvalId: approval.id,
          shiftAssignmentId: plan.shiftAssignmentId
        }
      });
    }

    return {
      kind: plan.kind,
      shiftAssignmentId: plan.shiftAssignmentId,
      targetStaffMemberId: plan.targetStaffMemberId,
      updatedAssignment: updateResult.data ?? null
    };
  }

  return {
    kind: plan.kind,
    overtimeDate: plan.overtimeDate,
    overtimeMinutes: plan.overtimeMinutes,
    payrollImpact: plan.payrollImpact
  };
}

async function createOutsideLocationApproval({
  supabase,
  session,
  staff,
  branch,
  attendanceLogId,
  distanceMeters,
  radiusMeters,
  reason,
  payload
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  branch: BranchRow;
  attendanceLogId: string;
  distanceMeters: number | null;
  radiusMeters: number;
  reason: string;
  payload: Record<string, unknown>;
}) {
  const existingResult = await supabase
    .from("attendance_approval_requests")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("attendance_log_id", attendanceLogId)
    .eq("request_type", "outside_location")
    .eq("status", "pending")
    .maybeSingle();

  if (existingResult.error) throwDataError(existingResult.error, "Không kiểm tra được yêu cầu phê duyệt.");
  if (existingResult.data?.id) return existingResult.data as { id: string };

  const result = await supabase
    .from("attendance_approval_requests")
    .insert({
      restaurant_id: session.restaurantId,
      attendance_log_id: attendanceLogId,
      staff_member_id: staff.id,
      branch_id: branch.id,
      request_type: "outside_location",
      status: "pending",
      reason,
      requested_payload: {
        ...payload,
        distanceMeters,
        radiusMeters
      },
      requested_by: session.userId
    })
    .select("id")
    .single();

  if (result.error) throwDataError(result.error, "Không tạo được yêu cầu phê duyệt chấm công.");

  await insertNotification({
    supabase,
    restaurantId: session.restaurantId,
    type: "attendance_approval_requested",
    title: "Cần duyệt chấm công ngoài vị trí",
    body: `${staff.full_name} chấm công cách ${branch.name} ${distanceMeters ?? "--"}m.`,
    payload: {
      approvalId: result.data.id,
      attendanceLogId,
      staffMemberId: staff.id,
      branchId: branch.id
    }
  });

  return result.data as { id: string };
}

async function createShiftOverrideApproval({
  supabase,
  session,
  staff,
  branch,
  attendanceLogId,
  reason,
  payload
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  branch: BranchRow;
  attendanceLogId: string;
  reason: string;
  payload: Record<string, unknown>;
}) {
  const existingResult = await supabase
    .from("attendance_approval_requests")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("attendance_log_id", attendanceLogId)
    .eq("request_type", "shift_override")
    .eq("status", "pending")
    .maybeSingle();

  if (existingResult.error) throwDataError(existingResult.error, "Không kiểm tra được yêu cầu xoay ca.");
  if (existingResult.data?.id) return existingResult.data as { id: string };

  const result = await supabase
    .from("attendance_approval_requests")
    .insert({
      restaurant_id: session.restaurantId,
      attendance_log_id: attendanceLogId,
      staff_member_id: staff.id,
      branch_id: branch.id,
      request_type: "shift_override",
      status: "pending",
      reason,
      requested_payload: payload,
      requested_by: session.userId
    })
    .select("id")
    .single();

  if (result.error) throwDataError(result.error, "Không tạo được yêu cầu duyệt ca đột xuất.");

  await insertNotification({
    supabase,
    restaurantId: session.restaurantId,
    type: "shift_override_requested",
    title: "Cần duyệt ca xoay đột xuất",
    body: `${staff.full_name} chấm công tại ${branch.name} nhưng chưa khớp phân ca.`,
    payload: {
      approvalId: result.data.id,
      attendanceLogId,
      staffMemberId: staff.id,
      branchId: branch.id
    }
  });

  return result.data as { id: string };
}

async function createDeviceRestrictionApproval({
  supabase,
  session,
  staff,
  branch,
  attendanceLogId,
  reason,
  payload
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  branch: BranchRow;
  attendanceLogId: string;
  reason: string;
  payload: Record<string, unknown>;
}) {
  const existingResult = await supabase
    .from("attendance_approval_requests")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("attendance_log_id", attendanceLogId)
    .eq("request_type", "device_restriction")
    .eq("status", "pending")
    .maybeSingle();

  if (existingResult.error) throwDataError(existingResult.error, "Không kiểm tra được yêu cầu duyệt thiết bị.");
  if (existingResult.data?.id) return existingResult.data as { id: string };

  const result = await supabase
    .from("attendance_approval_requests")
    .insert({
      restaurant_id: session.restaurantId,
      attendance_log_id: attendanceLogId,
      staff_member_id: staff.id,
      branch_id: branch.id,
      request_type: "device_restriction",
      status: "pending",
      reason,
      requested_payload: payload,
      requested_by: session.userId
    })
    .select("id")
    .single();

  if (result.error) throwDataError(result.error, "Không tạo được yêu cầu duyệt thiết bị chấm công.");

  await insertNotification({
    supabase,
    restaurantId: session.restaurantId,
    type: "attendance_device_review_requested",
    title: "Cần duyệt thiết bị chấm công",
    body: `${staff.full_name} chấm công bằng thiết bị chưa được tin cậy tại ${branch.name}.`,
    payload: {
      approvalId: result.data.id,
      attendanceLogId,
      staffMemberId: staff.id,
      branchId: branch.id
    }
  });

  return result.data as { id: string };
}

async function createAttendanceSourceApproval({
  supabase,
  session,
  staff,
  branch,
  attendanceLogId,
  reason,
  payload
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  branch: BranchRow;
  attendanceLogId: string;
  reason: string;
  payload: Record<string, unknown>;
}) {
  const existingResult = await supabase
    .from("attendance_approval_requests")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("attendance_log_id", attendanceLogId)
    .eq("request_type", "attendance_edit")
    .eq("status", "pending")
    .maybeSingle();

  if (existingResult.error) throwDataError(existingResult.error, "Không kiểm tra được yêu cầu đối soát chấm công.");
  if (existingResult.data?.id) return existingResult.data as { id: string };

  const result = await supabase
    .from("attendance_approval_requests")
    .insert({
      restaurant_id: session.restaurantId,
      attendance_log_id: attendanceLogId,
      staff_member_id: staff.id,
      branch_id: branch.id,
      request_type: "attendance_edit",
      status: "pending",
      reason,
      requested_payload: payload,
      requested_by: session.userId
    })
    .select("id")
    .single();

  if (result.error) throwDataError(result.error, "Không tạo được yêu cầu đối soát chấm công.");

  await insertNotification({
    supabase,
    restaurantId: session.restaurantId,
    type: "attendance_source_review_requested",
    title: "Cần đối soát nguồn chấm công",
    body: `${staff.full_name} chấm công bằng nguồn cần quản lý kiểm tra tại ${branch.name}.`,
    payload: {
      approvalId: result.data.id,
      attendanceLogId,
      staffMemberId: staff.id,
      branchId: branch.id
    }
  });

  return result.data as { id: string };
}

function assertSourceAllowed({
  source,
  session,
  isPremium
}: {
  source: "gps" | "qr" | "manual" | "offline_sync";
  session: DashboardSession;
  isPremium: boolean;
}) {
  if (source === "manual" && session.role !== "ADMIN") {
    throw new AppError("Chấm công thủ công cần quyền quản trị.", 403);
  }

  if ((source === "gps" || source === "offline_sync") && !isPremium) {
    throw new AppError("Chấm công GPS/offline chỉ khả dụng trên gói Premium.", 402);
  }
}

function attendanceSourceApprovalReason(source: AttendanceSource, deviceTrust: StaffAttendanceDeviceTrust) {
  if (source === "offline_sync") {
    return "Dữ liệu chấm công offline cần quản lý đối soát trước khi tính công.";
  }
  if (source === "qr" && !deviceTrust.trustedForAttendance && !deviceTrust.approvalRequired) {
    return "QR chấm công cần thiết bị tin cậy hoặc quản lý đối soát trước khi tính công.";
  }
  return null;
}

export async function clockInStaffAttendance({
  session,
  input
}: {
  session: DashboardSession;
  input: AttendanceClockInInput;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const entitlement = await getRestaurantEntitlement(session.restaurantId);
  const isPremium = entitlement.planCode === "premium";
  const source = input.source ?? "gps";
  assertSourceAllowed({ source, session, isPremium });

  const capturedAt = normalizeCapturedAt(input.capturedAt, source);
  const staff = await readStaffMember(supabase, session, input.staffMemberId || undefined);
  assertAttendanceActorScope({ session, staff, source });

  if (input.offlineQueueKey) {
    const duplicateResult = await supabase
      .from("attendance_logs")
      .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,shift_id,shift_assignment_id,attendance_state,approval_state,clock_in_at,clock_out_at,late_minutes,overtime_minutes,anomaly_score,anomaly_flags")
      .eq("restaurant_id", session.restaurantId)
      .eq("staff_member_id", staff.id)
      .eq("offline_queue_key", input.offlineQueueKey)
      .maybeSingle();
    if (duplicateResult.error) throwDataError(duplicateResult.error, "Không kiểm tra được dữ liệu offline.");
    if (duplicateResult.data) {
      return {
        attendance: duplicateResult.data as AttendanceLogRow,
        approval: null,
        duplicate: true
      };
    }
  }

  const openResult = await supabase
    .from("attendance_logs")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("staff_member_id", staff.id)
    .is("clock_out_at", null)
    .maybeSingle();
  if (openResult.error) throwDataError(openResult.error, "Không kiểm tra được phiên chấm công hiện tại.");
  if (openResult.data?.id) {
    throw new AppError("Nhân sự đang có phiên chấm công mở. Vui lòng kết ca trước.", 409);
  }

  const branchContext = await resolveBranch({
    supabase,
    session,
    staff,
    branchId: input.branchId || undefined,
    capturedAt
  });
  const branch = branchContext.branch;
  const shiftContext = await resolveShiftContext({
    supabase,
    restaurantId: session.restaurantId,
    staffMemberId: staff.id,
    branchId: branch.id,
    shiftAssignmentId: input.shiftAssignmentId || undefined,
    capturedAt
  });
  const deviceTrust = source === "manual"
    ? trustedDeviceBypass()
    : await assessAttendanceDeviceTrust({
        supabase,
        restaurantId: session.restaurantId,
        staffMemberId: staff.id,
        branchId: branch.id,
        deviceInfo: input.deviceInfo
      });
  if (deviceTrust.blocked) {
    throw new AppError("Thiết bị này đang bị khoá, bảo trì hoặc gán cho nhân sự khác.", 403);
  }
  const qrToken = source === "qr"
    ? await validateStaffAttendanceQrToken({
        supabase,
        restaurantId: session.restaurantId,
        branchId: branch.id,
        token: input.qrToken,
        usedAt: capturedAt,
        clock: "in",
        staffMemberId: staff.id
      })
    : null;
  const radiusMeters = shiftContext.shift?.attendance_radius_meters ?? staff.gps_radius_meters ?? 80;
  const gps = evaluateGps({
    lat: input.lat,
    lng: input.lng,
    branch,
    radiusMeters
  });
  assertGpsWithinAttendanceRadius({ session, source, gps });
  const timing = computeClockInTiming(capturedAt, shiftContext.shift, shiftContext.assignment?.scheduled_date ?? null);
  const anomaly = scoreAnomalies({
    gps,
    accuracyMeters: input.accuracyMeters,
    source,
    capturedAt,
    lateMinutes: timing.lateMinutes
  });
  const anomalyFlags = mergeAnomalyFlags(anomaly.flags, deviceTrust.flags);
  const anomalyScore = Math.min(100, anomaly.score + (deviceTrust.approvalRequired ? 25 : 0));
  const shiftOverrideReason = branchContext.approvalReason ?? (!shiftContext.assignment ? "Chưa có ca được gán cho thời điểm chấm công, ghi nhận như ca đột xuất." : null);
  const deviceApprovalReason = deviceTrust.approvalRequired ? deviceTrust.message : null;
  const sourceApprovalReason = attendanceSourceApprovalReason(source, deviceTrust);
  const approvalState = gps.valid && !shiftOverrideReason && !deviceApprovalReason && !sourceApprovalReason ? "auto_approved" : "pending";
  const clockInDevice = {
    ...input.deviceInfo,
    deviceTrustStatus: deviceTrust.status,
    trustedForAttendance: deviceTrust.trustedForAttendance,
    staffDeviceId: deviceTrust.deviceId
  };

  const insertResult = await supabase
    .from("attendance_logs")
    .insert({
      restaurant_id: session.restaurantId,
      staff_member_id: staff.id,
      staff_user_id: staff.user_id,
      branch_id: branch.id,
      shift_id: shiftContext.shift?.id ?? null,
      shift_assignment_id: shiftContext.assignment?.id ?? null,
      clock_in_at: capturedAt.toISOString(),
      clock_in_source: source,
      clock_in_lat: input.lat ?? null,
      clock_in_lng: input.lng ?? null,
      clock_in_accuracy_meters: input.accuracyMeters ?? null,
      clock_in_distance_meters: gps.distanceMeters,
      clock_in_device: clockInDevice,
      attendance_state: timing.state,
      approval_state: approvalState,
      late_minutes: timing.lateMinutes,
      anomaly_score: anomalyScore,
      anomaly_flags: anomalyFlags,
      offline_queue_key: input.offlineQueueKey || null,
      raw_payload: {
        source,
        staffMemberId: input.staffMemberId || null,
        capturedAt: input.capturedAt ?? null,
        branchId: input.branchId || null,
        shiftAssignmentId: input.shiftAssignmentId || null,
        qrTokenId: qrToken?.id ?? null,
        deviceTrustStatus: deviceTrust.status,
        staffDeviceId: deviceTrust.deviceId
      },
      note: input.note || null
    })
    .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,shift_id,shift_assignment_id,attendance_state,approval_state,clock_in_at,clock_out_at,late_minutes,overtime_minutes,anomaly_score,anomaly_flags")
    .single();

  if (insertResult.error) throwDataError(insertResult.error, "Không ghi được chấm công.");
  const attendance = insertResult.data as AttendanceLogRow;

  let approval: { id: string } | null = null;
  if (!gps.valid) {
    approval = await createOutsideLocationApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      distanceMeters: gps.distanceMeters,
      radiusMeters: gps.radiusMeters,
      reason: "Thiết bị nằm ngoài bán kính chấm công.",
      payload: {
        source,
        clock: "in",
        accuracyMeters: input.accuracyMeters ?? null
      }
    });
  }

  if (shiftOverrideReason) {
    approval = await createShiftOverrideApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: shiftOverrideReason,
      payload: {
        source,
        clock: "in",
        branchId: branch.id,
        scheduledDate: dateKeyInVietnam(capturedAt),
        shiftAssignmentId: input.shiftAssignmentId || null
      }
    });
  }

  if (deviceApprovalReason) {
    approval = await createDeviceRestrictionApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: deviceApprovalReason,
      payload: {
        source,
        clock: "in",
        deviceTrust,
        branchId: branch.id
      }
    });
  }

  if (sourceApprovalReason) {
    approval = await createAttendanceSourceApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: sourceApprovalReason,
      payload: {
        source,
        clock: "in",
        capturedAt: capturedAt.toISOString(),
        clientCapturedAt: input.capturedAt ?? null,
        qrTokenId: qrToken?.id ?? null,
        deviceTrust
      }
    });
  }

  await insertActivityLog({
    supabase,
    session,
    staffMemberId: staff.id,
    branchId: branch.id,
    entityType: "attendance_log",
    entityId: attendance.id,
    action: "attendance.clock_in",
    severity: approvalState === "pending" || anomalyScore >= 60 ? "warning" : "info",
    reason: input.note || null,
    afterState: attendance,
    deviceInfo: clockInDevice,
    metadata: {
      source,
      qrTokenId: qrToken?.id ?? null,
      distanceMeters: gps.distanceMeters,
      radiusMeters: gps.radiusMeters,
      shiftOverrideReason,
      deviceApprovalReason,
      sourceApprovalReason,
      deviceTrust,
      anomalyScore,
      anomalyFlags
    }
  });

  const evaluatedAnomaly = await evaluateAttendanceAnomaly({
    supabase,
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    staffMemberId: staff.id,
    staffUserId: staff.user_id,
    staffName: staff.full_name,
    branchId: branch.id,
    attendanceLogId: attendance.id,
    currentScore: anomalyScore,
    currentFlags: anomalyFlags,
    stage: "clock_in",
    lateMinutes: timing.lateMinutes,
    distanceMeters: gps.distanceMeters,
    anomalyDetectionEnabled: isPremium
  });

  return {
    attendance: {
      ...attendance,
      anomaly_score: evaluatedAnomaly.score,
      anomaly_flags: evaluatedAnomaly.flags
    },
    approval,
    duplicate: false
  };
}

async function readOpenAttendance({
  supabase,
  session,
  staff,
  attendanceLogId
}: {
  supabase: any;
  session: DashboardSession;
  staff: StaffMemberRow;
  attendanceLogId?: string;
}) {
  let query = supabase
    .from("attendance_logs")
    .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,shift_id,shift_assignment_id,attendance_state,approval_state,clock_in_at,clock_out_at,late_minutes,overtime_minutes,anomaly_score,anomaly_flags")
    .eq("restaurant_id", session.restaurantId)
    .eq("staff_member_id", staff.id);

  if (attendanceLogId) query = query.eq("id", attendanceLogId).maybeSingle();
  else query = query.is("clock_out_at", null).maybeSingle();

  const result = await query;
  if (result.error) throwDataError(result.error, "Không tải được phiên chấm công.");
  const attendance = result.data as AttendanceLogRow | null;
  if (!attendance) throw new AppError("Không tìm thấy phiên chấm công đang mở.", 404);
  if (attendance.clock_out_at) throw new AppError("Phiên chấm công này đã kết ca.", 409);
  return attendance;
}

async function readShiftForAttendance(supabase: any, restaurantId: string, attendance: AttendanceLogRow): Promise<ShiftContext> {
  if (!attendance.shift_id) return { assignment: null, shift: null };

  const [shiftResult, assignmentResult] = await Promise.all([
    supabase
      .from("shifts")
      .select("id,start_time,end_time,allowed_late_minutes,overtime_threshold_minutes,attendance_radius_meters")
      .eq("restaurant_id", restaurantId)
      .eq("id", attendance.shift_id)
      .maybeSingle(),
    attendance.shift_assignment_id
      ? supabase
          .from("shift_assignments")
          .select("id,shift_id,branch_id,scheduled_date,status")
          .eq("restaurant_id", restaurantId)
          .eq("id", attendance.shift_assignment_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (shiftResult.error) throwDataError(shiftResult.error, "Không tải được ca làm.");
  if (assignmentResult.error) throwDataError(assignmentResult.error, "Không tải được phân ca.");

  return {
    shift: (shiftResult.data as ShiftRow | null) ?? null,
    assignment: (assignmentResult.data as ShiftAssignmentRow | null) ?? null
  };
}

export async function clockOutStaffAttendance({
  session,
  input
}: {
  session: DashboardSession;
  input: AttendanceClockOutInput;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const entitlement = await getRestaurantEntitlement(session.restaurantId);
  const isPremium = entitlement.planCode === "premium";
  const source = input.source ?? "gps";
  assertSourceAllowed({ source, session, isPremium });

  const capturedAt = normalizeCapturedAt(input.capturedAt, source);
  const staff = await readStaffMember(supabase, session, input.staffMemberId || undefined);
  assertAttendanceActorScope({ session, staff, source });
  const attendance = await readOpenAttendance({
    supabase,
    session,
    staff,
    attendanceLogId: input.attendanceLogId || undefined
  });
  assertClockOutAfterClockIn(attendance.clock_in_at, capturedAt);
  const branchContext = await resolveBranch({
    supabase,
    session,
    staff,
    branchId: input.branchId || attendance.branch_id || undefined,
    capturedAt
  });
  const branch = branchContext.branch;
  const shiftContext = await readShiftForAttendance(supabase, session.restaurantId, attendance);
  const deviceTrust = source === "manual"
    ? trustedDeviceBypass()
    : await assessAttendanceDeviceTrust({
        supabase,
        restaurantId: session.restaurantId,
        staffMemberId: staff.id,
        branchId: branch.id,
        deviceInfo: input.deviceInfo
      });
  if (deviceTrust.blocked) {
    throw new AppError("Thiết bị này đang bị khoá, bảo trì hoặc gán cho nhân sự khác.", 403);
  }
  const qrToken = source === "qr"
    ? await validateStaffAttendanceQrToken({
        supabase,
        restaurantId: session.restaurantId,
        branchId: branch.id,
        token: input.qrToken,
        usedAt: capturedAt,
        clock: "out",
        staffMemberId: staff.id
      })
    : null;
  const radiusMeters = shiftContext.shift?.attendance_radius_meters ?? staff.gps_radius_meters ?? 80;
  const gps = evaluateGps({
    lat: input.lat,
    lng: input.lng,
    branch,
    radiusMeters
  });
  assertGpsWithinAttendanceRadius({ session, source, gps });
  const timing = computeClockOutTiming({
    clockInAt: attendance.clock_in_at,
    clockOutAt: capturedAt,
    currentState: attendance.attendance_state,
    shift: shiftContext.shift,
    scheduledDate: shiftContext.assignment?.scheduled_date ?? dateKeyInVietnam(new Date(attendance.clock_in_at))
  });
  const anomaly = scoreAnomalies({
    gps,
    accuracyMeters: input.accuracyMeters,
    source,
    capturedAt,
    workMinutes: timing.workMinutes
  });
  const shiftOverrideReason = branchContext.approvalReason ?? (!shiftContext.assignment ? "Phiên chấm công không khớp ca đã gán, ghi nhận như ca đột xuất." : null);
  const deviceApprovalReason = deviceTrust.approvalRequired ? deviceTrust.message : null;
  const sourceApprovalReason = attendanceSourceApprovalReason(source, deviceTrust);
  const approvalState = attendance.approval_state === "pending" || !gps.valid || shiftOverrideReason || deviceApprovalReason || sourceApprovalReason ? "pending" : attendance.approval_state;
  const anomalyFlags = mergeAnomalyFlags(attendance.anomaly_flags ?? [], anomaly.flags, deviceTrust.flags);
  const anomalyScore = Math.min(100, Math.max(attendance.anomaly_score ?? 0, anomaly.score + (deviceTrust.approvalRequired ? 25 : 0)));
  const clockOutDevice = {
    ...input.deviceInfo,
    deviceTrustStatus: deviceTrust.status,
    trustedForAttendance: deviceTrust.trustedForAttendance,
    staffDeviceId: deviceTrust.deviceId
  };

  const updateResult = await supabase
    .from("attendance_logs")
    .update({
      clock_out_at: capturedAt.toISOString(),
      clock_out_source: source,
      clock_out_lat: input.lat ?? null,
      clock_out_lng: input.lng ?? null,
      clock_out_accuracy_meters: input.accuracyMeters ?? null,
      clock_out_distance_meters: gps.distanceMeters,
      clock_out_device: clockOutDevice,
      attendance_state: timing.state,
      approval_state: approvalState,
      early_leave_minutes: timing.earlyLeaveMinutes,
      overtime_minutes: timing.overtimeMinutes,
      work_minutes: timing.workMinutes,
      anomaly_score: anomalyScore,
      anomaly_flags: anomalyFlags,
      note: input.note || null
    })
    .eq("id", attendance.id)
    .eq("restaurant_id", session.restaurantId)
    .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,shift_id,shift_assignment_id,attendance_state,approval_state,clock_in_at,clock_out_at,late_minutes,overtime_minutes,anomaly_score,anomaly_flags")
    .single();

  if (updateResult.error) throwDataError(updateResult.error, "Không lưu được kết ca.");
  const updatedAttendance = updateResult.data as AttendanceLogRow;

  let approval: { id: string } | null = null;
  if (!gps.valid) {
    approval = await createOutsideLocationApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      distanceMeters: gps.distanceMeters,
      radiusMeters: gps.radiusMeters,
      reason: "Thiết bị kết ca nằm ngoài bán kính chấm công.",
      payload: {
        source,
        clock: "out",
        accuracyMeters: input.accuracyMeters ?? null
      }
    });
  }

  if (shiftOverrideReason) {
    approval = await createShiftOverrideApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: shiftOverrideReason,
      payload: {
        source,
        clock: "out",
        branchId: branch.id,
        scheduledDate: dateKeyInVietnam(capturedAt),
        attendanceLogId: attendance.id
      }
    });
  }

  if (deviceApprovalReason) {
    approval = await createDeviceRestrictionApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: deviceApprovalReason,
      payload: {
        source,
        clock: "out",
        deviceTrust,
        branchId: branch.id,
        attendanceLogId: attendance.id
      }
    });
  }

  if (sourceApprovalReason) {
    approval = await createAttendanceSourceApproval({
      supabase,
      session,
      staff,
      branch,
      attendanceLogId: attendance.id,
      reason: sourceApprovalReason,
      payload: {
        source,
        clock: "out",
        capturedAt: capturedAt.toISOString(),
        clientCapturedAt: input.capturedAt ?? null,
        qrTokenId: qrToken?.id ?? null,
        attendanceLogId: attendance.id,
        deviceTrust
      }
    });
  }

  await insertActivityLog({
    supabase,
    session,
    staffMemberId: staff.id,
    branchId: branch.id,
    entityType: "attendance_log",
    entityId: attendance.id,
    action: "attendance.clock_out",
    severity: approvalState === "pending" || anomalyScore >= 60 ? "warning" : "info",
    reason: input.note || null,
    beforeState: attendance,
    afterState: updatedAttendance,
    deviceInfo: clockOutDevice,
    metadata: {
      source,
      qrTokenId: qrToken?.id ?? null,
      distanceMeters: gps.distanceMeters,
      radiusMeters: gps.radiusMeters,
      shiftOverrideReason,
      deviceApprovalReason,
      sourceApprovalReason,
      deviceTrust,
      anomalyScore,
      anomalyFlags
    }
  });

  const evaluatedAnomaly = await evaluateAttendanceAnomaly({
    supabase,
    restaurantId: session.restaurantId,
    actorUserId: session.userId,
    staffMemberId: staff.id,
    staffUserId: staff.user_id,
    staffName: staff.full_name,
    branchId: branch.id,
    attendanceLogId: updatedAttendance.id,
    currentScore: anomalyScore,
    currentFlags: anomalyFlags,
    stage: "clock_out",
    overtimeMinutes: timing.overtimeMinutes,
    workMinutes: timing.workMinutes,
    distanceMeters: gps.distanceMeters,
    anomalyDetectionEnabled: isPremium
  });

  return {
    attendance: {
      ...updatedAttendance,
      anomaly_score: evaluatedAnomaly.score,
      anomaly_flags: evaluatedAnomaly.flags
    },
    approval
  };
}

export async function reviewAttendanceApproval({
  session,
  approvalId,
  input
}: {
  session: DashboardSession;
  approvalId: string;
  input: AttendanceApprovalReviewInput;
}) {
  if (session.role !== "ADMIN") throw new AppError("Cần quyền quản trị để duyệt chấm công.", 403);

  const supabase = createAdminSupabaseClient() as any;
  const approvalResult = await supabase
    .from("attendance_approval_requests")
    .select("id,restaurant_id,attendance_log_id,staff_member_id,branch_id,request_type,status,reason,requested_payload,requested_by")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalResult.error) throwDataError(approvalResult.error, "Không tải được yêu cầu phê duyệt.");
  const approval = approvalResult.data as ApprovalRow | null;
  if (!approval) throw new AppError("Không tìm thấy yêu cầu phê duyệt.", 404);
  if (approval.status !== "pending") throw new AppError("Yêu cầu phê duyệt này đã được xử lý.", 409);

  const nextStatus = input.decision;
  const sideEffectPlan = await prepareOperationalApprovalSideEffect({
    supabase,
    session,
    approval,
    nextStatus
  });
  const updateApprovalResult = await supabase
    .from("attendance_approval_requests")
    .update({
      status: nextStatus,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
      review_note: input.note || null
    })
    .eq("id", approval.id)
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "pending")
    .select("id,restaurant_id,attendance_log_id,staff_member_id,branch_id,request_type,status,reason,requested_payload,requested_by")
    .single();

  if (updateApprovalResult.error) throwDataError(updateApprovalResult.error, "Không cập nhật được phê duyệt.");

  let attendance: AttendanceLogRow | null = null;
  if (approval.attendance_log_id) {
    const attendanceUpdate = await supabase
      .from("attendance_logs")
      .update({
        approval_state: nextStatus === "approved" ? "approved" : "rejected"
      })
      .eq("restaurant_id", session.restaurantId)
      .eq("id", approval.attendance_log_id)
      .select("id,restaurant_id,staff_member_id,staff_user_id,branch_id,shift_id,shift_assignment_id,attendance_state,approval_state,clock_in_at,clock_out_at,late_minutes,overtime_minutes,anomaly_score,anomaly_flags")
      .maybeSingle();

    if (attendanceUpdate.error) throwDataError(attendanceUpdate.error, "Không cập nhật được log chấm công.");
    attendance = attendanceUpdate.data as AttendanceLogRow | null;
  }

  const sideEffect = await applyOperationalApprovalSideEffect({
    supabase,
    session,
    approval,
    plan: sideEffectPlan,
    note: input.note
  });

  await insertActivityLog({
    supabase,
    session,
    branchId: approval.branch_id,
    entityType: "attendance_approval_request",
    entityId: approval.id,
    action: nextStatus === "approved" ? "attendance.approval_approved" : "attendance.approval_rejected",
    severity: nextStatus === "approved" ? "info" : "warning",
    reason: input.note || approval.reason,
    beforeState: approval,
    afterState: updateApprovalResult.data,
    metadata: {
      attendanceLogId: approval.attendance_log_id,
      requestType: approval.request_type,
      requestedPayload: approval.requested_payload ?? {},
      sideEffect
    }
  });

  const notificationTarget = attendance?.staff_user_id
    ? { user_id: attendance.staff_user_id }
    : await readStaffNotificationTarget(supabase, session.restaurantId, approval.staff_member_id);

  if (notificationTarget?.user_id) {
    await insertNotification({
      supabase,
      restaurantId: session.restaurantId,
      userId: notificationTarget.user_id,
      type: "attendance_approval_reviewed",
      title: approvalReviewTitle(approval.request_type, nextStatus),
      body: input.note || (nextStatus === "approved" ? "Quản lý đã duyệt yêu cầu của bạn." : "Quản lý đã từ chối yêu cầu của bạn."),
      payload: {
        approvalId: approval.id,
        attendanceLogId: attendance?.id ?? null,
        status: nextStatus,
        requestType: approval.request_type
      }
    });
  }

  return {
    approval: updateApprovalResult.data as ApprovalRow,
    attendance
  };
}
