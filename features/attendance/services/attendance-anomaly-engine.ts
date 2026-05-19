import "server-only";

type AttendanceAnomalySeverity = "info" | "warning" | "critical";

type AttendanceAnomalyContext = {
  supabase: any;
  restaurantId: string;
  actorUserId: string;
  staffMemberId: string;
  staffUserId: string;
  staffName: string;
  branchId?: string | null;
  attendanceLogId: string;
  currentScore: number;
  currentFlags: string[];
  stage: "clock_in" | "clock_out";
  lateMinutes?: number;
  overtimeMinutes?: number;
  workMinutes?: number | null;
  distanceMeters?: number | null;
  anomalyDetectionEnabled: boolean;
};

type AttendanceHistoryRow = {
  id: string;
  attendance_state: "on_time" | "late" | "early_leave" | "overtime" | "absent";
  approval_state: "auto_approved" | "pending" | "approved" | "rejected";
  late_minutes: number;
  overtime_minutes: number;
  work_minutes: number | null;
  anomaly_score: number;
  anomaly_flags: string[] | null;
  clock_in_at: string;
};

type ApprovalHistoryRow = {
  request_type: "outside_location" | "attendance_edit" | "overtime" | "shift_override" | "manual_clock_in" | "leave_request" | "shift_swap" | "device_restriction";
  status: "pending" | "approved" | "rejected" | "cancelled";
};

type SessionHistoryRow = {
  id: string;
  device_fingerprint: string | null;
  last_seen_at: string;
  forced_logout_at: string | null;
};

function isMissingAnomalySchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /attendance_logs|attendance_approval_requests|staff_sessions|staff_activity_logs|notifications/i.test(message);
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString();
}

function severityFromScore(score: number): AttendanceAnomalySeverity {
  if (score >= 75) return "critical";
  if (score >= 45) return "warning";
  return "info";
}

function uniqueFlags(flags: string[]) {
  return [...new Set(flags)].filter(Boolean);
}

function warningLabels(flags: string[]) {
  const labels: Record<string, string> = {
    repeated_lateness: "đi muộn lặp lại",
    repeated_outside_location: "chấm công ngoài vị trí nhiều lần",
    repeated_overtime: "tăng ca bất thường",
    multi_device_abuse: "nhiều thiết bị hoạt động cùng lúc",
    excessive_late_minutes: "đi muộn quá lâu",
    excessive_overtime_minutes: "tăng ca quá dài",
    impossible_long_shift: "ca làm dài bất thường",
    pending_approval_pattern: "nhiều phê duyệt đang chờ",
    high_recent_anomaly_score: "điểm bất thường gần đây cao"
  };

  return flags.map((flag) => labels[flag]).filter(Boolean);
}

async function insertAnomalyActivity({
  supabase,
  input,
  score,
  flags,
  severity
}: {
  supabase: any;
  input: AttendanceAnomalyContext;
  score: number;
  flags: string[];
  severity: AttendanceAnomalySeverity;
}) {
  const { error } = await supabase.from("staff_activity_logs").insert({
    restaurant_id: input.restaurantId,
    actor_user_id: input.actorUserId,
    actor_staff_member_id: input.staffMemberId,
    branch_id: input.branchId ?? null,
    entity_type: "attendance_log",
    entity_id: input.attendanceLogId,
    action: "attendance.anomaly_detected",
    severity,
    reason: warningLabels(flags).join(", ") || "Phát hiện bất thường chấm công",
    after_state: {
      attendanceLogId: input.attendanceLogId,
      stage: input.stage,
      score,
      flags
    },
    metadata: {
      source: "attendance_anomaly_engine",
      lateMinutes: input.lateMinutes ?? 0,
      overtimeMinutes: input.overtimeMinutes ?? 0,
      workMinutes: input.workMinutes ?? null,
      distanceMeters: input.distanceMeters ?? null
    }
  });

  if (error && !isMissingAnomalySchema(error)) throw error;
}

async function insertManagerNotification({
  supabase,
  input,
  score,
  flags,
  severity
}: {
  supabase: any;
  input: AttendanceAnomalyContext;
  score: number;
  flags: string[];
  severity: AttendanceAnomalySeverity;
}) {
  const { error } = await supabase.from("notifications").insert({
    restaurant_id: input.restaurantId,
    user_id: null,
    type: "attendance_anomaly_detected",
    title: severity === "critical" ? "Bất thường chấm công nghiêm trọng" : "Cảnh báo chấm công cần xem",
    body: `${input.staffName} có điểm bất thường ${score}/100: ${warningLabels(flags).join(", ") || "cần kiểm tra"}.`,
    action_url: "/dashboard/staff",
    status: "unread",
    payload: {
      attendanceLogId: input.attendanceLogId,
      staffMemberId: input.staffMemberId,
      staffUserId: input.staffUserId,
      stage: input.stage,
      score,
      flags
    }
  });

  if (error && !isMissingAnomalySchema(error)) throw error;
}

export async function evaluateAttendanceAnomaly(input: AttendanceAnomalyContext) {
  if (!input.anomalyDetectionEnabled) {
    return {
      score: input.currentScore,
      flags: uniqueFlags(input.currentFlags),
      severity: severityFromScore(input.currentScore),
      warningLabels: warningLabels(input.currentFlags)
    };
  }

  const since30Days = daysAgo(30);
  const since15Minutes = new Date(Date.now() - 15 * 60_000).toISOString();

  const [attendanceResult, approvalResult, sessionResult] = await Promise.all([
    input.supabase
      .from("attendance_logs")
      .select("id,attendance_state,approval_state,late_minutes,overtime_minutes,work_minutes,anomaly_score,anomaly_flags,clock_in_at")
      .eq("restaurant_id", input.restaurantId)
      .eq("staff_member_id", input.staffMemberId)
      .gte("clock_in_at", since30Days)
      .order("clock_in_at", { ascending: false })
      .limit(60),
    input.supabase
      .from("attendance_approval_requests")
      .select("request_type,status")
      .eq("restaurant_id", input.restaurantId)
      .eq("staff_member_id", input.staffMemberId)
      .gte("created_at", since30Days),
    input.supabase
      .from("staff_sessions")
      .select("id,device_fingerprint,last_seen_at,forced_logout_at")
      .eq("restaurant_id", input.restaurantId)
      .eq("staff_member_id", input.staffMemberId)
      .gte("last_seen_at", since15Minutes)
  ]);

  if (attendanceResult.error && !isMissingAnomalySchema(attendanceResult.error)) throw attendanceResult.error;
  if (approvalResult.error && !isMissingAnomalySchema(approvalResult.error)) throw approvalResult.error;
  if (sessionResult.error && !isMissingAnomalySchema(sessionResult.error)) throw sessionResult.error;

  const attendanceRows = (attendanceResult.data ?? []) as AttendanceHistoryRow[];
  const approvals = (approvalResult.data ?? []) as ApprovalHistoryRow[];
  const sessions = (sessionResult.data ?? []) as SessionHistoryRow[];
  const initialFlags = uniqueFlags(input.currentFlags);
  const flags = [...initialFlags];
  let score = input.currentScore;
  const addSignal = (flag: string, points: number) => {
    if (flags.includes(flag)) return;
    flags.push(flag);
    score += points;
  };
  const raiseSignal = (flag: string, minimumScore: number, pointsWhenNew: number) => {
    addSignal(flag, pointsWhenNew);
    score = Math.max(score, minimumScore);
  };

  const lateRows = attendanceRows.filter((row) => row.late_minutes > 0);
  const outsideApprovals = approvals.filter((row) => row.request_type === "outside_location");
  const overtimeRows = attendanceRows.filter((row) => row.overtime_minutes >= 30);
  const pendingApprovals = approvals.filter((row) => row.status === "pending");
  const recentHighAnomalies = attendanceRows.filter((row) => row.id !== input.attendanceLogId && row.anomaly_score >= 60);
  const activeDeviceCount = new Set(sessions.filter((row) => !row.forced_logout_at).map((row) => row.device_fingerprint || row.id)).size;

  if (lateRows.length >= 3) {
    addSignal("repeated_lateness", Math.min(25, lateRows.length * 4));
  }

  if ((input.lateMinutes ?? 0) >= 30) {
    addSignal("excessive_late_minutes", 15);
  }

  if (outsideApprovals.length >= 2) {
    addSignal("repeated_outside_location", Math.min(30, outsideApprovals.length * 8));
  }

  if (overtimeRows.length >= 3) {
    addSignal("repeated_overtime", Math.min(20, overtimeRows.length * 4));
  }

  if ((input.overtimeMinutes ?? 0) >= 120) {
    addSignal("excessive_overtime_minutes", 20);
  }

  if ((input.workMinutes ?? 0) > 16 * 60) {
    raiseSignal("impossible_long_shift", 75, 35);
  }

  if (activeDeviceCount > 1) {
    addSignal("multi_device_abuse", Math.min(25, activeDeviceCount * 8));
  }

  if (pendingApprovals.length >= 3) {
    addSignal("pending_approval_pattern", 15);
  }

  if (recentHighAnomalies.length >= 2) {
    addSignal("high_recent_anomaly_score", 18);
  }

  const normalizedFlags = uniqueFlags(flags);
  const normalizedScore = Math.min(100, score);
  const severity = severityFromScore(normalizedScore);
  const anomalyChanged = normalizedScore > input.currentScore || normalizedFlags.length > initialFlags.length;
  const outsideOnlyBaseAlert = !anomalyChanged && initialFlags.length === 1 && initialFlags[0] === "outside_location";

  if (anomalyChanged) {
    const updateResult = await input.supabase
      .from("attendance_logs")
      .update({
        anomaly_score: normalizedScore,
        anomaly_flags: normalizedFlags
      })
      .eq("restaurant_id", input.restaurantId)
      .eq("id", input.attendanceLogId);

    if (updateResult.error && !isMissingAnomalySchema(updateResult.error)) throw updateResult.error;
  }

  if (normalizedScore >= 45 && !outsideOnlyBaseAlert && (input.stage === "clock_in" || anomalyChanged)) {
    await insertAnomalyActivity({
      supabase: input.supabase,
      input,
      score: normalizedScore,
      flags: normalizedFlags,
      severity
    });

    await insertManagerNotification({
      supabase: input.supabase,
      input,
      score: normalizedScore,
      flags: normalizedFlags,
      severity
    });
  }

  return {
    score: normalizedScore,
    flags: normalizedFlags,
    severity,
    warningLabels: warningLabels(normalizedFlags)
  };
}
