/* staff-view-model — nguồn ngữ nghĩa DÙNG CHUNG cho cả Admin HR và PWA staff.
 *
 * Mọi nhãn (label) + tông màu (tone) + icon của các trạng thái nghiệp vụ nhân sự
 * được định nghĩa MỘT lần ở đây, để admin và app nhân viên không bao giờ lệch nhau.
 * Module thuần (chỉ import type + lucide icon), không chứa JSX.
 */

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CloudOff,
  Hand,
  MapPin,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  TimerReset,
  UserMinus,
  Wifi,
  type LucideIcon
} from "lucide-react";
import type {
  StaffOpsApprovalItem,
  StaffOpsAttendanceFeedItem,
  StaffOpsMember,
  StaffOpsShiftAssignment
} from "@/features/staff/types";

/** Tông màu thống nhất — khớp Badge/StatusPill v2 (token --d-*). */
export type StaffTone = "jade" | "info" | "ok" | "orange" | "danger" | "neutral";

export type StaffDescriptor = {
  label: string;
  tone: StaffTone;
  icon?: LucideIcon;
};

/** Cửa sổ coi là "đang online" (đồng bộ cả 2 surface). */
export const STAFF_ONLINE_WINDOW_MS = 15 * 60_000;

export function isStaffRecentlyActive(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  return Number.isFinite(seen) && now - seen < STAFF_ONLINE_WINDOW_MS;
}

type AttendanceState = NonNullable<StaffOpsMember["todayAttendanceState"]>;
type AttendanceSource = StaffOpsAttendanceFeedItem["source"];
type ApprovalState = StaffOpsAttendanceFeedItem["approvalState"];
type ApprovalType = StaffOpsApprovalItem["requestType"];
type ApprovalStatus = StaffOpsApprovalItem["status"];
type ShiftStatus = StaffOpsShiftAssignment["status"];
type EmploymentStatus = StaffOpsMember["employmentStatus"];

const ATTENDANCE_STATE: Record<AttendanceState, StaffDescriptor> = {
  on_time: { label: "Đúng giờ", tone: "ok", icon: CheckCircle2 },
  late: { label: "Đi muộn", tone: "orange", icon: Clock3 },
  early_leave: { label: "Về sớm", tone: "orange", icon: TimerReset },
  overtime: { label: "Tăng ca", tone: "info", icon: CalendarClock },
  absent: { label: "Vắng", tone: "danger", icon: UserMinus }
};

/** Trạng thái chấm công hôm nay (null = chưa chấm công). */
export function describeAttendanceState(state: AttendanceState | null | undefined): StaffDescriptor {
  if (!state) return { label: "Chưa chấm công", tone: "neutral", icon: Clock3 };
  return ATTENDANCE_STATE[state] ?? { label: state, tone: "neutral" };
}

const ATTENDANCE_SOURCE: Record<AttendanceSource, StaffDescriptor> = {
  gps: { label: "GPS", tone: "info", icon: MapPin },
  qr: { label: "QR", tone: "info", icon: QrCode },
  wifi: { label: "WiFi", tone: "info", icon: Wifi },
  manual: { label: "Thủ công", tone: "neutral", icon: Hand },
  offline_sync: { label: "Offline", tone: "neutral", icon: CloudOff }
};

export function describeAttendanceSource(source: AttendanceSource): StaffDescriptor {
  return ATTENDANCE_SOURCE[source] ?? { label: source, tone: "neutral" };
}

const APPROVAL_STATE: Record<ApprovalState, StaffDescriptor> = {
  auto_approved: { label: "Tự duyệt", tone: "ok", icon: CheckCircle2 },
  approved: { label: "Đã duyệt", tone: "ok", icon: CheckCircle2 },
  pending: { label: "Chờ duyệt", tone: "orange", icon: Clock3 },
  rejected: { label: "Từ chối", tone: "danger", icon: AlertTriangle }
};

export function describeApprovalState(state: ApprovalState): StaffDescriptor {
  return APPROVAL_STATE[state] ?? { label: state, tone: "neutral" };
}

const APPROVAL_STATUS: Record<ApprovalStatus, StaffDescriptor> = {
  pending: { label: "Chờ duyệt", tone: "orange", icon: Clock3 },
  approved: { label: "Đã duyệt", tone: "ok", icon: CheckCircle2 },
  rejected: { label: "Từ chối", tone: "danger", icon: AlertTriangle },
  cancelled: { label: "Đã huỷ", tone: "neutral", icon: UserMinus }
};

export function describeApprovalStatus(status: ApprovalStatus): StaffDescriptor {
  return APPROVAL_STATUS[status] ?? { label: status, tone: "neutral" };
}

const APPROVAL_TYPE: Record<ApprovalType, StaffDescriptor> = {
  outside_location: { label: "Chấm công ngoài vùng", tone: "orange", icon: MapPin },
  attendance_edit: { label: "Sửa giờ chấm công", tone: "info", icon: TimerReset },
  overtime: { label: "Đăng ký tăng ca", tone: "info", icon: CalendarClock },
  shift_override: { label: "Đổi ca", tone: "info", icon: RefreshCw },
  manual_clock_in: { label: "Chấm công hộ", tone: "neutral", icon: Hand },
  leave_request: { label: "Xin nghỉ", tone: "info", icon: CalendarClock },
  shift_swap: { label: "Hoán ca", tone: "info", icon: RefreshCw },
  device_restriction: { label: "Giới hạn thiết bị", tone: "danger", icon: ShieldAlert }
};

export function describeApprovalType(type: ApprovalType): StaffDescriptor {
  return APPROVAL_TYPE[type] ?? { label: type, tone: "neutral" };
}

const SHIFT_STATUS: Record<ShiftStatus, StaffDescriptor> = {
  scheduled: { label: "Đã xếp", tone: "neutral", icon: CalendarClock },
  confirmed: { label: "Đã xác nhận", tone: "ok", icon: CheckCircle2 },
  swapped: { label: "Đã hoán", tone: "info", icon: RefreshCw },
  cancelled: { label: "Đã huỷ", tone: "danger", icon: AlertTriangle },
  completed: { label: "Hoàn tất", tone: "ok", icon: CheckCircle2 }
};

export function describeShiftStatus(status: ShiftStatus): StaffDescriptor {
  return SHIFT_STATUS[status] ?? { label: status, tone: "neutral" };
}

const EMPLOYMENT_STATUS: Record<EmploymentStatus, StaffDescriptor> = {
  active: { label: "Đang làm", tone: "ok" },
  suspended: { label: "Tạm ngừng", tone: "orange" },
  resigned: { label: "Đã nghỉ", tone: "neutral" }
};

export function describeEmploymentStatus(status: EmploymentStatus): StaffDescriptor {
  return EMPLOYMENT_STATUS[status] ?? { label: status, tone: "neutral" };
}

/** Vai trò nhân sự — nhãn + tông dùng chung (thay cho ROLE_LABEL/ROLE_TONE rải rác). */
const ROLE_DESCRIPTOR: Record<string, StaffDescriptor> = {
  owner: { label: "Chủ quán", tone: "jade" },
  manager: { label: "Quản lý", tone: "info" },
  cashier: { label: "Thu ngân", tone: "info" },
  waiter: { label: "Phục vụ", tone: "neutral" },
  kitchen: { label: "Bếp", tone: "neutral" },
  delivery: { label: "Giao hàng", tone: "neutral" },
  marketing: { label: "Marketing", tone: "orange" },
  accountant: { label: "Kế toán", tone: "orange" }
};

export function describeRole(roleCode: string, fallbackTitle?: string | null): StaffDescriptor {
  return ROLE_DESCRIPTOR[roleCode] ?? { label: fallbackTitle || roleCode, tone: "neutral" };
}

/** Tổng hợp trạng thái hôm nay cho 1 nhân sự (kèm số phút trễ/tăng ca). */
export function describeTodayAttendance(member: Pick<StaffOpsMember, "todayAttendanceState" | "lateMinutesToday" | "overtimeMinutesToday">): StaffDescriptor {
  const base = describeAttendanceState(member.todayAttendanceState);
  if (member.todayAttendanceState === "late" && member.lateMinutesToday > 0) {
    return { ...base, label: `Trễ ${member.lateMinutesToday} phút` };
  }
  if (member.todayAttendanceState === "overtime" && member.overtimeMinutesToday > 0) {
    return { ...base, label: `Tăng ca ${member.overtimeMinutesToday} phút` };
  }
  return base;
}

/** Lớp CSS nền/chữ theo tông — dùng chung cho mọi chip/pill (token --d-*). */
export function staffToneSurfaceClass(tone: StaffTone): string {
  switch (tone) {
    case "jade":
      return "bg-[var(--d-primary-soft)] text-[var(--d-primary)]";
    case "info":
      return "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]";
    case "ok":
      return "bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]";
    case "orange":
      return "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]";
    case "danger":
      return "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]";
    default:
      return "bg-[var(--d-surface-2)] text-[var(--d-text-muted)]";
  }
}

/** Map tông view-model → tone prop của Badge v2 (primitives). */
export function staffToneToBadgeTone(tone: StaffTone): "jade" | "orange" | "danger" | "info" | "ok" | "neutral" {
  return tone;
}
