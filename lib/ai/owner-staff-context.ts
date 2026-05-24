export type OwnerStaffSnapshot = {
  schemaReady?: boolean | null;
  memberCount?: number | null;
  activeCount?: number | null;
  suspendedCount?: number | null;
  archivedCount?: number | null;
  onlineCount?: number | null;
  currentlyClockedIn?: number | null;
  attendanceLogCount24h?: number | null;
  lateCount24h?: number | null;
  overtimeMinutes24h?: number | null;
  pendingApprovalCount?: number | null;
  pendingApprovalByType?: Record<string, number> | null;
  roleBreakdown?: Record<string, number> | null;
  assignedBranchCount?: number | null;
  unassignedActiveCount?: number | null;
  averageReviewScore?: number | null;
  lowReviewCount?: number | null;
  draftReviewCount?: number | null;
  shiftCount7d?: number | null;
  upcomingShiftCount?: number | null;
  activeStaff?: Array<{ name?: string | null; role?: string | null; lastSeenAt?: string | null }> | null;
  clockedInStaff?: Array<{ name?: string | null; state?: string | null; lateMinutes?: number | null; overtimeMinutes?: number | null }> | null;
  pendingRequests?: Array<{ name?: string | null; type?: string | null; reason?: string | null }> | null;
  upcomingShifts?: Array<{ name?: string | null; scheduledDate?: string | null; status?: string | null }> | null;
};

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildOwnerStaffContextLine(staff: OwnerStaffSnapshot | null | undefined) {
  if (!staff) return "";

  const pendingTypes = Object.entries(staff.pendingApprovalByType ?? {})
    .filter(([, count]) => numberValue(count) > 0)
    .map(([type, count]) => `${type}:${numberValue(count)}`)
    .slice(0, 4)
    .join(", ");
  const roleBreakdown = Object.entries(staff.roleBreakdown ?? {})
    .filter(([, count]) => numberValue(count) > 0)
    .map(([role, count]) => `${role}:${numberValue(count)}`)
    .slice(0, 5)
    .join(", ");
  const clockedInNames = (staff.clockedInStaff ?? [])
    .map((item) => `${item.name ?? "Nhân viên"}${numberValue(item.lateMinutes) > 0 ? ` muộn ${numberValue(item.lateMinutes)}p` : ""}`)
    .slice(0, 4)
    .join(", ");
  const pendingNames = (staff.pendingRequests ?? [])
    .map((item) => `${item.name ?? "Nhân viên"}:${item.type ?? "request"}`)
    .slice(0, 4)
    .join(", ");
  const upcomingShiftNames = (staff.upcomingShifts ?? [])
    .map((item) => `${item.name ?? "Nhân viên"} ${item.scheduledDate ?? ""}`.trim())
    .slice(0, 4)
    .join(", ");
  const reviewLine = staff.averageReviewScore
    ? ` review TB ${numberValue(staff.averageReviewScore).toFixed(1)}/5, ${numberValue(staff.lowReviewCount)} review thấp, ${numberValue(staff.draftReviewCount)} nháp`
    : "";

  return [
    `Nhân sự: ${numberValue(staff.activeCount)}/${numberValue(staff.memberCount)} active, ${numberValue(staff.suspendedCount)} tạm khoá, ${numberValue(staff.archivedCount)} lưu trữ, ${numberValue(staff.currentlyClockedIn)} đang check-in, ${numberValue(staff.onlineCount)} online.`,
    `Chấm công/payroll: ${numberValue(staff.attendanceLogCount24h)} log 24h, ${numberValue(staff.lateCount24h)} lượt muộn 24h, ${numberValue(staff.overtimeMinutes24h)} phút tăng ca, ${numberValue(staff.pendingApprovalCount)} yêu cầu chờ duyệt${pendingTypes ? ` (${pendingTypes})` : ""}.`,
    `Ca & chi nhánh: ${numberValue(staff.upcomingShiftCount || staff.shiftCount7d)} ca sắp tới, ${numberValue(staff.assignedBranchCount)} nhân sự đã gán chi nhánh, ${numberValue(staff.unassignedActiveCount)} active chưa gán chi nhánh${roleBreakdown ? `, role ${roleBreakdown}` : ""}${reviewLine}.`,
    clockedInNames ? `Đang trong ca: ${clockedInNames}.` : "",
    pendingNames ? `Request chờ: ${pendingNames}.` : "",
    upcomingShiftNames ? `Ca gần tới: ${upcomingShiftNames}.` : ""
  ].filter(Boolean).join(" ");
}
