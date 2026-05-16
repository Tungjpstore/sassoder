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
  | "shifts"
  | "attendance"
  | "requests"
  | "activity"
  | "reviews"
  | "contracts"
  | "documents"
  | "devices"
  | "reports";

const screenItems: Array<{ key: StaffScreenKey; label: string; index: string; icon: LucideIcon }> = [
  { key: "staff", label: "Danh sách nhân sự", index: "1", icon: UsersRound },
  { key: "profile", label: "Chi tiết nhân viên", index: "2", icon: UserRound },
  { key: "shifts", label: "Ca làm việc", index: "3", icon: CalendarClock },
  { key: "attendance", label: "Chấm công", index: "4", icon: Clock3 },
  { key: "requests", label: "Yêu cầu nhân sự", index: "5", icon: ListChecks },
  { key: "activity", label: "Lịch sử hoạt động", index: "6", icon: History },
  { key: "reviews", label: "Đánh giá nhân viên", index: "7", icon: ClipboardCheck },
  { key: "contracts", label: "Hợp đồng", index: "8", icon: BriefcaseBusiness },
  { key: "documents", label: "Tài liệu", index: "9", icon: FileText },
  { key: "devices", label: "Thiết bị", index: "10", icon: MonitorSmartphone },
  { key: "reports", label: "Báo cáo nhân sự", index: "11", icon: BarChart3 }
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
    items: ["profile", "contracts", "documents", "devices"]
  },
  {
    label: "Hiệu suất",
    description: "Đánh giá và báo cáo",
    items: ["reviews", "reports"]
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

type AttendanceFilterKey = (typeof attendanceFilterOptions)[number]["key"];
type ActivityFilterKey = (typeof activityFilterOptions)[number]["key"];

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

function operationalTone(value: number, warningAt = 1): "green" | "orange" | "red" | "neutral" {
  if (value <= 0) return "green";
  if (value >= warningAt * 3) return "red";
  return "orange";
}

function branchPressure(branch: StaffOperationsBundle["branches"][number]) {
  return branch.pendingApprovals * 4 + branch.lateCount * 3 + branch.suspiciousCount * 5 + Math.max(0, 70 - branch.coverageScore);
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
  const weakestBranch = tenseBranches[0] ?? null;
  const understaffedDay = [...bundle.weeklyCoverage]
    .sort((left, right) => (left.confirmed - left.assigned) - (right.confirmed - right.assigned) || left.confirmed - right.confirmed)[0];
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
  const aiInsights = [
    weakestBranch
      ? {
          id: "branch-pressure",
          title: `${weakestBranch.name} cần theo dõi`,
          detail: `${weakestBranch.coverageScore}% phủ ca · ${weakestBranch.lateCount} muộn · ${weakestBranch.pendingApprovals} chờ duyệt`,
          tone: branchPressure(weakestBranch) >= 20 ? "red" as const : "orange" as const,
          onClick: () => onOpenScreen(weakestBranch.pendingApprovals > 0 ? "requests" : "shifts")
        }
      : null,
    understaffedDay
      ? {
          id: "understaffed-day",
          title: `${understaffedDay.label} có thể thiếu người`,
          detail: `${understaffedDay.confirmed}/${understaffedDay.assigned} ca đã nhận · ${understaffedDay.overtimeAlerts} cảnh báo tăng ca`,
          tone: understaffedDay.confirmed < understaffedDay.assigned || understaffedDay.overtimeAlerts > 0 ? "orange" as const : "green" as const,
          onClick: () => onOpenScreen("shifts")
        }
      : null,
    riskMembers[0]
      ? {
          id: "risk-member",
          title: `${riskMembers[0].fullName} có tín hiệu bất thường`,
          detail: `Điểm rủi ro ${riskMembers[0].suspiciousScore} · ${riskMembers[0].roleTitle} · ${riskMembers[0].primaryBranchName ?? "Toàn quán"}`,
          tone: riskMembers[0].suspiciousScore >= 55 ? "red" as const : "orange" as const,
          onClick: () => onOpenMember(riskMembers[0].id, "profile")
        }
      : null
  ].filter(Boolean).slice(0, 3);

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

        <div className="mt-3 rounded-xl border border-[#E9DED0] bg-[#FFF9F0] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#0B3F31]"><Activity size={14} />AI gợi ý</span>
            <Pill tone={aiInsights.some((item) => item?.tone === "red") ? "red" : aiInsights.length ? "orange" : "green"}>{aiInsights.length || "Ổn"}</Pill>
          </div>
          <div className="mt-2 grid gap-1.5">
            {aiInsights.length ? aiInsights.map((item) => item ? (
              <button key={item.id} type="button" onClick={item.onClick} className="rounded-lg border border-[#E9DED0] bg-white px-2.5 py-2 text-left transition hover:border-[#0F4D3A]/30">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-black text-[#2D2924]">{item.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[10.5px] font-bold text-[#756E64]">{item.detail}</span>
                  </span>
                  <Pill tone={item.tone}>{item.tone === "red" ? "Gấp" : item.tone === "orange" ? "Theo dõi" : "Ổn"}</Pill>
                </span>
              </button>
            ) : null) : (
              <p className="rounded-lg border border-dashed border-[#E9DED0] bg-white px-2.5 py-2 text-[11px] font-bold text-[#756E64]">Chưa có bất thường nổi bật từ ca/chấm công.</p>
            )}
          </div>
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "off" | "risk">("all");
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
  const normalizedQuery = normalizeText(deferredQuery.trim());
  const filteredMembers = bundle.members.filter((member) => {
    const matchesSearch =
      !normalizedQuery ||
      normalizeText(`${member.fullName} ${member.phone ?? ""} ${member.email} ${member.username ?? ""} ${member.roleTitle} ${member.primaryBranchName ?? ""}`).includes(normalizedQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && member.activeSessionCount > 0 && !member.isArchived) ||
      (statusFilter === "off" && member.activeSessionCount === 0 && !member.isArchived) ||
      (statusFilter === "risk" && member.suspiciousScore >= 40 && !member.isArchived);
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
          formAction={reviewFormAction}
          state={reviewState}
          pending={creatingReview}
          onOpenMember={openMember}
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
      {activeScreen === "reports" ? <ReportsScreen bundle={bundle} /> : null}
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
  statusFilter: "all" | "active" | "off" | "risk";
  setStatusFilter: Dispatch<SetStateAction<"all" | "active" | "off" | "risk">>;
  onOpenMember: (memberId: string, screen?: StaffScreenKey) => void;
  createFormAction: (payload: FormData) => void;
  createState?: StaffActionState;
  creatingStaff: boolean;
}) {
  const [showQuickCreate, setShowQuickCreate] = useState(members.length === 0);

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
          <div className="flex flex-col gap-1.5 border-b border-[#EFE5D9] px-3 py-2 md:flex-row md:items-center">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E8DED0] bg-white px-2.5 text-[#7D7469]">
              <Search size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm nhân viên..." className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] font-bold outline-none" />
            </label>
            <div className="flex flex-wrap gap-1">
              {[
                ["all", "Tất cả"],
                ["active", "Online"],
                ["risk", "Rủi ro"],
                ["off", "Offline"]
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setStatusFilter(key as typeof statusFilter)} className={`h-7 rounded-lg border px-2.5 text-[10px] font-black ${statusFilter === key ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E8DED0] bg-white text-[#615A50]"}`}>
                  {label}
                </button>
              ))}
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
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => onOpenMember(member.id, "profile")} className="h-8 rounded-lg bg-[#003F2D] text-[10px] font-black text-white">Hồ sơ</button>
                  <button type="button" onClick={() => onOpenMember(member.id, "attendance")} className="h-8 rounded-lg border border-[#E3D8CA] bg-white text-[10px] font-black text-[#0B3F31]">Chấm công</button>
                  <button type="button" onClick={() => onOpenMember(member.id, "shifts")} className="h-8 rounded-lg border border-[#E3D8CA] bg-white text-[10px] font-black text-[#0B3F31]">Ca</button>
                </div>
              </article>
            ))}
            {!members.length ? <div className="rounded-xl border border-dashed border-[#E8DED0] bg-[#FFF9F0] p-6 text-sm font-bold text-[#756E64]">Không có nhân sự phù hợp bộ lọc.</div> : null}
          </div>
          <div className="hidden overflow-auto md:block">
            <TableHead className="grid-cols-[minmax(220px,1.6fr)_130px_150px_130px_90px_44px]">
              <span>Nhân viên</span>
              <span>Vai trò</span>
              <span>Chi nhánh</span>
              <span>Ca làm việc</span>
              <span>Trạng thái</span>
              <span />
            </TableHead>
            {members.map((member) => (
              <button key={member.id} type="button" onClick={() => onOpenMember(member.id, "profile")} className="block w-full text-left">
                <TableRow className="grid-cols-[minmax(220px,1.6fr)_130px_150px_130px_90px_44px] hover:bg-[#FFF8EF]">
                  <span className="flex min-w-0 items-center gap-2">
                    <StaffAvatar member={member} />
                    <span className="min-w-0">
                      <span className="block truncate font-black text-[#2D2924]">{member.fullName}</span>
                      <span className="block truncate text-[11px] font-semibold text-[#756E64]">{member.username ?? member.email}</span>
                    </span>
                  </span>
                  <span><Pill>{member.roleTitle}</Pill></span>
                  <span className="truncate font-semibold text-[#5D554B]">{member.primaryBranchName ?? "Chưa gán"}</span>
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
              <button key={day.iso} type="button" className={`rounded-xl border p-2 text-left transition hover:border-[#0F4D3A]/30 ${day.iso === today ? "border-[#0F4D3A]/35 bg-[#E8F5EC]" : "border-[#E8DED0] bg-white"}`}>
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
            <select name="shiftId" required className="staff-field-input mt-1.5">
              <option value="">Chọn mẫu ca</option>
              {shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>)}
            </select>
            <input name="scheduledDate" type="date" defaultValue={today} className="staff-field-input mt-1.5" />
            <input name="note" placeholder="Ghi chú" className="staff-field-input mt-1.5" />
            <button disabled={pending.assigningShift || shifts.length === 0} className="mt-1.5 h-8 w-full rounded-lg bg-[#003F2D] text-[11px] font-black text-white disabled:opacity-50">{pending.assigningShift ? "Đang gán..." : "Gán ca"}</button>
            <div className="mt-1.5"><ActionNotice state={assignState} /></div>
            <div className="mt-1.5"><ActionNotice state={cancelShiftState} /></div>
          </form>
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
  const attendanceFilterCounts = {
    all: attendanceRows.length,
    active: activeRows.length,
    late: lateRows.length,
    waiting: waitingRows.length,
    overtime: overtimeRows.length,
    manual: attendanceRows.filter((item) => item.row?.source === "manual").length
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
  const deferredRequestQuery = useDeferredValue(requestQuery);
  const selectedRequestMember = members.find((member) => member.id === adminStaffMemberId) ?? members[0] ?? null;
  const selectedMemberAssignments = assignments
    .filter((assignment) => assignment.staffMemberId === selectedRequestMember?.id && assignment.status !== "cancelled" && assignment.status !== "completed" && assignment.scheduledDate >= todayInputValue())
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
  formAction,
  state,
  pending,
  onOpenMember
}: {
  members: StaffOpsMember[];
  reviews: StaffOpsReviewItem[];
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
    <StaffShellCard index="6" title="Đánh giá nhân viên" subtitle="Quản lý đánh giá và hiệu suất làm việc" action={<button type="submit" form="staff-review-form" disabled={pending || members.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white disabled:opacity-50"><Plus size={12} />Tạo đánh giá</button>}>
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
        <StatTile label="Xuất sắc" value={excellentReviews.length} />
        <StatTile label="Cần kèm cặp" value={watchReviews.length} tone={watchReviews.length ? "orange" : "green"} />
        <StatTile label="Bản nháp" value={draftReviews.length} tone={draftReviews.length ? "orange" : "neutral"} />
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

function ReportsScreen({ bundle }: { bundle: StaffOperationsBundle }) {
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
  const payrollRows = [...bundle.timesheets].sort((left, right) => right.workMinutes - left.workMinutes).slice(0, 6);
  const branchInsights = [...bundle.branches].sort((left, right) => branchPressure(right) - branchPressure(left)).slice(0, 4);
  const heatmapHighlights = bundle.heatmap
    .flat()
    .sort((left, right) => (right.assigned + right.attendance) - (left.assigned + left.attendance))
    .slice(0, 6);

  return (
    <StaffShellCard index="10" title="Báo cáo nhân sự" subtitle="Thống kê và báo cáo nhân sự" action={<a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003F2D] px-3 text-[11px] font-black text-white"><FileDown size={12} />Xuất báo cáo</a>}>
      <div className="grid grid-cols-2 gap-2 border-b border-[#EFE5D9] p-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Tổng nhân viên" value={visibleMembers.length} />
        <StatTile label="Đang làm việc" value={bundle.overview.activeStaff} />
        <StatTile label="Nghỉ việc" value={resignedMembers.length} tone="orange" />
        <StatTile label="Tổng công" value={formatHours(totalWorkMinutes)} />
        <StatTile label="Tăng ca" value={formatHours(totalOvertimeMinutes)} tone={totalOvertimeMinutes ? "orange" : "neutral"} />
        <StatTile label="Nghỉ đã duyệt" value={`${totalPaidLeaveDays + totalUnpaidLeaveDays} ngày`} tone={totalUnpaidLeaveDays ? "orange" : "neutral"} />
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

      <div className="overflow-auto">
        <TableHead className="grid-cols-[minmax(220px,1.45fr)_120px_105px_105px_115px_90px_105px]">
          <span>Nhân viên</span><span>Công tháng</span><span>Tăng ca</span><span>Đi muộn</span><span>Nghỉ duyệt</span><span>Chờ</span><span>Điểm</span>
        </TableHead>
        {payrollRows.map((item) => {
          const workRatio = Math.max(6, item.workMinutes / maxWorkMinutes * 100);
          return (
            <TableRow key={item.staffMemberId} className="grid-cols-[minmax(220px,1.45fr)_120px_105px_105px_115px_90px_105px] hover:bg-[#FFF8EF]">
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
          );
        })}
        {!payrollRows.length ? <p className="p-3 text-xs font-bold text-[#756E64]">Chưa có dữ liệu timesheet để chốt lương.</p> : null}
      </div>
    </StaffShellCard>
  );
}
