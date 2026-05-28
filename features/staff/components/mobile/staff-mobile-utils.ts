import type { StaffOpsApprovalItem, StaffOpsAttendanceFeedItem, StaffOpsMobileOps, StaffOpsMobileWorkItem, StaffOpsShiftAssignment } from "@/features/staff/types";

export type StaffMobileTab = "today" | "work" | "requests" | "inbox";

export const staffMobileTabs: StaffMobileTab[] = ["today", "work", "requests", "inbox"];

export function normalizeStaffMobileTab(value: string | null | undefined): StaffMobileTab {
  return staffMobileTabs.includes(value as StaffMobileTab) ? (value as StaffMobileTab) : "today";
}

export function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NV";
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

export function minutesToText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

export function durationBetween(startAt: string | null | undefined, endAt: string | null | undefined, nowMs: number) {
  if (!startAt) return "--";
  const endMs = endAt ? new Date(endAt).getTime() : nowMs;
  const minutes = Math.max(0, Math.round((endMs - new Date(startAt).getTime()) / 60_000));
  return minutesToText(minutes);
}

export function relativeTime(value: string) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes}p trước`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}g trước`;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

export function syncStatusText(queueLength: number, isOnline: boolean, syncing: boolean) {
  if (syncing) return "Đang đồng bộ";
  if (!isOnline) return "Mất kết nối";
  if (queueLength > 0) return "Chờ đồng bộ";
  return "Đã sẵn sàng";
}

export function shiftStatusLabel(status: StaffOpsShiftAssignment["status"]) {
  if (status === "confirmed") return "Đã nhận";
  if (status === "completed") return "Hoàn tất";
  if (status === "swapped") return "Đổi ca";
  if (status === "cancelled") return "Đã huỷ";
  return "Đã xếp";
}

export function attendanceStateLabel(state: StaffOpsAttendanceFeedItem["state"] | null | undefined) {
  if (state === "on_time") return "Đúng giờ";
  if (state === "late") return "Đi muộn";
  if (state === "early_leave") return "Về sớm";
  if (state === "overtime") return "Tăng ca";
  if (state === "absent") return "Vắng";
  return "Chưa chấm";
}

export function workItemKey(item: StaffOpsMobileWorkItem) {
  return `${item.kind}-${item.id}`;
}

export function priorityLabel(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return "Gấp";
  if (priority === "medium") return "Ưu tiên";
  return "Theo dõi";
}

export function priorityRank(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

export function staffRequestLabel(type: StaffOpsApprovalItem["requestType"] | "leave_request" | "shift_swap" | "overtime") {
  if (type === "leave_request") return "Nghỉ phép";
  if (type === "shift_swap") return "Đổi ca";
  if (type === "overtime") return "Tăng ca";
  if (type === "outside_location") return "Ngoài vị trí";
  if (type === "shift_override") return "Ca đột xuất";
  if (type === "attendance_edit") return "Sửa công";
  if (type === "device_restriction") return "Thiết bị";
  return "Chấm công";
}

export function requestStatusLabel(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Từ chối";
  if (status === "cancelled") return "Đã huỷ";
  return "Chờ duyệt";
}

export function activeAttendanceForMember(attendanceFeed: StaffOpsAttendanceFeedItem[], staffMemberId: string) {
  return attendanceFeed.find((item) => item.staffMemberId === staffMemberId && !item.clockOutAt) ?? null;
}

export function removeWorkItem(mobileOps: StaffOpsMobileOps, item: StaffOpsMobileWorkItem): StaffOpsMobileOps {
  const workItems = mobileOps.workItems.filter((current) => workItemKey(current) !== workItemKey(item));
  return {
    ...mobileOps,
    pendingOrders: Math.max(0, mobileOps.pendingOrders - (item.kind === "order_pending" ? 1 : 0)),
    cookingOrders: Math.max(0, mobileOps.cookingOrders - (item.kind === "kitchen_order" ? 1 : 0)),
    waitingPayments: Math.max(0, mobileOps.waitingPayments - (item.kind === "payment_waiting" ? 1 : 0)),
    serviceRequests: Math.max(0, mobileOps.serviceRequests - (item.kind === "service_request" ? 1 : 0)),
    urgentCount: workItems.filter((current) => current.priority === "high").length,
    workItems
  };
}
