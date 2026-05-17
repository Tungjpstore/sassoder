"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useDeferredValue, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileDown,
  FileText,
  Fingerprint,
  History,
  ListChecks,
  MonitorSmartphone,
  MoreVertical,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  assignStaffShiftAction,
  cancelStaffShiftAssignmentAction,
  createStaffAction,
  createStaffContractAction,
  createStaffDeviceAction,
  createStaffDocumentAction,
  createStaffReviewAction,
  createStaffShiftTemplateAction,
  forceStaffSessionsLogoutAction,
  manualClockInStaffAction,
  manualClockOutStaffAction,
  reviewAttendanceApprovalAction,
  setStaffAccountStateAction,
  updateStaffProfileAction,
  updateStaffRolePermissionsAction
} from "@/app/dashboard/actions/staff";
import type { StaffActionState } from "@/app/dashboard/actions/staff";
import { STAFF_CONTRACT_TEMPLATES, getStaffContractTemplate } from "@/features/staff/constants/contract-templates";
import { isDangerPermission, staffPermissionLabel } from "@/lib/staff-permissions";
import type {
  StaffOperationsBundle,
  StaffOpsActivityItem,
  StaffOpsApprovalItem,
  StaffOpsAttendanceFeedItem,
  StaffOpsContractItem,
  StaffOpsDeviceItem,
  StaffOpsDocumentItem,
  StaffOpsMember,
  StaffOpsReviewItem,
  StaffOpsRoleSummary,
  StaffOpsShiftAssignment,
  StaffOpsShiftTemplate,
  StaffOpsTimesheetSummary,
  StaffOpsRealtimeState
} from "@/features/staff/types";
import { createStaffRequest, type StaffRequestCreatePayload } from "@/features/staff/api/client";
import { STAFF_OPERATIONS_REALTIME_TABLES, staffOperationsChannelName } from "@/features/staff/realtime/channels";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type StaffOperationsWorkspaceProps = {
  bundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  illustrationSrc: string;
};

type StaffScreenKey =
  | "staff"
  | "profile"
  | "permissions"
  | "shifts"
  | "attendance"
  | "requests"
  | "activity"
  | "reviews"
  | "lifecycle"
  | "contracts"
  | "documents"
  | "devices"
  | "branches"
  | "reports";

type StaffListFilterKey = "all" | "active" | "off" | "risk" | "no_pin" | "no_branch" | "suspended";

const screenItems: Array<{ key: StaffScreenKey; label: string; index: string; icon: LucideIcon }> = [
  { key: "staff", label: "Danh sách nhân sự", index: "1", icon: UsersRound },
  { key: "profile", label: "Chi tiết nhân viên", index: "2", icon: UserRound },
  { key: "permissions", label: "Quyền & bảo mật", index: "3", icon: ShieldCheck },
  { key: "shifts", label: "Ca làm việc", index: "4", icon: CalendarClock },
  { key: "attendance", label: "Chấm công", index: "5", icon: Clock3 },
  { key: "requests", label: "Yêu cầu nhân sự", index: "6", icon: ListChecks },
  { key: "activity", label: "Lịch sử hoạt động", index: "7", icon: History },
  { key: "reviews", label: "Đánh giá nhân viên", index: "8", icon: ClipboardCheck },
  { key: "lifecycle", label: "Vòng đời nhân sự", index: "9", icon: RadioTower },
  { key: "contracts", label: "Hợp đồng", index: "10", icon: BriefcaseBusiness },
  { key: "documents", label: "Tài liệu", index: "11", icon: FileText },
  { key: "devices", label: "Thiết bị", index: "12", icon: MonitorSmartphone },
  { key: "branches", label: "Chuỗi & chi nhánh", index: "13", icon: RadioTower },
  { key: "reports", label: "Báo cáo nhân sự", index: "14", icon: BarChart3 }
];

const screenItemByKey = new Map(screenItems.map((screen) => [screen.key, screen]));

const screenGroups: Array<{
  label: string;
  description: string;
  items: StaffScreenKey[];
}> = [
  {
    label: "Vận hành hôm nay",
    description: "Nhân sự, ca, chấm công",
    items: ["staff", "shifts", "attendance", "requests", "activity"]
  },
  {
    label: "Hồ sơ & kiểm soát",
    description: "Quyền, hợp đồng, thiết bị",
    items: ["profile", "permissions", "lifecycle", "contracts", "documents", "devices"]
  },
  {
    label: "Hiệu suất",
    description: "Chuỗi, đánh giá và báo cáo",
    items: ["branches", "reviews", "reports"]
  }
];

const weekdayOptions = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 0, label: "CN" }
];

const roleOrder = ["owner", "manager", "cashier", "waiter", "kitchen", "marketing", "accountant", "delivery"];
const STAFF_TIMESHEET_EXPORT_URL = "/api/admin/staff-operations/timesheets/export";
const STAFF_ACTIVITY_EXPORT_URL = "/api/admin/staff-operations/activity/export";
const attendanceFilterOptions = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang trong ca" },
  { key: "late", label: "Đi muộn" },
  { key: "waiting", label: "Chờ check-in" },
  { key: "overtime", label: "Tăng ca" },
  { key: "manual", label: "Chấm tay" }
] as const;
const activityFilterOptions = [
  { key: "all", label: "Tất cả" },
  { key: "attendance", label: "Chấm công" },
  { key: "shift", label: "Ca làm việc" },
  { key: "staff", label: "Nhân sự & quyền" },
  { key: "review", label: "Đánh giá" },
  { key: "system", label: "Hệ thống" }
] as const;
const payrollReportFilterOptions = [
  { key: "all", label: "Tất cả" },
  { key: "blockers", label: "Kẹt chốt" },
  { key: "overtime", label: "Tăng ca" },
  { key: "late", label: "Đi muộn" },
  { key: "leave", label: "Nghỉ phép" },
  { key: "low_score", label: "Điểm thấp" }
] as const;

type AttendanceFilterKey = (typeof attendanceFilterOptions)[number]["key"];
type ActivityFilterKey = (typeof activityFilterOptions)[number]["key"];
type PayrollReportFilterKey = (typeof payrollReportFilterOptions)[number]["key"];

function todayInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function buildWeekRange() {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    const iso = new Date(current.getTime() - current.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return {
      iso,
      dayLabel: weekdayOptions.find((item) => item.value === current.getDay())?.label ?? "T2",
      dateLabel: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(current)
    };
  });
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NV";
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function formatShortDateTime(value: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatHours(minutes: number) {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}p`;
  return rest ? `${hours}h ${rest}p` : `${hours}h`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shortTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sortRoles(roles: StaffOpsRoleSummary[]) {
  return [...roles].sort((left, right) => {
    const leftIndex = roleOrder.indexOf(String(left.code));
    const rightIndex = roleOrder.indexOf(String(right.code));
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function roleForMember(member: StaffOpsMember, roles: StaffOpsRoleSummary[]) {
  return roles.find((role) => role.code === member.roleCode) ?? roles.find((role) => role.profile === member.roleProfile) ?? roles[0] ?? null;
}

function shiftsForMember(member: StaffOpsMember, assignments: StaffOpsShiftAssignment[]) {
  return assignments
    .filter((assignment) => assignment.staffMemberId === member.id)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate));
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function shiftDurationLabel(shift: StaffOpsShiftTemplate | null | undefined) {
  if (!shift) return "Chưa chọn mẫu ca";
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  const duration = end >= start ? end - start : 24 * 60 - start + end;
  return `${shift.startTime}-${shift.endTime} · ${formatHours(duration)}`;
}

function shiftAssignmentStatusLabel(status: StaffOpsShiftAssignment["status"]) {
  const labels = {
    scheduled: "Đã gán",
    confirmed: "Đã nhận",
    swapped: "Đổi ca",
    cancelled: "Đã huỷ",
    completed: "Xong"
  } satisfies Record<StaffOpsShiftAssignment["status"], string>;
  return labels[status];
}

function currentMonthLabel() {
  const now = new Date();
  return `Tháng ${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function contractTypeLabel(type: StaffOpsContractItem["contractType"]) {
  const labels = {
    official: "Chính thức",
    probation: "Thử việc",
    part_time: "Bán thời gian",
    service: "Dịch vụ",
    other: "Khác"
  } satisfies Record<StaffOpsContractItem["contractType"], string>;
  return labels[type];
}

function contractSignatureLabel(status: StaffOpsContractItem["eSignatureStatus"]) {
  const labels = {
    draft: "Bản nháp",
    pending_employee: "Chờ NV ký",
    pending_employer: "Chờ quán ký",
    signed: "Đã ký",
    declined: "Từ chối",
    voided: "Huỷ hiệu lực"
  } satisfies Record<StaffOpsContractItem["eSignatureStatus"], string>;
  return labels[status];
}

function contractSignatureTone(status: StaffOpsContractItem["eSignatureStatus"]) {
  if (status === "signed") return "green";
  if (status === "declined" || status === "voided") return "red";
  if (status === "pending_employee" || status === "pending_employer") return "orange";
  return "neutral";
}

function contractStatusLabel(status: StaffOpsContractItem["status"]) {
  if (status === "active") return "Có hiệu lực";
  if (status === "expired") return "Hết hạn";
  if (status === "terminated") return "Đã kết thúc";
  return "Bản nháp";
}

function contractStatusTone(status: StaffOpsContractItem["status"]) {
  if (status === "active") return "green";
  if (status === "terminated") return "red";
  if (status === "expired") return "orange";
  return "neutral";
}

function documentTypeLabel(type: StaffOpsDocumentItem["documentType"]) {
  const labels = {
    identity_card: "CCCD",
    health_certificate: "Sức khoẻ",
    contract: "Hợp đồng",
    training: "Đào tạo",
    other: "Khác"
  } satisfies Record<StaffOpsDocumentItem["documentType"], string>;
  return labels[type];
}

function documentStatusLabel(status: StaffOpsDocumentItem["status"]) {
  if (status === "complete") return "Đã lưu";
  if (status === "expired") return "Hết hạn";
  return "Thiếu";
}

function documentStatusTone(status: StaffOpsDocumentItem["status"]) {
  if (status === "complete") return "green";
  if (status === "expired") return "orange";
  return "red";
}

function deviceTypeLabel(type: StaffOpsDeviceItem["deviceType"]) {
  const labels = {
    phone: "Điện thoại",
    tablet: "Máy tính bảng",
    pos: "Máy POS",
    cash_drawer: "Két tiền",
    other: "Khác"
  } satisfies Record<StaffOpsDeviceItem["deviceType"], string>;
  return labels[type];
}

function deviceStatusLabel(status: StaffOpsDeviceItem["status"]) {
  if (status === "assigned") return "Đang cấp";
  if (status === "returned") return "Đã trả";
  if (status === "lost") return "Thất lạc";
  return "Bảo trì";
}

function deviceStatusTone(status: StaffOpsDeviceItem["status"]) {
  if (status === "assigned") return "green";
  if (status === "lost") return "red";
  if (status === "maintenance") return "orange";
  return "neutral";
}

function attendanceLabel(state: StaffOpsMember["todayAttendanceState"] | StaffOpsAttendanceFeedItem["state"] | null) {
  if (state === "on_time") return "Đúng giờ";
  if (state === "late") return "Đi muộn";
  if (state === "early_leave") return "Về sớm";
  if (state === "overtime") return "Tăng ca";
  if (state === "absent") return "Vắng";
  return "Chưa chấm";
}

function requestTypeLabel(type: StaffOpsApprovalItem["requestType"]) {
  const labels = {
    leave_request: "Nghỉ phép",
    shift_swap: "Đổi ca",
    outside_location: "Ngoài vị trí",
    attendance_edit: "Sửa chấm công",
    overtime: "Tăng ca",
    shift_override: "Ca đột xuất",
    manual_clock_in: "Chấm công tay"
  } satisfies Record<StaffOpsApprovalItem["requestType"], string>;
  return labels[type];
}

function requestStatusLabel(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Từ chối";
  if (status === "cancelled") return "Đã huỷ";
  return "Chờ duyệt";
}

function requestStatusTone(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  return "orange";
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function requestDetail(approval: StaffOpsApprovalItem) {
  const payload = approval.requestedPayload ?? {};

  if (approval.requestType === "leave_request") {
    const leaveType = payloadText(payload, "leaveTypeLabel") ?? "Nghỉ phép";
    const fromDate = payloadText(payload, "fromDate");
    const toDate = payloadText(payload, "toDate");
    return `${leaveType} · ${fromDate ?? "--"}${toDate && toDate !== fromDate ? ` -> ${toDate}` : ""}`;
  }

  if (approval.requestType === "shift_swap") {
    const shiftName = payloadText(payload, "shiftName") ?? "Ca làm";
    const scheduledDate = payloadText(payload, "scheduledDate") ?? "--";
    const targetStaffName = payloadText(payload, "targetStaffName");
    return `${shiftName} · ${scheduledDate}${targetStaffName ? ` · nhận bởi ${targetStaffName}` : ""}`;
  }

  if (approval.requestType === "overtime") {
    const overtimeDate = payloadText(payload, "overtimeDate") ?? payloadText(payload, "fromDate") ?? "--";
    const minutes = payloadNumber(payload, "overtimeMinutes") ?? 0;
    return `${overtimeDate} · ${formatHours(minutes)}`;
  }

  return approval.reason ?? "Yêu cầu vận hành";
}

function accountStatusLabel(member: StaffOpsMember) {
  if (member.isArchived) return "Đã lưu trữ";
  if (member.employmentStatus === "suspended" || member.accountStatus === "blocked") return "Tạm khoá";
  if (member.employmentStatus === "resigned") return "Đã nghỉ";
  return "Đang làm";
}

function badgeTone(member: StaffOpsMember) {
  if (member.isArchived || member.employmentStatus === "suspended" || member.accountStatus === "blocked") return "orange";
  if (member.suspiciousScore >= 50) return "red";
  if (member.activeSessionCount > 0) return "green";
  return "neutral";
}

function attendanceTone(state: StaffOpsMember["todayAttendanceState"] | StaffOpsAttendanceFeedItem["state"] | null) {
  if (state === "late" || state === "absent" || state === "early_leave") return "orange";
  if (state === "on_time" || state === "overtime") return "green";
  return "neutral";
}

function attendanceSourceLabel(source: StaffOpsAttendanceFeedItem["source"] | null | undefined) {
  if (source === "gps") return "GPS";
  if (source === "qr") return "QR";
  if (source === "manual") return "Quản lý";
  if (source === "offline_sync") return "Offline";
  return "--";
}

function realtimeLabel(state: StaffOpsRealtimeState) {
  if (state === "connected") return "Đồng bộ live";
  if (state === "error") return "Mất kết nối";
  if (state === "connecting") return "Đang nối live";
  return "Chưa bật live";
}

function realtimeTone(state: StaffOpsRealtimeState): "green" | "orange" | "red" | "neutral" {
  if (state === "connected") return "green";
  if (state === "error") return "red";
  if (state === "connecting") return "orange";
  return "neutral";
}

function activityCategory(item: StaffOpsActivityItem): ActivityFilterKey {
  const haystack = normalizeText(`${item.entityType} ${item.action} ${item.reason ?? ""}`);
  if (haystack.includes("attendance") || haystack.includes("cham cong") || haystack.includes("clock")) return "attendance";
  if (haystack.includes("shift") || haystack.includes("ca lam")) return "shift";
  if (haystack.includes("review") || haystack.includes("danh gia")) return "review";
  if (haystack.includes("role") || haystack.includes("permission") || haystack.includes("staff") || haystack.includes("nhan su") || haystack.includes("profile")) return "staff";
  if (haystack.includes("login") || haystack.includes("session") || haystack.includes("device") || haystack.includes("system")) return "system";
  return "system";
}

function severityLabel(severity: StaffOpsActivityItem["severity"]) {
  if (severity === "critical") return "Nghiêm trọng";
  if (severity === "warning") return "Cảnh báo";
  return "Thông tin";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatLiveDuration(startAt: string | null | undefined, endAt: string | null | undefined, nowMs: number) {
  if (!startAt) return "--";
  const endMs = endAt ? new Date(endAt).getTime() : nowMs;
  const minutes = Math.max(0, Math.round((endMs - new Date(startAt).getTime()) / 60_000));
  return formatHours(minutes);
}

function ActionNotice({ state }: { state?: StaffActionState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${state.error ? "border-[#E08A2E]/25 bg-[#FFF4E6] text-[#9A4F10]" : "border-[#0F4D3A]/20 bg-[#E8F5EC] text-[#0F4D3A]"}`}>
      {state.error ?? state.success}
    </div>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "green" | "orange" | "red" | "neutral" }) {
  const className =
    tone === "green"
      ? "border-[#0F7A4F]/15 bg-[#E7F6EC] text-[#0F6A45]"
      : tone === "orange"
        ? "border-[#E08A2E]/20 bg-[#FFF1DF] text-[#A85B14]"
        : tone === "red"
          ? "border-[#C2410C]/20 bg-[#FFF0E7] text-[#9A3412]"
          : "border-[#E9DED0] bg-[#FAF6EE] text-[#746B60]";

  return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10.5px] font-black leading-none ${className}`}>{children}</span>;
}

function StaffAvatar({ member, size = "md" }: { member: StaffOpsMember; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]";
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full border border-[#DDE9D8] bg-[#E7F3E7] font-black text-[#0F4D3A] ${sizeClass}`}>
      {initials(member.fullName)}
      {member.activeSessionCount > 0 ? <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white bg-[#16A062]" /> : null}
    </span>
  );
}

function StaffShellCard({
  index,
  title,
  subtitle,
  children,
  action
}: {
  index: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="staff-screen-card overflow-hidden rounded-xl border border-[#E8DED0] bg-[#FFFCF6] shadow-[0_14px_32px_rgba(71,45,18,0.05)]">
      <header className="flex min-h-[52px] items-center justify-between gap-2 border-b border-[#EDE3D6] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-[#0B3F31]">{index}. {title}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-[#7D7469]">{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function TableHead({ children, className }: { children: ReactNode; className: string }) {
  return (
    <div className={`staff-table-head grid min-w-[840px] border-b border-[#EFE5D9] bg-[#FFF9F0] px-3 py-1.5 text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64] ${className}`}>
      {children}
    </div>
  );
}

function TableRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`staff-table-row grid min-w-[840px] items-center border-b border-[#F0E7DD] px-3 py-1.5 text-[11px] last:border-b-0 ${className}`}>{children}</div>;
}

function StatTile({ label, value, tone = "green" }: { label: string; value: string | number; tone?: "green" | "orange" | "red" | "neutral" }) {
  return (
    <div className="staff-stat-tile rounded-lg border border-[#EADFD1] bg-[#FFF9F0] px-2.5 py-1.5">
      <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64]">{label}</p>
      <p className={`mt-0.5 text-lg font-black tracking-[-0.04em] ${tone === "orange" ? "text-[#A85B14]" : tone === "red" ? "text-[#9A3412]" : tone === "green" ? "text-[#0F4D3A]" : "text-[#2D2924]"}`}>
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "green" | "orange" | "red" | "neutral" }) {
  return (
    <div className="min-h-[54px] rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] px-2 py-1.5">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.08em] text-[#756E64]">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-black ${tone === "green" ? "text-[#0F4D3A]" : tone === "orange" ? "text-[#A85B14]" : tone === "red" ? "text-[#9A3412]" : "text-[#2D2924]"}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyStaffState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center">
      <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
      <p className="mt-1 text-sm font-black text-[#0B3F31]">{title}</p>
      <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">{description}</p>
    </div>
  );
}

function operationalTone(value: number, warningAt = 1): "green" | "orange" | "red" | "neutral" {
  if (value <= 0) return "green";
  if (value >= warningAt * 3) return "red";
  return "orange";
}

function branchPressure(branch: StaffOperationsBundle["branches"][number]) {
  return branch.pendingApprovals * 4 + branch.lateCount * 3 + branch.suspiciousCount * 5 + Math.max(0, 70 - branch.coverageScore);
}

type StaffAiInsight = {
  id: string;
  title: string;
  detail: string;
  nextAction: string;
  tone: "green" | "orange" | "red";
  screen: StaffScreenKey;
  memberId?: string;
};

function buildStaffAiInsights({
  bundle,
  members,
  approvals,
  limit = 5
}: {
  bundle: StaffOperationsBundle;
  members: StaffOpsMember[];
  approvals: StaffOpsApprovalItem[];
  limit?: number;
}) {
  const insights: StaffAiInsight[] = [];
  const activeMembers = members.filter((member) => !member.isArchived && member.employmentStatus === "active");
  const worstBranch = [...bundle.branches].sort((left, right) => branchPressure(right) - branchPressure(left))[0] ?? null;
  const weakestCoverageDay = [...bundle.weeklyCoverage]
    .filter((day) => day.assigned > 0 || day.confirmed > 0 || day.overtimeAlerts > 0)
    .sort((left, right) => (left.confirmed - left.assigned) - (right.confirmed - right.assigned) || right.overtimeAlerts - left.overtimeAlerts)[0] ?? null;
  const highestRiskMember = [...activeMembers].sort((left, right) => right.suspiciousScore - left.suspiciousScore)[0] ?? null;
  const lateRiskTimesheet = [...bundle.timesheets]
    .filter((item) => item.lateCount > 0 || item.lateMinutes > 0)
    .sort((left, right) => (right.lateCount * 20 + right.lateMinutes) - (left.lateCount * 20 + left.lateMinutes))[0] ?? null;
  const pendingByType = approvals.reduce<Record<string, number>>((acc, approval) => {
    acc[approval.requestType] = (acc[approval.requestType] ?? 0) + 1;
    return acc;
  }, {});
  const pendingPayrollApprovals = bundle.timesheets.reduce((sum, item) => sum + item.pendingApprovals, 0);
  const approvedOvertimeMinutes = bundle.timesheets.reduce((sum, item) => sum + item.approvedOvertimeMinutes, 0);
  const approvedLeaveDays = bundle.timesheets.reduce((sum, item) => sum + item.paidLeaveDays + item.unpaidLeaveDays, 0);
  const averageAttendanceScore = bundle.timesheets.length
    ? Math.round(bundle.timesheets.reduce((sum, item) => sum + item.attendanceScore, 0) / bundle.timesheets.length)
    : 100;

  if (approvals.length > 0) {
    insights.push({
      id: "pending-approval-queue",
      title: `${approvals.length} yêu cầu đang chờ duyệt`,
      detail: `${pendingByType.leave_request ?? 0} nghỉ phép · ${pendingByType.shift_swap ?? 0} đổi ca · ${pendingByType.overtime ?? 0} tăng ca`,
      nextAction: "Mở hàng chờ duyệt",
      tone: approvals.length >= 5 ? "red" : "orange",
      screen: "requests"
    });
  }

  if (worstBranch && branchPressure(worstBranch) > 0) {
    insights.push({
      id: `branch-pressure-${worstBranch.id}`,
      title: `${worstBranch.name} đang có áp lực vận hành`,
      detail: `${worstBranch.coverageScore}% phủ ca · ${worstBranch.lateCount} muộn · ${worstBranch.pendingApprovals} chờ duyệt`,
      nextAction: worstBranch.pendingApprovals ? "Duyệt yêu cầu chi nhánh" : "Xem lịch ca",
      tone: branchPressure(worstBranch) >= 24 ? "red" : "orange",
      screen: worstBranch.pendingApprovals ? "requests" : "shifts"
    });
  }

  if (weakestCoverageDay && (weakestCoverageDay.confirmed < weakestCoverageDay.assigned || weakestCoverageDay.overtimeAlerts > 0)) {
    insights.push({
      id: `coverage-${weakestCoverageDay.isoDate}`,
      title: `${weakestCoverageDay.label} có nguy cơ thiếu người`,
      detail: `${weakestCoverageDay.confirmed}/${weakestCoverageDay.assigned} ca đã nhận · ${weakestCoverageDay.overtimeAlerts} cảnh báo tăng ca`,
      nextAction: "Mở lịch ca",
      tone: weakestCoverageDay.confirmed + 1 < weakestCoverageDay.assigned ? "red" : "orange",
      screen: "shifts"
    });
  }

  if (highestRiskMember && highestRiskMember.suspiciousScore >= 40) {
    insights.push({
      id: `risk-${highestRiskMember.id}`,
      title: `${highestRiskMember.fullName} có tín hiệu bất thường`,
      detail: `Điểm rủi ro ${highestRiskMember.suspiciousScore} · ${highestRiskMember.roleTitle} · ${highestRiskMember.primaryBranchName ?? "Toàn quán"}`,
      nextAction: "Mở hồ sơ kiểm tra",
      tone: highestRiskMember.suspiciousScore >= 55 ? "red" : "orange",
      screen: "profile",
      memberId: highestRiskMember.id
    });
  }

  if (lateRiskTimesheet) {
    insights.push({
      id: `late-risk-${lateRiskTimesheet.staffMemberId}`,
      title: `${lateRiskTimesheet.fullName} cần rà soát giờ công`,
      detail: `${lateRiskTimesheet.lateCount} lần muộn · ${formatHours(lateRiskTimesheet.lateMinutes)} · điểm ${formatScore(lateRiskTimesheet.attendanceScore)}/100`,
      nextAction: "Mở chấm công",
      tone: lateRiskTimesheet.lateCount >= 3 || lateRiskTimesheet.attendanceScore < 75 ? "red" : "orange",
      screen: "attendance",
      memberId: lateRiskTimesheet.staffMemberId
    });
  }

  if (pendingPayrollApprovals || approvedOvertimeMinutes || approvedLeaveDays) {
    insights.push({
      id: "payroll-readiness",
      title: "Payroll có dữ liệu cần đối soát",
      detail: `${pendingPayrollApprovals} duyệt lương · ${formatHours(approvedOvertimeMinutes)} OT duyệt tay · ${approvedLeaveDays} ngày nghỉ`,
      nextAction: pendingPayrollApprovals ? "Xử lý phê duyệt" : "Mở báo cáo lương",
      tone: pendingPayrollApprovals ? "orange" : "green",
      screen: pendingPayrollApprovals ? "requests" : "reports"
    });
  }

  if (averageAttendanceScore < 85) {
    insights.push({
      id: "attendance-score-drop",
      title: "Điểm chấm công trung bình đang giảm",
      detail: `Điểm hiện tại ${averageAttendanceScore}/100 · nên rà soát nhóm đi muộn và chấm tay`,
      nextAction: "Mở báo cáo nhân sự",
      tone: averageAttendanceScore < 75 ? "red" : "orange",
      screen: "reports"
    });
  }

  if (!insights.length) {
    insights.push({
      id: "staff-ops-stable",
      title: "Nhân sự đang vận hành ổn định",
      detail: "Không có thiếu ca, duyệt gấp hoặc rủi ro nổi bật trong dữ liệu hiện tại.",
      nextAction: "Xem báo cáo",
      tone: "green",
      screen: "reports"
    });
  }

  return insights
    .sort((left, right) => (left.tone === "red" ? 0 : left.tone === "orange" ? 1 : 2) - (right.tone === "red" ? 0 : right.tone === "orange" ? 1 : 2))
    .slice(0, limit);
}

function StaffOpsMetric({
  icon: Icon,
  label,
  value,
  meta,
  tone = "green"
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  meta: string;
  tone?: "green" | "orange" | "red" | "neutral";
}) {
  const toneClass =
    tone === "red"
      ? "border-[#C2410C]/20 bg-[#FFF0E7] text-[#9A3412]"
      : tone === "orange"
        ? "border-[#E08A2E]/20 bg-[#FFF1DF] text-[#A85B14]"
        : tone === "green"
          ? "border-[#0F7A4F]/16 bg-[#E8F5EC] text-[#0F4D3A]"
          : "border-[#E9DED0] bg-[#FFF9F0] text-[#2D2924]";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/70">
          <Icon size={17} />
        </span>
        {tone === "red" || tone === "orange" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
      </div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] opacity-75">{label}</p>
      <p className="mt-0.5 text-2xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-bold opacity-80">{meta}</p>
    </div>
  );
}

function StaffAiAssistantPanel({
  insights,
  title = "AI HR Assistant",
  subtitle = "Ưu tiên theo ca, chấm công, payroll",
  compact = false,
  onOpenMember,
  onOpenScreen
}: {
  insights: StaffAiInsight[];
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onOpenMember?: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen?: (screen: StaffScreenKey) => void;
}) {
  const urgentCount = insights.filter((item) => item.tone === "red").length;
  const watchCount = insights.filter((item) => item.tone === "orange").length;

  function openInsight(insight: StaffAiInsight) {
    if (insight.memberId && onOpenMember) {
      onOpenMember(insight.memberId, insight.screen);
      return;
    }
    onOpenScreen?.(insight.screen);
  }

  return (
    <section className="rounded-xl border border-[#E9DED0] bg-[#FFF9F0] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#0B3F31]">
            <Activity size={14} />
            {title}
          </span>
          <p className="mt-0.5 truncate text-[10.5px] font-bold text-[#756E64]">{subtitle}</p>
        </div>
        <Pill tone={urgentCount ? "red" : watchCount ? "orange" : "green"}>
          {urgentCount ? `${urgentCount} gấp` : watchCount ? `${watchCount} theo dõi` : "Ổn"}
        </Pill>
      </div>
      <div className={`mt-2 grid gap-1.5 ${compact ? "" : "md:grid-cols-2"}`}>
        {insights.map((insight) => (
          <button
            key={insight.id}
            type="button"
            onClick={() => openInsight(insight)}
            className="rounded-lg border border-[#E9DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{insight.title}</span>
                <span className="mt-0.5 block line-clamp-2 text-[10.5px] font-bold text-[#756E64]">{insight.detail}</span>
              </span>
              <Pill tone={insight.tone}>{insight.tone === "red" ? "Gấp" : insight.tone === "orange" ? "Theo dõi" : "Ổn"}</Pill>
            </span>
            <span className="mt-1 inline-flex text-[10.5px] font-black text-[#0F4D3A]">{insight.nextAction}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StaffOperationsCockpit({
  bundle,
  members,
  approvals,
  onOpenMember,
  onOpenScreen
}: {
  bundle: StaffOperationsBundle;
  members: StaffOpsMember[];
  approvals: StaffOpsApprovalItem[];
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen: (screen: StaffScreenKey) => void;
}) {
  const today = todayInputValue();
  const todayFeed = bundle.attendanceFeed.filter((item) => item.clockInAt.slice(0, 10) === today);
  const activeMembers = members.filter((member) => member.activeSessionCount > 0);
  const lateMembers = members.filter((member) => member.lateMinutesToday > 0 || member.todayAttendanceState === "late");
  const absentMembers = members.filter((member) => member.todayAttendanceState === "absent");
  const riskMembers = members.filter((member) => member.suspiciousScore >= 40);
  const waitingClockIn = Math.max(0, members.length - todayFeed.length);
  const tenseBranches = [...bundle.branches].sort((left, right) => branchPressure(right) - branchPressure(left)).slice(0, 3);
  const newestNotifications = bundle.notifications.filter((item) => item.status === "unread").slice(0, 3);
  const urgentItems = [
    ...approvals.slice(0, 2).map((approval) => ({
      id: `approval-${approval.id}`,
      title: approval.fullName,
      detail: `${requestTypeLabel(approval.requestType)} · ${requestDetail(approval)}`,
      tone: "orange" as const,
      onClick: () => onOpenScreen("requests")
    })),
    ...lateMembers.slice(0, 2).map((member) => ({
      id: `late-${member.id}`,
      title: member.fullName,
      detail: `${member.lateMinutesToday}p đi muộn · ${member.primaryBranchName ?? "Chi nhánh chính"}`,
      tone: "orange" as const,
      onClick: () => onOpenMember(member.id, "attendance")
    })),
    ...riskMembers.slice(0, 2).map((member) => ({
      id: `risk-${member.id}`,
      title: member.fullName,
      detail: `Điểm rủi ro ${member.suspiciousScore} · ${member.roleTitle}`,
      tone: "red" as const,
      onClick: () => onOpenMember(member.id, "profile")
    }))
  ].slice(0, 4);
  const aiInsights = buildStaffAiInsights({ bundle, members, approvals, limit: 3 });

  return (
    <section className="grid gap-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="rounded-xl border border-[#E9DED0] bg-[#FFFCF6] p-3 shadow-[0_14px_34px_rgba(71,45,18,0.045)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0F4D3A]">Ca làm hôm nay</p>
            <h2 className="mt-0.5 text-lg font-black text-[#0B3F31]">Nhịp vận hành nhân sự</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onOpenScreen("attendance")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white">
              <Clock3 size={13} />
              Chấm công
            </button>
            <button type="button" onClick={() => onOpenScreen("shifts")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E3D8CA] bg-white px-3 text-[11px] font-black text-[#0B3F31]">
              <CalendarClock size={13} />
              Ca làm
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StaffOpsMetric icon={UsersRound} label="Online" value={activeMembers.length} meta={`${bundle.overview.activeCashiers} thu ngân · ${bundle.overview.activeKitchenStaff} bếp`} />
          <StaffOpsMetric icon={Clock3} label="Chờ check-in" value={waitingClockIn} meta={`${todayFeed.length}/${members.length} đã chấm`} tone={operationalTone(waitingClockIn, 2)} />
          <StaffOpsMetric icon={AlertTriangle} label="Đi muộn/vắng" value={lateMembers.length + absentMembers.length} meta={`${bundle.overview.lateAttendance} lượt muộn hôm nay`} tone={operationalTone(lateMembers.length + absentMembers.length)} />
          <StaffOpsMetric icon={ShieldCheck} label="Cần duyệt" value={approvals.length} meta={`${bundle.overview.overtimeAlerts} tăng ca · ${bundle.overview.suspiciousActivities} rủi ro`} tone={operationalTone(approvals.length)} />
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {tenseBranches.map((branch) => {
            const pressure = branchPressure(branch);
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => onOpenScreen(branch.pendingApprovals > 0 ? "requests" : branch.lateCount > 0 ? "attendance" : "staff")}
                className="rounded-xl border border-[#E9DED0] bg-[#FFF9F0] p-3 text-left transition hover:border-[#0F4D3A]/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#2D2924]">{branch.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold text-[#756E64]">{branch.isPrimary ? "Chi nhánh chính" : "Chi nhánh"}</span>
                  </span>
                  <Pill tone={pressure >= 20 ? "red" : pressure > 0 ? "orange" : "green"}>{branch.coverageScore}%</Pill>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <span className="rounded-lg bg-white px-1.5 py-1"><strong className="block text-sm text-[#0F4D3A]">{branch.activeStaff}</strong><small className="text-[9px] font-bold text-[#756E64]">online</small></span>
                  <span className="rounded-lg bg-white px-1.5 py-1"><strong className="block text-sm text-[#A85B14]">{branch.lateCount}</strong><small className="text-[9px] font-bold text-[#756E64]">muộn</small></span>
                  <span className="rounded-lg bg-white px-1.5 py-1"><strong className="block text-sm text-[#9A3412]">{branch.pendingApprovals}</strong><small className="text-[9px] font-bold text-[#756E64]">duyệt</small></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="rounded-xl border border-[#E9DED0] bg-[#FFFCF6] p-3 shadow-[0_14px_34px_rgba(71,45,18,0.045)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#0F4D3A]">Action queue</p>
            <h2 className="mt-0.5 text-lg font-black text-[#0B3F31]">Cần xử lý</h2>
          </div>
          <Pill tone={urgentItems.length ? "orange" : "green"}>{urgentItems.length || "Ổn"}</Pill>
        </div>
        <div className="mt-3 grid gap-1.5">
          {urgentItems.length ? urgentItems.map((item) => (
            <button key={item.id} type="button" onClick={item.onClick} className="flex min-h-[54px] items-center gap-2 rounded-xl border border-[#E9DED0] bg-[#FFF9F0] px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone === "red" ? "bg-[#FFF0E7] text-[#9A3412]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                {item.tone === "red" ? <ShieldCheck size={16} /> : <Clock3 size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-[#2D2924]">{item.title}</span>
                <span className="mt-0.5 block truncate text-[10px] font-bold text-[#756E64]">{item.detail}</span>
              </span>
            </button>
          )) : (
            <div className="grid min-h-[120px] place-items-center rounded-xl border border-dashed border-[#E9DED0] bg-[#FFF9F0] px-3 text-center">
              <div>
                <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={24} />
                <p className="mt-1 text-sm font-black text-[#0B3F31]">Ca làm đang ổn</p>
                <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Không có duyệt gấp hoặc rủi ro nổi bật.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3">
          <StaffAiAssistantPanel
            insights={aiInsights}
            title="AI gợi ý"
            subtitle="Ca, rủi ro và payroll"
            compact
            onOpenMember={onOpenMember}
            onOpenScreen={onOpenScreen}
          />
        </div>

        <div className="mt-3 rounded-xl border border-[#E9DED0] bg-[#FFF9F0] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-[#0B3F31]">Thông báo mới</span>
            <Pill>{newestNotifications.length}</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {newestNotifications.map((notification) => (
              <div key={notification.id} className="rounded-lg bg-white px-2.5 py-2">
                <p className="truncate text-[11.5px] font-black text-[#2D2924]">{notification.title}</p>
                {notification.body ? <p className="mt-0.5 line-clamp-2 text-[10.5px] font-bold text-[#756E64]">{notification.body}</p> : null}
              </div>
            ))}
            {!newestNotifications.length ? <p className="text-[11px] font-bold text-[#756E64]">Không có thông báo chưa đọc.</p> : null}
          </div>
        </div>
      </aside>
    </section>
  );
}

export function StaffOperationsWorkspace({ bundle, restaurantId, restaurantName, illustrationSrc }: StaffOperationsWorkspaceProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);
  const roles = sortRoles(bundle.roles);
  const visibleMembers = bundle.members.filter((member) => !member.isArchived);
  const fallbackMember = visibleMembers[0] ?? bundle.members[0] ?? null;
  const [activeScreen, setActiveScreen] = useState<StaffScreenKey>("staff");
  const [selectedMemberId, setSelectedMemberId] = useState(fallbackMember?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StaffListFilterKey>("all");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [realtimeState, setRealtimeState] = useState<StaffOpsRealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());
  const deferredQuery = useDeferredValue(query);

  const [createState, createFormAction, creatingStaff] = useActionState(createStaffAction, undefined);
  const [profileState, profileFormAction, savingProfile] = useActionState(updateStaffProfileAction, undefined);
  const [accountState, accountFormAction, updatingAccount] = useActionState(setStaffAccountStateAction, undefined);
  const [shiftState, shiftFormAction, creatingShift] = useActionState(createStaffShiftTemplateAction, undefined);
  const [assignState, assignFormAction, assigningShift] = useActionState(assignStaffShiftAction, undefined);
  const [cancelShiftState, cancelShiftFormAction, cancellingShift] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  const [permissionState, permissionFormAction, savingPermissions] = useActionState(updateStaffRolePermissionsAction, undefined);
  const [approvalState, approvalFormAction, reviewingApproval] = useActionState(reviewAttendanceApprovalAction, undefined);
  const [forceLogoutState, forceLogoutFormAction, forcingLogout] = useActionState(forceStaffSessionsLogoutAction, undefined);
  const [manualClockInState, manualClockInFormAction, manualClockingIn] = useActionState(manualClockInStaffAction, undefined);
  const [manualClockOutState, manualClockOutFormAction, manualClockingOut] = useActionState(manualClockOutStaffAction, undefined);
  const [reviewState, reviewFormAction, creatingReview] = useActionState(createStaffReviewAction, undefined);
  const [contractState, contractFormAction, creatingContract] = useActionState(createStaffContractAction, undefined);
  const [documentState, documentFormAction, creatingDocument] = useActionState(createStaffDocumentAction, undefined);
  const [deviceState, deviceFormAction, creatingDevice] = useActionState(createStaffDeviceAction, undefined);
  const refreshSignal = [
    createState?.success,
    profileState?.success,
    accountState?.success,
    shiftState?.success,
    assignState?.success,
    cancelShiftState?.success,
    permissionState?.success,
    approvalState?.success,
    forceLogoutState?.success,
    manualClockInState?.success,
    manualClockOutState?.success,
    reviewState?.success,
    contractState?.success,
    documentState?.success,
    deviceState?.success
  ].filter(Boolean).join("|");

  useEffect(() => {
    if (!refreshSignal) return;
    router.refresh();
  }, [refreshSignal, router]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRealtimeRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        setLastSyncedAt(new Date());
        router.refresh();
      }, 320);
    };

    let channel = supabase.channel(staffOperationsChannelName(restaurantId));
    STAFF_OPERATIONS_REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRealtimeRefresh
      );
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setRealtimeState("connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
    });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  const selectedMemberIsValid = bundle.members.some((member) => member.id === selectedMemberId);
  const effectiveSelectedMemberId = selectedMemberIsValid ? selectedMemberId : fallbackMember?.id ?? "";
  const selectedMember = bundle.members.find((member) => member.id === effectiveSelectedMemberId) ?? fallbackMember;
  const selectedRole = selectedMember ? roleForMember(selectedMember, roles) : null;
  const selectedAssignments = selectedMember ? shiftsForMember(selectedMember, bundle.shiftAssignments) : [];
  const selectedTimesheet = selectedMember ? bundle.timesheets.find((item) => item.staffMemberId === selectedMember.id) : null;
  const selectedAttendance = selectedMember ? bundle.attendanceFeed.filter((item) => item.staffMemberId === selectedMember.id).slice(0, 5) : [];
  const selectedApprovals = selectedMember ? bundle.approvals.filter((item) => item.staffMemberId === selectedMember.id).slice(0, 5) : [];
  const normalizedQuery = normalizeText(deferredQuery.trim());
  const filteredMembers = bundle.members.filter((member) => {
    const matchesSearch =
      !normalizedQuery ||
      normalizeText(`${member.fullName} ${member.phone ?? ""} ${member.email} ${member.username ?? ""} ${member.roleTitle} ${member.primaryBranchName ?? ""}`).includes(normalizedQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && member.activeSessionCount > 0 && !member.isArchived) ||
      (statusFilter === "off" && member.activeSessionCount === 0 && !member.isArchived && member.employmentStatus === "active") ||
      (statusFilter === "risk" && member.suspiciousScore >= 40 && !member.isArchived) ||
      (statusFilter === "no_pin" && !member.hasPin && !member.isArchived) ||
      (statusFilter === "no_branch" && !member.primaryBranchId && !member.isArchived) ||
      (statusFilter === "suspended" && member.employmentStatus === "suspended" && !member.isArchived);
    return matchesSearch && matchesStatus;
  });

  const pendingApprovals = bundle.approvals.filter((approval) => approval.status === "pending");
  const unresolvedRiskCount = pendingApprovals.length + visibleMembers.filter((member) => member.suspiciousScore >= 40).length + bundle.overview.lateAttendance;
  const liveStateLabel = bundle.overview.activeStaff > 0 ? `${bundle.overview.activeStaff} đang online` : "Chưa có nhân sự online";
  const realtimeBadgeTone = realtimeTone(realtimeState);

  function openMember(memberId: string, screen: StaffScreenKey = "profile") {
    setSelectedMemberId(memberId);
    setActiveScreen(screen);
  }

  return (
    <div className="staff-wireframe-space grid gap-2">
      <section className="staff-overview-hero staff-ops-hero-grid overflow-hidden rounded-xl border border-[#E9DED0] bg-[#FFFCF6] p-3 shadow-[0_14px_34px_rgba(71,45,18,0.045)]">
        <div className="flex min-w-0 flex-col justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#DDF1DE] text-[#0F4D3A]">
              <UsersRound size={22} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-[#CBE5D2] bg-[#E8F5EC] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#0F6A45]">
                  <Activity size={11} />
                  Live staff ops
                </span>
                <Pill tone={unresolvedRiskCount > 0 ? "orange" : "green"}>{unresolvedRiskCount > 0 ? `${unresolvedRiskCount} cần xem` : "Ổn định"}</Pill>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                  realtimeBadgeTone === "green"
                    ? "border-[#0F7A4F]/20 bg-[#E7F6EC] text-[#0F6A45]"
                    : realtimeBadgeTone === "red"
                      ? "border-[#C2410C]/20 bg-[#FFF0E7] text-[#9A3412]"
                      : "border-[#E08A2E]/20 bg-[#FFF1DF] text-[#A85B14]"
                }`}>
                  {realtimeState === "connected" ? <RadioTower size={11} /> : <RefreshCw size={11} />}
                  {realtimeLabel(realtimeState)}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black uppercase leading-none tracking-[0.025em] text-[#0B3F31]">Nhân sự hôm nay</h1>
              <p className="mt-0.5 text-xs font-semibold text-[#7B7266]">Online, ca làm, chấm công và quyền vận hành · {restaurantName} · {lastSyncedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[#E8DED0] bg-white/80 px-2.5 py-2">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64]">Đội ngũ</p>
              <p className="mt-0.5 text-sm font-black text-[#0B3F31]">{visibleMembers.length} nhân viên</p>
            </div>
            <div className="rounded-lg border border-[#E8DED0] bg-white/80 px-2.5 py-2">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64]">Hiện diện</p>
              <p className="mt-0.5 text-sm font-black text-[#0B3F31]">{liveStateLabel}</p>
            </div>
            <div className="rounded-lg border border-[#E8DED0] bg-white/80 px-2.5 py-2">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64]">Thông báo</p>
              <p className="mt-0.5 text-sm font-black text-[#0B3F31]">{bundle.unreadNotificationCount} chưa đọc</p>
            </div>
          </div>
        </div>
        <div className="relative hidden min-h-[132px] items-center justify-end md:flex">
          <Image
            src={illustrationSrc}
            alt=""
            width={220}
            height={132}
            className="h-32 w-auto max-w-[220px] object-contain drop-shadow-[0_18px_28px_rgba(15,77,58,0.12)]"
          />
        </div>
        <div className="flex flex-wrap content-start gap-2 md:justify-end">
          <button type="button" onClick={() => setActiveScreen("staff")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white">
            <Plus size={13} />
            Thêm nhân sự
          </button>
          <button type="button" onClick={() => setActiveScreen("attendance")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E3D8CA] bg-white px-3 text-[11px] font-black text-[#0B3F31]">
            <Clock3 size={13} />
            Chấm công
          </button>
          <a href="/staff/login" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E3D8CA] bg-white px-3 text-[11px] font-black text-[#0B3F31]">
            <Fingerprint size={13} />
            Cổng PIN
          </a>
        </div>
      </section>

      <StaffOperationsCockpit
        bundle={bundle}
        members={visibleMembers}
        approvals={pendingApprovals}
        onOpenMember={openMember}
        onOpenScreen={setActiveScreen}
      />

      <nav className="staff-screen-nav grid gap-1.5 xl:grid-cols-[1.4fr_1.35fr_0.9fr]">
        {screenGroups.map((group) => (
          <section key={group.label} className="rounded-xl border border-[#E9DED0] bg-[#FFFCF6] p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-[#0B3F31]">{group.label}</p>
                <p className="truncate text-[9.5px] font-bold text-[#756E64]">{group.description}</p>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {group.items.map((key) => {
                const screen = screenItemByKey.get(key);
                if (!screen) return null;
                return (
                  <button
                    key={screen.key}
                    type="button"
                    onClick={() => setActiveScreen(screen.key)}
                    className={`flex h-10 items-center gap-2 rounded-lg border px-2.5 text-left transition ${
                      activeScreen === screen.key
                        ? "border-[#0F4D3A] bg-[#0F4D3A] text-white shadow-[0_12px_24px_rgba(15,77,58,0.16)]"
                        : "border-[#E9DED0] bg-[#FFFCF6] text-[#453F37] hover:border-[#0F4D3A]/30"
                    }`}
                  >
                    <screen.icon size={16} />
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black opacity-70">{screen.index}</span>
                      <span className="block truncate text-[11px] font-black">{screen.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      {activeScreen === "staff" ? (
        <StaffListScreen
          members={filteredMembers}
          roles={roles}
          branches={bundle.branches}
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onOpenMember={openMember}
          createFormAction={createFormAction}
          createState={createState}
          creatingStaff={creatingStaff}
        />
      ) : null}

      {activeScreen === "profile" && selectedMember ? (
        <ProfileScreen
          member={selectedMember}
          roles={roles}
          selectedRole={selectedRole}
          branches={bundle.branches}
          assignments={selectedAssignments}
          timesheet={selectedTimesheet}
          attendance={selectedAttendance}
          approvals={selectedApprovals}
          permissionGroups={bundle.permissionGroups}
          premiumCustomPermissions={bundle.premium.customPermissions}
          profileFormAction={profileFormAction}
          accountFormAction={accountFormAction}
          permissionFormAction={permissionFormAction}
          forceLogoutFormAction={forceLogoutFormAction}
          states={{ profileState, accountState, permissionState }}
          forceLogoutState={forceLogoutState}
          pending={{ savingProfile, updatingAccount, savingPermissions, forcingLogout }}
        />
      ) : null}

      {activeScreen === "permissions" ? (
        <PermissionsScreen
          roles={roles}
          members={visibleMembers}
          permissionGroups={bundle.permissionGroups}
          activity={bundle.activity}
          premiumCustomPermissions={bundle.premium.customPermissions}
          permissionFormAction={permissionFormAction}
          permissionState={permissionState}
          savingPermissions={savingPermissions}
          onOpenMember={openMember}
          onOpenScreen={setActiveScreen}
        />
      ) : null}

      {activeScreen === "shifts" && selectedMember ? (
        <ShiftsScreen
          members={visibleMembers}
          selectedMember={selectedMember}
          branches={bundle.branches}
          shifts={bundle.shifts}
          assignments={bundle.shiftAssignments}
          assignFormAction={assignFormAction}
          cancelShiftFormAction={cancelShiftFormAction}
          shiftFormAction={shiftFormAction}
          assignState={assignState}
          cancelShiftState={cancelShiftState}
          shiftState={shiftState}
          pending={{ assigningShift, cancellingShift, creatingShift }}
          weekdays={weekdays}
          setWeekdays={setWeekdays}
          onOpenMember={openMember}
        />
      ) : null}

      {activeScreen === "attendance" ? (
        <AttendanceScreen
          members={visibleMembers}
          attendanceFeed={bundle.attendanceFeed}
          approvals={pendingApprovals}
          approvalFormAction={approvalFormAction}
          manualClockInFormAction={manualClockInFormAction}
          manualClockOutFormAction={manualClockOutFormAction}
          approvalState={approvalState}
          manualClockInState={manualClockInState}
          manualClockOutState={manualClockOutState}
          reviewingApproval={reviewingApproval}
          manualClockingIn={manualClockingIn}
          manualClockingOut={manualClockingOut}
          onOpenMember={openMember}
        />
      ) : null}
      {activeScreen === "requests" ? (
        <RequestsScreen
          approvals={bundle.approvals}
          members={visibleMembers}
          branches={bundle.branches}
          assignments={bundle.shiftAssignments}
          approvalFormAction={approvalFormAction}
          approvalState={approvalState}
          reviewingApproval={reviewingApproval}
          onOpenMember={openMember}
        />
      ) : null}
      {activeScreen === "activity" ? <ActivityScreen activity={bundle.activity} /> : null}
      {activeScreen === "reviews" ? (
        <ReviewsScreen
          members={visibleMembers}
          reviews={bundle.reviews}
          bundle={bundle}
          formAction={reviewFormAction}
          state={reviewState}
          pending={creatingReview}
          onOpenMember={openMember}
        />
      ) : null}
      {activeScreen === "lifecycle" ? (
        <LifecycleScreen
          members={visibleMembers}
          contracts={bundle.contracts}
          documents={bundle.documents}
          devices={bundle.devices}
          approvals={bundle.approvals}
          assignments={bundle.shiftAssignments}
          onOpenMember={openMember}
          onOpenScreen={setActiveScreen}
        />
      ) : null}
      {activeScreen === "contracts" ? (
        <ContractsScreen
          members={visibleMembers}
          contracts={bundle.contracts}
          formAction={contractFormAction}
          state={contractState}
          pending={creatingContract}
        />
      ) : null}
      {activeScreen === "documents" ? (
        <DocumentsScreen
          members={visibleMembers}
          documents={bundle.documents}
          formAction={documentFormAction}
          state={documentState}
          pending={creatingDocument}
        />
      ) : null}
      {activeScreen === "devices" ? (
        <DevicesScreen
          members={visibleMembers}
          devices={bundle.devices}
          formAction={deviceFormAction}
          state={deviceState}
          pending={creatingDevice}
        />
      ) : null}
      {activeScreen === "branches" ? (
        <BranchCommandCenterScreen
          bundle={bundle}
          members={visibleMembers}
          approvals={pendingApprovals}
          onOpenMember={openMember}
          onOpenScreen={setActiveScreen}
        />
      ) : null}
      {activeScreen === "reports" ? <ReportsScreen bundle={bundle} onOpenMember={openMember} onOpenScreen={setActiveScreen} /> : null}
    </div>
  );
}

function StaffListScreen({
  members,
  roles,
  branches,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  onOpenMember,
  createFormAction,
  createState,
  creatingStaff
}: {
  members: StaffOpsMember[];
  roles: StaffOpsRoleSummary[];
  branches: StaffOperationsBundle["branches"];
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  statusFilter: StaffListFilterKey;
  setStatusFilter: Dispatch<SetStateAction<StaffListFilterKey>>;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  createFormAction: (payload: FormData) => void;
  createState?: StaffActionState;
  creatingStaff: boolean;
}) {
  const [showQuickCreate, setShowQuickCreate] = useState(members.length === 0);
  const onlineCount = members.filter((member) => member.activeSessionCount > 0 && !member.isArchived).length;
  const activeStaffCount = members.filter((member) => member.employmentStatus === "active" && !member.isArchived).length;
  const noPinCount = members.filter((member) => !member.hasPin && !member.isArchived).length;
  const noBranchCount = members.filter((member) => !member.primaryBranchId && !member.isArchived).length;
  const riskCount = members.filter((member) => member.suspiciousScore >= 40 && !member.isArchived).length;
  const lateTodayCount = members.filter((member) => (member.lateMinutesToday > 0 || member.todayAttendanceState === "late") && !member.isArchived).length;
  const blockedCount = members.filter((member) => (member.employmentStatus === "suspended" || member.accountStatus === "blocked") && !member.isArchived).length;
  const trainingGapCount = members.filter((member) =>
    !member.isArchived &&
    member.employmentStatus === "active" &&
    (!member.hasPin || !member.primaryBranchId || member.suspiciousScore >= 40 || member.todayAttendanceState === "absent")
  ).length;
  const workforceReadinessScore = clampPercent(
    100 -
    noPinCount * 8 -
    noBranchCount * 8 -
    riskCount * 10 -
    lateTodayCount * 4 -
    blockedCount * 6
  );
  const workforceChecklist = [
    { id: "pin", label: "PIN sẵn sàng cho nhân viên", value: noPinCount, done: noPinCount === 0 },
    { id: "branch", label: "Đã gán chi nhánh", value: noBranchCount, done: noBranchCount === 0 },
    { id: "risk", label: "Không có hồ sơ rủi ro", value: riskCount, done: riskCount === 0 },
    { id: "training", label: "Đủ điều kiện training ca", value: trainingGapCount, done: trainingGapCount === 0 }
  ];
  const filterOptions: Array<{ key: StaffListFilterKey; label: string; count: number; tone: "green" | "orange" | "red" | "neutral" }> = [
    { key: "all", label: "Tất cả", count: members.length, tone: "neutral" },
    { key: "active", label: "Online", count: onlineCount, tone: "green" },
    { key: "off", label: "Offline", count: members.filter((member) => member.activeSessionCount === 0 && member.employmentStatus === "active" && !member.isArchived).length, tone: "neutral" },
    { key: "risk", label: "Rủi ro", count: riskCount, tone: "red" },
    { key: "no_pin", label: "Chưa PIN", count: noPinCount, tone: "orange" },
    { key: "no_branch", label: "Chưa chi nhánh", count: noBranchCount, tone: "orange" },
    { key: "suspended", label: "Tạm khóa", count: blockedCount, tone: "red" }
  ];
  const setupGapCount = noPinCount + noBranchCount;

  return (
    <StaffShellCard
      index="1"
      title="Danh sách nhân sự"
      subtitle="Quản lý thông tin và trạng thái hoạt động nhân viên"
      action={
        <button
          type="button"
          onClick={() => setShowQuickCreate((current) => !current)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white"
        >
          <Plus size={12} />
          {showQuickCreate ? "Ẩn tạo nhanh" : "Tạo nhân sự"}
        </button>
      }
    >
      <div className={`grid gap-0 ${showQuickCreate ? "xl:grid-cols-[minmax(0,1fr)_286px]" : ""}`}>
        <div className={`min-w-0 ${showQuickCreate ? "xl:border-r xl:border-[#EFE5D9]" : ""}`}>
          <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Workforce readiness</p>
                  <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ai đã đủ điều kiện đứng ca</h3>
                </div>
                <Pill tone={workforceReadinessScore >= 90 ? "green" : workforceReadinessScore >= 75 ? "orange" : "red"}>{workforceReadinessScore}/100</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <StaffOpsMetric icon={UsersRound} label="Đang làm" value={activeStaffCount} meta={`${onlineCount} online realtime`} tone={onlineCount ? "green" : "neutral"} />
                <StaffOpsMetric icon={Fingerprint} label="Thiếu PIN" value={noPinCount} meta="Chưa sẵn sàng chấm ca" tone={noPinCount ? "orange" : "green"} />
                <StaffOpsMetric icon={AlertTriangle} label="Cần kèm" value={trainingGapCount} meta="Thiếu setup, rủi ro hoặc vắng" tone={trainingGapCount ? "orange" : "green"} />
                <StaffOpsMetric icon={ShieldCheck} label="Rủi ro quyền" value={riskCount} meta={`${blockedCount} tài khoản khóa`} tone={riskCount ? "red" : "green"} />
              </div>
            </section>

            <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Training gate</p>
                  <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Checklist mở ca</h3>
                </div>
                <Pill tone={workforceChecklist.every((item) => item.done) ? "green" : "orange"}>{workforceChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
              </div>
              <div className="mt-3 grid gap-1.5">
                {workforceChecklist.map((item) => (
                  <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                        {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                      </span>
                      <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className="flex flex-col gap-1.5 border-b border-[#EFE5D9] px-3 py-2 md:flex-row md:items-center">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[#7D7469]">
              <Search size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm nhân viên..." className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] font-bold outline-none" />
            </label>
            <div className="flex flex-wrap gap-1">
              {filterOptions.map((item) => (
                <button key={item.key} type="button" onClick={() => setStatusFilter(item.key)} className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-black ${statusFilter === item.key ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#615A50]"}`}>
                  {item.label}
                  <span className={`rounded-full px-1 text-[9px] ${statusFilter === item.key ? "bg-white/18 text-white" : item.tone === "red" ? "bg-[#FFF0E7] text-[#9A3412]" : item.tone === "orange" ? "bg-[#FFF1DF] text-[#A85B14]" : item.tone === "green" ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FAF6EE] text-[#746B60]"}`}>{item.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] px-3 py-2 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">Bulk-ready cohorts</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-[#2D2924]">
                {setupGapCount ? `${setupGapCount} hồ sơ cần hoàn tất PIN/chi nhánh trước khi training ca.` : "Không có thiếu sót setup nổi bật trong danh sách hiện tại."}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setStatusFilter("no_pin")} className="h-7 rounded-lg border border-[#F2D2B2] bg-white px-2.5 text-[10px] font-black text-[#A85B14]">Lọc chưa PIN</button>
              <button type="button" onClick={() => setStatusFilter("no_branch")} className="h-7 rounded-lg border border-[#F2D2B2] bg-white px-2.5 text-[10px] font-black text-[#A85B14]">Lọc chưa chi nhánh</button>
              <button type="button" onClick={() => setShowQuickCreate(true)} className="h-7 rounded-lg bg-[#003F2D] px-2.5 text-[10px] font-black text-white">Tạo thêm</button>
            </div>
          </div>
          <div className="grid gap-2 p-3 md:hidden">
            {members.map((member) => (
              <article key={member.id} className="staff-mobile-action-card rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3 shadow-[0_10px_24px_rgba(71,45,18,0.04)]">
                <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="flex w-full items-start gap-2 text-left">
                  <StaffAvatar member={member} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-black text-[#2D2924]">{member.fullName}</span>
                      <Pill tone={badgeTone(member)}>{accountStatusLabel(member)}</Pill>
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#756E64]">{member.roleTitle} · {member.primaryBranchName ?? "Chưa gán chi nhánh"}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Pill tone={member.hasPin ? "green" : "orange"}>{member.hasPin ? "PIN OK" : "Chưa PIN"}</Pill>
                      <Pill tone={member.primaryBranchId ? "green" : "orange"}>{member.primaryBranchId ? "Có chi nhánh" : "Chưa chi nhánh"}</Pill>
                    </span>
                  </span>
                </button>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                  <span className="rounded-lg bg-[#FFF9F0] px-1.5 py-1">
                    <strong className="block text-sm text-[#0F4D3A]">{member.activeSessionCount}</strong>
                    <small className="text-[9px] font-bold text-[#756E64]">phiên</small>
                  </span>
                  <span className="rounded-lg bg-[#FFF9F0] px-1.5 py-1">
                    <strong className="block text-sm text-[#A85B14]">{member.lateMinutesToday}</strong>
                    <small className="text-[9px] font-bold text-[#756E64]">phút muộn</small>
                  </span>
                  <span className="rounded-lg bg-[#FFF9F0] px-1.5 py-1">
                    <strong className="block text-sm text-[#9A3412]">{member.suspiciousScore}</strong>
                    <small className="text-[9px] font-bold text-[#756E64]">rủi ro</small>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="h-8 rounded-lg bg-[#003F2D] text-[10px] font-black text-white">Hồ sơ</button>
                  <button type="button" onClick={() => onOpenMember(member.id, "attendance")} className="h-8 rounded-lg border border-[#E3D8CA] bg-white text-[10px] font-black text-[#0B3F31]">Chấm công</button>
                  <button type="button" onClick={() => onOpenMember(member.id, "shifts")} className="h-8 rounded-lg border border-[#E3D8CA] bg-white text-[10px] font-black text-[#0B3F31]">Ca</button>
                  <button type="button" onClick={() => onOpenMember(member.id, "requests")} className="h-8 rounded-lg border border-[#E3D8CA] bg-white text-[10px] font-black text-[#0B3F31]">Duyệt</button>
                </div>
              </article>
            ))}
            {!members.length ? <div className="rounded-xl border border-dashed border-[#E8DED0] bg-[#FFF9F0] p-6 text-sm font-bold text-[#756E64]">Không có nhân sự phù hợp bộ lọc.</div> : null}
          </div>
          <div className="hidden overflow-auto md:block">
            <TableHead className="grid-cols-[minmax(220px,1.5fr)_130px_150px_110px_130px_90px_44px]">
              <span>Nhân viên</span>
              <span>Vai trò</span>
              <span>Chi nhánh</span>
              <span>Setup</span>
              <span>Ca làm việc</span>
              <span>Trạng thái</span>
              <span />
            </TableHead>
            {members.map((member) => (
              <button key={member.id} type="button" onClick={() => onOpenMember(member.id, "profile")} className="block w-full text-left">
                <TableRow className="grid-cols-[minmax(220px,1.5fr)_130px_150px_110px_130px_90px_44px] hover:bg-[#FFF8EF]">
                  <span className="flex min-w-0 items-center gap-2">
                    <StaffAvatar member={member} />
                    <span className="min-w-0">
                      <span className="block truncate font-black text-[#2D2924]">{member.fullName}</span>
                      <span className="block truncate text-[11px] font-semibold text-[#756E64]">{member.username ?? member.email}</span>
                    </span>
                  </span>
                  <span><Pill>{member.roleTitle}</Pill></span>
                  <span className="truncate font-semibold text-[#5D554B]">{member.primaryBranchName ?? "Chưa gán"}</span>
                  <span className="flex flex-wrap gap-1">
                    <Pill tone={member.hasPin ? "green" : "orange"}>{member.hasPin ? "PIN" : "Thiếu PIN"}</Pill>
                    {!member.primaryBranchId ? <Pill tone="orange">Branch</Pill> : null}
                  </span>
                  <span className="font-bold text-[#2D2924]">{member.todayAttendanceState ? attendanceLabel(member.todayAttendanceState) : "Chưa chấm"}</span>
                  <span><Pill tone={badgeTone(member)}>{accountStatusLabel(member)}</Pill></span>
                  <span className="flex justify-end text-[#756E64]"><MoreVertical size={15} /></span>
                </TableRow>
              </button>
            ))}
            {!members.length ? <div className="p-6 text-sm font-bold text-[#756E64]">Không có nhân sự phù hợp bộ lọc.</div> : null}
          </div>
        </div>
        {showQuickCreate ? (
          <form id="staff-create-form" action={createFormAction} className="grid content-start gap-1.5 bg-[#FFF9F0] p-3">
            <div className="mb-1 rounded-lg border border-[#E8DED0] bg-white/70 p-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Tạo nhân sự nhanh</h3>
              <p className="mt-0.5 text-[10.5px] font-bold leading-snug text-[#756E64]">Chỉ cần tên, vai trò và chi nhánh. Email có thể để trống cho tài khoản PIN nội bộ.</p>
            </div>
            <input name="fullName" required placeholder="Họ tên" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none" />
            <input name="phone" placeholder="Số điện thoại" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none" />
            <select name="roleCode" defaultValue="waiter" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none">
              {roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}
            </select>
            <select name="branchId" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none">
              <option value="">Chi nhánh chính</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <input name="pin" inputMode="numeric" placeholder="PIN 4-8 số" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none" />
            <input name="email" type="email" placeholder="Email nếu cần" className="h-8 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[11px] font-bold outline-none" />
            <button type="submit" disabled={creatingStaff} className="mt-1 h-8 rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-60">{creatingStaff ? "Đang tạo..." : "Tạo nhân sự"}</button>
            <ActionNotice state={createState} />
          </form>
        ) : null}
      </div>
    </StaffShellCard>
  );
}

function ProfileScreen({
  member,
  roles,
  selectedRole,
  branches,
  assignments,
  timesheet,
  attendance,
  approvals,
  permissionGroups,
  premiumCustomPermissions,
  profileFormAction,
  accountFormAction,
  permissionFormAction,
  forceLogoutFormAction,
  states,
  forceLogoutState,
  pending
}: {
  member: StaffOpsMember;
  roles: StaffOpsRoleSummary[];
  selectedRole: StaffOpsRoleSummary | null;
  branches: StaffOperationsBundle["branches"];
  assignments: StaffOpsShiftAssignment[];
  timesheet: StaffOpsTimesheetSummary | null | undefined;
  attendance: StaffOpsAttendanceFeedItem[];
  approvals: StaffOpsApprovalItem[];
  permissionGroups: StaffOperationsBundle["permissionGroups"];
  premiumCustomPermissions: boolean;
  profileFormAction: (payload: FormData) => void;
  accountFormAction: (payload: FormData) => void;
  permissionFormAction: (payload: FormData) => void;
  forceLogoutFormAction: (payload: FormData) => void;
  states: { profileState?: StaffActionState; accountState?: StaffActionState; permissionState?: StaffActionState };
  forceLogoutState?: StaffActionState;
  pending: { savingProfile: boolean; updatingAccount: boolean; savingPermissions: boolean; forcingLogout: boolean };
}) {
  const rolePermissions = selectedRole?.permissions ?? member.permissions;

  return (
    <StaffShellCard index="2" title="Chi tiết nhân viên (Hồ sơ)" subtitle="Hồ sơ vận hành, phân quyền và trạng thái tài khoản" action={<Pill tone={badgeTone(member)}>{accountStatusLabel(member)}</Pill>}>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_330px]">
        <div className="min-w-0 border-r border-[#EFE5D9] p-3">
          <div className="mb-3 flex flex-col gap-3 rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3 md:flex-row md:items-center">
            <StaffAvatar member={member} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-black text-[#2D2924]">{member.fullName}</h2>
                <Pill>{member.roleTitle}</Pill>
                {member.activeSessionCount > 0 ? <Pill tone="green">Đang làm</Pill> : <Pill>Offline</Pill>}
              </div>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">{member.email} · {member.phone ?? "Chưa có SĐT"}</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">{member.primaryBranchName ?? "Chưa gán chi nhánh"}</p>
            </div>
          </div>

          <form action={profileFormAction} className="grid gap-2">
            <input type="hidden" name="userId" value={member.userId} />
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Họ và tên"><input name="fullName" defaultValue={member.fullName} className="staff-field-input" /></Field>
              <Field label="Tài khoản"><input name="username" defaultValue={member.username ?? ""} placeholder="Username" className="staff-field-input" /></Field>
              <Field label="Email"><input value={member.email} readOnly className="staff-field-input opacity-70" /></Field>
              <Field label="Số điện thoại"><input name="phone" defaultValue={member.phone ?? ""} className="staff-field-input" /></Field>
              <Field label="Vai trò">
                <select name="roleCode" defaultValue={member.roleCode} className="staff-field-input">
                  {roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}
                </select>
              </Field>
              <Field label="Chi nhánh">
                <select name="branchId" defaultValue={member.primaryBranchId ?? ""} className="staff-field-input">
                  <option value="">Chưa gán</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </Field>
              <Field label="Trạng thái">
                <select name="employmentStatus" defaultValue={member.employmentStatus} className="staff-field-input">
                  <option value="active">Đang làm</option>
                  <option value="suspended">Tạm khoá</option>
                  <option value="resigned">Đã nghỉ</option>
                </select>
              </Field>
              <Field label="PIN mới"><input name="pin" inputMode="numeric" placeholder="Thiết lập 4-8 số" className="staff-field-input" /></Field>
              <Field label="Liên hệ khẩn cấp"><input name="emergencyContactName" defaultValue={member.emergencyContactName ?? ""} className="staff-field-input" /></Field>
              <Field label="SĐT khẩn cấp"><input name="emergencyContactPhone" defaultValue={member.emergencyContactPhone ?? ""} className="staff-field-input" /></Field>
            </div>
            <Field label="Ghi chú"><textarea name="notes" defaultValue={member.notes ?? ""} rows={2} className="staff-field-input h-auto py-1.5" /></Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending.savingProfile} className="h-8 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-60">{pending.savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}</button>
              <ActionNotice state={states.profileState} />
            </div>
          </form>
        </div>

        <aside className="grid content-start gap-2 bg-[#FFF9F0] p-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Công tháng" value={timesheet ? formatHours(timesheet.workMinutes) : "0h"} />
            <StatTile label="Đi muộn" value={`${member.lateMinutesToday}p`} tone={member.lateMinutesToday ? "orange" : "neutral"} />
            <StatTile label="Tăng ca" value={formatHours(member.overtimeMinutesToday)} />
            <StatTile label="Rủi ro" value={member.suspiciousScore} tone={member.suspiciousScore >= 50 ? "red" : member.suspiciousScore >= 40 ? "orange" : "green"} />
          </div>
          <div className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <h3 className="text-xs font-black text-[#0B3F31]">Ca gần nhất</h3>
            <div className="mt-1.5 grid gap-1.5">
              {assignments.slice(0, 3).map((assignment) => (
                <div key={assignment.id} className="rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] px-2.5 py-1.5">
                  <p className="text-[11px] font-black text-[#2D2924]">{assignment.shiftName}</p>
                  <p className="text-[10px] font-bold text-[#756E64]">{assignment.scheduledDate} · {assignment.branchName ?? member.primaryBranchName ?? "Toàn quán"}</p>
                </div>
              ))}
              {!assignments.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có ca tuần này.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Chấm công gần đây</h3>
              <Pill tone={approvals.length ? "orange" : "green"}>{approvals.length} chờ</Pill>
            </div>
            <div className="mt-1.5 grid gap-1.5">
              {attendance.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-black text-[#2D2924]">{attendanceLabel(item.state)}</p>
                    <Pill tone={item.approvalState === "pending" ? "orange" : item.approvalState === "rejected" ? "red" : "green"}>{item.source}</Pill>
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold text-[#756E64]">{formatShortDateTime(item.clockInAt)} · Muộn {item.lateMinutes}p · OT {formatHours(item.overtimeMinutes)}</p>
                </div>
              ))}
              {!attendance.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có log chấm công gần đây.</p> : null}
            </div>
          </div>
          {approvals.length ? (
            <div className="rounded-xl border border-[#F2D2B2] bg-[#FFF8EF] p-2.5">
              <h3 className="text-xs font-black text-[#A85B14]">Request ảnh hưởng công/lương</h3>
              <div className="mt-1.5 grid gap-1.5">
                {approvals.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-lg border border-[#F2D2B2] bg-white px-2.5 py-1.5">
                    <p className="truncate text-[11px] font-black text-[#2D2924]">{requestTypeLabel(item.requestType)}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">{item.reason ?? "Cần quản lý duyệt trước khi chốt payroll."}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <form action={accountFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <input type="hidden" name="userId" value={member.userId} />
            <h3 className="text-xs font-black text-[#0B3F31]">Kiểm soát tài khoản</h3>
            <textarea name="reason" rows={2} placeholder="Lý do lưu audit log..." className="staff-field-input mt-1.5 h-auto py-1.5" />
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <button name="nextState" value="active" disabled={pending.updatingAccount} className="h-8 rounded-lg border border-[#DDE9D8] bg-[#E7F6EC] text-[11px] font-black text-[#0F6A45]">Mở</button>
              <button name="nextState" value="suspended" disabled={pending.updatingAccount} className="h-8 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] text-[11px] font-black text-[#A85B14]">Khoá</button>
              <button name="nextState" value="archived" disabled={pending.updatingAccount} className="h-8 rounded-lg border border-[#F2D2B2] bg-[#FFF0E7] text-[11px] font-black text-[#9A3412]">Lưu trữ</button>
            </div>
            <div className="mt-1.5"><ActionNotice state={states.accountState} /></div>
          </form>
          <form action={forceLogoutFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Phiên đăng nhập</h3>
              <Pill tone={member.activeSessionCount > 0 ? "green" : "neutral"}>{member.activeSessionCount} phiên</Pill>
            </div>
            <input
              name="reason"
              placeholder="Lý do buộc đăng xuất..."
              className="staff-field-input mt-1.5"
              defaultValue={member.activeSessionCount > 1 ? "Nghi ngờ đăng nhập nhiều thiết bị" : ""}
            />
            <button
              type="submit"
              disabled={pending.forcingLogout || member.activeSessionCount === 0}
              className="mt-1.5 h-8 w-full rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] text-[11px] font-black text-[#A85B14] disabled:opacity-50"
            >
              {pending.forcingLogout ? "Đang đăng xuất..." : "Buộc đăng xuất phiên"}
            </button>
            <div className="mt-1.5"><ActionNotice state={forceLogoutState} /></div>
          </form>
          <form action={permissionFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            {selectedRole?.id ? <input type="hidden" name="roleId" value={selectedRole.id} /> : null}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Quyền vận hành</h3>
              <Pill>{rolePermissions.length} quyền</Pill>
            </div>
            <p className="mt-1 text-[10.5px] font-bold leading-snug text-[#756E64]">
              Ma trận quyền đầy đủ theo role. Quyền nhạy cảm có biểu tượng kiểm soát và luôn được ghi audit log khi thay đổi.
            </p>
            <div className="mt-1.5 max-h-[268px] overflow-auto pr-1">
              {permissionGroups.map((group) => (
                <details key={group.key} className="mb-2 rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] p-1.5 last:mb-0" open={group.key === "staff" || group.permissions.some((permission) => isDangerPermission(permission))}>
                  <summary className="cursor-pointer list-none rounded-md px-1 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">
                    {group.title} · {group.permissions.length} quyền
                  </summary>
                  <div className="mt-1 grid gap-1">
                    {group.permissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-1.5 rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] px-2 py-1 text-[10.5px] font-bold text-[#453F37]">
                        <input type="checkbox" name="permissions" value={permission} defaultChecked={rolePermissions.includes(permission)} disabled={!premiumCustomPermissions || !selectedRole?.id} className="h-3.5 w-3.5 accent-[#0F4D3A]" />
                        <span className="min-w-0 flex-1 truncate">{staffPermissionLabel(permission)}</span>
                        {isDangerPermission(permission) ? <ShieldCheck size={12} className="text-[#A85B14]" /> : null}
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <button type="submit" disabled={!premiumCustomPermissions || !selectedRole?.id || pending.savingPermissions} className="mt-1.5 h-8 w-full rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">Lưu quyền</button>
            <div className="mt-1.5"><ActionNotice state={states.permissionState} /></div>
          </form>
        </aside>
      </div>
    </StaffShellCard>
  );
}

function PermissionsScreen({
  roles,
  members,
  permissionGroups,
  activity,
  premiumCustomPermissions,
  permissionFormAction,
  permissionState,
  savingPermissions,
  onOpenMember,
  onOpenScreen
}: {
  roles: StaffOpsRoleSummary[];
  members: StaffOpsMember[];
  permissionGroups: StaffOperationsBundle["permissionGroups"];
  activity: StaffOpsActivityItem[];
  premiumCustomPermissions: boolean;
  permissionFormAction: (payload: FormData) => void;
  permissionState?: StaffActionState;
  savingPermissions: boolean;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen: (screen: StaffScreenKey) => void;
}) {
  const sortedRoles = sortRoles(roles);
  const [selectedRoleId, setSelectedRoleId] = useState(sortedRoles[0]?.id ?? "");
  const selectedRole = sortedRoles.find((role) => role.id === selectedRoleId) ?? sortedRoles[0] ?? null;
  const selectedPermissions = selectedRole?.permissions ?? [];
  const selectedDangerCount = selectedPermissions.filter((permission) => isDangerPermission(permission)).length;
  const staffWithSelectedRole = selectedRole ? members.filter((member) => String(member.roleCode) === String(selectedRole.code)) : [];
  const noPinInRole = staffWithSelectedRole.filter((member) => !member.hasPin && !member.isArchived).length;
  const riskyMembersInRole = staffWithSelectedRole.filter((member) => member.suspiciousScore >= 40 && !member.isArchived).length;
  const permissionActivity = activity.filter((item) => {
    const haystack = normalizeText(`${item.action} ${item.entityType} ${item.reason ?? ""}`);
    return haystack.includes("permission") || haystack.includes("role") || haystack.includes("quyen") || haystack.includes("vai tro");
  });
  const permissionReadinessScore = clampPercent(
    100 -
    selectedDangerCount * 5 -
    noPinInRole * 7 -
    riskyMembersInRole * 10 -
    (!premiumCustomPermissions ? 12 : 0)
  );
  const groupRows = permissionGroups.map((group) => {
    const enabled = group.permissions.filter((permission) => selectedPermissions.includes(permission));
    const danger = enabled.filter((permission) => isDangerPermission(permission));
    return {
      key: group.key,
      title: group.title,
      total: group.permissions.length,
      enabled: enabled.length,
      danger: danger.length,
      permissions: group.permissions
    };
  }).sort((left, right) => right.danger - left.danger || right.enabled - left.enabled);
  const roleRiskRows = sortedRoles.map((role) => {
    const roleMembers = members.filter((member) => String(member.roleCode) === String(role.code) && !member.isArchived);
    const dangerCount = role.permissions.filter((permission) => isDangerPermission(permission)).length;
    const riskScore = dangerCount * 8 + roleMembers.filter((member) => member.suspiciousScore >= 40).length * 12 + (role.system ? 0 : 4);
    return {
      role,
      members: roleMembers.length,
      dangerCount,
      riskScore: clampPercent(riskScore)
    };
  }).sort((left, right) => right.riskScore - left.riskScore || right.members - left.members);
  const permissionChecklist = [
    { id: "danger", label: "Quyền nhạy cảm đã rà", value: selectedDangerCount, done: selectedDangerCount === 0 },
    { id: "pin", label: "Nhân sự role này có PIN", value: noPinInRole, done: noPinInRole === 0 },
    { id: "risk", label: "Không có nhân sự rủi ro", value: riskyMembersInRole, done: riskyMembersInRole === 0 },
    { id: "premium", label: "Gói cho phép chỉnh quyền", value: premiumCustomPermissions ? "Có" : "Khóa", done: premiumCustomPermissions }
  ];

  return (
    <StaffShellCard
      index="3"
      title="Quyền & bảo mật"
      subtitle="Kiểm soát role, quyền nhạy cảm và audit phân quyền"
      action={<Pill tone={permissionReadinessScore >= 90 ? "green" : permissionReadinessScore >= 75 ? "orange" : "red"}>{permissionReadinessScore}/100</Pill>}
    >
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Role" value={sortedRoles.length} />
        <StatTile label="Quyền bật" value={selectedPermissions.length} />
        <StatTile label="Nhạy cảm" value={selectedDangerCount} tone={selectedDangerCount ? "orange" : "green"} />
        <StatTile label="Audit quyền" value={permissionActivity.length} tone={permissionActivity.length ? "orange" : "neutral"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Permission command center</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Role nào đang có quyền nhạy cảm</h3>
            </div>
            <Pill tone={premiumCustomPermissions ? "green" : "orange"}>{premiumCustomPermissions ? "Custom on" : "Custom locked"}</Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {roleRiskRows.slice(0, 4).map((row) => (
              <button
                key={row.role.id}
                type="button"
                onClick={() => setSelectedRoleId(row.role.id)}
                className={`rounded-xl border p-2.5 text-left transition hover:border-[#0F4D3A]/30 ${selectedRole?.id === row.role.id ? "border-[#0F4D3A]/35 bg-[#E8F5EC]" : "border-[#E8DED0] bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{row.role.title}</p>
                  <Pill tone={row.riskScore >= 45 ? "red" : row.riskScore > 0 ? "orange" : "green"}>{row.riskScore}</Pill>
                </div>
                <p className="mt-1 text-[10px] font-bold text-[#756E64]">{row.members} nhân sự · {row.dangerCount} quyền nhạy cảm</p>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist bảo mật</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">{selectedRole?.title ?? "Chưa chọn role"}</h3>
            </div>
            <Pill tone={permissionChecklist.every((item) => item.done) ? "green" : "orange"}>{permissionChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {permissionChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#756E64]">Role templates</p>
          <div className="grid gap-1.5">
            {sortedRoles.map((role) => {
              const active = selectedRole?.id === role.id;
              const roleMembers = members.filter((member) => String(member.roleCode) === String(role.code) && !member.isArchived).length;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`rounded-lg border px-2.5 py-2 text-left transition ${active ? "border-[#0F4D3A] bg-[#E8F5EC]" : "border-[#E8DED0] bg-[#FFFCF6] hover:border-[#0F4D3A]/30"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-black text-[#2D2924]">{role.title}</span>
                    <Pill>{roleMembers}</Pill>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">{role.permissionCount} quyền · {role.dangerPermissionCount} nhạy cảm</p>
                </button>
              );
            })}
          </div>
        </aside>

        <form action={permissionFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-3">
          {selectedRole?.id ? <input type="hidden" name="roleId" value={selectedRole.id} /> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Permission matrix</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">{selectedRole?.title ?? "Chưa có role"}</h3>
            </div>
            <div className="flex flex-wrap gap-1">
              <Pill>{selectedPermissions.length} quyền</Pill>
              <Pill tone={selectedDangerCount ? "orange" : "green"}>{selectedDangerCount} nhạy cảm</Pill>
            </div>
          </div>
          {!premiumCustomPermissions ? (
            <div className="mt-2 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] px-2.5 py-2 text-[10.5px] font-bold text-[#A85B14]">
              Gói hiện tại đang khóa chỉnh custom permission. Vẫn có thể xem ma trận và audit.
            </div>
          ) : null}
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1 lg:grid-cols-2">
            {groupRows.map((group) => (
              <details key={group.key} className="rounded-xl border border-[#EFE5D9] bg-[#FFFCF6] p-2" open={group.danger > 0 || group.enabled > 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{group.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Pill>{group.enabled}/{group.total}</Pill>
                    {group.danger ? <Pill tone="orange">{group.danger}</Pill> : null}
                  </span>
                </summary>
                <div className="mt-2 grid gap-1">
                  {group.permissions.map((permission) => (
                    <label key={permission} className="flex items-center gap-1.5 rounded-lg border border-[#EFE5D9] bg-white px-2 py-1 text-[10.5px] font-bold text-[#453F37]">
                      <input type="checkbox" name="permissions" value={permission} defaultChecked={selectedPermissions.includes(permission)} disabled={!premiumCustomPermissions || !selectedRole?.id} className="h-3.5 w-3.5 accent-[#0F4D3A]" />
                      <span className="min-w-0 flex-1 truncate">{staffPermissionLabel(permission)}</span>
                      {isDangerPermission(permission) ? <ShieldCheck size={12} className="text-[#A85B14]" /> : null}
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </div>
          <button type="submit" disabled={!premiumCustomPermissions || !selectedRole?.id || savingPermissions} className="mt-3 h-8 w-full rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">
            {savingPermissions ? "Đang lưu..." : "Lưu ma trận quyền"}
          </button>
          <div className="mt-2"><ActionNotice state={permissionState} /></div>
        </form>

        <aside className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Nhân sự role này</h3>
            <Pill>{staffWithSelectedRole.length}</Pill>
          </div>
          <div className="mt-2 grid max-h-[280px] gap-1.5 overflow-auto pr-1">
            {staffWithSelectedRole.slice(0, 8).map((member) => (
              <button key={member.id} type="button" onClick={() => onOpenMember(member.id, "profile")} className="flex min-h-[42px] items-center gap-2 rounded-lg border border-[#EFE5D9] bg-[#FFFCF6] px-2 py-1.5 text-left">
                <StaffAvatar member={member} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-[#2D2924]">{member.fullName}</span>
                  <span className="block truncate text-[10px] font-bold text-[#756E64]">{member.primaryBranchName ?? "Chưa gán chi nhánh"}</span>
                </span>
                {member.suspiciousScore >= 40 ? <Pill tone="orange">{member.suspiciousScore}</Pill> : null}
              </button>
            ))}
            {!staffWithSelectedRole.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có nhân sự dùng role này.</p> : null}
          </div>
          <button type="button" onClick={() => onOpenScreen("activity")} className="mt-2 h-8 w-full rounded-lg border border-[#0F4D3A] text-[11px] font-black text-[#0F4D3A]">
            Xem audit quyền
          </button>
        </aside>
      </div>
    </StaffShellCard>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#756E64]">{label}</span>
      {children}
    </label>
  );
}

function ShiftsScreen({
  members,
  selectedMember,
  branches,
  shifts,
  assignments,
  assignFormAction,
  cancelShiftFormAction,
  shiftFormAction,
  assignState,
  cancelShiftState,
  shiftState,
  pending,
  weekdays,
  setWeekdays,
  onOpenMember
}: {
  members: StaffOpsMember[];
  selectedMember: StaffOpsMember;
  branches: StaffOperationsBundle["branches"];
  shifts: StaffOpsShiftTemplate[];
  assignments: StaffOpsShiftAssignment[];
  assignFormAction: (payload: FormData) => void;
  cancelShiftFormAction: (payload: FormData) => void;
  shiftFormAction: (payload: FormData) => void;
  assignState?: StaffActionState;
  cancelShiftState?: StaffActionState;
  shiftState?: StaffActionState;
  pending: { assigningShift: boolean; cancellingShift: boolean; creatingShift: boolean };
  weekdays: number[];
  setWeekdays: Dispatch<SetStateAction<number[]>>;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
}) {
  const week = buildWeekRange();
  const today = todayInputValue();
  const scheduleMembers = [...members].sort(
    (left, right) =>
      right.activeSessionCount - left.activeSessionCount ||
      right.suspiciousScore - left.suspiciousScore ||
      left.fullName.localeCompare(right.fullName, "vi")
  );
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "cancelled");
  const todayAssignments = activeAssignments.filter((assignment) => assignment.scheduledDate === today);
  const confirmedAssignments = activeAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
  const todayConfirmedAssignments = todayAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
  const unassignedTodayCount = Math.max(0, scheduleMembers.length - new Set(todayAssignments.map((assignment) => assignment.staffMemberId)).size);
  const coverageByDay = week.map((day) => {
    const dayAssignments = activeAssignments.filter((assignment) => assignment.scheduledDate === day.iso);
    const dayConfirmed = dayAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed");
    const coverage = scheduleMembers.length ? Math.round((dayAssignments.length / scheduleMembers.length) * 100) : 0;
    return {
      ...day,
      assigned: dayAssignments.length,
      confirmed: dayConfirmed.length,
      coverage
    };
  });
  const weakestDay = [...coverageByDay].sort((left, right) => left.coverage - right.coverage || left.assigned - right.assigned)[0];
  const [assignShiftId, setAssignShiftId] = useState("");
  const [assignScheduledDate, setAssignScheduledDate] = useState(today);
  const selectedShift = shifts.find((shift) => shift.id === assignShiftId) ?? null;
  const selectedDateAssignments = activeAssignments.filter((assignment) => assignment.scheduledDate === assignScheduledDate);
  const selectedMemberDateAssignments = selectedDateAssignments.filter((assignment) => assignment.staffMemberId === selectedMember.id);
  const selectedDayCoverage = coverageByDay.find((day) => day.iso === assignScheduledDate);
  const selectedDateAssignedStaff = new Set(selectedDateAssignments.map((assignment) => assignment.staffMemberId)).size;
  const selectedDateUnassignedCount = Math.max(0, scheduleMembers.length - selectedDateAssignedStaff);
  const selectedShiftBranchMismatch = Boolean(selectedShift?.branchId && selectedMember.primaryBranchId && selectedShift.branchId !== selectedMember.primaryBranchId);
  const hasAssignmentConflict = selectedMemberDateAssignments.length > 0;
  const canAssignShift = Boolean(assignShiftId) && Boolean(assignScheduledDate) && !hasAssignmentConflict && !pending.assigningShift;
  const lowCoverageDays = coverageByDay.filter((day) => day.coverage < 60);
  const unconfirmedAssignments = activeAssignments.filter((assignment) => assignment.status === "scheduled" || assignment.status === "swapped");
  const conflictRows = [...activeAssignments.reduce((map, assignment) => {
    const key = `${assignment.staffMemberId}-${assignment.scheduledDate}`;
    const current = map.get(key) ?? {
      key,
      staffMemberId: assignment.staffMemberId,
      staffName: assignment.staffName,
      scheduledDate: assignment.scheduledDate,
      branchNames: new Set<string>(),
      assignments: [] as StaffOpsShiftAssignment[]
    };
    current.assignments.push(assignment);
    current.branchNames.add(assignment.branchName ?? "Toàn quán");
    map.set(key, current);
    return map;
  }, new Map<string, { key: string; staffMemberId: string; staffName: string; scheduledDate: string; branchNames: Set<string>; assignments: StaffOpsShiftAssignment[] }>()).values()]
    .filter((row) => row.assignments.length > 1 || row.branchNames.size > 1)
    .sort((left, right) => right.assignments.length - left.assignments.length || left.scheduledDate.localeCompare(right.scheduledDate))
    .slice(0, 5);
  const branchCoverageRows = [...branches.map((branch) => {
    const branchMembers = scheduleMembers.filter((member) => member.primaryBranchId === branch.id);
    const branchAssignments = activeAssignments.filter((assignment) => assignment.branchId === branch.id);
    const todayBranchAssignments = branchAssignments.filter((assignment) => assignment.scheduledDate === today);
    const confirmed = branchAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed").length;
    const coverage = branchMembers.length ? Math.round((todayBranchAssignments.length / branchMembers.length) * 100) : 0;
    return {
      id: branch.id,
      name: branch.name,
      members: branchMembers.length,
      assigned: branchAssignments.length,
      todayAssigned: todayBranchAssignments.length,
      confirmed,
      coverage,
      pressure: Math.max(0, 70 - coverage) + branch.pendingApprovals * 5 + branch.lateCount * 4
    };
  }), {
    id: "unassigned",
    name: "Chưa gán chi nhánh",
    members: scheduleMembers.filter((member) => !member.primaryBranchId).length,
    assigned: activeAssignments.filter((assignment) => !assignment.branchId).length,
    todayAssigned: todayAssignments.filter((assignment) => !assignment.branchId).length,
    confirmed: activeAssignments.filter((assignment) => !assignment.branchId && (assignment.status === "confirmed" || assignment.status === "completed")).length,
    coverage: scheduleMembers.filter((member) => !member.primaryBranchId).length ? Math.round((todayAssignments.filter((assignment) => !assignment.branchId).length / scheduleMembers.filter((member) => !member.primaryBranchId).length) * 100) : 0,
    pressure: scheduleMembers.filter((member) => !member.primaryBranchId).length * 8
  }]
    .filter((branch) => branch.members > 0 || branch.assigned > 0)
    .sort((left, right) => right.pressure - left.pressure || right.todayAssigned - left.todayAssigned)
    .slice(0, 4);
  const openShiftRows = coverageByDay
    .map((day) => ({
      ...day,
      missing: Math.max(0, scheduleMembers.length - activeAssignments.filter((assignment) => assignment.scheduledDate === day.iso).length),
      unconfirmed: activeAssignments.filter((assignment) => assignment.scheduledDate === day.iso && (assignment.status === "scheduled" || assignment.status === "swapped")).length
    }))
    .filter((day) => day.missing > 0 || day.unconfirmed > 0 || day.coverage < 60)
    .sort((left, right) => right.missing - left.missing || right.unconfirmed - left.unconfirmed || left.coverage - right.coverage)
    .slice(0, 5);
  const scheduleReadinessScore = clampPercent(
    100 -
    unassignedTodayCount * 5 -
    lowCoverageDays.length * 8 -
    unconfirmedAssignments.length * 4 -
    conflictRows.length * 12 -
    selectedDateUnassignedCount * 2
  );
  const scheduleChecklist = [
    { id: "today", label: "Hôm nay không thiếu người", value: unassignedTodayCount, done: unassignedTodayCount === 0 },
    { id: "confirm", label: "Ca đã được xác nhận", value: unconfirmedAssignments.length, done: unconfirmedAssignments.length === 0 },
    { id: "conflict", label: "Không trùng/lệch ca", value: conflictRows.length, done: conflictRows.length === 0 },
    { id: "coverage", label: "Coverage tuần trên 60%", value: lowCoverageDays.length, done: lowCoverageDays.length === 0 }
  ];

  return (
    <StaffShellCard
      index="3"
      title="Ca làm việc"
      subtitle="Lịch theo tuần, mẫu ca và gán ca nhanh"
      action={<div className="flex items-center gap-1.5"><Pill>{scheduleMembers.length} nhân sự</Pill><Pill>{week[0]?.dateLabel} - {week[6]?.dateLabel}</Pill></div>}
    >
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Ca tuần này" value={activeAssignments.length} />
        <StatTile label="Đã xác nhận" value={`${confirmedAssignments.length}/${activeAssignments.length || 0}`} tone={confirmedAssignments.length === activeAssignments.length ? "green" : "orange"} />
        <StatTile label="Hôm nay" value={`${todayConfirmedAssignments.length}/${todayAssignments.length}`} tone={todayAssignments.length && todayConfirmedAssignments.length < todayAssignments.length ? "orange" : "green"} />
        <StatTile label="Chưa có ca hôm nay" value={unassignedTodayCount} tone={operationalTone(unassignedTodayCount, 2)} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Shift command center</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Sẵn sàng vận hành ca tuần này</h3>
            </div>
            <Pill tone={scheduleReadinessScore >= 90 ? "green" : scheduleReadinessScore >= 75 ? "orange" : "red"}>{scheduleReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={CalendarClock} label="Thiếu hôm nay" value={unassignedTodayCount} meta={`${todayAssignments.length} ca đã gán`} tone={unassignedTodayCount ? "orange" : "green"} />
            <StaffOpsMetric icon={ShieldCheck} label="Chưa xác nhận" value={unconfirmedAssignments.length} meta="Scheduled/swapped cần nhận" tone={unconfirmedAssignments.length ? "orange" : "green"} />
            <StaffOpsMetric icon={AlertTriangle} label="Xung đột" value={conflictRows.length} meta="Trùng ngày hoặc lệch chi nhánh" tone={conflictRows.length ? "red" : "green"} />
            <StaffOpsMetric icon={BarChart3} label="Ngày yếu" value={lowCoverageDays.length} meta={weakestDay ? `${weakestDay.dayLabel} ${weakestDay.coverage}%` : "Không có dữ liệu"} tone={lowCoverageDays.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist xếp ca</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước giờ cao điểm</h3>
            </div>
            <Pill tone={scheduleChecklist.every((item) => item.done) ? "green" : "orange"}>{scheduleChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {scheduleChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Coverage theo chi nhánh</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Cụm nào đang thiếu người hôm nay</h3>
            </div>
            <Pill tone={branchCoverageRows.some((branch) => branch.pressure >= 20) ? "orange" : "green"}>{branchCoverageRows.length || "Trống"}</Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {branchCoverageRows.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setAssignScheduledDate(today)}
                className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-2.5 text-left transition hover:border-[#0F4D3A]/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{branch.name}</p>
                  <Pill tone={branch.coverage >= 80 ? "green" : branch.coverage >= 50 ? "orange" : "red"}>{branch.coverage}%</Pill>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EFE5D9]">
                  <div className={`h-full rounded-full ${branch.coverage >= 80 ? "bg-[#0F7A4F]" : branch.coverage >= 50 ? "bg-[#E08A2E]" : "bg-[#C2410C]"}`} style={{ width: `${Math.max(6, Math.min(100, branch.coverage))}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <MiniMetric label="NV" value={branch.members} />
                  <MiniMetric label="Hôm nay" value={branch.todayAssigned} tone={branch.todayAssigned ? "green" : "orange"} />
                  <MiniMetric label="Nhận" value={branch.confirmed} tone={branch.confirmed ? "green" : "neutral"} />
                </div>
              </button>
            ))}
            {!branchCoverageRows.length ? (
              <div className="rounded-xl border border-dashed border-[#E8DED0] bg-[#FFF9F0] p-4 text-center md:col-span-2 xl:col-span-4">
                <CalendarClock className="mx-auto text-[#0F4D3A]" size={22} />
                <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có dữ liệu chi nhánh</p>
                <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Gán nhân sự vào chi nhánh để xem coverage theo cụm.</p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Hàng đợi điều phối</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ngày cần xử lý</h3>
            </div>
            <Pill tone={openShiftRows.length ? "orange" : "green"}>{openShiftRows.length || "Ổn"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {openShiftRows.map((day) => (
              <button
                key={day.iso}
                type="button"
                onClick={() => setAssignScheduledDate(day.iso)}
                className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] font-black text-[#2D2924]">{day.dayLabel} · {day.dateLabel}</span>
                  <Pill tone={day.coverage >= 60 ? "orange" : "red"}>{day.coverage}%</Pill>
                </div>
                <p className="mt-0.5 text-[10px] font-bold text-[#756E64]">{day.missing} thiếu · {day.unconfirmed} chưa nhận · {day.assigned} ca</p>
              </button>
            ))}
            {!openShiftRows.length ? (
              <div className="grid min-h-[116px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-[#FFF9F0] px-3 text-center">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Lịch tuần đang ổn</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Không có ngày thiếu người hoặc chưa nhận ca nổi bật.</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Coverage tuần</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Độ phủ nhân sự theo ngày</h3>
            </div>
            <Pill tone={weakestDay && weakestDay.coverage < 60 ? "orange" : "green"}>{weakestDay ? `${weakestDay.dayLabel} thấp nhất` : "Chưa có dữ liệu"}</Pill>
          </div>
          <div className="grid gap-2 md:grid-cols-7">
            {coverageByDay.map((day) => (
              <button key={day.iso} type="button" onClick={() => setAssignScheduledDate(day.iso)} className={`rounded-xl border p-2 text-left transition hover:border-[#0F4D3A]/30 ${day.iso === assignScheduledDate ? "border-[#0F4D3A]/35 bg-[#E8F5EC]" : "border-[#E8DED0] bg-white"}`}>
                <span className="block text-[10px] font-black text-[#0B3F31]">{day.dayLabel}</span>
                <span className="block text-[10px] font-bold text-[#756E64]">{day.dateLabel}</span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#EFE5D9]">
                  <span className={`block h-full rounded-full ${day.coverage >= 80 ? "bg-[#0F7A4F]" : day.coverage >= 50 ? "bg-[#E08A2E]" : "bg-[#C2410C]"}`} style={{ width: `${Math.max(6, Math.min(100, day.coverage))}%` }} />
                </span>
                <span className="mt-1.5 block text-[10px] font-black text-[#2D2924]">{day.assigned} ca · {day.confirmed} nhận</span>
              </button>
            ))}
          </div>
        </section>
        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Mẫu ca</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ca thường dùng</h3>
            </div>
            <Pill>{shifts.length} mẫu</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {shifts.slice(0, 4).map((shift) => (
              <div key={shift.id} className="rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <p className="truncate text-[11px] font-black text-[#2D2924]">{shift.name}</p>
                <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">{shift.startTime}-{shift.endTime} · {shift.branchName ?? "Toàn quán"} · {shift.attendanceRadiusMeters}m</p>
              </div>
            ))}
            {!shifts.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có mẫu ca.</p> : null}
          </div>
        </aside>
      </div>
      <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_306px]">
        <div className="min-w-0 max-h-[680px] overflow-auto border-r border-[#EFE5D9]">
          <div className="grid min-w-[920px] grid-cols-[174px_repeat(7,minmax(100px,1fr))] border-b border-[#EFE5D9] bg-[#FFF9F0] text-center text-[10px] font-black text-[#0B3F31]">
            <div className="border-r border-[#EFE5D9] px-2.5 py-2 text-left">Nhân viên</div>
            {week.map((day) => <div key={day.iso} className="border-r border-[#EFE5D9] px-2 py-2 last:border-r-0">{day.dayLabel}<br /><span className="text-[#756E64]">{day.dateLabel}</span></div>)}
          </div>
          {scheduleMembers.map((member) => (
            <div key={member.id} className="grid min-w-[920px] grid-cols-[174px_repeat(7,minmax(100px,1fr))] border-b border-[#EFE5D9] last:border-b-0">
              <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="flex items-center gap-2 border-r border-[#EFE5D9] px-2.5 py-1.5 text-left">
                <StaffAvatar member={member} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black">{member.fullName}</span>
                  <span className="block truncate text-[10px] font-bold text-[#756E64]">{member.roleTitle}</span>
                </span>
              </button>
              {week.map((day) => {
                const assignment = assignments.find((item) => item.staffMemberId === member.id && item.scheduledDate === day.iso && item.status !== "cancelled");
                const canCancelAssignment = assignment ? assignment.status !== "cancelled" && assignment.status !== "completed" : false;
                return (
                  <div key={day.iso} className="min-h-[42px] border-r border-[#EFE5D9] p-1 last:border-r-0">
                    {assignment ? (
                      <form action={cancelShiftFormAction} className={`group rounded-md border px-1.5 py-1 text-center text-[9.5px] font-black leading-tight transition ${assignment.status === "cancelled" ? "border-[#E5DBD0] bg-[#F5EFE8] text-[#756E64]" : "border-[#CBE5D2] bg-[#E8F5EC] text-[#0F6A45]"}`}>
                        <input type="hidden" name="shiftAssignmentId" value={assignment.id} />
                        <input type="hidden" name="note" value="Huỷ từ lịch tuần Staff Operations" />
                        <span className="block truncate">{assignment.shiftName}</span>
                        <span className="font-bold opacity-75">{shiftAssignmentStatusLabel(assignment.status)}</span>
                        {canCancelAssignment ? (
                          <button type="submit" disabled={pending.cancellingShift} className="mt-1 h-5 w-full rounded bg-white/80 text-[9px] font-black text-[#9A3412] shadow-sm transition hover:bg-[#FFF1DF] disabled:opacity-50">
                            Huỷ
                          </button>
                        ) : null}
                      </form>
                    ) : (
                      <span className="grid h-full place-items-center rounded-md bg-[#FFF9F0] text-[10px] font-bold text-[#B4A99B]">+</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {!scheduleMembers.length ? <div className="p-6 text-sm font-bold text-[#756E64]">Chưa có nhân sự để xếp ca.</div> : null}
        </div>
        <aside className="grid content-start gap-2 bg-[#FFF9F0] p-3">
          <form action={assignFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <input type="hidden" name="staffMemberId" value={selectedMember.id} />
            <h3 className="text-xs font-black text-[#0B3F31]">Gán ca cho {selectedMember.fullName}</h3>
            <select name="shiftId" required value={assignShiftId} onChange={(event) => setAssignShiftId(event.target.value)} className="staff-field-input mt-1.5">
              <option value="">Chọn mẫu ca</option>
              {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>)}
            </select>
            <input name="scheduledDate" type="date" value={assignScheduledDate} onChange={(event) => setAssignScheduledDate(event.target.value)} className="staff-field-input mt-1.5" />
            <input name="note" placeholder="Ghi chú" className="staff-field-input mt-1.5" />
            <div className="mt-1.5 grid gap-1.5">
              <div className="rounded-lg border border-[#E8DED0] bg-[#FFFCF6] px-2 py-1.5">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">Preview</p>
                <p className="mt-0.5 text-[11px] font-black text-[#0B3F31]">{shiftDurationLabel(selectedShift)}</p>
                <p className="mt-0.5 text-[10.5px] font-bold text-[#756E64]">{selectedShift?.branchName ?? selectedMember.primaryBranchName ?? "Toàn quán"} · {selectedDayCoverage ? `${selectedDayCoverage.assigned} ca trong lịch tuần` : `${selectedDateAssignments.length} ca ngày này`}</p>
              </div>
              {hasAssignmentConflict ? (
                <div className="flex items-start gap-2 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#A85B14]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{selectedMember.fullName} đã có {selectedMemberDateAssignments.map((assignment) => assignment.shiftName).join(", ")} trong ngày này.</span>
                </div>
              ) : null}
              {selectedShiftBranchMismatch ? (
                <div className="flex items-start gap-2 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] px-2 py-1.5 text-[10.5px] font-bold leading-snug text-[#A85B14]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Mẫu ca khác chi nhánh chính của nhân viên. Nên kiểm tra quyền chi nhánh trước khi gán.</span>
                </div>
              ) : null}
            </div>
            <button disabled={shifts.length === 0 || !canAssignShift} className="mt-1.5 h-8 w-full rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">{pending.assigningShift ? "Đang gán..." : "Gán ca"}</button>
            <div className="mt-1.5"><ActionNotice state={assignState} /></div>
            <div className="mt-1.5"><ActionNotice state={cancelShiftState} /></div>
          </form>
          <div className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Độ phủ ngày đang chọn</h3>
              <Pill tone={selectedDateUnassignedCount > 2 ? "orange" : "green"}>{selectedDateUnassignedCount} chưa có ca</Pill>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <MiniMetric label="Đã gán" value={selectedDateAssignments.length} />
              <MiniMetric label="Nhân sự" value={selectedDateAssignedStaff} />
              <MiniMetric label="Xung đột" value={hasAssignmentConflict ? selectedMemberDateAssignments.length : 0} tone={hasAssignmentConflict ? "orange" : "green"} />
            </div>
            <p className="mt-2 text-[10.5px] font-bold leading-snug text-[#756E64]">
              Dùng để rà nhanh trước khi bấm gán, tránh trùng ca và thiếu người vào giờ cao điểm.
            </p>
          </div>
          <form action={shiftFormAction} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <input type="hidden" name="recurringWeekdays" value={JSON.stringify(weekdays)} />
            <h3 className="text-xs font-black text-[#0B3F31]">Tạo mẫu ca</h3>
            <input name="name" required placeholder="Ca sáng / Ca chiều" className="staff-field-input mt-1.5" />
            <select name="branchId" defaultValue={selectedMember.primaryBranchId ?? ""} className="staff-field-input mt-1.5">
              <option value="">Toàn quán</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <input name="startTime" type="time" defaultValue="07:00" className="staff-field-input" />
              <input name="endTime" type="time" defaultValue="12:00" className="staff-field-input" />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <input name="allowedLateMinutes" type="number" min="0" max="180" defaultValue="10" className="staff-field-input" />
              <input name="attendanceRadiusMeters" type="number" min="50" max="150" defaultValue="80" className="staff-field-input" />
              <input name="overtimeThresholdMinutes" type="hidden" value="30" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {weekdayOptions.map((day) => {
                const active = weekdays.includes(day.value);
                return (
                  <button key={day.value} type="button" onClick={() => setWeekdays((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])} className={`h-6 rounded-full border px-2 text-[9.5px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-[#FFFCF6] text-[#756E64]"}`}>
                    {day.label}
                  </button>
                );
              })}
            </div>
            <button disabled={pending.creatingShift} className="mt-1.5 h-8 w-full rounded-lg border border-[#0F4D3A] text-[11px] font-black text-[#0F4D3A] disabled:opacity-50">{pending.creatingShift ? "Đang tạo..." : "Tạo mẫu ca"}</button>
            <div className="mt-1.5"><ActionNotice state={shiftState} /></div>
          </form>
        </aside>
      </div>
    </StaffShellCard>
  );
}

function AttendanceScreen({
  members,
  attendanceFeed,
  approvals,
  approvalFormAction,
  manualClockInFormAction,
  manualClockOutFormAction,
  approvalState,
  manualClockInState,
  manualClockOutState,
  reviewingApproval,
  manualClockingIn,
  manualClockingOut,
  onOpenMember
}: {
  members: StaffOpsMember[];
  attendanceFeed: StaffOpsAttendanceFeedItem[];
  approvals: StaffOpsApprovalItem[];
  approvalFormAction: (payload: FormData) => void;
  manualClockInFormAction: (payload: FormData) => void;
  manualClockOutFormAction: (payload: FormData) => void;
  approvalState?: StaffActionState;
  manualClockInState?: StaffActionState;
  manualClockOutState?: StaffActionState;
  reviewingApproval: boolean;
  manualClockingIn: boolean;
  manualClockingOut: boolean;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [attendanceQuery, setAttendanceQuery] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilterKey>("all");
  const deferredAttendanceQuery = useDeferredValue(attendanceQuery);
  const today = todayInputValue();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayFeed = attendanceFeed.filter((item) => item.clockInAt.slice(0, 10) === today);
  const feedByMember = new Map<string, StaffOpsAttendanceFeedItem>();
  todayFeed.forEach((item) => {
    const current = feedByMember.get(item.staffMemberId);
    if (!current || (!item.clockOutAt && current.clockOutAt)) feedByMember.set(item.staffMemberId, item);
  });
  const attendanceRows = members.map((member) => {
    const row = feedByMember.get(member.id);
    const state = row?.state ?? member.todayAttendanceState;
    const lateMinutes = row?.lateMinutes ?? member.lateMinutesToday;
    return {
      member,
      row,
      state,
      lateMinutes,
      isClockOpen: Boolean(row && !row.clockOutAt),
      duration: formatLiveDuration(row?.clockInAt, row?.clockOutAt, nowMs)
    };
  });
  const checkedInCount = attendanceRows.filter((item) => item.row).length;
  const activeRows = attendanceRows.filter((item) => item.isClockOpen);
  const lateRows = attendanceRows.filter((item) => item.lateMinutes > 0 || item.state === "late");
  const overtimeRows = attendanceRows.filter((item) => item.state === "overtime" || (item.row?.overtimeMinutes ?? item.member.overtimeMinutesToday) > 0);
  const waitingRows = attendanceRows.filter((item) => !item.row && item.member.employmentStatus === "active" && !item.member.isArchived);
  const manualRows = attendanceRows.filter((item) => item.row?.source === "manual");
  const pendingApprovalRows = attendanceRows.filter((item) => item.row?.approvalState === "pending");
  const outsideLocationRows = attendanceRows.filter((item) => (item.row?.distanceMeters ?? 0) > 120);
  const activeWorkMinutes = activeRows.reduce((sum, item) => {
    if (!item.row?.clockInAt) return sum;
    return sum + Math.max(0, Math.round((nowMs - new Date(item.row.clockInAt).getTime()) / 60_000));
  }, 0);
  const activeBranchRows = [...attendanceRows.reduce((map, item) => {
    const key = item.member.primaryBranchId ?? "unassigned";
    const current = map.get(key) ?? {
      id: key,
      name: item.member.primaryBranchName ?? "Chưa gán chi nhánh",
      total: 0,
      active: 0,
      waiting: 0,
      late: 0
    };
    if (item.member.employmentStatus === "active" && !item.member.isArchived) current.total += 1;
    if (item.isClockOpen) current.active += 1;
    if (!item.row && item.member.employmentStatus === "active" && !item.member.isArchived) current.waiting += 1;
    if (item.lateMinutes > 0 || item.state === "late") current.late += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { id: string; name: string; total: number; active: number; waiting: number; late: number }>()).values()]
    .filter((branch) => branch.total > 0 || branch.active > 0)
    .sort((left, right) => right.waiting - left.waiting || right.late - left.late || right.active - left.active)
    .slice(0, 4);
  const payrollRiskItems = [
    {
      id: "pending-approval",
      label: "Cần duyệt",
      value: approvals.length + pendingApprovalRows.length,
      detail: `${approvals.length} yêu cầu · ${pendingApprovalRows.length} log chờ`,
      tone: operationalTone(approvals.length + pendingApprovalRows.length, 2),
      icon: ShieldCheck
    },
    {
      id: "manual-clock",
      label: "Chấm tay",
      value: manualRows.length,
      detail: manualRows.length ? "Cần ghi chú rõ trước khi xuất công" : "Không có log thủ công",
      tone: operationalTone(manualRows.length, 2),
      icon: Fingerprint
    },
    {
      id: "outside-location",
      label: "Lệch vị trí",
      value: outsideLocationRows.length,
      detail: outsideLocationRows.length ? "Khoảng cách GPS vượt 120m" : "GPS/QR trong vùng an toàn",
      tone: operationalTone(outsideLocationRows.length, 1),
      icon: RadioTower
    },
    {
      id: "open-shift",
      label: "Ca đang mở",
      value: activeRows.length,
      detail: `${formatHours(activeWorkMinutes)} tổng thời lượng live`,
      tone: activeRows.length ? "green" : "neutral",
      icon: Activity
    }
  ] satisfies Array<{
    id: string;
    label: string;
    value: number;
    detail: string;
    tone: "green" | "orange" | "red" | "neutral";
    icon: LucideIcon;
  }>;
  const shiftCloseChecks = [
    {
      id: "missing-check-in",
      label: "Nhân viên chưa check-in",
      value: waitingRows.length,
      done: waitingRows.length === 0
    },
    {
      id: "late-review",
      label: "Đi muộn cần xác nhận",
      value: lateRows.length,
      done: lateRows.length === 0
    },
    {
      id: "manual-review",
      label: "Log chấm tay cần đối soát",
      value: manualRows.length,
      done: manualRows.length === 0
    },
    {
      id: "approval-review",
      label: "Yêu cầu ảnh hưởng công/lương",
      value: approvals.length + pendingApprovalRows.length,
      done: approvals.length + pendingApprovalRows.length === 0
    }
  ];
  const attendanceFilterCounts = {
    all: attendanceRows.length,
    active: activeRows.length,
    late: lateRows.length,
    waiting: waitingRows.length,
    overtime: overtimeRows.length,
    manual: manualRows.length
  } satisfies Record<AttendanceFilterKey, number>;
  const normalizedAttendanceQuery = normalizeText(deferredAttendanceQuery.trim());
  const filteredAttendanceRows = attendanceRows.filter((item) => {
    const matchesFilter =
      attendanceFilter === "all" ||
      (attendanceFilter === "active" && item.isClockOpen) ||
      (attendanceFilter === "late" && (item.lateMinutes > 0 || item.state === "late")) ||
      (attendanceFilter === "waiting" && !item.row && item.member.employmentStatus === "active" && !item.member.isArchived) ||
      (attendanceFilter === "overtime" && (item.state === "overtime" || (item.row?.overtimeMinutes ?? item.member.overtimeMinutesToday) > 0)) ||
      (attendanceFilter === "manual" && item.row?.source === "manual");
    if (!matchesFilter) return false;
    if (!normalizedAttendanceQuery) return true;

    const haystack = normalizeText([
      item.member.fullName,
      item.member.roleTitle,
      item.member.primaryBranchName ?? "",
      item.member.branchNames.join(" "),
      attendanceLabel(item.state),
      attendanceSourceLabel(item.row?.source),
      item.row?.approvalState ?? ""
    ].join(" "));
    return haystack.includes(normalizedAttendanceQuery);
  });
  const queueItems = [
    ...approvals.slice(0, 3).map((approval) => ({
      id: `approval-${approval.id}`,
      title: approval.fullName,
      detail: `${requestTypeLabel(approval.requestType)} · ${requestDetail(approval)}`,
      tone: "orange" as const,
      icon: ShieldCheck,
      onClick: () => onOpenMember(approval.staffMemberId, "requests")
    })),
    ...lateRows.slice(0, 3).map((item) => ({
      id: `late-${item.member.id}`,
      title: item.member.fullName,
      detail: `${item.lateMinutes}p đi muộn · ${item.member.primaryBranchName ?? "Chi nhánh chính"}`,
      tone: "orange" as const,
      icon: Clock3,
      onClick: () => onOpenMember(item.member.id, "profile")
    })),
    ...waitingRows.slice(0, 3).map((item) => ({
      id: `waiting-${item.member.id}`,
      title: item.member.fullName,
      detail: `${item.member.roleTitle} · chưa check-in hôm nay`,
      tone: "neutral" as const,
      icon: AlertTriangle,
      onClick: () => onOpenMember(item.member.id, "profile")
    }))
  ].slice(0, 5);

  return (
    <StaffShellCard index="4" title="Chấm công" subtitle="Quản lý chấm công nhân viên" action={<a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white"><FileDown size={12} />Xuất báo cáo</a>}>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-5">
        <StatTile label="Tổng nhân viên" value={members.length} />
        <StatTile label="Đã check-in" value={checkedInCount} />
        <StatTile label="Đang trong ca" value={activeRows.length} tone={activeRows.length ? "green" : "neutral"} />
        <StatTile label="Đi muộn" value={lateRows.length} tone={lateRows.length ? "orange" : "neutral"} />
        <StatTile label="Chờ check-in" value={waitingRows.length} tone={operationalTone(waitingRows.length, 2)} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Sàn vận hành</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Nhân sự đang trong ca</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={overtimeRows.length ? "orange" : "green"}>{overtimeRows.length} tăng ca</Pill>
              <Pill tone={activeRows.length ? "green" : "neutral"}>{activeRows.length} online</Pill>
            </div>
          </div>
          <div className="mt-3 grid max-h-[244px] gap-2 overflow-auto pr-1 lg:grid-cols-2">
            {activeRows.map((item) => (
              <button key={item.member.id} type="button" onClick={() => onOpenMember(item.member.id, "profile")} className="flex min-h-[62px] items-center gap-2 rounded-xl border border-[#E8DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
                <StaffAvatar member={item.member} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-black text-[#2D2924]">{item.member.fullName}</span>
                    <Pill tone={attendanceTone(item.state)}>{attendanceLabel(item.state)}</Pill>
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#756E64]">
                    {shortTime(item.row?.clockInAt)} · {item.duration} · {attendanceSourceLabel(item.row?.source)}
                  </span>
                </span>
              </button>
            ))}
            {!activeRows.length ? (
              <div className="grid min-h-[118px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-white px-3 text-center lg:col-span-2">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={24} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có ca mở</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Ca mới sẽ hiện tại đây khi nhân viên check-in.</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-2 rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#0B3F31]"><Activity size={14} />Feed hôm nay</span>
              <Pill>{todayFeed.length} lượt</Pill>
            </div>
            <div className="mt-2 grid max-h-[172px] gap-1.5 overflow-auto pr-1">
              {todayFeed.map((item) => (
                <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-[#FFF9F0] px-2 py-1.5 text-[10.5px] font-bold">
                  <span className="text-[#756E64]">{shortTime(item.clockInAt)}</span>
                  <span className="min-w-0 truncate text-[#2D2924]">{item.fullName} · {item.branchName ?? "Toàn quán"}</span>
                  <Pill tone={attendanceTone(item.state)}>{attendanceSourceLabel(item.source)}</Pill>
                </div>
              ))}
              {!todayFeed.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có lượt chấm công hôm nay.</p> : null}
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Hàng chờ</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Cần xử lý</h3>
            </div>
            <Pill tone={queueItems.length ? "orange" : "green"}>{queueItems.length || "Ổn"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {queueItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" onClick={item.onClick} className="flex min-h-[54px] items-center gap-2 rounded-xl border border-[#E8DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone === "orange" ? "bg-[#FFF1DF] text-[#A85B14]" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#2D2924]">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#756E64]">{item.detail}</span>
                  </span>
                </button>
              );
            })}
            {!queueItems.length ? (
              <div className="grid min-h-[132px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-white px-3 text-center">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={24} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có việc gấp</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Duyệt ca và cảnh báo sẽ gom tại đây.</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Payroll readiness</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Điểm cần chốt trước khi xuất công</h3>
            </div>
            <Pill tone={approvals.length + manualRows.length + outsideLocationRows.length ? "orange" : "green"}>
              {approvals.length + manualRows.length + outsideLocationRows.length ? "Cần đối soát" : "Sẵn sàng"}
            </Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {payrollRiskItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="min-h-[104px] rounded-xl border border-[#E8DED0] bg-white p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone === "red" ? "bg-[#FFF0E7] text-[#9A3412]" : item.tone === "orange" ? "bg-[#FFF1DF] text-[#A85B14]" : item.tone === "green" ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                      <Icon size={15} />
                    </span>
                    <Pill tone={item.tone}>{item.value}</Pill>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-snug text-[#2D2924]">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Chốt ca</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Checklist quản lý</h3>
            </div>
            <Pill tone={shiftCloseChecks.every((item) => item.done) ? "green" : "orange"}>
              {shiftCloseChecks.filter((item) => !item.done).length || "Xong"}
            </Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {shiftCloseChecks.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFF9F0] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Coverage theo chi nhánh</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ai đang online, ai còn thiếu</h3>
          </div>
          <Pill tone={waitingRows.length || lateRows.length ? "orange" : "green"}>{activeBranchRows.length} cụm</Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {activeBranchRows.map((branch) => {
            const activePercent = branch.total ? Math.round((branch.active / branch.total) * 100) : 0;
            return (
              <div key={branch.id} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{branch.name}</p>
                  <Pill tone={branch.waiting || branch.late ? "orange" : "green"}>{activePercent}%</Pill>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EFE5D9]">
                  <div className={`h-full rounded-full ${activePercent >= 75 ? "bg-[#0F7A4F]" : activePercent >= 45 ? "bg-[#E08A2E]" : "bg-[#C2410C]"}`} style={{ width: `${Math.max(6, Math.min(100, activePercent))}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <MiniMetric label="Online" value={branch.active} tone={branch.active ? "green" : "neutral"} />
                  <MiniMetric label="Thiếu" value={branch.waiting} tone={branch.waiting ? "orange" : "green"} />
                  <MiniMetric label="Muộn" value={branch.late} tone={branch.late ? "orange" : "green"} />
                </div>
              </div>
            );
          })}
          {!activeBranchRows.length ? (
            <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center md:col-span-2 xl:col-span-4">
              <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
              <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có dữ liệu coverage</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Khi có nhân sự theo chi nhánh, trạng thái ca sẽ hiện tại đây.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input
              value={attendanceQuery}
              onChange={(event) => setAttendanceQuery(event.target.value)}
              placeholder="Tìm nhân viên, chi nhánh, trạng thái..."
              className="staff-field-input h-9 pl-8"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {attendanceFilterOptions.map((item) => {
              const active = attendanceFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setAttendanceFilter(item.key)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black transition ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64] hover:border-[#0F4D3A]/30"}`}
                >
                  {item.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                    {attendanceFilterCounts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.5fr)_140px_100px_100px_90px_110px_130px]">
          <span>Nhân viên</span><span>Vai trò/nguồn</span><span>Check-in</span><span>Check-out</span><span>Đi muộn</span><span>Trạng thái</span><span>Thao tác</span>
        </TableHead>
        {filteredAttendanceRows.map(({ member, row, state, lateMinutes, isClockOpen, duration }) => {
          return (
            <TableRow key={member.id} className="grid-cols-[minmax(220px,1.5fr)_140px_100px_100px_90px_110px_130px] hover:bg-[#FFF8EF]">
              <span className="min-w-0">
                <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="flex min-w-0 items-center gap-2 text-left">
                  <StaffAvatar member={member} />
                  <span className="min-w-0">
                    <span className="block truncate font-black">{member.fullName}</span>
                    <span className="block truncate text-[10px] font-bold text-[#756E64]">{member.primaryBranchName ?? "Chưa gán chi nhánh"}</span>
                  </span>
                </button>
              </span>
              <span>
                <span className="block truncate font-bold">{member.roleTitle}</span>
                <span className="block truncate text-[10px] font-bold text-[#756E64]">{attendanceSourceLabel(row?.source)}</span>
              </span>
              <span>
                <span className="block">{shortTime(row?.clockInAt)}</span>
                {row ? <span className="block text-[10px] font-bold text-[#756E64]">{duration}</span> : null}
              </span>
              <span>{shortTime(row?.clockOutAt)}</span>
              <span>{lateMinutes} phút</span>
              <span><Pill tone={attendanceTone(state)}>{attendanceLabel(state)}</Pill></span>
              <span>
                {isClockOpen ? (
                  <form action={manualClockOutFormAction}>
                    <input type="hidden" name="attendanceLogId" value={row?.id ?? ""} />
                    <input type="hidden" name="staffMemberId" value={member.id} />
                    <input type="hidden" name="branchId" value={member.primaryBranchId ?? ""} />
                    <input type="hidden" name="note" value="Quản lý kết ca thủ công từ bảng chấm công" />
                    <button disabled={manualClockingOut} className="h-7 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] px-2 text-[10px] font-black text-[#A85B14] disabled:opacity-50">
                      Kết ca hộ
                    </button>
                  </form>
                ) : (
                  <form action={manualClockInFormAction}>
                    <input type="hidden" name="staffMemberId" value={member.id} />
                    <input type="hidden" name="branchId" value={member.primaryBranchId ?? ""} />
                    <input type="hidden" name="note" value="Quản lý chấm công thủ công từ bảng chấm công" />
                    <button disabled={manualClockingIn} className="h-7 rounded-lg border border-[#CBE5D2] bg-[#E8F5EC] px-2 text-[10px] font-black text-[#0F6A45] disabled:opacity-50">
                      Chấm tay
                    </button>
                  </form>
                )}
              </span>
            </TableRow>
          );
        })}
        {!filteredAttendanceRows.length ? (
          <div className="min-w-[840px] p-6 text-center">
            <p className="text-sm font-black text-[#0B3F31]">Không có nhân sự khớp bộ lọc</p>
            <p className="mt-1 text-[11px] font-bold text-[#756E64]">Thử đổi trạng thái hoặc tìm theo tên/chi nhánh khác.</p>
          </div>
        ) : null}
      </div>
      <div className="grid gap-1.5 border-t border-[#EFE5D9] bg-[#FFF9F0] px-3 py-2 md:grid-cols-2">
        <ActionNotice state={manualClockInState} />
        <ActionNotice state={manualClockOutState} />
      </div>
      {approvals.length ? (
        <div className="border-t border-[#EFE5D9] bg-[#FFF9F0] p-3">
          <h3 className="text-xs font-black text-[#0B3F31]">Yêu cầu cần duyệt</h3>
          <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
            {approvals.slice(0, 4).map((approval) => (
              <form key={approval.id} action={approvalFormAction} className="rounded-lg border border-[#F2D2B2] bg-white px-2.5 py-2 text-[11px] font-bold text-[#A85B14]">
                <input type="hidden" name="approvalId" value={approval.id} />
                <p className="font-black text-[#2D2924]">{approval.fullName}</p>
                <p className="mt-0.5 text-[10px] font-bold text-[#A85B14]">
                  {requestTypeLabel(approval.requestType)} · {approval.branchName ?? "Toàn quán"}
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-[#756E64]">{requestDetail(approval)}</p>
                {approval.reason ? <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold text-[#756E64]">{approval.reason}</p> : null}
                <input name="note" placeholder="Ghi chú duyệt nếu cần" className="staff-field-input mt-1.5" />
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button name="decision" value="rejected" disabled={reviewingApproval} className="h-8 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] text-[11px] font-black text-[#A85B14] disabled:opacity-50">
                    Từ chối
                  </button>
                  <button name="decision" value="approved" disabled={reviewingApproval} className="h-8 rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">
                    Duyệt
                  </button>
                </div>
              </form>
            ))}
          </div>
          <div className="mt-2"><ActionNotice state={approvalState} /></div>
        </div>
      ) : null}
    </StaffShellCard>
  );
}

function RequestsScreen({
  approvals,
  members,
  branches,
  assignments,
  approvalFormAction,
  approvalState,
  reviewingApproval,
  onOpenMember
}: {
  approvals: StaffOpsApprovalItem[];
  members: StaffOpsMember[];
  branches: StaffOperationsBundle["branches"];
  assignments: StaffOpsShiftAssignment[];
  approvalFormAction: (payload: FormData) => void;
  approvalState?: StaffActionState;
  reviewingApproval: boolean;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
}) {
  const router = useRouter();
  const [requestQuery, setRequestQuery] = useState("");
  const [requestFilter, setRequestFilter] = useState<"all" | "pending" | "leave" | "swap" | "overtime" | "reviewed">("pending");
  const [adminRequestType, setAdminRequestType] = useState<StaffRequestCreatePayload["requestType"]>("leave_request");
  const [adminStaffMemberId, setAdminStaffMemberId] = useState(members[0]?.id ?? "");
  const [adminBranchId, setAdminBranchId] = useState(members[0]?.primaryBranchId ?? branches[0]?.id ?? "");
  const [adminFromDate, setAdminFromDate] = useState(() => todayInputValue());
  const [adminToDate, setAdminToDate] = useState(() => todayInputValue());
  const [adminLeaveType, setAdminLeaveType] = useState<NonNullable<StaffRequestCreatePayload["leaveType"]>>("unpaid");
  const [adminOvertimeMinutes, setAdminOvertimeMinutes] = useState(60);
  const [adminShiftAssignmentId, setAdminShiftAssignmentId] = useState("");
  const [adminTargetStaffMemberId, setAdminTargetStaffMemberId] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const [creatingAdminRequest, setCreatingAdminRequest] = useState(false);
  const [adminRequestMessage, setAdminRequestMessage] = useState<{ tone: "success" | "warning" | "neutral"; text: string } | null>(null);
  const [requestNowMs] = useState(() => Date.now());
  const deferredRequestQuery = useDeferredValue(requestQuery);
  const today = todayInputValue();
  const selectedRequestMember = members.find((member) => member.id === adminStaffMemberId) ?? members[0] ?? null;
  const selectedMemberAssignments = assignments
    .filter((assignment) => assignment.staffMemberId === selectedRequestMember?.id && assignment.status !== "cancelled" && assignment.status !== "completed" && assignment.scheduledDate >= today)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate))
    .slice(0, 12);
  const targetStaffOptions = members.filter((member) => member.id !== selectedRequestMember?.id && !member.isArchived && member.employmentStatus === "active");
  const pendingRequests = approvals.filter((approval) => approval.status === "pending");
  const leaveRequests = approvals.filter((approval) => approval.requestType === "leave_request");
  const swapRequests = approvals.filter((approval) => approval.requestType === "shift_swap");
  const overtimeRequests = approvals.filter((approval) => approval.requestType === "overtime");
  const reviewedRequests = approvals.filter((approval) => approval.status !== "pending");
  const requestFilterCounts = {
    all: approvals.length,
    pending: pendingRequests.length,
    leave: leaveRequests.length,
    swap: swapRequests.length,
    overtime: overtimeRequests.length,
    reviewed: reviewedRequests.length
  };
  const normalizedRequestQuery = normalizeText(deferredRequestQuery.trim());
  const filteredRequests = approvals.filter((approval) => {
    const matchesFilter =
      requestFilter === "all" ||
      (requestFilter === "pending" && approval.status === "pending") ||
      (requestFilter === "leave" && approval.requestType === "leave_request") ||
      (requestFilter === "swap" && approval.requestType === "shift_swap") ||
      (requestFilter === "overtime" && approval.requestType === "overtime") ||
      (requestFilter === "reviewed" && approval.status !== "pending");
    if (!matchesFilter) return false;
    if (!normalizedRequestQuery) return true;

    return normalizeText([
      approval.fullName,
      approval.branchName ?? "Toàn quán",
      requestTypeLabel(approval.requestType),
      requestStatusLabel(approval.status),
      requestDetail(approval),
      approval.reason ?? "",
      approval.reviewNote ?? ""
    ].join(" ")).includes(normalizedRequestQuery);
  });
  const requestAgeHours = (approval: StaffOpsApprovalItem) => Math.max(0, Math.floor((requestNowMs - new Date(approval.createdAt).getTime()) / 3_600_000));
  const requestPriorityScore = (approval: StaffOpsApprovalItem) => {
    const age = requestAgeHours(approval);
    const typeWeight =
      approval.requestType === "shift_swap" || approval.requestType === "shift_override"
        ? 24
        : approval.requestType === "overtime" || approval.requestType === "manual_clock_in" || approval.requestType === "attendance_edit"
          ? 18
          : approval.requestType === "outside_location"
            ? 16
            : 10;
    return typeWeight + Math.min(36, age);
  };
  const urgentRequests = [...pendingRequests]
    .sort((left, right) => requestPriorityScore(right) - requestPriorityScore(left))
    .slice(0, 4);
  const staleRequests = pendingRequests.filter((approval) => requestAgeHours(approval) >= 12);
  const payrollBlockingRequests = pendingRequests.filter((approval) =>
    approval.requestType === "attendance_edit" ||
    approval.requestType === "manual_clock_in" ||
    approval.requestType === "outside_location" ||
    approval.requestType === "overtime" ||
    approval.requestType === "leave_request"
  );
  const shiftBlockingRequests = pendingRequests.filter((approval) => approval.requestType === "shift_swap" || approval.requestType === "shift_override");
  const branchRequestRows = [...pendingRequests.reduce((map, approval) => {
    const key = approval.branchName ?? "Toàn quán";
    const current = map.get(key) ?? { name: key, pending: 0, leave: 0, shift: 0, payroll: 0 };
    current.pending += 1;
    if (approval.requestType === "leave_request") current.leave += 1;
    if (approval.requestType === "shift_swap" || approval.requestType === "shift_override") current.shift += 1;
    if (approval.requestType === "overtime" || approval.requestType === "attendance_edit" || approval.requestType === "manual_clock_in" || approval.requestType === "outside_location") current.payroll += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; pending: number; leave: number; shift: number; payroll: number }>()).values()]
    .sort((left, right) => right.pending - left.pending || right.payroll - left.payroll)
    .slice(0, 4);
  const decisionCards = [
    {
      id: "shift-risk",
      label: "Kẹt lịch ca",
      value: shiftBlockingRequests.length,
      detail: shiftBlockingRequests.length ? "Ưu tiên trước giờ vào ca" : "Không có đổi ca/ca đột xuất chờ",
      tone: operationalTone(shiftBlockingRequests.length, 1),
      icon: CalendarClock
    },
    {
      id: "payroll-risk",
      label: "Chặn payroll",
      value: payrollBlockingRequests.length,
      detail: payrollBlockingRequests.length ? "Ảnh hưởng công, OT hoặc nghỉ phép" : "Payroll không bị kẹt duyệt",
      tone: operationalTone(payrollBlockingRequests.length, 2),
      icon: ShieldCheck
    },
    {
      id: "stale-risk",
      label: "Quá 12 giờ",
      value: staleRequests.length,
      detail: staleRequests.length ? "Dễ tạo tranh chấp ca/lương" : "Không có yêu cầu tồn lâu",
      tone: operationalTone(staleRequests.length, 1),
      icon: Clock3
    },
    {
      id: "owner-ready",
      label: "Sẵn sàng chốt",
      value: reviewedRequests.length,
      detail: `${reviewedRequests.length}/${approvals.length || 0} yêu cầu đã xử lý`,
      tone: pendingRequests.length ? "orange" : "green",
      icon: CheckCircle2
    }
  ] satisfies Array<{
    id: string;
    label: string;
    value: number;
    detail: string;
    tone: "green" | "orange" | "red" | "neutral";
    icon: LucideIcon;
  }>;

  const createAdminRequest = () => {
    if (!selectedRequestMember) {
      setAdminRequestMessage({ tone: "warning", text: "Chưa có nhân viên để tạo yêu cầu." });
      return;
    }

    const payload: StaffRequestCreatePayload = {
      requestType: adminRequestType,
      staffMemberId: selectedRequestMember.id,
      branchId: adminBranchId || selectedRequestMember.primaryBranchId || undefined,
      reason: adminReason.trim() || undefined
    };

    if (adminRequestType === "leave_request") {
      payload.leaveType = adminLeaveType;
      payload.fromDate = adminFromDate;
      payload.toDate = adminToDate;
    }

    if (adminRequestType === "shift_swap") {
      const shiftAssignmentId = adminShiftAssignmentId || selectedMemberAssignments[0]?.id || "";
      if (!shiftAssignmentId) {
        setAdminRequestMessage({ tone: "warning", text: "Nhân viên chưa có ca sắp tới để tạo yêu cầu đổi ca." });
        return;
      }
      payload.shiftAssignmentId = shiftAssignmentId;
      payload.targetStaffMemberId = adminTargetStaffMemberId || undefined;
    }

    if (adminRequestType === "overtime") {
      payload.fromDate = adminFromDate;
      payload.overtimeMinutes = adminOvertimeMinutes;
    }

    setCreatingAdminRequest(true);
    setAdminRequestMessage({ tone: "neutral", text: "Đang tạo yêu cầu và đưa vào hàng chờ duyệt." });

    void (async () => {
      try {
        await createStaffRequest(payload);
        setAdminRequestMessage({ tone: "success", text: "Đã tạo yêu cầu nhân sự." });
        setAdminReason("");
        router.refresh();
      } catch (error) {
        setAdminRequestMessage({
          tone: "warning",
          text: error instanceof Error ? error.message : "Không thể tạo yêu cầu nhân sự."
        });
      } finally {
        setCreatingAdminRequest(false);
      }
    })();
  };

  return (
    <StaffShellCard
      index="5"
      title="Yêu cầu nhân sự"
      subtitle="Nghỉ phép, đổi ca, tăng ca và các phê duyệt ảnh hưởng payroll"
      action={<Pill tone={pendingRequests.length ? "orange" : "green"}>{pendingRequests.length ? `${pendingRequests.length} chờ duyệt` : "Không tồn đọng"}</Pill>}
    >
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-5">
        <StatTile label="Tất cả" value={approvals.length} />
        <StatTile label="Chờ duyệt" value={pendingRequests.length} tone={pendingRequests.length ? "orange" : "green"} />
        <StatTile label="Nghỉ phép" value={leaveRequests.length} />
        <StatTile label="Đổi ca" value={swapRequests.length} />
        <StatTile label="Tăng ca" value={overtimeRequests.length} tone={overtimeRequests.length ? "orange" : "neutral"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Decision control</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Duyệt gì trước để không kẹt ca/lương</h3>
            </div>
            <Pill tone={urgentRequests.length ? "orange" : "green"}>{urgentRequests.length ? `${urgentRequests.length} ưu tiên` : "Ổn"}</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {decisionCards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="min-h-[104px] rounded-xl border border-[#E8DED0] bg-white p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone === "red" ? "bg-[#FFF0E7] text-[#9A3412]" : item.tone === "orange" ? "bg-[#FFF1DF] text-[#A85B14]" : item.tone === "green" ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                      <Icon size={15} />
                    </span>
                    <Pill tone={item.tone}>{item.value}</Pill>
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-snug text-[#2D2924]">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Ưu tiên ngay</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Top yêu cầu rủi ro</h3>
            </div>
            <Pill tone={urgentRequests.length ? "orange" : "green"}>{urgentRequests.length || "Trống"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {urgentRequests.map((approval) => (
              <button key={approval.id} type="button" onClick={() => onOpenMember(approval.staffMemberId, "profile")} className="flex min-h-[54px] items-center justify-between gap-2 rounded-xl border border-[#E8DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-black text-[#2D2924]">{approval.fullName}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#756E64]">{requestTypeLabel(approval.requestType)} · {requestAgeHours(approval)}h chờ</span>
                </span>
                <Pill tone={requestPriorityScore(approval) >= 42 ? "red" : "orange"}>{approval.branchName ?? "Toàn quán"}</Pill>
              </button>
            ))}
            {!urgentRequests.length ? (
              <div className="grid min-h-[116px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-white px-3 text-center">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có yêu cầu rủi ro</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Hàng chờ ưu tiên sẽ tự nổi lên khi có ca/lương bị ảnh hưởng.</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFF9F0] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch impact</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Chi nhánh nào đang kẹt duyệt</h3>
          </div>
          <Pill tone={branchRequestRows.length ? "orange" : "green"}>{branchRequestRows.length || "Không kẹt"}</Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {branchRequestRows.map((branch) => (
            <div key={branch.name} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{branch.name}</p>
                <Pill tone={branch.payroll || branch.shift ? "orange" : "neutral"}>{branch.pending} chờ</Pill>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <MiniMetric label="Nghỉ" value={branch.leave} tone={branch.leave ? "orange" : "neutral"} />
                <MiniMetric label="Ca" value={branch.shift} tone={branch.shift ? "orange" : "neutral"} />
                <MiniMetric label="Payroll" value={branch.payroll} tone={branch.payroll ? "orange" : "green"} />
              </div>
            </div>
          ))}
          {!branchRequestRows.length ? (
            <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center md:col-span-2 xl:col-span-4">
              <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
              <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có chi nhánh kẹt duyệt</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Khi nhiều chi nhánh vận hành song song, backlog sẽ gom theo cụm tại đây.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Approval queue</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Cần quản lý xử lý</h3>
            </div>
            <Pill tone={pendingRequests.length ? "orange" : "green"}>{pendingRequests.length || "Trống"}</Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {pendingRequests.slice(0, 6).map((approval) => (
              <form key={approval.id} action={approvalFormAction} className="rounded-xl border border-[#F2D2B2] bg-white p-2.5">
                <input type="hidden" name="approvalId" value={approval.id} />
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => onOpenMember(approval.staffMemberId, "profile")} className="min-w-0 text-left">
                    <p className="truncate text-sm font-black text-[#2D2924]">{approval.fullName}</p>
                    <p className="mt-0.5 truncate text-[10.5px] font-bold text-[#756E64]">{approval.branchName ?? "Toàn quán"}</p>
                  </button>
                  <Pill tone="orange">{requestTypeLabel(approval.requestType)}</Pill>
                </div>
                <p className="mt-2 rounded-lg bg-[#FFF9F0] px-2 py-1.5 text-[11px] font-bold text-[#5D554B]">{requestDetail(approval)}</p>
                {approval.reason ? <p className="mt-1.5 line-clamp-2 text-[10.5px] font-semibold text-[#756E64]">{approval.reason}</p> : null}
                <input name="note" placeholder="Ghi chú duyệt/từ chối" className="staff-field-input mt-2" />
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <button name="decision" value="rejected" disabled={reviewingApproval} className="h-8 rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] text-[11px] font-black text-[#A85B14] disabled:opacity-50">
                    Từ chối
                  </button>
                  <button name="decision" value="approved" disabled={reviewingApproval} className="h-8 rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">
                    Duyệt
                  </button>
                </div>
              </form>
            ))}
            {!pendingRequests.length ? (
              <div className="grid min-h-[168px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-white px-4 text-center md:col-span-2">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={24} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có yêu cầu chờ duyệt</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Nhân viên gửi nghỉ phép, đổi ca hoặc tăng ca sẽ hiện realtime ở đây.</p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-2"><ActionNotice state={approvalState} /></div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Payroll hooks</p>
          <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Tác động chốt công</h3>
          <div className="mt-3 grid gap-1.5">
            <div className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-[#756E64]">
              <strong className="block text-[#0B3F31]">{leaveRequests.filter((item) => item.status === "approved").length} nghỉ phép đã duyệt</strong>
              Gắn `paid_leave` hoặc `unpaid_leave` trong payload để payroll đọc về sau.
            </div>
            <div className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-[#756E64]">
              <strong className="block text-[#0B3F31]">{overtimeRequests.filter((item) => item.status === "approved").length} tăng ca đã duyệt</strong>
              Gắn `overtime_payable` để báo cáo công có thể đối soát.
            </div>
            <div className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold text-[#756E64]">
              <strong className="block text-[#0B3F31]">{swapRequests.filter((item) => item.status === "approved").length} đổi ca đã duyệt</strong>
              Nếu có người nhận, lịch sẽ chuyển ca và kiểm tra trùng giờ khi duyệt.
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-[#E8DED0] bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Tạo hộ nhân viên</p>
                <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Dùng khi quản lý nhập nhanh nghỉ phép, đổi ca hoặc OT tại quầy.</p>
              </div>
              <Pill>{requestTypeLabel(adminRequestType)}</Pill>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                ["leave_request", "Nghỉ"],
                ["shift_swap", "Đổi ca"],
                ["overtime", "OT"]
              ].map(([key, label]) => {
                const active = adminRequestType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAdminRequestType(key as StaffRequestCreatePayload["requestType"])}
                    className={`h-9 rounded-lg border text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-[#FFFCF6] text-[#756E64]"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 grid gap-1.5">
              <select
                value={adminStaffMemberId}
                onChange={(event) => {
                  const nextMember = members.find((member) => member.id === event.target.value) ?? null;
                  setAdminStaffMemberId(event.target.value);
                  setAdminBranchId(nextMember?.primaryBranchId ?? branches[0]?.id ?? "");
                  setAdminShiftAssignmentId("");
                  setAdminTargetStaffMemberId("");
                }}
                className="staff-field-input"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName} · {member.roleTitle}
                  </option>
                ))}
              </select>
              <select value={adminBranchId} onChange={(event) => setAdminBranchId(event.target.value)} className="staff-field-input">
                <option value="">Theo chi nhánh chính</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>

              {adminRequestType === "shift_swap" ? (
                <>
                  <select value={adminShiftAssignmentId} onChange={(event) => setAdminShiftAssignmentId(event.target.value)} className="staff-field-input">
                    <option value="">Chọn ca sắp tới</option>
                    {selectedMemberAssignments.map((assignment) => (
                      <option key={assignment.id} value={assignment.id}>
                        {assignment.shiftName} · {assignment.scheduledDate}
                      </option>
                    ))}
                  </select>
                  <select value={adminTargetStaffMemberId} onChange={(event) => setAdminTargetStaffMemberId(event.target.value)} className="staff-field-input">
                    <option value="">Quản lý tự tìm người nhận</option>
                    {targetStaffOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} · {member.roleTitle}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <input type="date" value={adminFromDate} onChange={(event) => setAdminFromDate(event.target.value)} className="staff-field-input" />
                  {adminRequestType === "leave_request" ? (
                    <input type="date" value={adminToDate} onChange={(event) => setAdminToDate(event.target.value)} className="staff-field-input" />
                  ) : (
                    <input type="number" min="15" max="720" step="15" value={adminOvertimeMinutes} onChange={(event) => setAdminOvertimeMinutes(Number(event.target.value) || 15)} className="staff-field-input" />
                  )}
                </div>
              )}

              {adminRequestType === "leave_request" ? (
                <select value={adminLeaveType} onChange={(event) => setAdminLeaveType(event.target.value as typeof adminLeaveType)} className="staff-field-input">
                  <option value="unpaid">Nghỉ không lương</option>
                  <option value="paid">Nghỉ phép có lương</option>
                  <option value="sick">Nghỉ ốm</option>
                  <option value="emergency">Nghỉ gấp</option>
                  <option value="other">Khác</option>
                </select>
              ) : null}

              <textarea value={adminReason} onChange={(event) => setAdminReason(event.target.value)} rows={2} placeholder="Lý do/ghi chú..." className="staff-field-input h-auto py-1.5" />
              <button type="button" onClick={createAdminRequest} disabled={creatingAdminRequest || !members.length} className="h-9 rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">
                {creatingAdminRequest ? "Đang tạo..." : "Tạo yêu cầu"}
              </button>
              {adminRequestMessage ? (
                <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                  adminRequestMessage.tone === "success"
                    ? "border-[#0F4D3A]/20 bg-[#E8F5EC] text-[#0F4D3A]"
                    : adminRequestMessage.tone === "warning"
                      ? "border-[#E08A2E]/25 bg-[#FFF4E6] text-[#9A4F10]"
                      : "border-[#E8DED0] bg-[#FFFCF6] text-[#756E64]"
                }`}>
                  {adminRequestMessage.text}
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input value={requestQuery} onChange={(event) => setRequestQuery(event.target.value)} placeholder="Tìm yêu cầu theo nhân viên, loại, chi tiết..." className="staff-field-input h-9 pl-8" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["pending", "Chờ duyệt"],
              ["leave", "Nghỉ phép"],
              ["swap", "Đổi ca"],
              ["overtime", "Tăng ca"],
              ["reviewed", "Đã xử lý"],
              ["all", "Tất cả"]
            ].map(([key, label]) => {
              const active = requestFilter === key;
              return (
                <button key={key} type="button" onClick={() => setRequestFilter(key as typeof requestFilter)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{requestFilterCounts[key as typeof requestFilter]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(190px,1.25fr)_110px_minmax(220px,1.4fr)_120px_130px_110px]">
          <span>Nhân viên</span><span>Loại</span><span>Chi tiết</span><span>Chi nhánh</span><span>Ngày gửi</span><span>Trạng thái</span>
        </TableHead>
        {filteredRequests.map((approval) => (
          <button key={approval.id} type="button" onClick={() => onOpenMember(approval.staffMemberId, "profile")} className="block w-full text-left">
            <TableRow className="grid-cols-[minmax(190px,1.25fr)_110px_minmax(220px,1.4fr)_120px_130px_110px] hover:bg-[#FFF8EF]">
              <span className="min-w-0">
                <span className="block truncate font-black">{approval.fullName}</span>
                {approval.reason ? <span className="block truncate text-[10px] font-bold text-[#756E64]">{approval.reason}</span> : null}
              </span>
              <span><Pill>{requestTypeLabel(approval.requestType)}</Pill></span>
              <span className="truncate font-bold text-[#5D554B]">{requestDetail(approval)}</span>
              <span className="truncate">{approval.branchName ?? "Toàn quán"}</span>
              <span>{formatShortDateTime(approval.createdAt)}</span>
              <span><Pill tone={requestStatusTone(approval.status)}>{requestStatusLabel(approval.status)}</Pill></span>
            </TableRow>
          </button>
        ))}
        {!filteredRequests.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có yêu cầu khớp bộ lọc.</p> : null}
      </div>
    </StaffShellCard>
  );
}

function ActivityScreen({ activity }: { activity: StaffOpsActivityItem[] }) {
  const [activityQuery, setActivityQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilterKey>("all");
  const deferredActivityQuery = useDeferredValue(activityQuery);
  const categorizedActivity = activity.map((item) => ({ item, category: activityCategory(item) }));
  const activityFilterCounts = {
    all: activity.length,
    attendance: categorizedActivity.filter((entry) => entry.category === "attendance").length,
    shift: categorizedActivity.filter((entry) => entry.category === "shift").length,
    staff: categorizedActivity.filter((entry) => entry.category === "staff").length,
    review: categorizedActivity.filter((entry) => entry.category === "review").length,
    system: categorizedActivity.filter((entry) => entry.category === "system").length
  } satisfies Record<ActivityFilterKey, number>;
  const severityCounts = {
    critical: activity.filter((item) => item.severity === "critical").length,
    warning: activity.filter((item) => item.severity === "warning").length,
    info: activity.filter((item) => item.severity === "info").length
  };
  const normalizedActivityQuery = normalizeText(deferredActivityQuery.trim());
  const filteredActivity = categorizedActivity.filter(({ item, category }) => {
    if (activityFilter !== "all" && category !== activityFilter) return false;
    if (!normalizedActivityQuery) return true;

    const categoryLabel = activityFilterOptions.find((option) => option.key === category)?.label ?? category;
    const haystack = normalizeText([
      item.action,
      item.fullName ?? "Hệ thống",
      item.branchName ?? "Toàn quán",
      item.entityType,
      item.reason ?? "",
      severityLabel(item.severity),
      categoryLabel
    ].join(" "));
    return haystack.includes(normalizedActivityQuery);
  });
  const criticalActivity = activity.filter((item) => item.severity === "critical");
  const warningActivity = activity.filter((item) => item.severity === "warning");
  const sensitiveActivity = categorizedActivity.filter(({ item, category }) =>
    item.severity !== "info" ||
    category === "attendance" ||
    category === "staff" ||
    normalizeText(`${item.action} ${item.reason ?? ""}`).includes("permission") ||
    normalizeText(`${item.action} ${item.reason ?? ""}`).includes("phan quyen") ||
    normalizeText(`${item.action} ${item.reason ?? ""}`).includes("quyen") ||
    normalizeText(`${item.action} ${item.reason ?? ""}`).includes("role")
  );
  const recentCriticalActivity = [...activity]
    .filter((item) => item.severity === "critical" || item.severity === "warning")
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);
  const actorAuditRows = [...activity.reduce((map, item) => {
    const key = item.fullName ?? "Hệ thống";
    const current = map.get(key) ?? { name: key, total: 0, critical: 0, warning: 0, lastAt: item.createdAt };
    current.total += 1;
    if (item.severity === "critical") current.critical += 1;
    if (item.severity === "warning") current.warning += 1;
    if (new Date(item.createdAt).getTime() > new Date(current.lastAt).getTime()) current.lastAt = item.createdAt;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; total: number; critical: number; warning: number; lastAt: string }>()).values()]
    .sort((left, right) => right.critical - left.critical || right.warning - left.warning || right.total - left.total)
    .slice(0, 5);
  const entityAuditRows = [...activity.reduce((map, item) => {
    const key = item.entityType || "system";
    const current = map.get(key) ?? { name: key, total: 0, critical: 0, warning: 0 };
    current.total += 1;
    if (item.severity === "critical") current.critical += 1;
    if (item.severity === "warning") current.warning += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; total: number; critical: number; warning: number }>()).values()]
    .sort((left, right) => right.critical - left.critical || right.warning - left.warning || right.total - left.total)
    .slice(0, 6);
  const auditRiskScore = clampPercent(criticalActivity.length * 18 + warningActivity.length * 7 + sensitiveActivity.length * 2);
  const investigationPresets: Array<{ id: string; label: string; helper: string; filter: ActivityFilterKey; query: string; tone: "green" | "orange" | "red" | "neutral" }> = [
    { id: "attendance-abuse", label: "Gian lận công", helper: "GPS, QR, chấm tay", filter: "attendance", query: "manual gps qr outside", tone: "orange" },
    { id: "permission-change", label: "Đổi quyền", helper: "Role, phân quyền, tài khoản", filter: "staff", query: "permission role quyen", tone: "red" },
    { id: "shift-dispute", label: "Tranh chấp ca", helper: "Gán, hủy, đổi ca", filter: "shift", query: "ca shift swap cancel", tone: "orange" },
    { id: "system-critical", label: "Sự cố nặng", helper: "Critical toàn hệ thống", filter: "all", query: "critical nghiêm trọng", tone: criticalActivity.length ? "red" : "green" }
  ];
  const branchAuditRows = [...activity.reduce((map, item) => {
    const key = item.branchName ?? "Toàn quán";
    const current = map.get(key) ?? { name: key, total: 0, critical: 0, warning: 0 };
    current.total += 1;
    if (item.severity === "critical") current.critical += 1;
    if (item.severity === "warning") current.warning += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; total: number; critical: number; warning: number }>()).values()]
    .sort((left, right) => right.critical - left.critical || right.warning - left.warning || right.total - left.total)
    .slice(0, 4);
  const auditChecklist = [
    {
      id: "critical",
      label: "Log nghiêm trọng đã rà",
      value: criticalActivity.length,
      done: criticalActivity.length === 0
    },
    {
      id: "warning",
      label: "Cảnh báo cần ghi chú",
      value: warningActivity.length,
      done: warningActivity.length === 0
    },
    {
      id: "sensitive",
      label: "Thao tác nhạy cảm",
      value: sensitiveActivity.length,
      done: sensitiveActivity.length === 0
    },
    {
      id: "export",
      label: "Sẵn sàng xuất audit",
      value: filteredActivity.length,
      done: criticalActivity.length === 0 && warningActivity.length === 0
    }
  ];

  return (
    <StaffShellCard index="5" title="Lịch sử hoạt động" subtitle="Theo dõi các hoạt động của nhân viên" action={<a href={STAFF_ACTIVITY_EXPORT_URL} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white"><FileDown size={12} />Xuất log</a>}>
      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input
              value={activityQuery}
              onChange={(event) => setActivityQuery(event.target.value)}
              placeholder="Tìm log theo nhân viên, thao tác, chi nhánh..."
              className="staff-field-input h-9 pl-8"
            />
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg border border-[#F2D2B2] bg-[#FFF1DF] px-2 py-1.5">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#A85B14]">Nghiêm trọng</p>
              <p className="text-base font-black text-[#9A3412]">{severityCounts.critical}</p>
            </div>
            <div className="rounded-lg border border-[#F2D2B2] bg-[#FFF8EF] px-2 py-1.5">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#A85B14]">Cảnh báo</p>
              <p className="text-base font-black text-[#A85B14]">{severityCounts.warning}</p>
            </div>
            <div className="rounded-lg border border-[#CBE5D2] bg-[#E8F5EC] px-2 py-1.5">
              <p className="text-[9.5px] font-black uppercase tracking-[0.08em] text-[#0F6A45]">Thông tin</p>
              <p className="text-base font-black text-[#0F4D3A]">{severityCounts.info}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Audit command center</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Truy vết rủi ro vận hành</h3>
            </div>
            <Pill tone={criticalActivity.length ? "red" : warningActivity.length ? "orange" : "green"}>
              {criticalActivity.length ? `${criticalActivity.length} nghiêm trọng` : warningActivity.length ? `${warningActivity.length} cảnh báo` : "Ổn định"}
            </Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={AlertTriangle} label="Nghiêm trọng" value={criticalActivity.length} meta="Cần chủ quán rà ngay" tone={criticalActivity.length ? "red" : "green"} />
            <StaffOpsMetric icon={ShieldCheck} label="Cảnh báo" value={warningActivity.length} meta="Nên ghi chú xử lý" tone={warningActivity.length ? "orange" : "green"} />
            <StaffOpsMetric icon={Fingerprint} label="Nhạy cảm" value={sensitiveActivity.length} meta="Chấm công, quyền, hồ sơ" tone={sensitiveActivity.length ? "orange" : "green"} />
            <StaffOpsMetric icon={History} label="Risk score" value={`${auditRiskScore}/100`} meta={`${filteredActivity.length}/${activity.length} log đang xem`} tone={auditRiskScore >= 70 ? "red" : auditRiskScore >= 35 ? "orange" : "green"} />
          </div>
          <div className="mt-3 grid gap-1.5 md:grid-cols-4">
            {investigationPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setActivityFilter(preset.filter);
                  setActivityQuery(preset.query);
                }}
                className={`min-h-[58px] rounded-xl border px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/35 ${
                  preset.tone === "red"
                    ? "border-[#F2D2B2] bg-[#FFF0E7] text-[#9A3412]"
                    : preset.tone === "orange"
                      ? "border-[#F2D2B2] bg-[#FFF8EF] text-[#A85B14]"
                      : preset.tone === "green"
                        ? "border-[#CBE5D2] bg-[#E8F5EC] text-[#0F4D3A]"
                        : "border-[#E8DED0] bg-white text-[#756E64]"
                }`}
              >
                <span className="block text-[11px] font-black">{preset.label}</span>
                <span className="mt-0.5 block text-[10px] font-bold opacity-80">{preset.helper}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist audit</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước khi đóng ca</h3>
            </div>
            <Pill tone={auditChecklist.every((item) => item.done) ? "green" : "orange"}>
              {auditChecklist.filter((item) => !item.done).length || "Xong"}
            </Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {auditChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Audit theo chi nhánh</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Nơi nào phát sinh thao tác cần rà</h3>
          </div>
          <Pill tone={branchAuditRows.some((branch) => branch.critical || branch.warning) ? "orange" : "green"}>{branchAuditRows.length || "Trống"}</Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {branchAuditRows.map((branch) => (
            <div key={branch.name} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{branch.name}</p>
                <Pill tone={branch.critical ? "red" : branch.warning ? "orange" : "green"}>{branch.total} log</Pill>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <MiniMetric label="Nặng" value={branch.critical} tone={branch.critical ? "red" : "green"} />
                <MiniMetric label="Cảnh báo" value={branch.warning} tone={branch.warning ? "orange" : "green"} />
                <MiniMetric label="Tổng" value={branch.total} />
              </div>
            </div>
          ))}
          {!branchAuditRows.length ? (
            <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center md:col-span-2 xl:col-span-4">
              <History className="mx-auto text-[#0F4D3A]" size={22} />
              <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có audit theo chi nhánh</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Khi có thao tác nhân sự, dữ liệu sẽ gom theo chi nhánh tại đây.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Investigation map</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ai và đối tượng nào bị tác động nhiều</h3>
            </div>
            <Pill tone={actorAuditRows.some((actor) => actor.critical > 0) ? "red" : actorAuditRows.some((actor) => actor.warning > 0) ? "orange" : "green"}>
              {actorAuditRows.length} tác nhân
            </Pill>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <div className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-[#0B3F31]">Tác nhân nổi bật</h4>
                <Pill>{actorAuditRows.length}</Pill>
              </div>
              <div className="mt-2 grid gap-1.5">
                {actorAuditRows.map((actor) => (
                  <button
                    key={actor.name}
                    type="button"
                    onClick={() => {
                      setActivityFilter("all");
                      setActivityQuery(actor.name);
                    }}
                    className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-[#FFF9F0] px-2 py-1.5 text-left hover:bg-[#FFF1DF]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{actor.name}</span>
                      <span className="block truncate text-[10px] font-bold text-[#756E64]">{formatShortDateTime(actor.lastAt)} · {actor.total} thao tác</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {actor.critical ? <Pill tone="red">{actor.critical}</Pill> : null}
                      {actor.warning ? <Pill tone="orange">{actor.warning}</Pill> : null}
                    </span>
                  </button>
                ))}
                {!actorAuditRows.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có tác nhân audit.</p> : null}
              </div>
            </div>

            <div className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-[#0B3F31]">Đối tượng bị tác động</h4>
                <Pill>{entityAuditRows.length}</Pill>
              </div>
              <div className="mt-2 grid gap-1.5">
                {entityAuditRows.map((entity) => (
                  <button
                    key={entity.name}
                    type="button"
                    onClick={() => {
                      setActivityFilter("all");
                      setActivityQuery(entity.name);
                    }}
                    className="grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-[#FFF9F0] px-2 py-1.5 text-left hover:bg-[#FFF1DF]"
                  >
                    <span className="truncate text-[11.5px] font-black text-[#2D2924]">{entity.name}</span>
                    <span className="flex items-center gap-1">
                      <Pill tone={entity.critical ? "red" : entity.warning ? "orange" : "neutral"}>{entity.total}</Pill>
                    </span>
                  </button>
                ))}
                {!entityAuditRows.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có entity audit.</p> : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Hàng đợi điều tra</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Log nặng gần nhất</h3>
            </div>
            <Pill tone={recentCriticalActivity.length ? "orange" : "green"}>{recentCriticalActivity.length || "Trống"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {recentCriticalActivity.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActivityFilter("all");
                  setActivityQuery(item.action);
                }}
                className="rounded-xl border border-[#E8DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{item.action}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold text-[#756E64]">{item.fullName ?? "Hệ thống"} · {formatShortDateTime(item.createdAt)}</span>
                  </span>
                  <Pill tone={item.severity === "critical" ? "red" : "orange"}>{severityLabel(item.severity)}</Pill>
                </div>
                {item.reason ? <p className="mt-1 line-clamp-2 text-[10.5px] font-semibold text-[#8B8175]">{item.reason}</p> : null}
              </button>
            ))}
            {!recentCriticalActivity.length ? (
              <div className="grid min-h-[118px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-white px-3 text-center">
                <div>
                  <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có log nặng</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Log cảnh báo sẽ tự nổi lên khi phát sinh.</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <div className="grid min-h-[420px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 lg:border-b-0 lg:border-r">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#756E64]">Nhóm audit</p>
          {activityFilterOptions.map((item) => {
            const active = activityFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActivityFilter(item.key)}
                className={`mb-1 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-black transition ${active ? "border-[#CBE5D2] bg-[#E7F6EC] text-[#0F4D3A]" : "border-transparent text-[#756E64] hover:border-[#E8DED0] hover:bg-white"}`}
              >
                <span>{item.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white text-[#0F4D3A]" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                  {activityFilterCounts[item.key]}
                </span>
              </button>
            );
          })}
        </aside>
        <div className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-[#0B3F31]">{filteredActivity.length}/{activity.length} log khớp bộ lọc</p>
            <Pill tone={severityCounts.critical ? "red" : severityCounts.warning ? "orange" : "green"}>
              Audit realtime-ready
            </Pill>
          </div>
          <div className="grid max-h-[560px] gap-2 overflow-auto pr-1">
            {filteredActivity.map(({ item, category }) => {
              const categoryLabel = activityFilterOptions.find((option) => option.key === category)?.label ?? "Hệ thống";
              return (
                <div key={item.id} className="grid grid-cols-[64px_12px_minmax(0,1fr)] gap-2 rounded-xl border border-[#EFE5D9] bg-white px-2.5 py-2 sm:grid-cols-[76px_12px_minmax(0,1fr)_104px]">
                  <span className="text-[10.5px] font-bold leading-tight text-[#756E64]">{formatShortDateTime(item.createdAt)}</span>
                  <span className={`mt-1.5 h-2 w-2 rounded-full ${item.severity === "critical" ? "bg-[#C2410C]" : item.severity === "warning" ? "bg-[#E08A2E]" : "bg-[#0F7A4F]"}`} />
                  <span className="min-w-0">
                    <strong className="block truncate text-xs font-black text-[#2D2924]">{item.action}</strong>
                    <small className="block truncate text-[11px] font-bold text-[#756E64]">{item.fullName ?? "Hệ thống"} · {item.branchName ?? "Toàn quán"} · {categoryLabel}</small>
                    {item.reason ? <small className="mt-0.5 block line-clamp-2 text-[10.5px] font-semibold text-[#8B8175]">{item.reason}</small> : null}
                  </span>
                  <span className="hidden justify-self-end sm:block">
                    <Pill tone={item.severity === "critical" ? "red" : item.severity === "warning" ? "orange" : "green"}>{severityLabel(item.severity)}</Pill>
                  </span>
                </div>
              );
            })}
            {!filteredActivity.length ? (
              <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-[#E8DED0] bg-[#FFF9F0] px-4 text-center">
                <div>
                  <History className="mx-auto text-[#0F4D3A]" size={24} />
                  <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có log khớp bộ lọc</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Audit log vẫn được giữ nguyên; chỉ thay đổi cách đang xem.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </StaffShellCard>
  );
}

function ReviewsScreen({
  members,
  reviews,
  bundle,
  formAction,
  state,
  pending,
  onOpenMember
}: {
  members: StaffOpsMember[];
  reviews: StaffOpsReviewItem[];
  bundle: StaffOperationsBundle;
  formAction: (payload: FormData) => void;
  state?: StaffActionState;
  pending: boolean;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
}) {
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"all" | "excellent" | "watch" | "draft">("all");
  const deferredReviewQuery = useDeferredValue(reviewQuery);
  const averageScore = reviews.length ? reviews.reduce((sum, item) => sum + item.score, 0) / reviews.length : 0;
  const excellentReviews = reviews.filter((item) => item.score >= 4.5);
  const watchReviews = reviews.filter((item) => item.score < 3.5);
  const draftReviews = reviews.filter((item) => item.status !== "completed");
  const reviewedStaffIds = new Set(reviews.map((item) => item.staffMemberId));
  const activeMembersWithoutReview = members.filter((member) => member.employmentStatus === "active" && !member.isArchived && !reviewedStaffIds.has(member.id));
  const completedReviews = reviews.filter((item) => item.status === "completed");
  const latestReviewByStaff = new Map<string, StaffOpsReviewItem>();
  reviews.forEach((review) => {
    const current = latestReviewByStaff.get(review.staffMemberId);
    if (!current || new Date(review.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestReviewByStaff.set(review.staffMemberId, review);
    }
  });
  const timesheetByStaff = new Map(bundle.timesheets.map((item) => [item.staffMemberId, item]));
  const attendanceByStaff = bundle.attendanceFeed.reduce((map, item) => {
    const rows = map.get(item.staffMemberId) ?? [];
    rows.push(item);
    map.set(item.staffMemberId, rows);
    return map;
  }, new Map<string, StaffOpsAttendanceFeedItem[]>());
  const performanceRows = members
    .filter((member) => !member.isArchived)
    .map((member) => {
      const timesheet = timesheetByStaff.get(member.id) ?? null;
      const latestReview = latestReviewByStaff.get(member.id) ?? null;
      const attendanceRows = attendanceByStaff.get(member.id) ?? [];
      const manualAttendance = attendanceRows.filter((item) => item.source === "manual" || item.approvalState === "pending").length;
      const reviewScore = latestReview?.score ?? 0;
      const attendanceScore = timesheet?.attendanceScore ?? (member.todayAttendanceState === "late" || member.todayAttendanceState === "absent" ? 70 : 90);
      const workMinutes = timesheet?.workMinutes ?? 0;
      const lateMinutes = timesheet?.lateMinutes ?? member.lateMinutesToday;
      const overtimeMinutes = timesheet?.overtimeMinutes ?? member.overtimeMinutesToday;
      const pendingApprovals = timesheet?.pendingApprovals ?? 0;
      const productivityScore = clampPercent(
        attendanceScore * 0.46 +
        (reviewScore ? reviewScore * 10 : 32) +
        Math.min(18, workMinutes / 360) -
        Math.min(16, lateMinutes / 8) -
        Math.min(12, manualAttendance * 3) -
        pendingApprovals * 4 -
        (member.suspiciousScore >= 40 ? 12 : 0)
      );
      const riskReasons = [
        !latestReview ? "Chưa đánh giá" : null,
        reviewScore > 0 && reviewScore < 3.5 ? "Điểm review thấp" : null,
        attendanceScore < 75 ? "Điểm công thấp" : null,
        lateMinutes >= 45 ? "Đi muộn nhiều" : null,
        manualAttendance > 0 ? "Có chấm tay/chờ duyệt" : null,
        pendingApprovals > 0 ? "Request payroll chờ" : null,
        member.suspiciousScore >= 40 ? "Rủi ro bất thường" : null
      ].filter(Boolean) as string[];
      const segment =
        productivityScore >= 88 && reviewScore >= 4.2 && member.suspiciousScore < 30
          ? "leader"
          : riskReasons.length >= 2 || productivityScore < 70
            ? "coaching"
            : productivityScore >= 78
              ? "stable"
              : "watch";

      return {
        member,
        timesheet,
        latestReview,
        attendanceRows,
        manualAttendance,
        reviewScore,
        attendanceScore,
        workMinutes,
        lateMinutes,
        overtimeMinutes,
        pendingApprovals,
        productivityScore,
        riskReasons,
        segment
      };
    })
    .sort((left, right) => right.productivityScore - left.productivityScore || right.workMinutes - left.workMinutes);
  const leaderRows = performanceRows.filter((row) => row.segment === "leader");
  const coachingRows = performanceRows.filter((row) => row.segment === "coaching" || row.segment === "watch").sort((left, right) => left.productivityScore - right.productivityScore).slice(0, 8);
  const attendanceRiskRows = performanceRows.filter((row) => row.lateMinutes > 0 || row.manualAttendance > 0 || row.pendingApprovals > 0).sort((left, right) => (right.lateMinutes + right.manualAttendance * 15 + right.pendingApprovals * 20) - (left.lateMinutes + left.manualAttendance * 15 + left.pendingApprovals * 20)).slice(0, 6);
  const branchPerformanceRows = [...performanceRows.reduce((map, row) => {
    const key = row.member.primaryBranchName ?? "Chưa gán chi nhánh";
    const current = map.get(key) ?? { name: key, staff: 0, scoreTotal: 0, leaders: 0, coaching: 0, lateMinutes: 0, pendingApprovals: 0 };
    current.staff += 1;
    current.scoreTotal += row.productivityScore;
    if (row.segment === "leader") current.leaders += 1;
    if (row.segment === "coaching" || row.segment === "watch") current.coaching += 1;
    current.lateMinutes += row.lateMinutes;
    current.pendingApprovals += row.pendingApprovals;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; staff: number; scoreTotal: number; leaders: number; coaching: number; lateMinutes: number; pendingApprovals: number }>()).values()]
    .sort((left, right) => (right.coaching + right.pendingApprovals) - (left.coaching + left.pendingApprovals) || right.scoreTotal / Math.max(1, right.staff) - left.scoreTotal / Math.max(1, left.staff));
  const productivityAverage = performanceRows.length ? Math.round(performanceRows.reduce((sum, row) => sum + row.productivityScore, 0) / performanceRows.length) : 100;
  const coachingNeedCount = performanceRows.filter((row) => row.segment === "coaching" || row.segment === "watch").length;
  const promotionReadyRows = leaderRows.slice(0, 5);
  const recognitionRows = performanceRows.filter((row) => row.productivityScore >= 82 && row.overtimeMinutes > 0 && row.lateMinutes === 0).slice(0, 5);
  const performanceReadinessScore = clampPercent(
    100 -
    watchReviews.length * 12 -
    draftReviews.length * 6 -
    activeMembersWithoutReview.length * 8 -
    coachingNeedCount * 3 -
    Math.max(0, 4 - averageScore) * 10
  );
  const reviewPeriodRows = [...reviews.reduce((map, item) => {
    const current = map.get(item.periodLabel) ?? { label: item.periodLabel, count: 0, completed: 0, scoreTotal: 0 };
    current.count += 1;
    if (item.status === "completed") current.completed += 1;
    current.scoreTotal += item.score;
    map.set(item.periodLabel, current);
    return map;
  }, new Map<string, { label: string; count: number; completed: number; scoreTotal: number }>()).values()]
    .sort((left, right) => right.label.localeCompare(left.label, "vi"))
    .slice(0, 4);
  const coachingQueue = [...watchReviews]
    .sort((left, right) => left.score - right.score)
    .slice(0, 4);
  const performanceChecklist = [
    { id: "coverage", label: "Nhân sự active đã có đánh giá", value: activeMembersWithoutReview.length, done: activeMembersWithoutReview.length === 0 },
    { id: "draft", label: "Không còn đánh giá nháp", value: draftReviews.length, done: draftReviews.length === 0 },
    { id: "coaching", label: "Đã lên danh sách cần kèm", value: coachingNeedCount, done: coachingNeedCount === 0 },
    { id: "score", label: "Điểm trung bình đạt chuẩn", value: averageScore ? averageScore.toFixed(1) : "--", done: averageScore >= 4 || reviews.length === 0 }
  ];
  const filterCounts = {
    all: reviews.length,
    excellent: excellentReviews.length,
    watch: watchReviews.length,
    draft: draftReviews.length
  };
  const normalizedQuery = normalizeText(deferredReviewQuery.trim());
  const filteredReviews = reviews.filter((item) => {
    const matchesFilter =
      reviewFilter === "all" ||
      (reviewFilter === "excellent" && item.score >= 4.5) ||
      (reviewFilter === "watch" && item.score < 3.5) ||
      (reviewFilter === "draft" && item.status !== "completed");
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;

    return normalizeText([
      item.staffName,
      item.periodLabel,
      item.status,
      item.note ?? ""
    ].join(" ")).includes(normalizedQuery);
  });

  return (
    <StaffShellCard index="8" title="Performance & coaching" subtitle="Đánh giá, năng suất, coaching và đề xuất trưởng ca" action={<button type="submit" form="staff-review-form" disabled={pending || members.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-50"><Plus size={12} />Tạo đánh giá</button>}>
      <form id="staff-review-form" action={formAction} className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 md:grid-cols-[1.2fr_1fr_120px_1.4fr]">
        <select name="staffMemberId" required className="staff-field-input">
          <option value="">Chọn nhân sự</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
        <input name="periodLabel" defaultValue={currentMonthLabel()} className="staff-field-input" />
        <input name="score" type="number" min="1" max="5" step="0.1" defaultValue="4.5" className="staff-field-input" />
        <input name="note" placeholder="Ghi chú ngắn" className="staff-field-input" />
        <div className="md:col-span-4"><ActionNotice state={state} /></div>
      </form>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Điểm TB" value={averageScore ? averageScore.toFixed(1) : "--"} tone={averageScore >= 4 ? "green" : averageScore >= 3.5 ? "orange" : "red"} />
        <StatTile label="Năng suất TB" value={`${productivityAverage}/100`} tone={productivityAverage >= 85 ? "green" : productivityAverage >= 72 ? "orange" : "red"} />
        <StatTile label="Cần kèm cặp" value={coachingNeedCount} tone={coachingNeedCount ? "orange" : "green"} />
        <StatTile label="Leader ready" value={leaderRows.length} tone={leaderRows.length ? "green" : "neutral"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Performance control</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Đủ dữ liệu để quyết định training/ca</h3>
            </div>
            <Pill tone={performanceReadinessScore >= 90 ? "green" : performanceReadinessScore >= 75 ? "orange" : "red"}>{performanceReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={ClipboardCheck} label="Đã chốt" value={completedReviews.length} meta={`${reviews.length} đánh giá tổng`} tone={completedReviews.length ? "green" : "neutral"} />
            <StaffOpsMetric icon={AlertTriangle} label="Cần kèm" value={coachingNeedCount} meta="Review, công, risk hoặc chấm tay" tone={coachingNeedCount ? "orange" : "green"} />
            <StaffOpsMetric icon={UsersRound} label="Chưa đánh giá" value={activeMembersWithoutReview.length} meta="Nhân sự active" tone={activeMembersWithoutReview.length ? "orange" : "green"} />
            <StaffOpsMetric icon={FileText} label="Nháp" value={draftReviews.length} meta="Cần hoàn tất kỳ đánh giá" tone={draftReviews.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist hiệu suất</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước khi xếp ca chính</h3>
            </div>
            <Pill tone={performanceChecklist.every((item) => item.done) ? "green" : "orange"}>{performanceChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {performanceChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Talent matrix</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ai nên giao ca chính, ai cần coaching</h3>
            </div>
            <Pill tone={coachingNeedCount ? "orange" : "green"}>{leaderRows.length} leader · {coachingNeedCount} cần kèm</Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <section className="rounded-xl border border-[#CBE5D2] bg-[#F6FBF6] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-[#0B3F31]">Leader ready</h4>
                <Pill tone="green">{promotionReadyRows.length}</Pill>
              </div>
              <div className="mt-2 grid gap-1.5">
                {promotionReadyRows.map((row) => (
                  <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "profile")} className="rounded-lg bg-white px-2.5 py-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11.5px] font-black text-[#2D2924]">{row.member.fullName}</span>
                      <Pill tone="green">{row.productivityScore}</Pill>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">{row.member.roleTitle} · {row.member.primaryBranchName ?? "Chưa gán"}</p>
                  </button>
                ))}
                {!promotionReadyRows.length ? <p className="rounded-lg border border-dashed border-[#CBE5D2] bg-white p-3 text-[11px] font-bold text-[#756E64]">Chưa có ứng viên leader rõ ràng.</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-[#F2D2B2] bg-[#FFF8EF] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-[#0B3F31]">Coaching priority</h4>
                <Pill tone={coachingRows.length ? "orange" : "green"}>{coachingRows.length || "Trống"}</Pill>
              </div>
              <div className="mt-2 grid gap-1.5">
                {coachingRows.slice(0, 5).map((row) => (
                  <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "profile")} className="rounded-lg bg-white px-2.5 py-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11.5px] font-black text-[#2D2924]">{row.member.fullName}</span>
                      <Pill tone={row.productivityScore < 65 ? "red" : "orange"}>{row.productivityScore}</Pill>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] font-bold text-[#A85B14]">{row.riskReasons.join(", ") || "Cần theo dõi thêm dữ liệu"}</p>
                  </button>
                ))}
                {!coachingRows.length ? <p className="rounded-lg border border-dashed border-[#CBE5D2] bg-white p-3 text-[11px] font-bold text-[#756E64]">Không có nhân sự cần coaching gấp.</p> : null}
              </div>
            </section>

            <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-[#0B3F31]">Ghi nhận OT sạch</h4>
                <Pill tone={recognitionRows.length ? "green" : "neutral"}>{recognitionRows.length}</Pill>
              </div>
              <div className="mt-2 grid gap-1.5">
                {recognitionRows.map((row) => (
                  <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "profile")} className="rounded-lg bg-white px-2.5 py-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11.5px] font-black text-[#2D2924]">{row.member.fullName}</span>
                      <Pill tone="green">{formatHours(row.overtimeMinutes)}</Pill>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">Không đi muộn · điểm {row.productivityScore}/100</p>
                  </button>
                ))}
                {!recognitionRows.length ? <p className="rounded-lg border border-dashed border-[#E8DED0] bg-white p-3 text-[11px] font-bold text-[#756E64]">Chưa có đề xuất ghi nhận OT.</p> : null}
              </div>
            </section>
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Attendance correlation</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Rủi ro hiệu suất do công/duyệt</h3>
            </div>
            <Pill tone={attendanceRiskRows.length ? "orange" : "green"}>{attendanceRiskRows.length || "Ổn"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {attendanceRiskRows.map((row) => (
              <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "attendance")} className="rounded-lg border border-[#EFE5D9] bg-[#FFF9F0] px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11.5px] font-black text-[#2D2924]">{row.member.fullName}</p>
                  <Pill tone={row.productivityScore < 70 ? "red" : "orange"}>{row.productivityScore}/100</Pill>
                </div>
                <p className="mt-0.5 truncate text-[10px] font-bold text-[#756E64]">{formatHours(row.lateMinutes)} muộn · {row.manualAttendance} chấm tay/chờ · {row.pendingApprovals} payroll chờ</p>
              </button>
            ))}
            {!attendanceRiskRows.length ? <p className="rounded-lg border border-dashed border-[#E8DED0] bg-[#FFF9F0] p-3 text-[11px] font-bold text-[#756E64]">Không có rủi ro chấm công ảnh hưởng hiệu suất.</p> : null}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch performance rollup</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Chi nhánh nào cần đào tạo lại đội hình</h3>
          </div>
          <Pill>{branchPerformanceRows.length} nhóm</Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {branchPerformanceRows.map((branch) => {
            const average = branch.staff ? Math.round(branch.scoreTotal / branch.staff) : 100;
            return (
              <div key={branch.name} className="rounded-xl border border-[#E8DED0] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#2D2924]">{branch.name}</p>
                    <p className="mt-0.5 text-[10.5px] font-bold text-[#756E64]">{branch.staff} nhân sự · {branch.leaders} leader ready</p>
                  </div>
                  <Pill tone={average >= 85 ? "green" : average >= 72 ? "orange" : "red"}>{average}/100</Pill>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                  <MiniMetric label="Leader" value={branch.leaders} tone={branch.leaders ? "green" : "neutral"} />
                  <MiniMetric label="Coaching" value={branch.coaching} tone={branch.coaching ? "orange" : "green"} />
                  <MiniMetric label="Muộn" value={formatHours(branch.lateMinutes)} tone={branch.lateMinutes ? "orange" : "green"} />
                  <MiniMetric label="Chờ" value={branch.pendingApprovals} tone={branch.pendingApprovals ? "orange" : "green"} />
                </div>
              </div>
            );
          })}
          {!branchPerformanceRows.length ? <EmptyStaffState title="Chưa có dữ liệu hiệu suất theo chi nhánh" description="Khi có nhân sự và timesheet, LogiVN sẽ gom performance theo từng điểm bán." /> : null}
        </div>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Coverage theo kỳ</h3>
            <Pill>{reviewPeriodRows.length} kỳ</Pill>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {reviewPeriodRows.map((period) => {
              const avg = period.count ? period.scoreTotal / period.count : 0;
              return (
                <div key={period.label} className="rounded-lg border border-[#EFE5D9] bg-[#FFF9F0] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-black text-[#2D2924]">{period.label}</p>
                    <Pill tone={avg >= 4 ? "green" : avg >= 3.5 ? "orange" : "red"}>{avg ? avg.toFixed(1) : "--"}</Pill>
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-[#756E64]">{period.completed}/{period.count} đã chốt</p>
                </div>
              );
            })}
            {!reviewPeriodRows.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có kỳ đánh giá.</p> : null}
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Coaching queue</h3>
            <Pill tone={coachingQueue.length ? "orange" : "green"}>{coachingQueue.length || "Trống"}</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {coachingQueue.map((item) => (
              <button key={item.id} type="button" onClick={() => onOpenMember(item.staffMemberId, "profile")} className="rounded-lg border border-[#F2D2B2] bg-[#FFF8EF] px-2.5 py-2 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-black text-[#2D2924]">{item.staffName}</p>
                  <Pill tone="orange">{item.score}/5</Pill>
                </div>
                <p className="mt-0.5 truncate text-[10px] font-bold text-[#A85B14]">{item.periodLabel} · {item.note ?? "Cần kế hoạch kèm cặp"}</p>
              </button>
            ))}
            {!coachingQueue.length ? <p className="text-[11px] font-bold text-[#756E64]">Không có nhân sự cần kèm nổi bật.</p> : null}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input value={reviewQuery} onChange={(event) => setReviewQuery(event.target.value)} placeholder="Tìm đánh giá theo nhân viên, kỳ, ghi chú..." className="staff-field-input h-9 pl-8" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Tất cả"],
              ["excellent", "Xuất sắc"],
              ["watch", "Cần kèm"],
              ["draft", "Chưa chốt"]
            ].map(([key, label]) => {
              const active = reviewFilter === key;
              return (
                <button key={key} type="button" onClick={() => setReviewFilter(key as typeof reviewFilter)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{filterCounts[key as typeof reviewFilter]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.5fr)_140px_100px_120px_130px_120px]">
          <span>Nhân viên</span><span>Kỳ đánh giá</span><span>Điểm</span><span>Xếp loại</span><span>Ngày đánh giá</span><span>Trạng thái</span>
        </TableHead>
        {filteredReviews.map((item) => {
          const grade = item.score >= 4.5 ? "Xuất sắc" : item.score >= 4 ? "Tốt" : item.score >= 3 ? "Khá" : "Cần chú ý";
          return (
            <button key={item.id} type="button" onClick={() => onOpenMember(item.staffMemberId, "profile")} className="block w-full text-left">
              <TableRow className="grid-cols-[minmax(220px,1.5fr)_140px_100px_120px_130px_120px] hover:bg-[#FFF8EF]">
                <span>
                  <span className="block truncate font-black">{item.staffName}</span>
                  {item.note ? <span className="block truncate text-[10px] font-bold text-[#756E64]">{item.note}</span> : null}
                </span>
                <span>{item.periodLabel}</span>
                <span>{item.score}/5</span>
                <span><Pill tone={item.score >= 4 ? "green" : "orange"}>{grade}</Pill></span>
                <span>{formatDate(item.createdAt)}</span>
                <span><Pill tone={item.status === "completed" ? "green" : "neutral"}>{item.status === "completed" ? "Đã lưu" : item.status}</Pill></span>
              </TableRow>
            </button>
          );
        })}
        {!filteredReviews.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có đánh giá khớp bộ lọc.</p> : null}
      </div>
    </StaffShellCard>
  );
}

function LifecycleScreen({
  members,
  contracts,
  documents,
  devices,
  approvals,
  assignments,
  onOpenMember,
  onOpenScreen
}: {
  members: StaffOpsMember[];
  contracts: StaffOpsContractItem[];
  documents: StaffOpsDocumentItem[];
  devices: StaffOpsDeviceItem[];
  approvals: StaffOpsApprovalItem[];
  assignments: StaffOpsShiftAssignment[];
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen: (screen: StaffScreenKey) => void;
}) {
  const activeMembers = members.filter((member) => member.employmentStatus === "active" && !member.isArchived);
  const suspendedMembers = members.filter((member) => member.employmentStatus === "suspended" && !member.isArchived);
  const resignedMembers = members.filter((member) => member.employmentStatus === "resigned" || member.isArchived);
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const lifecycleRows = members.map((member) => {
    const memberContracts = contracts.filter((contract) => contract.staffMemberId === member.id);
    const activeContract = memberContracts.find((contract) => contract.status === "active");
    const hasIdentity = documents.some((document) => document.staffMemberId === member.id && document.documentType === "identity_card" && document.status === "complete");
    const hasContractDoc = documents.some((document) => document.staffMemberId === member.id && document.documentType === "contract" && document.status === "complete");
    const assignedDevices = devices.filter((device) => device.staffMemberId === member.id && device.status === "assigned");
    const pendingRequests = pendingApprovals.filter((approval) => approval.staffMemberId === member.id);
    const upcomingAssignments = assignments.filter((assignment) => assignment.staffMemberId === member.id && assignment.status !== "cancelled");
    const onboardingGaps = [
      !member.hasPin ? "Thiếu PIN" : null,
      !member.primaryBranchId ? "Thiếu chi nhánh" : null,
      !activeContract && member.employmentStatus === "active" ? "Thiếu HĐ" : null,
      !hasIdentity && member.employmentStatus === "active" ? "Thiếu CCCD" : null,
      !hasContractDoc && member.employmentStatus === "active" ? "Thiếu file HĐ" : null
    ].filter(Boolean) as string[];
    const offboardingGaps = [
      (member.employmentStatus === "resigned" || member.isArchived) && assignedDevices.length ? "Chưa thu hồi thiết bị" : null,
      (member.employmentStatus === "resigned" || member.isArchived) && member.activeSessionCount ? "Còn phiên đăng nhập" : null,
      (member.employmentStatus === "resigned" || member.isArchived) && pendingRequests.length ? "Còn request chờ" : null
    ].filter(Boolean) as string[];
    const riskScore = onboardingGaps.length * 18 + offboardingGaps.length * 24 + pendingRequests.length * 8 + (member.suspiciousScore >= 40 ? 12 : 0);
    return {
      member,
      activeContract,
      hasIdentity,
      hasContractDoc,
      assignedDevices,
      pendingRequests,
      upcomingAssignments,
      onboardingGaps,
      offboardingGaps,
      riskScore: clampPercent(riskScore)
    };
  });
  const onboardingRows = lifecycleRows.filter((row) => row.member.employmentStatus === "active" && row.onboardingGaps.length > 0);
  const offboardingRows = lifecycleRows.filter((row) => row.offboardingGaps.length > 0);
  const trainingReadyRows = lifecycleRows.filter((row) =>
    row.member.employmentStatus === "active" &&
    row.onboardingGaps.length === 0 &&
    row.upcomingAssignments.length > 0
  );
  const highRiskRows = [...lifecycleRows].filter((row) => row.riskScore >= 35).sort((left, right) => right.riskScore - left.riskScore).slice(0, 6);
  const lifecycleReadinessScore = clampPercent(100 - onboardingRows.length * 7 - offboardingRows.length * 10 - pendingApprovals.length * 3 - suspendedMembers.length * 4);
  const lifecycleChecklist = [
    { id: "pin-branch", label: "Nhân sự active đủ PIN/chi nhánh", value: activeMembers.filter((member) => !member.hasPin || !member.primaryBranchId).length },
    { id: "contracts", label: "Nhân sự active có hợp đồng", value: onboardingRows.filter((row) => row.onboardingGaps.includes("Thiếu HĐ")).length },
    { id: "documents", label: "CCCD/file HĐ đã đủ", value: onboardingRows.filter((row) => row.onboardingGaps.includes("Thiếu CCCD") || row.onboardingGaps.includes("Thiếu file HĐ")).length },
    { id: "offboarding", label: "Không còn offboarding kẹt", value: offboardingRows.length }
  ];

  return (
    <StaffShellCard
      index="8"
      title="Vòng đời nhân sự"
      subtitle="Onboarding, training readiness, offboarding và thu hồi tài sản"
      action={<Pill tone={lifecycleReadinessScore >= 90 ? "green" : lifecycleReadinessScore >= 75 ? "orange" : "red"}>{lifecycleReadinessScore}/100 sẵn sàng</Pill>}
    >
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-5">
        <StatTile label="Đang làm" value={activeMembers.length} />
        <StatTile label="Sẵn sàng training" value={trainingReadyRows.length} tone={trainingReadyRows.length ? "green" : "neutral"} />
        <StatTile label="Onboarding kẹt" value={onboardingRows.length} tone={onboardingRows.length ? "orange" : "green"} />
        <StatTile label="Offboarding kẹt" value={offboardingRows.length} tone={offboardingRows.length ? "red" : "green"} />
        <StatTile label="Tạm khoá/nghỉ" value={suspendedMembers.length + resignedMembers.length} tone={suspendedMembers.length ? "orange" : "neutral"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Lifecycle command center</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ai đã sẵn sàng lên ca, ai cần xử lý</h3>
            </div>
            <Pill tone={highRiskRows.length ? "orange" : "green"}>{highRiskRows.length || "Không rủi ro"}</Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={UserRound} label="Training ready" value={trainingReadyRows.length} meta="Đủ hồ sơ và có ca" tone={trainingReadyRows.length ? "green" : "neutral"} />
            <StaffOpsMetric icon={AlertTriangle} label="Thiếu setup" value={onboardingRows.length} meta="PIN, chi nhánh, HĐ, CCCD" tone={onboardingRows.length ? "orange" : "green"} />
            <StaffOpsMetric icon={MonitorSmartphone} label="Thu hồi kẹt" value={offboardingRows.length} meta="Thiết bị, phiên, request" tone={offboardingRows.length ? "red" : "green"} />
            <StaffOpsMetric icon={ShieldCheck} label="Request chờ" value={pendingApprovals.length} meta="Ảnh hưởng ca/công/lương" tone={pendingApprovals.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist vòng đời</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước khi mở rộng ca</h3>
            </div>
            <Pill tone={lifecycleChecklist.every((item) => item.value === 0) ? "green" : "orange"}>{lifecycleChecklist.filter((item) => item.value > 0).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {lifecycleChecklist.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "contracts") onOpenScreen("contracts");
                  if (item.id === "documents") onOpenScreen("documents");
                  if (item.id === "offboarding") onOpenScreen("devices");
                }}
                className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2 text-left hover:bg-[#FFF8EF]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.value ? "bg-[#FFF1DF] text-[#A85B14]" : "bg-[#E7F6EC] text-[#0F6A45]"}`}>
                    {item.value ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.value ? "text-[#A85B14]" : "text-[#0F6A45]"}`}>{item.value}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-3">
        <LifecycleQueue title="Onboarding cần xử lý" rows={onboardingRows.slice(0, 5)} empty="Không có onboarding bị kẹt." onOpenMember={onOpenMember} />
        <LifecycleQueue title="Sẵn sàng training" rows={trainingReadyRows.slice(0, 5)} empty="Chưa có nhân sự sẵn sàng training." onOpenMember={onOpenMember} tone="green" />
        <LifecycleQueue title="Offboarding cần thu hồi" rows={offboardingRows.slice(0, 5)} empty="Không có offboarding bị kẹt." onOpenMember={onOpenMember} tone="red" />
      </div>

      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.35fr)_130px_150px_130px_140px_100px]">
          <span>Nhân sự</span><span>Trạng thái</span><span>Hợp đồng/tài liệu</span><span>Thiết bị</span><span>Việc cần xử lý</span><span>Risk</span>
        </TableHead>
        {highRiskRows.map((row) => (
          <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "profile")} className="block w-full text-left">
            <TableRow className="grid-cols-[minmax(220px,1.35fr)_130px_150px_130px_140px_100px] hover:bg-[#FFF8EF]">
              <span className="min-w-0">
                <span className="block truncate font-black">{row.member.fullName}</span>
                <span className="block truncate text-[10px] font-bold text-[#756E64]">{row.member.roleTitle} · {row.member.primaryBranchName ?? "Chưa gán"}</span>
              </span>
              <span><Pill tone={badgeTone(row.member)}>{accountStatusLabel(row.member)}</Pill></span>
              <span className="font-bold text-[#5D554B]">{row.activeContract ? "Có HĐ" : "Thiếu HĐ"} · {row.hasIdentity ? "CCCD OK" : "Thiếu CCCD"}</span>
              <span>{row.assignedDevices.length} thiết bị</span>
              <span className="truncate">{[...row.onboardingGaps, ...row.offboardingGaps].join(", ") || "Sẵn sàng"}</span>
              <span><Pill tone={row.riskScore >= 70 ? "red" : row.riskScore >= 35 ? "orange" : "green"}>{row.riskScore}/100</Pill></span>
            </TableRow>
          </button>
        ))}
        {!highRiskRows.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có nhân sự rủi ro trong vòng đời hiện tại.</p> : null}
      </div>
    </StaffShellCard>
  );
}

function LifecycleQueue({
  title,
  rows,
  empty,
  onOpenMember,
  tone = "orange"
}: {
  title: string;
  rows: Array<{
    member: StaffOpsMember;
    onboardingGaps: string[];
    offboardingGaps: string[];
    assignedDevices: StaffOpsDeviceItem[];
    pendingRequests: StaffOpsApprovalItem[];
    riskScore: number;
  }>;
  empty: string;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  tone?: "green" | "orange" | "red";
}) {
  return (
    <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black text-[#0B3F31]">{title}</h3>
        <Pill tone={rows.length ? tone : "green"}>{rows.length || "Trống"}</Pill>
      </div>
      <div className="mt-2 grid gap-1.5">
        {rows.map((row) => (
          <button key={row.member.id} type="button" onClick={() => onOpenMember(row.member.id, "profile")} className="rounded-lg border border-[#EFE5D9] bg-[#FFF9F0] px-2.5 py-2 text-left hover:bg-[#FFF1DF]">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{row.member.fullName}</span>
                <span className="mt-0.5 block truncate text-[10px] font-bold text-[#756E64]">{row.member.roleTitle} · {row.member.primaryBranchName ?? "Chưa gán"}</span>
              </span>
              <Pill tone={row.riskScore >= 70 ? "red" : row.riskScore >= 35 ? "orange" : "green"}>{row.riskScore}</Pill>
            </div>
            <p className="mt-1 line-clamp-2 text-[10.5px] font-bold text-[#756E64]">
              {[...row.onboardingGaps, ...row.offboardingGaps].join(", ") || `${row.assignedDevices.length} thiết bị · ${row.pendingRequests.length} request`}
            </p>
          </button>
        ))}
        {!rows.length ? <p className="text-[11px] font-bold text-[#756E64]">{empty}</p> : null}
      </div>
    </section>
  );
}

function ContractsScreen({
  members,
  contracts,
  formAction,
  state,
  pending
}: {
  members: StaffOpsMember[];
  contracts: StaffOpsContractItem[];
  formAction: (payload: FormData) => void;
  state?: StaffActionState;
  pending: boolean;
}) {
  const today = todayInputValue();
  const [contractQuery, setContractQuery] = useState("");
  const [contractFilter, setContractFilter] = useState<"all" | "active" | "pending" | "unsigned" | "expiring">("all");
  const deferredContractQuery = useDeferredValue(contractQuery);
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  const signedContracts = contracts.filter((contract) => contract.eSignatureStatus === "signed");
  const pendingSignatureContracts = contracts.filter((contract) => contract.eSignatureStatus === "pending_employee" || contract.eSignatureStatus === "pending_employer");
  const unsignedContracts = contracts.filter((contract) => contract.eSignatureStatus !== "signed");
  const expiringContracts = contracts.filter((contract) => {
    if (!contract.endDate || contract.status !== "active") return false;
    const diffDays = Math.ceil((new Date(`${contract.endDate}T00:00:00.000Z`).getTime() - todayMs) / 86_400_000);
    return diffDays >= 0 && diffDays <= 30;
  });
  const activeMembersWithoutContract = members.filter((member) =>
    !member.isArchived &&
    member.employmentStatus === "active" &&
    !contracts.some((contract) => contract.staffMemberId === member.id && contract.status === "active")
  );
  const contractBlockers = contracts.filter((contract) =>
    contract.status === "draft" ||
    contract.eSignatureStatus === "draft" ||
    contract.eSignatureStatus === "pending_employee" ||
    contract.eSignatureStatus === "pending_employer" ||
    expiringContracts.some((item) => item.id === contract.id)
  );
  const contractReadinessScore = clampPercent(
    100 -
    activeMembersWithoutContract.length * 12 -
    pendingSignatureContracts.length * 8 -
    expiringContracts.length * 7 -
    contracts.filter((contract) => contract.status === "draft").length * 5
  );
  const contractChecklist = [
    {
      id: "active-contracts",
      label: "Nhân sự đang làm có hợp đồng hiệu lực",
      value: activeMembersWithoutContract.length,
      done: activeMembersWithoutContract.length === 0
    },
    {
      id: "signature",
      label: "Không còn hợp đồng chờ ký",
      value: pendingSignatureContracts.length,
      done: pendingSignatureContracts.length === 0
    },
    {
      id: "expiry",
      label: "Hợp đồng sắp hết hạn đã rà",
      value: expiringContracts.length,
      done: expiringContracts.length === 0
    },
    {
      id: "documents",
      label: "Có link bản đã ký khi cần",
      value: contracts.filter((contract) => contract.status === "active" && !contract.signedDocumentUrl).length,
      done: contracts.filter((contract) => contract.status === "active" && !contract.signedDocumentUrl).length === 0
    }
  ];
  const contractTypeRows = [
    { label: "Chính thức", value: contracts.filter((contract) => contract.contractType === "official").length },
    { label: "Thử việc", value: contracts.filter((contract) => contract.contractType === "probation").length },
    { label: "Part-time", value: contracts.filter((contract) => contract.contractType === "part_time").length },
    { label: "Dịch vụ/khác", value: contracts.filter((contract) => contract.contractType === "service" || contract.contractType === "other").length }
  ];
  const contractFilterCounts = {
    all: contracts.length,
    active: contracts.filter((contract) => contract.status === "active").length,
    pending: pendingSignatureContracts.length,
    unsigned: unsignedContracts.length,
    expiring: expiringContracts.length
  };
  const normalizedContractQuery = normalizeText(deferredContractQuery.trim());
  const filteredContracts = contracts.filter((contract) => {
    const matchesFilter =
      contractFilter === "all" ||
      (contractFilter === "active" && contract.status === "active") ||
      (contractFilter === "pending" && (contract.eSignatureStatus === "pending_employee" || contract.eSignatureStatus === "pending_employer")) ||
      (contractFilter === "unsigned" && contract.eSignatureStatus !== "signed") ||
      (contractFilter === "expiring" && expiringContracts.some((item) => item.id === contract.id));
    if (!matchesFilter) return false;
    if (!normalizedContractQuery) return true;

    const template = getStaffContractTemplate(contract.templateCode);
    return normalizeText([
      contract.staffName,
      contract.jobTitle ?? "",
      contract.contractNumber ?? "",
      template.title,
      contractTypeLabel(contract.contractType),
      contractStatusLabel(contract.status),
      contractSignatureLabel(contract.eSignatureStatus)
    ].join(" ")).includes(normalizedContractQuery);
  });

  return (
    <StaffShellCard index="7" title="Hợp đồng" subtitle="Mẫu hợp đồng điện tử cho nhân sự quán" action={<button type="submit" form="staff-contract-form" disabled={pending || members.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-50"><Plus size={12} />Tạo hợp đồng</button>}>
      <form id="staff-contract-form" action={formAction} className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 md:grid-cols-6">
        <select name="staffMemberId" required className="staff-field-input">
          <option value="">Chọn nhân sự</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
        <select name="templateCode" className="staff-field-input md:col-span-2">
          {STAFF_CONTRACT_TEMPLATES.map((template) => (
            <option key={template.code} value={template.code}>{template.title}</option>
          ))}
        </select>
        <input name="contractNumber" placeholder="Số HĐ" className="staff-field-input" />
        <input name="startDate" type="date" defaultValue={today} className="staff-field-input" />
        <input name="endDate" type="date" className="staff-field-input" />
        <input name="jobTitle" placeholder="Vị trí: Phục vụ, Thu ngân..." className="staff-field-input" />
        <input name="workLocation" placeholder="Địa điểm/chi nhánh làm việc" className="staff-field-input md:col-span-2" />
        <input name="salaryAmount" type="number" min="0" step="1000" placeholder="Lương VND" className="staff-field-input" />
        <input name="salaryPaymentMethod" placeholder="Kỳ trả lương" className="staff-field-input" />
        <select name="eSignatureStatus" className="staff-field-input">
          <option value="draft">Bản nháp</option>
          <option value="pending_employee">Chờ nhân viên ký</option>
          <option value="pending_employer">Chờ quán ký</option>
          <option value="signed">Đã ký</option>
        </select>
        <input name="workingTime" placeholder="Thời giờ làm việc, xoay ca nếu có" className="staff-field-input md:col-span-3" />
        <input name="restTime" placeholder="Nghỉ giữa ca/nghỉ tuần" className="staff-field-input md:col-span-3" />
        <input name="eContractProvider" placeholder="Nhà cung cấp eContract" className="staff-field-input" />
        <input name="eContractId" placeholder="Mã giao dịch ký" className="staff-field-input" />
        <input name="signedDocumentUrl" placeholder="Link bản đã ký" className="staff-field-input md:col-span-2" />
        <input name="note" placeholder="Ghi chú nội bộ" className="staff-field-input md:col-span-2" />
        <div className="rounded-xl border border-[#E9DED0] bg-white/75 p-2 text-[10.5px] font-bold leading-relaxed text-[#6F675C] md:col-span-6">
          LogiVN tạo template riêng theo nội dung bắt buộc của hợp đồng lao động Việt Nam: thông tin hai bên, công việc, địa điểm, thời hạn, lương, thời giờ làm việc/nghỉ ngơi, bảo hiểm, đào tạo và lịch sử ký điện tử.
        </div>
        <div className="md:col-span-6"><ActionNotice state={state} /></div>
      </form>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Tổng hợp đồng" value={contracts.length} />
        <StatTile label="Đã ký" value={signedContracts.length} tone={signedContracts.length === contracts.length && contracts.length ? "green" : "neutral"} />
        <StatTile label="Chờ ký" value={pendingSignatureContracts.length} tone={pendingSignatureContracts.length ? "orange" : "green"} />
        <StatTile label="Sắp hết hạn" value={expiringContracts.length} tone={expiringContracts.length ? "orange" : "green"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Contract compliance</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Sẵn sàng pháp lý nhân sự</h3>
            </div>
            <Pill tone={contractReadinessScore >= 90 ? "green" : contractReadinessScore >= 75 ? "orange" : "red"}>{contractReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={BriefcaseBusiness} label="Thiếu HĐ hiệu lực" value={activeMembersWithoutContract.length} meta="Nhân sự active chưa có HĐ" tone={activeMembersWithoutContract.length ? "orange" : "green"} />
            <StaffOpsMetric icon={ShieldCheck} label="Chờ ký" value={pendingSignatureContracts.length} meta="Nhân viên/quán chưa ký" tone={pendingSignatureContracts.length ? "orange" : "green"} />
            <StaffOpsMetric icon={Clock3} label="Sắp hết hạn" value={expiringContracts.length} meta="Trong 30 ngày tới" tone={expiringContracts.length ? "orange" : "green"} />
            <StaffOpsMetric icon={FileText} label="Kẹt hồ sơ" value={contractBlockers.length} meta="Nháp, chờ ký, sắp hạn" tone={contractBlockers.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist hợp đồng</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước khi scale ca</h3>
            </div>
            <Pill tone={contractChecklist.every((item) => item.done) ? "green" : "orange"}>{contractChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {contractChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {contractTypeRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">{row.label}</p>
              <p className="mt-0.5 text-lg font-black text-[#0B3F31]">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input value={contractQuery} onChange={(event) => setContractQuery(event.target.value)} placeholder="Tìm hợp đồng, nhân viên, số HĐ..." className="staff-field-input h-9 pl-8" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Tất cả"],
              ["active", "Hiệu lực"],
              ["pending", "Chờ ký"],
              ["unsigned", "Chưa ký"],
              ["expiring", "Sắp hạn"]
            ].map(([key, label]) => {
              const active = contractFilter === key;
              return (
                <button key={key} type="button" onClick={() => setContractFilter(key as typeof contractFilter)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{contractFilterCounts[key as typeof contractFilter]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(190px,1.35fr)_190px_120px_120px_110px_130px]">
          <span>Nhân viên</span><span>Mẫu hợp đồng</span><span>Bắt đầu</span><span>Kết thúc</span><span>Ký điện tử</span><span>Trạng thái</span>
        </TableHead>
        {filteredContracts.map((contract) => {
          const template = getStaffContractTemplate(contract.templateCode);
          return (
            <TableRow key={contract.id} className="grid-cols-[minmax(190px,1.35fr)_190px_120px_120px_110px_130px]">
              <span>
                <span className="block font-black">{contract.staffName}</span>
                <span className="block text-[10.5px] font-bold text-[#756E64]">{contract.jobTitle || contractTypeLabel(contract.contractType)}</span>
              </span>
              <span>
                <span className="block font-black">{template.title}</span>
                <span className="block text-[10.5px] font-bold text-[#756E64]">{contract.contractNumber || "Chưa có số HĐ"}</span>
              </span>
              <span>{formatDate(contract.startDate)}</span>
              <span>{contract.endDate ? formatDate(contract.endDate) : "Không thời hạn"}</span>
              <span><Pill tone={contractSignatureTone(contract.eSignatureStatus)}>{contractSignatureLabel(contract.eSignatureStatus)}</Pill></span>
              <span>
                <span className="flex flex-wrap items-center gap-1">
                  <Pill tone={contractStatusTone(contract.status)}>{contractStatusLabel(contract.status)}</Pill>
                  {contract.signedDocumentUrl ? <a href={contract.signedDocumentUrl} target="_blank" rel="noreferrer" className="text-[10.5px] font-black text-[#0F4D3A] underline">Xem</a> : null}
                </span>
              </span>
            </TableRow>
          );
        })}
        {!filteredContracts.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có hợp đồng khớp bộ lọc.</p> : null}
      </div>
    </StaffShellCard>
  );
}

function DocumentsScreen({
  members,
  documents,
  formAction,
  state,
  pending
}: {
  members: StaffOpsMember[];
  documents: StaffOpsDocumentItem[];
  formAction: (payload: FormData) => void;
  state?: StaffActionState;
  pending: boolean;
}) {
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentFilter, setDocumentFilter] = useState<"all" | "missing" | "expired" | "complete" | "identity">("all");
  const deferredDocumentQuery = useDeferredValue(documentQuery);
  const missingDocuments = documents.filter((document) => document.status === "missing");
  const expiredDocuments = documents.filter((document) => document.status === "expired");
  const completeDocuments = documents.filter((document) => document.status === "complete");
  const identityDocuments = documents.filter((document) => document.documentType === "identity_card");
  const activeMembers = members.filter((member) => member.employmentStatus === "active" && !member.isArchived);
  const membersWithoutIdentity = activeMembers.filter((member) =>
    !documents.some((document) => document.staffMemberId === member.id && document.documentType === "identity_card" && document.status === "complete")
  );
  const membersWithoutContractDoc = activeMembers.filter((member) =>
    !documents.some((document) => document.staffMemberId === member.id && document.documentType === "contract" && document.status === "complete")
  );
  const documentReadinessScore = clampPercent(
    100 -
    missingDocuments.length * 8 -
    expiredDocuments.length * 10 -
    membersWithoutIdentity.length * 12 -
    membersWithoutContractDoc.length * 6
  );
  const documentChecklist = [
    {
      id: "identity",
      label: "CCCD nhân sự active đã đủ",
      value: membersWithoutIdentity.length,
      done: membersWithoutIdentity.length === 0
    },
    {
      id: "contract-doc",
      label: "Bản hợp đồng đã lưu",
      value: membersWithoutContractDoc.length,
      done: membersWithoutContractDoc.length === 0
    },
    {
      id: "missing",
      label: "Không còn tài liệu thiếu",
      value: missingDocuments.length,
      done: missingDocuments.length === 0
    },
    {
      id: "expired",
      label: "Không còn tài liệu hết hạn",
      value: expiredDocuments.length,
      done: expiredDocuments.length === 0
    }
  ];
  const documentTypeRows = [
    { label: "CCCD", value: identityDocuments.length, tone: membersWithoutIdentity.length ? "orange" : "green" },
    { label: "Hợp đồng", value: documents.filter((document) => document.documentType === "contract").length, tone: membersWithoutContractDoc.length ? "orange" : "green" },
    { label: "Sức khoẻ", value: documents.filter((document) => document.documentType === "health_certificate").length, tone: "neutral" },
    { label: "Đào tạo", value: documents.filter((document) => document.documentType === "training").length, tone: "neutral" }
  ] satisfies Array<{ label: string; value: number; tone: "green" | "orange" | "red" | "neutral" }>;
  const documentFilterCounts = {
    all: documents.length,
    missing: missingDocuments.length,
    expired: expiredDocuments.length,
    complete: completeDocuments.length,
    identity: identityDocuments.length
  };
  const normalizedDocumentQuery = normalizeText(deferredDocumentQuery.trim());
  const filteredDocuments = documents.filter((document) => {
    const matchesFilter =
      documentFilter === "all" ||
      (documentFilter === "missing" && document.status === "missing") ||
      (documentFilter === "expired" && document.status === "expired") ||
      (documentFilter === "complete" && document.status === "complete") ||
      (documentFilter === "identity" && document.documentType === "identity_card");
    if (!matchesFilter) return false;
    if (!normalizedDocumentQuery) return true;

    return normalizeText([
      document.documentName,
      document.staffName,
      documentTypeLabel(document.documentType),
      documentStatusLabel(document.status),
      document.note ?? ""
    ].join(" ")).includes(normalizedDocumentQuery);
  });

  return (
    <StaffShellCard index="8" title="Tài liệu" subtitle="Quản lý tài liệu và giấy tờ nhân viên" action={<button type="submit" form="staff-document-form" disabled={pending || members.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-50"><Plus size={12} />Thêm tài liệu</button>}>
      <form id="staff-document-form" action={formAction} className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 md:grid-cols-[1.2fr_1.2fr_1fr_1.4fr]">
        <select name="staffMemberId" required className="staff-field-input">
          <option value="">Chọn nhân sự</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
        <input name="documentName" required placeholder="Tên tài liệu" className="staff-field-input" />
        <select name="documentType" className="staff-field-input">
          <option value="identity_card">CCCD</option>
          <option value="health_certificate">Sức khoẻ</option>
          <option value="contract">Hợp đồng</option>
          <option value="training">Đào tạo</option>
          <option value="other">Khác</option>
        </select>
        <input name="fileUrl" placeholder="Link tài liệu nếu có" className="staff-field-input" />
        <div className="md:col-span-4"><ActionNotice state={state} /></div>
      </form>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Tài liệu" value={documents.length} />
        <StatTile label="Đã đủ" value={completeDocuments.length} />
        <StatTile label="Thiếu" value={missingDocuments.length} tone={missingDocuments.length ? "red" : "green"} />
        <StatTile label="Hết hạn" value={expiredDocuments.length} tone={expiredDocuments.length ? "orange" : "green"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Document readiness</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Hồ sơ nhân sự có đủ để vận hành</h3>
            </div>
            <Pill tone={documentReadinessScore >= 90 ? "green" : documentReadinessScore >= 75 ? "orange" : "red"}>{documentReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={FileText} label="Thiếu CCCD" value={membersWithoutIdentity.length} meta="Nhân sự active" tone={membersWithoutIdentity.length ? "orange" : "green"} />
            <StaffOpsMetric icon={BriefcaseBusiness} label="Thiếu HĐ lưu" value={membersWithoutContractDoc.length} meta="Bản hợp đồng trong hồ sơ" tone={membersWithoutContractDoc.length ? "orange" : "green"} />
            <StaffOpsMetric icon={AlertTriangle} label="Thiếu giấy tờ" value={missingDocuments.length} meta="Tài liệu marked missing" tone={missingDocuments.length ? "red" : "green"} />
            <StaffOpsMetric icon={Clock3} label="Hết hạn" value={expiredDocuments.length} meta="Cần cập nhật lại" tone={expiredDocuments.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist hồ sơ</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước khi training/quyền</h3>
            </div>
            <Pill tone={documentChecklist.every((item) => item.done) ? "green" : "orange"}>{documentChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {documentChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {documentTypeRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">{row.label}</p>
                <Pill tone={row.tone}>{row.value}</Pill>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Tìm tài liệu, nhân viên, loại giấy tờ..." className="staff-field-input h-9 pl-8" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Tất cả"],
              ["missing", "Thiếu"],
              ["expired", "Hết hạn"],
              ["complete", "Đã đủ"],
              ["identity", "CCCD"]
            ].map(([key, label]) => {
              const active = documentFilter === key;
              return (
                <button key={key} type="button" onClick={() => setDocumentFilter(key as typeof documentFilter)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{documentFilterCounts[key as typeof documentFilter]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.5fr)_150px_150px_120px_150px]">
          <span>Tên tài liệu</span><span>Loại tài liệu</span><span>Nhân sự</span><span>Trạng thái</span><span>Ngày thêm</span>
        </TableHead>
        {filteredDocuments.map((document) => (
          <TableRow key={document.id} className="grid-cols-[minmax(220px,1.5fr)_150px_150px_120px_150px]">
            <span className="flex min-w-0 items-center gap-2">
              <FileText size={15} className="shrink-0 text-[#0F4D3A]" />
              {document.fileUrl ? <a href={document.fileUrl} className="truncate font-black underline-offset-2 hover:underline">{document.documentName}</a> : <span className="truncate font-black">{document.documentName}</span>}
            </span>
            <span>{documentTypeLabel(document.documentType)}</span>
            <span className="truncate">{document.staffName}</span>
            <span><Pill tone={documentStatusTone(document.status)}>{documentStatusLabel(document.status)}</Pill></span>
            <span>{formatDate(document.createdAt)}</span>
          </TableRow>
        ))}
        {!filteredDocuments.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có tài liệu khớp bộ lọc.</p> : null}
      </div>
    </StaffShellCard>
  );
}

function DevicesScreen({
  members,
  devices,
  formAction,
  state,
  pending
}: {
  members: StaffOpsMember[];
  devices: StaffOpsDeviceItem[];
  formAction: (payload: FormData) => void;
  state?: StaffActionState;
  pending: boolean;
}) {
  const today = todayInputValue();
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "assigned" | "stock" | "maintenance" | "lost">("all");
  const deferredDeviceQuery = useDeferredValue(deviceQuery);
  const assignedDevices = devices.filter((device) => device.status === "assigned");
  const stockDevices = devices.filter((device) => device.status === "returned" || !device.staffMemberId);
  const maintenanceDevices = devices.filter((device) => device.status === "maintenance");
  const lostDevices = devices.filter((device) => device.status === "lost");
  const missingSerialDevices = devices.filter((device) => !device.serialNumber?.trim());
  const sharedPosDevices = devices.filter((device) => (device.deviceType === "pos" || device.deviceType === "tablet" || device.deviceType === "cash_drawer") && !device.staffMemberId && device.status === "assigned");
  const deviceReadinessScore = clampPercent(
    100 -
    lostDevices.length * 18 -
    maintenanceDevices.length * 10 -
    missingSerialDevices.length * 5 -
    sharedPosDevices.length * 8
  );
  const deviceChecklist = [
    {
      id: "lost",
      label: "Không có thiết bị thất lạc",
      value: lostDevices.length,
      done: lostDevices.length === 0
    },
    {
      id: "maintenance",
      label: "Thiết bị bảo trì đã xử lý",
      value: maintenanceDevices.length,
      done: maintenanceDevices.length === 0
    },
    {
      id: "serial",
      label: "Serial/IMEI đã nhập đủ",
      value: missingSerialDevices.length,
      done: missingSerialDevices.length === 0
    },
    {
      id: "ownership",
      label: "POS/tablet có người phụ trách",
      value: sharedPosDevices.length,
      done: sharedPosDevices.length === 0
    }
  ];
  const deviceTypeRows = [
    { label: "Điện thoại", value: devices.filter((device) => device.deviceType === "phone").length },
    { label: "Tablet", value: devices.filter((device) => device.deviceType === "tablet").length },
    { label: "POS", value: devices.filter((device) => device.deviceType === "pos").length },
    { label: "Két tiền", value: devices.filter((device) => device.deviceType === "cash_drawer").length }
  ];
  const deviceFilterCounts = {
    all: devices.length,
    assigned: assignedDevices.length,
    stock: stockDevices.length,
    maintenance: maintenanceDevices.length,
    lost: lostDevices.length
  };
  const normalizedDeviceQuery = normalizeText(deferredDeviceQuery.trim());
  const filteredDevices = devices.filter((device) => {
    const matchesFilter =
      deviceFilter === "all" ||
      (deviceFilter === "assigned" && device.status === "assigned") ||
      (deviceFilter === "stock" && (device.status === "returned" || !device.staffMemberId)) ||
      (deviceFilter === "maintenance" && device.status === "maintenance") ||
      (deviceFilter === "lost" && device.status === "lost");
    if (!matchesFilter) return false;
    if (!normalizedDeviceQuery) return true;

    return normalizeText([
      device.deviceName,
      device.staffName ?? "Kho chung",
      device.serialNumber ?? "",
      deviceTypeLabel(device.deviceType),
      deviceStatusLabel(device.status),
      device.note ?? ""
    ].join(" ")).includes(normalizedDeviceQuery);
  });

  return (
    <StaffShellCard index="9" title="Thiết bị" subtitle="Thiết bị được cấp và phiên đăng nhập" action={<button type="submit" form="staff-device-form" disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-50"><Plus size={12} />Cấp thiết bị</button>}>
      <form id="staff-device-form" action={formAction} className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 md:grid-cols-[1.2fr_1.2fr_1fr_1fr_130px]">
        <select name="staffMemberId" className="staff-field-input">
          <option value="">Kho chung</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
        <input name="deviceName" required placeholder="Tên thiết bị" className="staff-field-input" />
        <select name="deviceType" className="staff-field-input">
          <option value="phone">Điện thoại</option>
          <option value="tablet">Máy tính bảng</option>
          <option value="pos">Máy POS</option>
          <option value="cash_drawer">Két tiền</option>
          <option value="other">Khác</option>
        </select>
        <input name="serialNumber" placeholder="Serial/IMEI" className="staff-field-input" />
        <input name="issuedAt" type="date" defaultValue={today} className="staff-field-input" />
        <div className="md:col-span-5"><ActionNotice state={state} /></div>
      </form>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-4">
        <StatTile label="Thiết bị" value={devices.length} />
        <StatTile label="Đang cấp" value={assignedDevices.length} />
        <StatTile label="Kho chung" value={stockDevices.length} tone="neutral" />
        <StatTile label="Rủi ro" value={lostDevices.length + maintenanceDevices.length} tone={lostDevices.length ? "red" : maintenanceDevices.length ? "orange" : "green"} />
      </div>

      <div className="grid gap-2 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Asset control</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Thiết bị vận hành có truy vết</h3>
            </div>
            <Pill tone={deviceReadinessScore >= 90 ? "green" : deviceReadinessScore >= 75 ? "orange" : "red"}>{deviceReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StaffOpsMetric icon={MonitorSmartphone} label="Đang cấp" value={assignedDevices.length} meta="Có người/ca sử dụng" tone={assignedDevices.length ? "green" : "neutral"} />
            <StaffOpsMetric icon={AlertTriangle} label="Thất lạc" value={lostDevices.length} meta="Cần khoá/thu hồi" tone={lostDevices.length ? "red" : "green"} />
            <StaffOpsMetric icon={RefreshCw} label="Bảo trì" value={maintenanceDevices.length} meta="Không dùng giờ cao điểm" tone={maintenanceDevices.length ? "orange" : "green"} />
            <StaffOpsMetric icon={Fingerprint} label="Thiếu serial" value={missingSerialDevices.length} meta="Khó truy vết tài sản" tone={missingSerialDevices.length ? "orange" : "green"} />
          </div>
        </section>

        <aside className="rounded-xl border border-[#E8DED0] bg-[#FFFCF6] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist tài sản</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Trước giờ cao điểm</h3>
            </div>
            <Pill tone={deviceChecklist.every((item) => item.done) ? "green" : "orange"}>{deviceChecklist.filter((item) => !item.done).length || "Xong"}</Pill>
          </div>
          <div className="mt-3 grid gap-1.5">
            {deviceChecklist.map((item) => (
              <div key={item.id} className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-[#E7F6EC] text-[#0F6A45]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  <span className="truncate text-[11px] font-black text-[#2D2924]">{item.label}</span>
                </span>
                <span className={`shrink-0 text-xs font-black ${item.done ? "text-[#0F6A45]" : "text-[#A85B14]"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {deviceTypeRows.map((row) => (
            <div key={row.label} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756E64]">{row.label}</p>
              <p className="mt-0.5 text-lg font-black text-[#0B3F31]">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder="Tìm thiết bị, serial, người dùng..." className="staff-field-input h-9 pl-8" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Tất cả"],
              ["assigned", "Đang cấp"],
              ["stock", "Kho chung"],
              ["maintenance", "Bảo trì"],
              ["lost", "Thất lạc"]
            ].map(([key, label]) => {
              const active = deviceFilter === key;
              return (
                <button key={key} type="button" onClick={() => setDeviceFilter(key as typeof deviceFilter)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}>
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{deviceFilterCounts[key as typeof deviceFilter]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.5fr)_160px_170px_120px_130px]">
          <span>Thiết bị</span><span>Loại thiết bị</span><span>Người cấp/đang dùng</span><span>Trạng thái</span><span>Ngày cấp</span>
        </TableHead>
        {filteredDevices.map((device) => (
          <TableRow key={device.id} className="grid-cols-[minmax(220px,1.5fr)_160px_170px_120px_130px]">
            <span className="flex min-w-0 items-center gap-2">
              <MonitorSmartphone size={15} className="shrink-0 text-[#0F4D3A]" />
              <span className="min-w-0">
                <span className="block truncate font-black">{device.deviceName}</span>
                <span className="block truncate text-[10px] font-bold text-[#756E64]">{device.serialNumber ?? "Chưa có serial"}</span>
              </span>
            </span>
            <span>{deviceTypeLabel(device.deviceType)}</span>
            <span className="truncate">{device.staffName ?? "Kho chung"}</span>
            <span><Pill tone={deviceStatusTone(device.status)}>{deviceStatusLabel(device.status)}</Pill></span>
            <span>{formatDate(device.issuedAt)}</span>
          </TableRow>
        ))}
        {!filteredDevices.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có thiết bị khớp bộ lọc.</p> : null}
      </div>
    </StaffShellCard>
  );
}

type BranchCommandFilterKey = "all" | "pressure" | "coverage" | "payroll" | "risk";

function BranchCommandCenterScreen({
  bundle,
  members,
  approvals,
  onOpenMember,
  onOpenScreen
}: {
  bundle: StaffOperationsBundle;
  members: StaffOpsMember[];
  approvals: StaffOpsApprovalItem[];
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen: (screen: StaffScreenKey) => void;
}) {
  const [branchFilter, setBranchFilter] = useState<BranchCommandFilterKey>("all");
  const [selectedBranchId, setSelectedBranchId] = useState(bundle.branches[0]?.id ?? "unassigned");
  const branchLookup = new Map(bundle.branches.map((branch) => [branch.id, branch]));
  const memberBranchName = (member: StaffOpsMember) => member.primaryBranchName ?? "Chưa gán chi nhánh";
  const branchRows = [
    ...bundle.branches.map((branch) => {
      const branchMembers = members.filter((member) => member.primaryBranchId === branch.id || member.branchNames.includes(branch.name));
      const branchApprovals = approvals.filter((approval) => approval.branchName === branch.name);
      const branchAssignments = bundle.shiftAssignments.filter((assignment) => assignment.branchId === branch.id || assignment.branchName === branch.name);
      const branchTimesheets = bundle.timesheets.filter((timesheet) => timesheet.branchName === branch.name);
      const activeMembers = branchMembers.filter((member) => member.employmentStatus === "active" && !member.isArchived);
      const onlineMembers = branchMembers.filter((member) => member.activeSessionCount > 0);
      const noPinMembers = branchMembers.filter((member) => !member.hasPin);
      const lateMembers = branchMembers.filter((member) => member.lateMinutesToday > 0 || member.todayAttendanceState === "late");
      const riskMembers = branchMembers.filter((member) => member.suspiciousScore >= 40);
      const assignedCount = branchAssignments.filter((assignment) => assignment.status !== "cancelled").length;
      const confirmedCount = branchAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed").length;
      const payrollPending = branchTimesheets.reduce((sum, item) => sum + item.pendingApprovals, 0);
      const workMinutes = branchTimesheets.reduce((sum, item) => sum + item.workMinutes, 0);
      const overtimeMinutes = branchTimesheets.reduce((sum, item) => sum + item.overtimeMinutes, 0);
      const lateMinutes = branchTimesheets.reduce((sum, item) => sum + item.lateMinutes, 0);
      const averageScore = branchTimesheets.length
        ? Math.round(branchTimesheets.reduce((sum, item) => sum + item.attendanceScore, 0) / branchTimesheets.length)
        : 100;
      const readinessScore = clampPercent(
        branch.coverageScore -
        branchApprovals.length * 5 -
        noPinMembers.length * 7 -
        riskMembers.length * 9 -
        lateMembers.length * 4 -
        payrollPending * 4
      );
      const pressureScore = branchPressure(branch) + branchApprovals.length * 3 + payrollPending * 3 + noPinMembers.length * 2;

      return {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        isPrimary: branch.isPrimary,
        coverageScore: branch.coverageScore,
        readinessScore,
        pressureScore,
        activeMembers,
        onlineMembers,
        noPinMembers,
        lateMembers,
        riskMembers,
        approvals: branchApprovals,
        assignments: branchAssignments,
        assignedCount,
        confirmedCount,
        payrollPending,
        workMinutes,
        overtimeMinutes,
        lateMinutes,
        averageScore
      };
    }),
    (() => {
      const branchMembers = members.filter((member) => !member.primaryBranchId);
      const branchApprovals = approvals.filter((approval) => !approval.branchName);
      const branchTimesheets = bundle.timesheets.filter((timesheet) => !timesheet.branchName);
      const riskMembers = branchMembers.filter((member) => member.suspiciousScore >= 40);
      const noPinMembers = branchMembers.filter((member) => !member.hasPin);
      const lateMembers = branchMembers.filter((member) => member.lateMinutesToday > 0 || member.todayAttendanceState === "late");
      const payrollPending = branchTimesheets.reduce((sum, item) => sum + item.pendingApprovals, 0);
      const workMinutes = branchTimesheets.reduce((sum, item) => sum + item.workMinutes, 0);
      const overtimeMinutes = branchTimesheets.reduce((sum, item) => sum + item.overtimeMinutes, 0);
      const lateMinutes = branchTimesheets.reduce((sum, item) => sum + item.lateMinutes, 0);
      const averageScore = branchTimesheets.length
        ? Math.round(branchTimesheets.reduce((sum, item) => sum + item.attendanceScore, 0) / branchTimesheets.length)
        : 100;
      const readinessScore = clampPercent(100 - branchMembers.length * 12 - branchApprovals.length * 5 - riskMembers.length * 10 - payrollPending * 4);

      return {
        id: "unassigned",
        name: "Chưa gán chi nhánh",
        address: "Nhân sự cần đưa về chi nhánh trước khi xếp ca",
        isPrimary: false,
        coverageScore: branchMembers.length ? 0 : 100,
        readinessScore,
        pressureScore: branchMembers.length * 12 + branchApprovals.length * 5 + payrollPending * 3,
        activeMembers: branchMembers.filter((member) => member.employmentStatus === "active" && !member.isArchived),
        onlineMembers: branchMembers.filter((member) => member.activeSessionCount > 0),
        noPinMembers,
        lateMembers,
        riskMembers,
        approvals: branchApprovals,
        assignments: [],
        assignedCount: 0,
        confirmedCount: 0,
        payrollPending,
        workMinutes,
        overtimeMinutes,
        lateMinutes,
        averageScore
      };
    })()
  ].filter((row) => row.id !== "unassigned" || row.activeMembers.length || row.approvals.length || row.payrollPending);

  const selectedBranch = branchRows.find((row) => row.id === selectedBranchId) ?? branchRows[0] ?? null;
  const filteredBranchRows = branchRows
    .filter((row) => {
      if (branchFilter === "pressure") return row.pressureScore > 0 || row.approvals.length > 0;
      if (branchFilter === "coverage") return row.coverageScore < 85 || row.confirmedCount < row.assignedCount;
      if (branchFilter === "payroll") return row.payrollPending > 0 || row.overtimeMinutes > 0 || row.lateMinutes > 0;
      if (branchFilter === "risk") return row.riskMembers.length > 0 || row.noPinMembers.length > 0;
      return true;
    })
    .sort((left, right) => right.pressureScore - left.pressureScore || left.readinessScore - right.readinessScore);
  const totalOnline = branchRows.reduce((sum, row) => sum + row.onlineMembers.length, 0);
  const totalBranchStaff = branchRows.reduce((sum, row) => sum + row.activeMembers.length, 0);
  const totalPressure = branchRows.filter((row) => row.pressureScore > 0).length;
  const totalPayrollPending = branchRows.reduce((sum, row) => sum + row.payrollPending, 0);
  const averageReadiness = branchRows.length ? Math.round(branchRows.reduce((sum, row) => sum + row.readinessScore, 0) / branchRows.length) : 100;
  const filterOptions: Array<{ key: BranchCommandFilterKey; label: string; count: number }> = [
    { key: "all", label: "Tất cả", count: branchRows.length },
    { key: "pressure", label: "Áp lực", count: branchRows.filter((row) => row.pressureScore > 0 || row.approvals.length > 0).length },
    { key: "coverage", label: "Thiếu phủ ca", count: branchRows.filter((row) => row.coverageScore < 85 || row.confirmedCount < row.assignedCount).length },
    { key: "payroll", label: "Kẹt payroll", count: branchRows.filter((row) => row.payrollPending > 0 || row.overtimeMinutes > 0 || row.lateMinutes > 0).length },
    { key: "risk", label: "Rủi ro hồ sơ", count: branchRows.filter((row) => row.riskMembers.length > 0 || row.noPinMembers.length > 0).length }
  ];
  const selectedStaff = selectedBranch ? members.filter((member) => memberBranchName(member) === selectedBranch.name || (selectedBranch.id !== "unassigned" && member.primaryBranchId === selectedBranch.id)) : [];
  const branchAiInsights = buildStaffAiInsights({ bundle, members, approvals, limit: 4 });
  const transferCandidates = members
    .filter((member) => member.employmentStatus === "active" && !member.isArchived && member.activeSessionCount === 0 && member.suspiciousScore < 40)
    .sort((left, right) => left.suspiciousScore - right.suspiciousScore || left.fullName.localeCompare(right.fullName))
    .slice(0, 5);

  return (
    <StaffShellCard index="13" title="Chuỗi & chi nhánh" subtitle="Điều phối nhân sự, phủ ca, request và payroll theo từng chi nhánh" action={<Pill tone={averageReadiness >= 85 ? "green" : averageReadiness >= 70 ? "orange" : "red"}>{averageReadiness}/100 readiness</Pill>}>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Chi nhánh" value={bundle.branches.length} />
        <StatTile label="Nhân sự active" value={totalBranchStaff} />
        <StatTile label="Online" value={totalOnline} tone={totalOnline ? "green" : "neutral"} />
        <StatTile label="Chi nhánh áp lực" value={totalPressure} tone={totalPressure ? "orange" : "green"} />
        <StatTile label="Payroll kẹt" value={totalPayrollPending} tone={totalPayrollPending ? "orange" : "green"} />
        <StatTile label="Readiness TB" value={`${averageReadiness}%`} tone={averageReadiness >= 85 ? "green" : averageReadiness >= 70 ? "orange" : "red"} />
      </div>

      <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch command center</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Ưu tiên điều phối trong ngày</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filterOptions.map((item) => {
                const active = branchFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setBranchFilter(item.key)}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[10.5px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-[#FFFCF6] text-[#756E64]"}`}
                  >
                    {item.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-white/20 text-white" : "bg-[#F5EFE8] text-[#756E64]"}`}>{item.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {filteredBranchRows.map((row) => {
              const readinessTone = row.readinessScore >= 85 ? "green" : row.readinessScore >= 70 ? "orange" : "red";
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedBranchId(row.id)}
                  className={`rounded-xl border p-3 text-left transition hover:border-[#0F4D3A]/30 ${selectedBranch?.id === row.id ? "border-[#0F4D3A]/40 bg-[#E8F5EC]" : "border-[#E8DED0] bg-[#FFF9F0]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#2D2924]">{row.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-bold text-[#756E64]">{row.isPrimary ? "Chi nhánh chính" : row.address}</span>
                    </span>
                    <Pill tone={readinessTone}>{row.readinessScore}%</Pill>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#EFE5D9]">
                    <div className={`h-full rounded-full ${readinessTone === "green" ? "bg-[#0F4D3A]" : readinessTone === "orange" ? "bg-[#E08A2E]" : "bg-[#C2410C]"}`} style={{ width: `${Math.max(6, row.readinessScore)}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                    <MiniMetric label="Online" value={row.onlineMembers.length} tone={row.onlineMembers.length ? "green" : "neutral"} />
                    <MiniMetric label="Phủ ca" value={`${row.confirmedCount}/${row.assignedCount}`} tone={row.confirmedCount < row.assignedCount ? "orange" : "green"} />
                    <MiniMetric label="Duyệt" value={row.approvals.length} tone={row.approvals.length ? "orange" : "green"} />
                    <MiniMetric label="Risk" value={row.riskMembers.length + row.noPinMembers.length} tone={row.riskMembers.length || row.noPinMembers.length ? "red" : "green"} />
                  </div>
                </button>
              );
            })}
            {!filteredBranchRows.length ? (
              <div className="rounded-xl border border-dashed border-[#E8DED0] bg-[#FFFCF6] p-4 text-center md:col-span-2 2xl:col-span-3">
                <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
                <p className="mt-1 text-sm font-black text-[#0B3F31]">Không có chi nhánh khớp bộ lọc</p>
                <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Các chi nhánh đang ổn theo tiêu chí hiện tại.</p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="grid gap-3">
          <StaffAiAssistantPanel
            insights={branchAiInsights}
            title="AI điều phối chuỗi"
            subtitle="Thiếu ca, duyệt request, payroll và rủi ro"
            compact
            onOpenMember={onOpenMember}
            onOpenScreen={onOpenScreen}
          />

          <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Transfer pool</p>
                <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Nhân sự có thể điều phối</h3>
              </div>
              <Pill>{transferCandidates.length}</Pill>
            </div>
            <div className="mt-2 grid gap-1.5">
              {transferCandidates.map((member) => (
                <button key={member.id} type="button" onClick={() => onOpenMember(member.id, "profile")} className="flex min-h-[48px] items-center gap-2 rounded-lg border border-[#E9DED0] bg-[#FFF9F0] px-2 py-1.5 text-left transition hover:border-[#0F4D3A]/30">
                  <StaffAvatar member={member} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{member.fullName}</span>
                    <span className="block truncate text-[10px] font-bold text-[#756E64]">{member.roleTitle} · {member.primaryBranchName ?? "Chưa gán"}</span>
                  </span>
                  <Pill tone={member.hasPin ? "green" : "orange"}>{member.hasPin ? "PIN" : "Thiếu PIN"}</Pill>
                </button>
              ))}
              {!transferCandidates.length ? <p className="rounded-lg border border-dashed border-[#E8DED0] bg-[#FFF9F0] p-3 text-[11px] font-bold text-[#756E64]">Chưa có nhân sự phù hợp để điều phối nhanh.</p> : null}
            </div>
          </section>
        </aside>
      </div>

      {selectedBranch ? (
        <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Selected branch</p>
                <h3 className="mt-0.5 truncate text-base font-black text-[#0B3F31]">{selectedBranch.name}</h3>
                <p className="mt-0.5 line-clamp-2 text-[11px] font-bold text-[#756E64]">{selectedBranch.address}</p>
              </div>
              <Pill tone={selectedBranch.pressureScore ? "orange" : "green"}>{selectedBranch.pressureScore ? "Cần xử lý" : "Ổn"}</Pill>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <MiniMetric label="Nhân sự" value={selectedBranch.activeMembers.length} tone="green" />
              <MiniMetric label="Online" value={selectedBranch.onlineMembers.length} tone={selectedBranch.onlineMembers.length ? "green" : "neutral"} />
              <MiniMetric label="Công tháng" value={formatHours(selectedBranch.workMinutes)} tone="green" />
              <MiniMetric label="OT" value={formatHours(selectedBranch.overtimeMinutes)} tone={selectedBranch.overtimeMinutes ? "orange" : "neutral"} />
              <MiniMetric label="Đi muộn" value={formatHours(selectedBranch.lateMinutes)} tone={selectedBranch.lateMinutes ? "orange" : "green"} />
              <MiniMetric label="Điểm công" value={`${selectedBranch.averageScore}/100`} tone={selectedBranch.averageScore >= 85 ? "green" : selectedBranch.averageScore >= 70 ? "orange" : "red"} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => onOpenScreen("shifts")} className="h-9 rounded-lg bg-[#003F2D] px-2 text-[11px] font-black text-white">Mở lịch ca</button>
              <button type="button" onClick={() => onOpenScreen("requests")} className="h-9 rounded-lg border border-[#E3D8CA] bg-white px-2 text-[11px] font-black text-[#0B3F31]">Mở duyệt</button>
              <button type="button" onClick={() => onOpenScreen("attendance")} className="h-9 rounded-lg border border-[#E3D8CA] bg-white px-2 text-[11px] font-black text-[#0B3F31]">Chấm công</button>
              <button type="button" onClick={() => onOpenScreen("reports")} className="h-9 rounded-lg border border-[#E3D8CA] bg-white px-2 text-[11px] font-black text-[#0B3F31]">Payroll</button>
            </div>
          </section>

          <section className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch staff roster</p>
                <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Đội hình hiện tại và điểm cần chốt</h3>
              </div>
              <Pill>{selectedStaff.length} nhân sự</Pill>
            </div>
            <div className="mt-3 overflow-auto rounded-xl border border-[#E8DED0] bg-white">
              <TableHead className="grid-cols-[minmax(210px,1.35fr)_110px_110px_110px_110px]">
                <span>Nhân viên</span><span>Trạng thái</span><span>Chấm công</span><span>Rủi ro</span><span>Hành động</span>
              </TableHead>
              {selectedStaff.map((member) => (
                <TableRow key={member.id} className="grid-cols-[minmax(210px,1.35fr)_110px_110px_110px_110px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <StaffAvatar member={member} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-black">{member.fullName}</span>
                      <span className="block truncate text-[10px] font-bold text-[#756E64]">{member.roleTitle} · {member.phone ?? member.email}</span>
                    </span>
                  </span>
                  <span><Pill tone={badgeTone(member)}>{accountStatusLabel(member)}</Pill></span>
                  <span><Pill tone={attendanceTone(member.todayAttendanceState)}>{attendanceLabel(member.todayAttendanceState)}</Pill></span>
                  <span><Pill tone={member.suspiciousScore >= 40 ? "red" : !member.hasPin ? "orange" : "green"}>{member.suspiciousScore || (!member.hasPin ? "Thiếu PIN" : "Ổn")}</Pill></span>
                  <span>
                    <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="h-8 rounded-lg border border-[#E3D8CA] bg-[#FFFCF6] px-2 text-[10.5px] font-black text-[#0B3F31]">Mở hồ sơ</button>
                  </span>
                </TableRow>
              ))}
              {!selectedStaff.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Chi nhánh này chưa có nhân sự active trong dữ liệu hiện tại.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      <div className="border-b border-[#EFE5D9] bg-[#FFF9F0] p-3">
        <div className="grid gap-3 xl:grid-cols-3">
          <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-[#0B3F31]">Checklist mở ca</h3>
              <Pill tone={totalPayrollPending || totalPressure ? "orange" : "green"}>{totalPressure ? `${totalPressure} điểm` : "Ổn"}</Pill>
            </div>
            <div className="mt-2 grid gap-1.5">
              {[
                { label: "Tất cả chi nhánh có người online", done: totalOnline >= Math.min(totalBranchStaff, bundle.branches.length), detail: `${totalOnline} online` },
                { label: "Không còn request ảnh hưởng ca", done: approvals.filter((approval) => approval.requestType === "shift_swap" || approval.requestType === "shift_override").length === 0, detail: `${approvals.length} request chờ` },
                { label: "Không có chi nhánh dưới 70 readiness", done: !branchRows.some((row) => row.readinessScore < 70), detail: `${branchRows.filter((row) => row.readinessScore < 70).length} chi nhánh thấp` },
                { label: "Nhân sự đã có PIN và chi nhánh", done: !members.some((member) => !member.hasPin || !member.primaryBranchId), detail: `${members.filter((member) => !member.hasPin || !member.primaryBranchId).length} hồ sơ thiếu` }
              ].map((item) => (
                <div key={item.label} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${item.done ? "border-[#CBE5D2] bg-[#E8F5EC]" : "border-[#F2D2B2] bg-[#FFF8EF]"}`}>
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-white text-[#0F4D3A]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                    {item.done ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-black text-[#2D2924]">{item.label}</span>
                    <span className="block text-[10px] font-bold text-[#756E64]">{item.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#E8DED0] bg-white p-3 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch comparison</p>
                <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">So sánh phủ ca, payroll và rủi ro</h3>
              </div>
              <Pill>{filteredBranchRows.length}/{branchRows.length}</Pill>
            </div>
            <div className="mt-3 overflow-auto rounded-xl border border-[#E8DED0]">
              <TableHead className="grid-cols-[minmax(210px,1.25fr)_90px_90px_90px_90px_95px_95px]">
                <span>Chi nhánh</span><span>Readiness</span><span>Online</span><span>Phủ ca</span><span>Request</span><span>Payroll</span><span>Risk</span>
              </TableHead>
              {filteredBranchRows.map((row) => (
                <TableRow key={row.id} className="grid-cols-[minmax(210px,1.25fr)_90px_90px_90px_90px_95px_95px]">
                  <span className="min-w-0">
                    <span className="block truncate font-black">{row.name}</span>
                    <span className="block truncate text-[10px] font-bold text-[#756E64]">{row.activeMembers.length} nhân sự · {formatHours(row.workMinutes)} công</span>
                  </span>
                  <span><Pill tone={row.readinessScore >= 85 ? "green" : row.readinessScore >= 70 ? "orange" : "red"}>{row.readinessScore}%</Pill></span>
                  <span>{row.onlineMembers.length}/{row.activeMembers.length}</span>
                  <span>{row.confirmedCount}/{row.assignedCount}</span>
                  <span><Pill tone={row.approvals.length ? "orange" : "green"}>{row.approvals.length}</Pill></span>
                  <span><Pill tone={row.payrollPending ? "orange" : "green"}>{row.payrollPending} chờ</Pill></span>
                  <span><Pill tone={row.riskMembers.length || row.noPinMembers.length ? "red" : "green"}>{row.riskMembers.length + row.noPinMembers.length}</Pill></span>
                </TableRow>
              ))}
            </div>
          </section>
        </div>
      </div>
    </StaffShellCard>
  );
}

function ReportsScreen({
  bundle,
  onOpenMember,
  onOpenScreen
}: {
  bundle: StaffOperationsBundle;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  onOpenScreen: (screen: StaffScreenKey) => void;
}) {
  const [reportQuery, setReportQuery] = useState("");
  const [reportFilter, setReportFilter] = useState<PayrollReportFilterKey>("all");
  const deferredReportQuery = useDeferredValue(reportQuery);
  const maxAssigned = Math.max(1, ...bundle.weeklyCoverage.map((item) => item.assigned));
  const visibleMembers = bundle.members.filter((member) => !member.isArchived);
  const resignedMembers = bundle.members.filter((member) => member.employmentStatus === "resigned");
  const totalWorkMinutes = bundle.timesheets.reduce((sum, item) => sum + item.workMinutes, 0);
  const totalLateMinutes = bundle.timesheets.reduce((sum, item) => sum + item.lateMinutes, 0);
  const totalOvertimeMinutes = bundle.timesheets.reduce((sum, item) => sum + item.overtimeMinutes, 0);
  const totalApprovedOvertimeMinutes = bundle.timesheets.reduce((sum, item) => sum + item.approvedOvertimeMinutes, 0);
  const totalPaidLeaveDays = bundle.timesheets.reduce((sum, item) => sum + item.paidLeaveDays, 0);
  const totalUnpaidLeaveDays = bundle.timesheets.reduce((sum, item) => sum + item.unpaidLeaveDays, 0);
  const pendingPayrollApprovals = bundle.timesheets.reduce((sum, item) => sum + item.pendingApprovals, 0);
  const overtimeApprovalGap = Math.max(0, totalOvertimeMinutes - totalApprovedOvertimeMinutes);
  const averageAttendanceScore = bundle.timesheets.length
    ? Math.round(bundle.timesheets.reduce((sum, item) => sum + item.attendanceScore, 0) / bundle.timesheets.length)
    : 0;
  const maxWorkMinutes = Math.max(1, ...bundle.timesheets.map((item) => item.workMinutes));
  const topPerformers = [...bundle.timesheets]
    .sort((left, right) => right.attendanceScore - left.attendanceScore || right.workMinutes - left.workMinutes)
    .slice(0, 5);
  const lateRiskRows = [...bundle.timesheets]
    .filter((item) => item.lateMinutes > 0 || item.lateCount > 0 || item.pendingApprovals > 0)
    .sort((left, right) => (right.lateMinutes + right.pendingApprovals * 30) - (left.lateMinutes + left.pendingApprovals * 30))
    .slice(0, 5);
  const payrollBlockerRows = bundle.timesheets.filter((item) =>
    item.pendingApprovals > 0 ||
    item.attendanceScore < 75 ||
    item.lateCount >= 3 ||
    item.lateMinutes >= 45 ||
    item.overtimeMinutes > item.approvedOvertimeMinutes + 30
  );
  const payrollReadinessScore = clampPercent(
    100 -
    pendingPayrollApprovals * 7 -
    payrollBlockerRows.length * 5 -
    Math.ceil(totalLateMinutes / 30) * 2 -
    Math.ceil(overtimeApprovalGap / 60) * 4 -
    totalUnpaidLeaveDays * 2
  );
  const payrollReadyTone = payrollReadinessScore >= 90 ? "green" : payrollReadinessScore >= 75 ? "orange" : "red";
  const payrollRows = [...bundle.timesheets].sort((left, right) => right.workMinutes - left.workMinutes);
  const payrollFilterCounts = {
    all: payrollRows.length,
    blockers: payrollBlockerRows.length,
    overtime: payrollRows.filter((item) => item.overtimeMinutes > 0 || item.approvedOvertimeMinutes > 0).length,
    late: payrollRows.filter((item) => item.lateMinutes > 0 || item.lateCount > 0).length,
    leave: payrollRows.filter((item) => item.paidLeaveDays > 0 || item.unpaidLeaveDays > 0).length,
    low_score: payrollRows.filter((item) => item.attendanceScore < 75).length
  } satisfies Record<PayrollReportFilterKey, number>;
  const normalizedReportQuery = normalizeText(deferredReportQuery.trim());
  const filteredPayrollRows = payrollRows.filter((item) => {
    const matchesFilter =
      reportFilter === "all" ||
      (reportFilter === "blockers" && payrollBlockerRows.some((row) => row.staffMemberId === item.staffMemberId)) ||
      (reportFilter === "overtime" && (item.overtimeMinutes > 0 || item.approvedOvertimeMinutes > 0)) ||
      (reportFilter === "late" && (item.lateMinutes > 0 || item.lateCount > 0)) ||
      (reportFilter === "leave" && (item.paidLeaveDays > 0 || item.unpaidLeaveDays > 0)) ||
      (reportFilter === "low_score" && item.attendanceScore < 75);
    if (!matchesFilter) return false;
    if (!normalizedReportQuery) return true;

    return normalizeText([
      item.fullName,
      item.branchName ?? "Toàn quán",
      formatHours(item.workMinutes),
      formatHours(item.overtimeMinutes),
      formatHours(item.lateMinutes),
      `${item.attendanceScore}`
    ].join(" ")).includes(normalizedReportQuery);
  });
  const branchPayrollRows = [...bundle.timesheets.reduce((map, item) => {
    const key = item.branchName ?? "Toàn quán";
    const current = map.get(key) ?? {
      name: key,
      staff: 0,
      workMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      pendingApprovals: 0,
      leaveDays: 0,
      scoreTotal: 0
    };
    current.staff += 1;
    current.workMinutes += item.workMinutes;
    current.overtimeMinutes += item.overtimeMinutes;
    current.lateMinutes += item.lateMinutes;
    current.pendingApprovals += item.pendingApprovals;
    current.leaveDays += item.paidLeaveDays + item.unpaidLeaveDays;
    current.scoreTotal += item.attendanceScore;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; staff: number; workMinutes: number; overtimeMinutes: number; lateMinutes: number; pendingApprovals: number; leaveDays: number; scoreTotal: number }>()).values()]
    .sort((left, right) => right.pendingApprovals - left.pendingApprovals || right.overtimeMinutes - left.overtimeMinutes || right.workMinutes - left.workMinutes)
    .slice(0, 6);
  const payrollChecklist = [
    {
      id: "approvals",
      label: "Duyệt hết request ảnh hưởng công/lương",
      done: pendingPayrollApprovals === 0,
      detail: pendingPayrollApprovals ? `${pendingPayrollApprovals} yêu cầu còn chờ` : "Không còn request payroll chờ"
    },
    {
      id: "overtime",
      label: "Đối soát tăng ca",
      done: overtimeApprovalGap === 0,
      detail: overtimeApprovalGap ? `${formatHours(overtimeApprovalGap)} OT chưa khớp duyệt` : "OT đã khớp dữ liệu duyệt"
    },
    {
      id: "late",
      label: "Rà soát đi muộn và trừ công",
      done: totalLateMinutes < 30,
      detail: `${formatHours(totalLateMinutes)} đi muộn toàn hệ thống`
    },
    {
      id: "score",
      label: "Kiểm tra nhân sự điểm công thấp",
      done: payrollFilterCounts.low_score === 0,
      detail: payrollFilterCounts.low_score ? `${payrollFilterCounts.low_score} nhân sự dưới 75 điểm` : "Không có điểm công thấp"
    }
  ];
  const branchInsights = [...bundle.branches].sort((left, right) => branchPressure(right) - branchPressure(left)).slice(0, 4);
  const heatmapHighlights = bundle.heatmap
    .flat()
    .sort((left, right) => (right.assigned + right.attendance) - (left.assigned + left.attendance))
    .slice(0, 6);
  const reportInsights = buildStaffAiInsights({
    bundle,
    members: visibleMembers,
    approvals: bundle.approvals.filter((approval) => approval.status === "pending"),
    limit: 6
  });

  return (
    <StaffShellCard index="14" title="Báo cáo nhân sự" subtitle="Thống kê và báo cáo nhân sự" action={<a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white"><FileDown size={12} />Xuất báo cáo</a>}>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Tổng nhân viên" value={visibleMembers.length} />
        <StatTile label="Đang làm việc" value={bundle.overview.activeStaff} />
        <StatTile label="Nghỉ việc" value={resignedMembers.length} tone="orange" />
        <StatTile label="Tổng công" value={formatHours(totalWorkMinutes)} />
        <StatTile label="Tăng ca" value={formatHours(totalOvertimeMinutes)} tone={totalOvertimeMinutes ? "orange" : "neutral"} />
        <StatTile label="Nghỉ đã duyệt" value={`${totalPaidLeaveDays + totalUnpaidLeaveDays} ngày`} tone={totalUnpaidLeaveDays ? "orange" : "neutral"} />
      </div>
      <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Payroll control</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Mức sẵn sàng chốt lương</h3>
            </div>
            <Pill tone={payrollReadyTone}>{payrollReadinessScore}/100</Pill>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[#EFE5D9]">
            <div
              className={`h-full rounded-full ${payrollReadyTone === "green" ? "bg-[#0F4D3A]" : payrollReadyTone === "orange" ? "bg-[#E08A2E]" : "bg-[#C2410C]"}`}
              style={{ width: `${Math.max(6, payrollReadinessScore)}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <MiniMetric label="Kẹt chốt" value={payrollBlockerRows.length} tone={payrollBlockerRows.length ? "orange" : "green"} />
            <MiniMetric label="OT lệch duyệt" value={formatHours(overtimeApprovalGap)} tone={overtimeApprovalGap ? "orange" : "green"} />
            <MiniMetric label="Chờ duyệt" value={pendingPayrollApprovals} tone={pendingPayrollApprovals ? "orange" : "green"} />
            <MiniMetric label="Điểm TB" value={`${averageAttendanceScore}/100`} tone={averageAttendanceScore >= 90 ? "green" : averageAttendanceScore >= 75 ? "orange" : "red"} />
          </div>
        </section>

        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Checklist trước xuất file</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Những điểm cần chốt để payroll không tranh chấp</h3>
            </div>
            <Pill tone={payrollChecklist.every((item) => item.done) ? "green" : "orange"}>
              {payrollChecklist.filter((item) => item.done).length}/{payrollChecklist.length} xong
            </Pill>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {payrollChecklist.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "approvals" || item.id === "overtime") onOpenScreen("requests");
                  if (item.id === "late" || item.id === "score") setReportFilter(item.id === "late" ? "late" : "low_score");
                }}
                className={`flex min-h-[58px] items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30 ${item.done ? "border-[#CBE5D2] bg-[#E8F5EC]" : "border-[#F2D2B2] bg-[#FFF8EF]"}`}
              >
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.done ? "bg-white text-[#0F4D3A]" : "bg-[#FFF1DF] text-[#A85B14]"}`}>
                  {item.done ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-black text-[#2D2924]">{item.label}</span>
                  <span className="mt-0.5 block text-[10.5px] font-bold text-[#756E64]">{item.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFFCF6] p-3 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <section className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Coverage tuần</p>
              <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Tình hình nhân sự theo ngày</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={pendingPayrollApprovals ? "orange" : "green"}>{pendingPayrollApprovals} duyệt lương</Pill>
              <Pill>{bundle.weeklyCoverage.reduce((sum, day) => sum + day.confirmed, 0)} ca nhận</Pill>
            </div>
          </div>
          <div className="mt-3 grid h-56 grid-cols-7 items-end gap-2 rounded-xl border border-[#E8DED0] bg-white p-3">
            {bundle.weeklyCoverage.map((day) => {
              const assignedHeight = Math.max(12, day.assigned / maxAssigned * 100);
              const confirmedHeight = Math.max(8, day.confirmed / maxAssigned * 100);
              return (
                <div key={day.isoDate} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="relative h-full rounded-t-lg bg-[#EFE5D9]">
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-lg bg-[#71B987]" style={{ height: `${assignedHeight}%` }} />
                    <div className="absolute bottom-0 left-1 right-1 rounded-t-md bg-[#0F4D3A]" style={{ height: `${confirmedHeight}%` }} />
                    {day.overtimeAlerts > 0 ? <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-[#E08A2E]" /> : null}
                  </div>
                  <span className="truncate text-center text-[10px] font-black text-[#756E64]">{day.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold text-[#756E64]">
            <span className="rounded-lg bg-white px-2 py-1"><strong className="text-[#0F4D3A]">Xanh đậm</strong> ca đã nhận</span>
            <span className="rounded-lg bg-white px-2 py-1"><strong className="text-[#71B987]">Xanh nhạt</strong> đã xếp</span>
            <span className="rounded-lg bg-white px-2 py-1"><strong className="text-[#A85B14]">Cam</strong> cảnh báo tăng ca</span>
          </div>
        </section>

        <aside className="grid gap-2">
          <div className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Payroll-ready</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Tóm tắt trước khi chốt lương</h3>
            <div className="mt-3 grid gap-1.5">
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">Công hợp lệ</span>
                <strong className="text-[#0B3F31]">{formatHours(totalWorkMinutes)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">Tăng ca cần tính</span>
                <strong className="text-[#A85B14]">{formatHours(totalOvertimeMinutes)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">OT duyệt tay</span>
                <strong className="text-[#A85B14]">{formatHours(totalApprovedOvertimeMinutes)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">Nghỉ phép</span>
                <strong className="text-[#0B3F31]">{totalPaidLeaveDays} paid · {totalUnpaidLeaveDays} unpaid</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">Phút đi muộn</span>
                <strong className="text-[#9A3412]">{formatHours(totalLateMinutes)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold">
                <span className="text-[#756E64]">Điểm chấm công TB</span>
                <strong className="text-[#0B3F31]">{averageAttendanceScore}/100</strong>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#E8DED0] bg-[#FFF9F0] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Giờ cao điểm</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {heatmapHighlights.map((cell) => (
                <span key={cell.label} className="rounded-full border border-[#E8DED0] bg-white px-2 py-1 text-[10.5px] font-black text-[#756E64]">
                  {cell.label} · {cell.assigned}/{cell.attendance}
                </span>
              ))}
              {!heatmapHighlights.length ? <span className="text-[11px] font-bold text-[#756E64]">Chưa đủ dữ liệu.</span> : null}
            </div>
          </div>
        </aside>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <StaffAiAssistantPanel
          insights={reportInsights}
          title="AI HR Assistant"
          subtitle="Ưu tiên trước khi chốt ca, đối soát công và xuất payroll"
          onOpenMember={onOpenMember}
          onOpenScreen={onOpenScreen}
        />
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFF9F0] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Branch payroll rollup</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Đối soát công/lương theo chi nhánh</h3>
          </div>
          <Pill tone={branchPayrollRows.some((branch) => branch.pendingApprovals > 0) ? "orange" : "green"}>
            {branchPayrollRows.length} chi nhánh
          </Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {branchPayrollRows.map((branch) => {
            const averageScore = branch.staff ? Math.round(branch.scoreTotal / branch.staff) : 0;
            return (
              <div key={branch.name} className="rounded-xl border border-[#E8DED0] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#2D2924]">{branch.name}</p>
                    <p className="mt-0.5 text-[10.5px] font-bold text-[#756E64]">{branch.staff} nhân sự · {formatHours(branch.workMinutes)} công</p>
                  </div>
                  <Pill tone={branch.pendingApprovals ? "orange" : averageScore >= 85 ? "green" : "red"}>{averageScore}/100</Pill>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                  <MiniMetric label="OT" value={formatHours(branch.overtimeMinutes)} tone={branch.overtimeMinutes ? "orange" : "neutral"} />
                  <MiniMetric label="Muộn" value={formatHours(branch.lateMinutes)} tone={branch.lateMinutes ? "orange" : "green"} />
                  <MiniMetric label="Nghỉ" value={branch.leaveDays} tone={branch.leaveDays ? "orange" : "neutral"} />
                  <MiniMetric label="Chờ" value={branch.pendingApprovals} tone={branch.pendingApprovals ? "orange" : "green"} />
                </div>
              </div>
            );
          })}
          {!branchPayrollRows.length ? (
            <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center md:col-span-2 2xl:col-span-3">
              <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
              <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có dữ liệu payroll theo chi nhánh</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Khi có timesheet, LogiVN sẽ gom công/lương theo chi nhánh tại đây.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 border-b border-[#EFE5D9] bg-[#FFF9F0] p-3 xl:grid-cols-3">
        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Top đúng giờ</h3>
            <Pill tone="green">Hiệu suất</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {topPerformers.map((item, index) => (
              <div key={item.staffMemberId} className="grid grid-cols-[24px_minmax(0,1fr)_54px] items-center gap-2 rounded-lg bg-[#F6FBF6] px-2 py-1.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-black text-[#0F4D3A]">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{item.fullName}</span>
                  <span className="block truncate text-[10px] font-bold text-[#756E64]">{formatHours(item.workMinutes)} · {item.branchName ?? "Toàn quán"}</span>
                </span>
                <strong className="text-right text-sm text-[#0F4D3A]">{formatScore(item.attendanceScore)}</strong>
              </div>
            ))}
            {!topPerformers.length ? <p className="text-[11px] font-bold text-[#756E64]">Chưa có timesheet.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Cần rà soát</h3>
            <Pill tone={lateRiskRows.length ? "orange" : "green"}>{lateRiskRows.length || "Ổn"}</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {lateRiskRows.map((item) => (
              <div key={item.staffMemberId} className="rounded-lg border border-[#F2D2B2] bg-[#FFF8EF] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] font-black text-[#2D2924]">{item.fullName}</span>
                  <Pill tone="orange">{item.lateCount} lần</Pill>
                </div>
                <p className="mt-0.5 text-[10px] font-bold text-[#A85B14]">{formatHours(item.lateMinutes)} đi muộn · {item.pendingApprovals} yêu cầu chờ</p>
              </div>
            ))}
            {!lateRiskRows.length ? <p className="text-[11px] font-bold text-[#756E64]">Không có rủi ro chấm công nổi bật.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-[#E8DED0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-[#0B3F31]">Chi nhánh áp lực</h3>
            <Pill>{branchInsights.length} điểm</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {branchInsights.map((branch) => {
              const pressure = branchPressure(branch);
              return (
                <div key={branch.id} className="rounded-lg bg-[#FFF9F0] px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] font-black text-[#2D2924]">{branch.name}</span>
                    <Pill tone={pressure >= 20 ? "red" : pressure > 0 ? "orange" : "green"}>{branch.coverageScore}%</Pill>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#EFE5D9]">
                    <div className="h-full rounded-full bg-[#0F4D3A]" style={{ width: `${Math.max(6, Math.min(100, branch.coverageScore))}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-[#756E64]">{branch.activeStaff} online · {branch.lateCount} muộn · {branch.pendingApprovals} duyệt</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Payroll theo chi nhánh</p>
            <h3 className="mt-0.5 text-sm font-black text-[#0B3F31]">Cụm nào cần đối soát trước khi xuất lương</h3>
          </div>
          <Pill tone={branchPayrollRows.some((branch) => branch.pendingApprovals || branch.lateMinutes) ? "orange" : "green"}>
            {branchPayrollRows.length || "Trống"}
          </Pill>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {branchPayrollRows.map((branch) => {
            const averageScore = branch.staff ? Math.round(branch.scoreTotal / branch.staff) : 0;
            const riskTone = branch.pendingApprovals ? "orange" : averageScore >= 90 ? "green" : averageScore >= 75 ? "orange" : "red";
            return (
              <div key={branch.name} className="rounded-xl border border-[#E8DED0] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-black text-[#2D2924]">{branch.name}</p>
                  <Pill tone={riskTone}>{averageScore}/100</Pill>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <MiniMetric label="Công" value={formatHours(branch.workMinutes)} tone="green" />
                  <MiniMetric label="OT" value={formatHours(branch.overtimeMinutes)} tone={branch.overtimeMinutes ? "orange" : "neutral"} />
                  <MiniMetric label="Chờ" value={branch.pendingApprovals} tone={branch.pendingApprovals ? "orange" : "green"} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Pill>{branch.staff} nhân sự</Pill>
                  <Pill tone={branch.lateMinutes ? "orange" : "green"}>{formatHours(branch.lateMinutes)} muộn</Pill>
                  <Pill tone={branch.leaveDays ? "orange" : "neutral"}>{branch.leaveDays} ngày nghỉ</Pill>
                </div>
              </div>
            );
          })}
          {!branchPayrollRows.length ? (
            <div className="rounded-xl border border-dashed border-[#E8DED0] bg-white p-4 text-center md:col-span-2 xl:col-span-3">
              <CheckCircle2 className="mx-auto text-[#0F4D3A]" size={22} />
              <p className="mt-1 text-sm font-black text-[#0B3F31]">Chưa có dữ liệu payroll theo chi nhánh</p>
              <p className="mt-0.5 text-[11px] font-bold text-[#756E64]">Khi có timesheet, bảng công sẽ gom theo từng cụm vận hành.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-b border-[#EFE5D9] bg-[#FFFCF6] p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B8175]" size={14} />
            <input
              value={reportQuery}
              onChange={(event) => setReportQuery(event.target.value)}
              placeholder="Tìm nhân viên, chi nhánh, điểm công..."
              className="staff-field-input h-9 pl-8"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {payrollReportFilterOptions.map((item) => {
              const active = reportFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setReportFilter(item.key)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-black ${active ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#756E64]"}`}
                >
                  {item.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${active ? "bg-white/20 text-white" : item.key === "blockers" || item.key === "low_score" ? "bg-[#FFF1DF] text-[#A85B14]" : "bg-[#F5EFE8] text-[#756E64]"}`}>
                    {payrollFilterCounts[item.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.45fr)_120px_105px_105px_115px_90px_105px]">
          <span>Nhân viên</span><span>Công tháng</span><span>Tăng ca</span><span>Đi muộn</span><span>Nghỉ duyệt</span><span>Chờ</span><span>Điểm</span>
        </TableHead>
        {filteredPayrollRows.map((item) => {
          const workRatio = Math.max(6, item.workMinutes / maxWorkMinutes * 100);
          return (
            <button key={item.staffMemberId} type="button" onClick={() => onOpenMember(item.staffMemberId, "profile")} className="block w-full text-left">
              <TableRow className="grid-cols-[minmax(220px,1.45fr)_120px_105px_105px_115px_90px_105px] hover:bg-[#FFF8EF]">
                <span className="min-w-0">
                  <span className="block truncate font-black">{item.fullName}</span>
                  <span className="block truncate text-[10px] font-bold text-[#756E64]">{item.branchName ?? "Toàn quán"} · {item.attendanceCount} lượt</span>
                </span>
                <span>
                  <span className="block font-black">{formatHours(item.workMinutes)}</span>
                  <span className="mt-1 block h-1.5 rounded-full bg-[#EFE5D9]">
                    <span className="block h-full rounded-full bg-[#71B987]" style={{ width: `${workRatio}%` }} />
                  </span>
                </span>
                <span>{formatHours(item.overtimeMinutes)}</span>
                <span>{formatHours(item.lateMinutes)}</span>
                <span>{item.paidLeaveDays + item.unpaidLeaveDays ? `${item.paidLeaveDays}/${item.unpaidLeaveDays} ngày` : "--"}</span>
                <span><Pill tone={item.pendingApprovals ? "orange" : "green"}>{item.pendingApprovals}</Pill></span>
                <span><Pill tone={item.attendanceScore >= 90 ? "green" : item.attendanceScore >= 75 ? "orange" : "red"}>{formatScore(item.attendanceScore)}/100</Pill></span>
              </TableRow>
            </button>
          );
        })}
        {!filteredPayrollRows.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Không có timesheet khớp bộ lọc payroll.</p> : null}
      </div>
    </StaffShellCard>
  );
}
