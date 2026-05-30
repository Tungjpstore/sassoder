"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Fingerprint,
  FileText,
  KeyRound,
  ListChecks,
  LogOut,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  UserRound,
  UsersRound,
  Wifi,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  adjustStaffAttendanceAction,
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
  resetStaffAppPasswordAction,
  resetStaffAppPasswordsAction,
  reviewAttendanceApprovalAction,
  setStaffAccountStateAction,
  updateStaffProfileAction,
  updateStaffDeviceTrustAction,
  updateStaffShiftAssignmentAction,
  updateStaffShiftTemplateAction,
  updateStaffRolePermissionsAction
} from "@/app/dashboard/actions/staff";
import type { StaffActionState } from "@/app/dashboard/actions/staff";
import {
  createStaffAttendanceQrToken,
  markStaffNotificationRead,
  registerStaffAttendanceWifiNetwork,
  type StaffAttendanceQrTokenResult,
  type StaffAttendanceWifiNetworkResult
} from "@/features/staff/api/client";
import { useStaffMobileRealtime } from "@/features/staff/components/mobile/use-staff-mobile-realtime";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import type {
  StaffOperationsBundle,
  StaffOpsApprovalItem,
  StaffOpsAttendanceFeedItem,
  StaffOpsBranchSummary,
  StaffOpsMember,
  StaffOpsRoleSummary,
  StaffOpsShiftAssignment,
  StaffOpsShiftTemplate
} from "@/features/staff/types";
import { isDangerPermission, staffPermissionLabel } from "@/lib/staff-permissions";
import type { StaffPermissionKey } from "@/lib/staff-permissions";
import { cn } from "@/lib/utils";

type StaffRedesignWorkspaceProps = {
  bundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  restaurantStaffCode?: string | null;
};

type StaffView = "staff" | "credentials" | "shifts" | "attendance" | "requests" | "permissions" | "reports" | "detail" | "add" | "success";
type PrimaryView = Exclude<StaffView, "detail" | "add" | "success">;

const navItems: Array<{ key: PrimaryView; label: string; icon: LucideIcon }> = [
  { key: "staff", label: "Nhân viên", icon: UsersRound },
  { key: "credentials", label: "Tài khoản", icon: LockKeyhole },
  { key: "shifts", label: "Ca làm việc", icon: Clock3 },
  { key: "attendance", label: "Chấm công", icon: Fingerprint },
  { key: "requests", label: "Yêu cầu", icon: ListChecks },
  { key: "permissions", label: "Phân quyền", icon: KeyRound },
  { key: "reports", label: "Báo cáo", icon: BarChart3 }
];

const today = todayInputValue();
const STAFF_TIMESHEET_EXPORT_URL = "/api/admin/staff-operations/timesheets/export";
const STAFF_ACTIVITY_EXPORT_URL = "/api/admin/staff-operations/activity/export";

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NV";
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shortTime(value: string | null | undefined) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function dateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest || 0}p`;
  return rest ? `${hours}h ${rest}p` : `${hours}h`;
}

function formatVnd(value: number | null | undefined) {
  if (value === null || value === undefined) return "Chưa có";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function attendanceSourceLabel(source: StaffOpsAttendanceFeedItem["source"]) {
  const map: Record<StaffOpsAttendanceFeedItem["source"], string> = {
    gps: "GPS",
    qr: "QR",
    wifi: "WiFi",
    manual: "Chấm hộ",
    offline_sync: "Offline"
  };
  return map[source];
}

function attendanceStateLabel(state: StaffOpsAttendanceFeedItem["state"]) {
  const map: Record<StaffOpsAttendanceFeedItem["state"], string> = {
    on_time: "Đúng giờ",
    late: "Đi trễ",
    early_leave: "Về sớm",
    overtime: "Tăng ca",
    absent: "Vắng mặt"
  };
  return map[state];
}

function attendanceRiskScore(item: StaffOpsAttendanceFeedItem) {
  let score = 0;
  if (item.approvalState === "pending") score += 30;
  if (item.approvalState === "rejected") score += 55;
  if (item.state === "late") score += Math.min(35, 12 + Math.ceil(item.lateMinutes / 5));
  if (item.state === "early_leave") score += 20;
  if (item.state === "absent") score += 45;
  if (item.source === "manual" || item.source === "offline_sync") score += 14;
  if (item.source === "gps" && item.distanceMeters !== null && item.distanceMeters > 120) score += Math.min(30, Math.ceil(item.distanceMeters / 25));
  if (!item.clockOutAt) score += 8;
  return clampPercent(score);
}

function attendanceRiskTone(score: number): "success" | "warning" | "danger" | "neutral" {
  if (score >= 55) return "danger";
  if (score >= 28) return "warning";
  if (score > 0) return "neutral";
  return "success";
}

function attendanceRiskLabel(score: number) {
  if (score >= 55) return "Rủi ro cao";
  if (score >= 28) return "Cần kiểm tra";
  if (score > 0) return "Theo dõi";
  return "Ổn";
}

function payrollStatus(timesheet: StaffOperationsBundle["timesheets"][number]) {
  const overtimeGap = Math.max(0, timesheet.overtimeMinutes - timesheet.approvedOvertimeMinutes);
  if (timesheet.pendingApprovals > 0 || timesheet.attendanceScore < 75 || timesheet.lateCount >= 3 || timesheet.lateMinutes >= 45 || overtimeGap > 30) {
    return { label: "Cần đối soát", tone: "danger" as const };
  }
  if (timesheet.overtimeMinutes > 0 || timesheet.paidLeaveDays > 0 || timesheet.unpaidLeaveDays > 0) {
    return { label: "Cần duyệt kỳ", tone: "warning" as const };
  }
  return { label: "Sẵn sàng", tone: "success" as const };
}

function estimatePayrollAmount(timesheet: StaffOperationsBundle["timesheets"][number], contract: StaffOperationsBundle["contracts"][number] | null) {
  if (!contract?.salaryAmount) return null;
  const method = normalizeText(contract.salaryPaymentMethod ?? "");
  if (method.includes("gio") || method.includes("hour")) {
    return Math.round(contract.salaryAmount * (timesheet.workMinutes / 60));
  }
  return contract.salaryAmount;
}

function latestContractForStaff(contracts: StaffOperationsBundle["contracts"], staffMemberId: string) {
  return [...contracts]
    .filter((contract) => contract.staffMemberId === staffMemberId && contract.status !== "terminated")
    .sort((left, right) => right.startDate.localeCompare(left.startDate) || right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function latestReviewForStaff(reviews: StaffOperationsBundle["reviews"], staffMemberId: string) {
  return [...reviews]
    .filter((review) => review.staffMemberId === staffMemberId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function payrollPeriodLabel() {
  const now = new Date();
  return `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
}

function statusLabel(member: StaffOpsMember) {
  if (member.employmentStatus === "suspended" || member.accountStatus === "blocked") return "Tạm khóa";
  if (member.employmentStatus === "resigned" || member.isArchived) return "Nghỉ việc";
  if (member.todayAttendanceState === "late") return "Đi muộn";
  if (member.todayAttendanceState === "absent") return "Chưa đến";
  if (member.todayAttendanceState === "overtime") return "Tăng ca";
  if (member.activeSessionCount > 0 || member.todayAttendanceState === "on_time") return "Đang làm";
  return "Chưa đến";
}

function statusTone(label: string) {
  if (label === "Đang làm") return "success";
  if (label === "Đi muộn" || label === "Tạm khóa") return "danger";
  if (label === "Tăng ca") return "warning";
  return "neutral";
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    owner: "Chủ quán",
    manager: "Quản lý",
    cashier: "Thu ngân",
    waiter: "Phục vụ",
    kitchen: "Bếp",
    delivery: "Giao hàng",
    accountant: "Kế toán",
    marketing: "Marketing"
  };
  return map[role] ?? role;
}

function shiftAssignmentStatusLabel(status: StaffOpsShiftAssignment["status"]) {
  const map: Record<StaffOpsShiftAssignment["status"], string> = {
    scheduled: "Đã xếp",
    confirmed: "Đã nhận",
    swapped: "Đổi ca",
    cancelled: "Đã hủy",
    completed: "Hoàn tất"
  };
  return map[status];
}

function contractStatusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Bản nháp",
    active: "Đang hiệu lực",
    expired: "Hết hạn",
    terminated: "Đã kết thúc"
  };
  return map[status] ?? status;
}

function documentTypeLabel(type: string) {
  const map: Record<string, string> = {
    identity_card: "CCCD/CMND",
    health_certificate: "Giấy sức khỏe",
    contract: "Hợp đồng",
    training: "Đào tạo",
    other: "Khác"
  };
  return map[type] ?? type;
}

function documentStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "complete") return "success";
  if (status === "expired") return "danger";
  if (status === "missing") return "warning";
  return "neutral";
}

function documentStatusLabel(status: string) {
  const map: Record<string, string> = {
    complete: "Đủ hồ sơ",
    missing: "Thiếu",
    expired: "Hết hạn"
  };
  return map[status] ?? status;
}

function deviceTypeLabel(type: string) {
  const map: Record<string, string> = {
    phone: "Điện thoại",
    tablet: "Tablet",
    pos: "POS",
    cash_drawer: "Két tiền",
    other: "Khác"
  };
  return map[type] ?? type;
}

function deviceStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "assigned") return "success";
  if (status === "maintenance") return "warning";
  if (status === "lost") return "danger";
  return "neutral";
}

function deviceStatusLabel(status: string) {
  const map: Record<string, string> = {
    assigned: "Đang cấp",
    returned: "Đã trả",
    lost: "Mất",
    maintenance: "Bảo trì"
  };
  return map[status] ?? status;
}

function requestLabel(type: StaffOpsApprovalItem["requestType"]) {
  const map: Record<StaffOpsApprovalItem["requestType"], string> = {
    outside_location: "Ngoài vị trí",
    attendance_edit: "Sửa công",
    overtime: "Tăng ca",
    shift_override: "Ghi đè ca",
    manual_clock_in: "Chấm hộ",
    leave_request: "Nghỉ phép",
    shift_swap: "Đổi ca",
    device_restriction: "Thiết bị"
  };
  return map[type];
}

function attendanceLabel(item: StaffOpsAttendanceFeedItem | undefined) {
  if (!item) return "--:--";
  return `${shortTime(item.clockInAt)} - ${item.clockOutAt ? shortTime(item.clockOutAt) : "--:--"}`;
}

function currentAssignmentForMember(assignments: StaffOpsShiftAssignment[], memberId: string) {
  return assignments.find((assignment) => assignment.staffMemberId === memberId && assignment.scheduledDate === today && assignment.status !== "cancelled");
}

function activeAttendanceForMember(feed: StaffOpsAttendanceFeedItem[], memberId: string) {
  return feed.find((item) => item.staffMemberId === memberId && !item.clockOutAt) ?? null;
}

function isShiftAssignableMember(member: StaffOpsMember) {
  return !member.isArchived && member.employmentStatus === "active" && member.accountStatus === "active";
}

function getWeekRange() {
  const base = new Date();
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    const iso = new Date(current.getTime() - current.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    return {
      iso,
      weekday: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][current.getDay()],
      day: current.getDate()
    };
  });
}

function branchOptions(branches: StaffOpsBranchSummary[]) {
  return branches;
}

function ActionMessage({ state }: { state: StaffActionState | undefined }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-2 text-sm font-semibold",
        state.error ? "border-[#F28C28]/30 bg-[#FFF1DE] text-[#9A4F07]" : "border-[#0F4D3A]/20 bg-[#E8F6EE] text-[#0F4D3A]"
      )}
    >
      {state.error ?? state.success}
    </p>
  );
}

function useActionSuccessRefresh(state: StaffActionState | undefined, onSuccess?: (state: StaffActionState) => void) {
  const router = useRouter();
  const handledMessageRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state?.success || handledMessageRef.current === state.success) return;
    handledMessageRef.current = state.success;
    router.refresh();
    onSuccess?.(state);
  }, [onSuccess, router, state?.success]);
}

function OperationNotice({ message }: { message: { tone: "success" | "warning"; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "mb-5 rounded-xl border px-4 py-3 text-sm font-bold",
        message.tone === "success" ? "border-[#0F4D3A]/20 bg-[#DDF8E9] text-[#0F4D3A]" : "border-[#F28C28]/30 bg-[#FFF0D9] text-[#93540A]"
      )}
    >
      {message.text}
    </div>
  );
}

function StaffButton({ children, className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-[#0F4D3A] text-white shadow-[0_8px_20px_rgba(15,77,58,0.16)] hover:bg-[#0b3d2e]",
        variant === "secondary" && "border border-[#D8D1C7] bg-white text-[#2B2B2B] hover:border-[#0F4D3A]/35",
        variant === "ghost" && "bg-transparent text-[#4B4945] hover:bg-[#F5F1E9]",
        variant === "danger" && "bg-[#FFE0D4] text-[#A33D10] hover:bg-[#FFD4C3]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#0F4D3A]/15 bg-[#FFFDF8] text-[#2B2B2B] shadow-[0_8px_18px_rgba(15,42,31,0.045)] transition hover:border-[#0F4D3A]/35 active:scale-[0.98]", className)}
      {...props}
    >
      {children}
    </button>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("staff-brand-panel", className)}>{children}</section>;
}

function StatusChip({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "neutral" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        tone === "success" && "bg-[#DDF8E9] text-[#0F4D3A]",
        tone === "warning" && "bg-[#FFF0D9] text-[#93540A]",
        tone === "danger" && "bg-[#FFF0D9] text-[#A33D10]",
        tone === "neutral" && "bg-[#ECE9E3] text-[#595650]",
        tone === "brand" && "bg-[#E5EEE2] text-[#0F4D3A]"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Avatar({ name, active, size = "md" }: { name: string; active?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-[#E5EEE2] font-bold text-[#0F4D3A] ring-1 ring-[#D8D1C7]",
        size === "sm" && "h-9 w-9 text-xs",
        size === "md" && "h-10 w-10 text-xs",
        size === "lg" && "h-20 w-20 text-xl"
      )}
    >
      {initials(name)}
      {active !== undefined ? <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white", active ? "bg-[#0F4D3A]" : "bg-[#A6A19A]")} /> : null}
    </span>
  );
}

export function StaffRedesignWorkspace({ bundle, restaurantId, restaurantName, restaurantStaffCode }: StaffRedesignWorkspaceProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<StaffView>("staff");
  const [lastPrimaryView, setLastPrimaryView] = useState<PrimaryView>("staff");
  const [selectedMemberId, setSelectedMemberId] = useState(bundle.members[0]?.id ?? "");
  const [createdStaffUserId, setCreatedStaffUserId] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ employeeCode?: string | null; temporaryPassword?: string | null } | null>(null);
  const [search, setSearch] = useState("");
  const [operationMessage, setOperationMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const createdMember = createdStaffUserId ? bundle.members.find((member) => member.userId === createdStaffUserId) ?? null : null;
  const selectedMember = bundle.members.find((member) => member.id === selectedMemberId) ?? createdMember ?? bundle.members[0] ?? null;

  useStaffMobileRealtime({ restaurantId, onRefresh: () => router.refresh() });

  function openView(view: StaffView) {
    if (!["detail", "add", "success"].includes(view)) setLastPrimaryView(view as PrimaryView);
    setActiveView(view);
  }

  function openMember(memberId: string) {
    setSelectedMemberId(memberId);
    setActiveView("detail");
  }

  async function markNotificationsRead() {
    if (!bundle.unreadNotificationCount) {
      setOperationMessage({ tone: "success", text: "Không có thông báo mới." });
      return;
    }
    try {
      await markStaffNotificationRead({ all: true });
      setOperationMessage({ tone: "success", text: "Đã đánh dấu thông báo là đã đọc." });
      router.refresh();
    } catch (error) {
      setOperationMessage({ tone: "warning", text: error instanceof Error ? error.message : "Không thể cập nhật thông báo." });
    }
  }

  const pageTitle = activeView === "add" ? "Thêm nhân viên mới" : activeView === "success" ? "Hoàn tất" : activeView === "detail" ? selectedMember?.fullName ?? "Chi tiết nhân viên" : navItems.find((item) => item.key === activeView)?.label ?? "Nhân viên";

  return (
    <main className="staff-brand-page dashboard-density text-[#2B2B2B]">
      <DesktopSidebar activeView={lastPrimaryView} onNavigate={openView} />
      <section className="min-h-screen lg:pl-72">
        <TopBar title={pageTitle} restaurantName={restaurantName} search={search} onSearch={setSearch} onAdd={() => openView("add")} unreadCount={bundle.unreadNotificationCount} onNotifications={markNotificationsRead} />
        <MobileHeader title={pageTitle} onAdd={() => openView("add")} unreadCount={bundle.unreadNotificationCount} onNotifications={markNotificationsRead} />
        <div className="mx-auto w-full max-w-[1280px] px-5 pb-28 pt-6 sm:px-7 lg:px-8 lg:pb-10 lg:pt-8">
          <OperationNotice message={operationMessage} />
          {activeView === "staff" ? <StaffListScreen bundle={bundle} search={search} onSearch={setSearch} onOpenMember={openMember} onAdd={() => openView("add")} onNavigate={openView} /> : null}
          {activeView === "credentials" ? <CredentialsScreen bundle={bundle} restaurantName={restaurantName} restaurantStaffCode={restaurantStaffCode} search={search} onSearch={setSearch} onOpenMember={openMember} /> : null}
          {activeView === "detail" && selectedMember ? <StaffDetailScreen member={selectedMember} bundle={bundle} onBack={() => setActiveView(lastPrimaryView)} onPermissions={() => openView("permissions")} /> : null}
          {activeView === "add" ? <AddStaffScreen bundle={bundle} onCancel={() => setActiveView(lastPrimaryView)} onSuccess={(state) => { setCreatedStaffUserId(state.staffUserId ?? null); setCreatedCredentials({ employeeCode: state.employeeCode, temporaryPassword: state.temporaryPassword }); openView("success"); }} /> : null}
          {activeView === "success" ? <AddSuccessScreen member={createdMember ?? selectedMember ?? bundle.members[0] ?? null} credentials={createdCredentials} onList={() => openView("staff")} onProfile={() => { const profile = createdMember ?? selectedMember; return profile ? openMember(profile.id) : openView("staff"); }} /> : null}
          {activeView === "shifts" ? <ShiftScreen bundle={bundle} /> : null}
          {activeView === "attendance" ? <AttendanceScreen bundle={bundle} /> : null}
          {activeView === "requests" ? <RequestsScreen bundle={bundle} /> : null}
          {activeView === "permissions" ? <PermissionsScreen bundle={bundle} selectedMember={selectedMember} /> : null}
          {activeView === "reports" ? <ReportsScreen bundle={bundle} /> : null}
        </div>
      </section>
      <MobileBottomNav activeView={lastPrimaryView} onNavigate={openView} />
    </main>
  );
}

function DesktopSidebar({ activeView, onNavigate }: { activeView: PrimaryView; onNavigate: (view: StaffView) => void }) {
  return (
    <aside className="staff-brand-sidebar fixed inset-y-0 left-0 z-40 hidden w-72 border-r lg:flex lg:flex-col">
      <div className="px-6 pb-5 pt-6">
        <LogiVNLogo priority className="h-10 w-auto" />
        <span>
          <span className="mt-2 block text-xs font-medium tracking-[0.08em] text-[#0F4D3A]">SMART ORDERING. BETTER SERVICE.</span>
        </span>
      </div>
      <nav className="flex-1 space-y-1.5 px-3" aria-label="Staff workspace">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-bold transition",
                active ? "border-r-4 border-[#0F4D3A] bg-[#E5EEE2] text-[#2B2B2B]" : "text-[#3F3D39] hover:bg-[#F7F2EA]"
              )}
            >
              <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="space-y-3 px-4 pb-5">
        <Link href="/pricing" className="grid h-11 w-full place-items-center rounded-xl bg-[#0F4D3A] text-sm font-bold text-white opacity-90">Nâng cấp gói</Link>
        <div className="border-t border-[#D8D1C7] pt-3">
          <Link href="/dashboard/settings" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#4B4945] hover:bg-[#F7F2EA]"><Settings size={20} /> Cài đặt</Link>
          <Link href="/dashboard" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#4B4945] hover:bg-[#F7F2EA]"><Store size={20} /> Dashboard</Link>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  title,
  restaurantName,
  search,
  onSearch,
  onAdd,
  unreadCount,
  onNotifications
}: {
  title: string;
  restaurantName: string;
  search: string;
  onSearch: (value: string) => void;
  onAdd: () => void;
  unreadCount: number;
  onNotifications: () => void;
}) {
  return (
    <header className="staff-brand-topbar sticky top-0 z-30 hidden h-16 items-center justify-between border-b px-6 lg:flex">
      <label className="relative block w-full max-w-[480px]">
        <span className="sr-only">Tìm kiếm</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#74716B]" size={20} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="h-10 w-full rounded-xl border border-[#CFC8BE] bg-white pl-11 pr-4 text-sm font-medium outline-none transition placeholder:text-[#74716B] focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10"
          placeholder={title === "Báo cáo" ? "Tìm kiếm báo cáo..." : "Tìm kiếm nhân viên..."}
        />
      </label>
      <div className="flex items-center gap-3">
        <StaffButton onClick={onAdd} className="min-w-[154px]"><Plus size={17} /> Thêm nhân viên</StaffButton>
        <span className="h-8 w-px bg-[#D8D1C7]" />
        <IconButton label={unreadCount ? `Đánh dấu ${unreadCount} thông báo đã đọc` : "Thông báo"} onClick={onNotifications} className="border-transparent bg-transparent"><Bell size={20} />{unreadCount ? <span className="absolute mt-[-20px] ml-[16px] h-2.5 w-2.5 rounded-full bg-[#F28C28]" /> : null}</IconButton>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0F4D3A] text-sm font-black text-white ring-2 ring-[#D8D1C7]">{restaurantName.charAt(0).toUpperCase()}</span>
      </div>
    </header>
  );
}

function MobileHeader({ title, onAdd, unreadCount, onNotifications }: { title: string; onAdd: () => void; unreadCount: number; onNotifications: () => void }) {
  return (
    <header className="staff-brand-mobile-header sticky top-0 z-30 flex h-[60px] items-center justify-between border-b px-4 lg:hidden">
      <div className="flex items-center gap-4">
        <h1 className="max-w-[180px] truncate text-xl font-black leading-none text-[#2B2B2B] sm:max-w-none">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Thêm nhân viên" onClick={onAdd} className="border-transparent bg-transparent"><Plus size={22} /></IconButton>
        <IconButton label={unreadCount ? `Đánh dấu ${unreadCount} thông báo đã đọc` : "Thông báo"} onClick={onNotifications} className="border-transparent bg-transparent"><Bell size={22} />{unreadCount ? <span className="absolute mt-[-22px] ml-[18px] h-2.5 w-2.5 rounded-full bg-[#F28C28]" /> : null}</IconButton>
      </div>
    </header>
  );
}

function MobileBottomNav({ activeView, onNavigate }: { activeView: PrimaryView; onNavigate: (view: StaffView) => void }) {
  const items = navItems.filter((item) => ["staff", "credentials", "shifts", "attendance", "reports"].includes(item.key));
  return (
    <nav className="staff-brand-bottom-nav fixed inset-x-0 bottom-0 z-40 grid h-[86px] grid-cols-5 border-t px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 lg:hidden" aria-label="Staff mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.key;
        return (
          <button key={item.key} type="button" onClick={() => onNavigate(item.key)} className={cn("grid min-h-14 place-items-center rounded-xl text-xs font-semibold transition", active ? "text-[#0F4D3A]" : "text-[#3F3D39]")}>
            <Icon size={22} strokeWidth={active ? 2.6 : 2.1} aria-hidden="true" />
            <span className="mt-0.5 truncate">{item.key === "staff" ? "Nhân viên" : item.key === "credentials" ? "Tài khoản" : item.key === "shifts" ? "Ca làm" : item.key === "attendance" ? "Chấm công" : "Báo cáo"}</span>
            <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#0F4D3A]" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}

function StaffListScreen({ bundle, search, onSearch, onOpenMember, onAdd, onNavigate }: { bundle: StaffOperationsBundle; search: string; onSearch: (value: string) => void; onOpenMember: (id: string) => void; onAdd: () => void; onNavigate: (view: StaffView) => void }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const query = normalizeText(search);
  const branches = branchOptions(bundle.branches);
  const roles = [...new Map(bundle.roles.map((role) => [role.code, role])).values()];

  const filteredMembers = useMemo(
    () =>
      bundle.members.filter((member) => {
        const status = statusLabel(member);
        const matchesQuery = !query || normalizeText(`${member.fullName} ${member.employeeCode ?? ""} ${member.phone ?? ""} ${member.email} ${member.roleTitle} ${member.primaryBranchName ?? ""}`).includes(query);
        const matchesBranch = branchFilter === "all" || member.primaryBranchId === branchFilter;
        const matchesRole = roleFilter === "all" || member.roleCode === roleFilter;
        const matchesStatus = statusFilter === "all" || status === statusFilter;
        return matchesQuery && matchesBranch && matchesRole && matchesStatus;
      }),
    [branchFilter, bundle.members, query, roleFilter, statusFilter]
  );

  const kpis = [
    { label: "Đang làm", value: bundle.overview.activeStaff || bundle.members.filter((member) => statusLabel(member) === "Đang làm").length, tone: "success" as const, icon: UserRound },
    { label: "Chưa đến", value: bundle.overview.absentStaff || bundle.members.filter((member) => statusLabel(member) === "Chưa đến").length, tone: "neutral" as const, icon: Clock3 },
    { label: "Đi muộn", value: bundle.overview.lateAttendance, tone: "danger" as const, icon: Clock3 },
    { label: "Chờ duyệt", value: bundle.overview.approvalRequests, tone: "brand" as const, icon: ListChecks }
  ];
  const todayAssignments = bundle.shiftAssignments.filter((assignment) => assignment.scheduledDate === today && assignment.status !== "cancelled");
  const confirmedToday = todayAssignments.filter((assignment) => assignment.status === "confirmed" || assignment.status === "completed").length;
  const openSessionCount = bundle.attendanceFeed.filter((item) => !item.clockOutAt).length;
  const payrollBlockerCount = bundle.timesheets.filter((item) => payrollStatus(item).tone === "danger").length;
  const highRiskAttendanceCount = bundle.attendanceFeed.filter((item) => attendanceRiskScore(item) >= 55).length;
  const branchAlerts = [...branches]
    .filter((branch) => branch.coverageScore < 80 || branch.lateCount > 0 || branch.pendingApprovals > 0 || branch.suspiciousCount > 0)
    .sort((left, right) => (right.pendingApprovals * 4 + right.lateCount * 3 + right.suspiciousCount * 5 + Math.max(0, 80 - right.coverageScore)) - (left.pendingApprovals * 4 + left.lateCount * 3 + left.suspiciousCount * 5 + Math.max(0, 80 - left.coverageScore)))
    .slice(0, 3);
  const commandMetrics = [
    { label: "Đang mở ca", value: openSessionCount, detail: "phiên cần kết ca đúng giờ", tone: openSessionCount ? "success" : "neutral", icon: Fingerprint, view: "attendance" as StaffView },
    { label: "Nhận ca", value: `${confirmedToday}/${todayAssignments.length || 0}`, detail: "ca hôm nay đã xác nhận", tone: todayAssignments.length && confirmedToday < todayAssignments.length ? "warning" : "success", icon: CalendarClock, view: "shifts" as StaffView },
    { label: "Rủi ro công", value: highRiskAttendanceCount, detail: "bản ghi cần kiểm tra", tone: highRiskAttendanceCount ? "danger" : "success", icon: ShieldCheck, view: "attendance" as StaffView },
    { label: "Chặn payroll", value: payrollBlockerCount, detail: "nhân sự cần đối soát", tone: payrollBlockerCount ? "danger" : "success", icon: BriefcaseBusiness, view: "reports" as StaffView }
  ];

  return (
    <div className="space-y-5">
      <section className="hidden lg:block">
        <h1 className="text-2xl font-black leading-tight text-[#2B2B2B]">Quản lý Nhân viên</h1>
        <p className="mt-1 text-sm font-medium text-[#4B4945]">Tổng quan và danh sách nhân sự trong ca làm việc hôm nay.</p>
      </section>

      <Panel className="overflow-hidden">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Trung tâm nhân sự</p>
                <h2 className="mt-1 text-xl font-black leading-tight text-[#2B2B2B] lg:text-2xl">Vận hành nhân sự hôm nay</h2>
              </div>
              <StatusChip tone="brand">Đồng bộ thật</StatusChip>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {commandMetrics.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} type="button" onClick={() => onNavigate(item.view)} className="min-h-[104px] rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-3 text-left transition hover:border-[#0F4D3A]/35 hover:bg-[#F9F7F0]">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", item.tone === "danger" ? "bg-[#FFF0D9] text-[#A33D10]" : item.tone === "warning" ? "bg-[#FFF0D9] text-[#93540A]" : item.tone === "success" ? "bg-[#E5EEE2] text-[#0F4D3A]" : "bg-[#ECE9E3] text-[#595650]")}> <Icon size={17} /> </span>
                      <ChevronRight size={16} className="text-[#8B857B]" />
                    </span>
                    <span className="mt-3 block text-2xl font-black leading-none text-[#2B2B2B]">{item.value}</span>
                    <span className="mt-1 block text-xs font-black uppercase tracking-[0.08em] text-[#3F3D39]">{item.label}</span>
                    <span className="mt-1 block text-xs font-semibold text-[#6B655B]">{item.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-[#E5DDD2] bg-[#F9F7F0] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#2B2B2B]">Chi nhánh cần chú ý</h3>
              <button type="button" onClick={() => onNavigate("reports")} className="text-xs font-black text-[#0F4D3A]">Mở báo cáo</button>
            </div>
            <div className="mt-3 space-y-2">
              {branchAlerts.map((branch) => (
                <button key={branch.id} type="button" onClick={() => onNavigate(branch.pendingApprovals ? "requests" : "shifts")} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white px-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[#2B2B2B]">{branch.name}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-[#6B655B]">{branch.coverageScore}% phủ ca · {branch.lateCount} muộn · {branch.pendingApprovals} chờ duyệt</span>
                  </span>
                  <StatusChip tone={branch.coverageScore < 55 || branch.suspiciousCount > 0 ? "danger" : "warning"}>{branch.coverageScore < 80 ? "Thiếu phủ" : "Theo dõi"}</StatusChip>
                </button>
              ))}
              {!branchAlerts.length ? <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-white px-3 py-4 text-sm font-semibold text-[#5E5A54]">Các chi nhánh đang ổn theo dữ liệu hiện có.</p> : null}
            </div>
          </div>
        </div>
        <div className="grid border-t border-[#E5DDD2] bg-[#FCFAF6] text-sm font-black text-[#2B2B2B] sm:grid-cols-4">
          <button type="button" onClick={() => onNavigate("attendance")} className="flex min-h-12 items-center justify-center gap-2 border-b border-[#E5DDD2] px-3 hover:bg-white sm:border-b-0 sm:border-r"><Fingerprint size={17} /> Chấm công</button>
          <button type="button" onClick={() => onNavigate("shifts")} className="flex min-h-12 items-center justify-center gap-2 border-b border-[#E5DDD2] px-3 hover:bg-white sm:border-b-0 sm:border-r"><CalendarClock size={17} /> Gán ca</button>
          <button type="button" onClick={() => onNavigate("credentials")} className="flex min-h-12 items-center justify-center gap-2 border-b border-[#E5DDD2] px-3 hover:bg-white sm:border-b-0 sm:border-r"><KeyRound size={17} /> Tài khoản</button>
          <button type="button" onClick={() => onNavigate("reports")} className="flex min-h-12 items-center justify-center gap-2 px-3 hover:bg-white"><BriefcaseBusiness size={17} /> Lương/thưởng</button>
        </div>
      </Panel>

      <section>
        <p className="mb-3 text-sm font-black uppercase tracking-[0.08em] text-[#3F3D39] lg:hidden">Hôm nay</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <Panel key={item.label} className="flex h-24 items-center justify-between p-4 lg:h-24">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#3F3D39]"><span className={cn("h-2 w-2 rounded-full", item.tone === "success" ? "bg-[#0F4D3A]" : item.tone === "danger" ? "bg-[#A33D10]" : item.tone === "brand" ? "bg-[#0F4D3A]" : "bg-[#3B2500]")} />{item.label}</p>
                  <p className={cn("mt-2 text-2xl font-black leading-none", item.tone === "danger" ? "text-[#A33D10]" : "text-[#2B2B2B]")}>{item.value}</p>
                </div>
                <span className={cn("hidden h-11 w-11 place-items-center rounded-full lg:grid", item.tone === "success" ? "bg-[#A9C5A1] text-[#0F4D3A]" : item.tone === "danger" ? "bg-[#FFE2C6] text-[#A33D10]" : item.tone === "brand" ? "bg-[#E5EEE2] text-[#0F4D3A]" : "bg-[#6B3D00] text-[#FFF7EB]")}>
                  <Icon size={20} />
                </span>
              </Panel>
            );
          })}
        </div>
      </section>

      <Panel className="hidden p-4 lg:block">
        <div className="grid items-center gap-4">
          <div className="flex flex-wrap gap-3">
            <SelectPill value={branchFilter} onChange={setBranchFilter} label="Tất cả chi nhánh" options={[{ value: "all", label: "Tất cả chi nhánh" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} />
            <SelectPill value={roleFilter} onChange={setRoleFilter} label="Vị trí" options={[{ value: "all", label: "Vị trí" }, ...roles.map((role) => ({ value: role.code, label: role.title }))]} />
            <SelectPill value={statusFilter} onChange={setStatusFilter} label="Trạng thái" options={["all", "Đang làm", "Chưa đến", "Đi muộn", "Tăng ca", "Tạm khóa"].map((value) => ({ value, label: value === "all" ? "Trạng thái" : value }))} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-[1.45fr_0.78fr_1fr] gap-2 lg:hidden">
        <SelectPill value={branchFilter} onChange={setBranchFilter} label="Tất cả chi nhánh" options={[{ value: "all", label: "Tất cả chi nhánh" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} compact fluid />
        <SelectPill value={roleFilter} onChange={setRoleFilter} label="Vị trí" options={[{ value: "all", label: "Vị trí" }, ...roles.map((role) => ({ value: role.code, label: role.title }))]} compact fluid />
        <SelectPill value={statusFilter} onChange={setStatusFilter} label="Trạng thái" options={["all", "Đang làm", "Chưa đến", "Đi muộn", "Tăng ca"].map((value) => ({ value, label: value === "all" ? "Trạng thái" : value }))} compact fluid />
      </div>

      <div className="hidden">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#74716B]" size={20} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} className="h-12 w-full rounded-2xl border border-[#D8D1C7] bg-white pl-11 pr-4 text-base font-semibold outline-none" placeholder="Tìm nhân viên" />
        </label>
      </div>

      <StaffDesktopTable members={filteredMembers} bundle={bundle} onOpenMember={onOpenMember} onNavigate={onNavigate} />
      <div className="space-y-4 lg:hidden">
        {filteredMembers.map((member) => (
          <StaffMobileCard key={member.id} member={member} bundle={bundle} onOpen={() => onOpenMember(member.id)} onAttendance={() => onNavigate("attendance")} />
        ))}
        {!filteredMembers.length ? <EmptyState title="Không có nhân viên phù hợp" text="Thử đổi bộ lọc hoặc thêm hồ sơ mới." action={<StaffButton onClick={onAdd}><Plus size={17} /> Thêm nhân viên</StaffButton>} /> : null}
      </div>
    </div>
  );
}

function SelectPill({ value, onChange, options, label, compact, fluid }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label: string; compact?: boolean; fluid?: boolean }) {
  return (
    <label className={cn("relative", fluid ? "min-w-0" : "shrink-0")}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={cn("appearance-none rounded-xl border border-[#D8D1C7] bg-[#F9F7F3] py-0 pl-3 pr-9 text-sm font-semibold text-[#2B2B2B] outline-none focus:border-[#0F4D3A]", compact ? "h-10 rounded-full" : "h-10 min-w-[148px]", compact && !fluid && "min-w-[136px]", fluid && "w-full truncate pl-3 pr-8")}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#4B4945]" size={18} />
    </label>
  );
}

function StaffDesktopTable({ members, bundle, onOpenMember, onNavigate }: { members: StaffOpsMember[]; bundle: StaffOperationsBundle; onOpenMember: (id: string) => void; onNavigate: (view: StaffView) => void }) {
  return (
    <Panel className="hidden overflow-hidden lg:block">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em] text-[#37342F]">
          <tr>
            <th className="px-5 py-3">Nhân viên</th>
            <th className="px-4 py-3">Vị trí</th>
            <th className="px-4 py-3">Ca hôm nay</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3">Chi nhánh</th>
            <th className="px-5 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D8D1C7]">
          {members.map((member) => {
            const assignment = currentAssignmentForMember(bundle.shiftAssignments, member.id);
            const attendance = bundle.attendanceFeed.find((item) => item.staffMemberId === member.id);
            const label = statusLabel(member);
            return (
              <tr key={member.id} className="bg-white transition hover:bg-[#FFF9F0]">
                <td className="px-5 py-3">
                  <button type="button" onClick={() => onOpenMember(member.id)} className="flex min-h-10 items-center gap-3 text-left">
                    <Avatar name={member.fullName} active={label === "Đang làm"} />
                    <span>
                      <span className="block text-base font-black text-[#2B2B2B]">{member.fullName}</span>
                      <span className="block text-sm font-semibold text-[#4B4945]">EMP-{member.id.slice(0, 4).toUpperCase()}</span>
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3 text-sm font-medium text-[#3F3D39]">{member.roleTitle || roleLabel(member.roleCode)}</td>
                <td className="px-4 py-3 text-sm font-bold text-[#2B2B2B]">{assignment ? `${assignment.shiftName.includes(":") ? "" : ""}${attendanceLabel(attendance)}` : "--:--"}</td>
                <td className="px-4 py-3"><StatusChip tone={statusTone(label)}>{label}</StatusChip></td>
                <td className="px-4 py-3 text-sm font-medium text-[#3F3D39]">{member.primaryBranchName ?? "Chưa gán"}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <IconButton label="Chấm công" onClick={() => onNavigate("attendance")}><Fingerprint size={18} /></IconButton>
                    <IconButton label="Hồ sơ" onClick={() => onOpenMember(member.id)}><UserRound size={18} /></IconButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-[#D8D1C7] px-5 py-3 text-sm font-semibold text-[#3F3D39]">
        <span>Đang hiển thị {members.length} nhân viên theo bộ lọc hiện tại</span>
        <span className="rounded-lg bg-[#F5F8F1] px-3 py-1 text-xs font-black text-[#0F4D3A]">Dữ liệu thật</span>
      </div>
    </Panel>
  );
}

function StaffMobileCard({ member, bundle, onOpen, onAttendance }: { member: StaffOpsMember; bundle: StaffOperationsBundle; onOpen: () => void; onAttendance: () => void }) {
  const assignment = currentAssignmentForMember(bundle.shiftAssignments, member.id);
  const attendance = bundle.attendanceFeed.find((item) => item.staffMemberId === member.id);
  const label = statusLabel(member);
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar name={member.fullName} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-black leading-tight text-[#2B2B2B]">{member.fullName}</span>
            <span className="mt-1 block truncate text-sm font-medium text-[#3F3D39]">{member.roleTitle} • {member.primaryBranchName ?? "Chưa gán"}</span>
          </span>
        </button>
        <StatusChip tone={statusTone(label)}>{label}</StatusChip>
      </div>
      <div className="mt-4 flex min-h-12 items-center gap-3 rounded-xl bg-[#F5F8F1] px-4 text-sm font-semibold text-[#2B2B2B]"><Clock3 size={18} className="text-[#77736D]" />{assignment ? `${assignment.shiftName}: ${attendanceLabel(attendance)}` : "Chưa có ca hôm nay"}</div>
      <div className="mt-5 grid grid-cols-[minmax(124px,1.15fr)_minmax(92px,1fr)] gap-2">
        <StaffButton variant={label === "Đang làm" ? "secondary" : "ghost"} onClick={onAttendance} className="min-h-11 whitespace-nowrap px-3 text-sm"><Fingerprint size={19} /> Chấm công</StaffButton>
        <StaffButton variant="secondary" onClick={onOpen} className="min-h-11 whitespace-nowrap px-3 text-sm"><UserRound size={18} /> Hồ sơ</StaffButton>
      </div>
    </Panel>
  );
}

function isAppPasswordLocked(member: StaffOpsMember) {
  return Boolean(member.appPasswordLockedUntil && new Date(member.appPasswordLockedUntil).getTime() > Date.now());
}

function credentialTone(member: StaffOpsMember): "success" | "warning" | "danger" | "neutral" {
  if (member.isArchived || member.employmentStatus === "resigned") return "neutral";
  if (member.accountStatus === "blocked" || member.employmentStatus === "suspended" || isAppPasswordLocked(member)) return "danger";
  if (member.mustChangeAppPassword) return "warning";
  return "success";
}

function credentialLabel(member: StaffOpsMember) {
  if (member.isArchived || member.employmentStatus === "resigned") return "Đã lưu trữ";
  if (isAppPasswordLocked(member)) return "Khóa tạm";
  if (member.accountStatus === "blocked" || member.employmentStatus === "suspended") return "Bị khóa";
  if (member.mustChangeAppPassword) return "Cần đổi mật khẩu";
  return "Sẵn sàng";
}

function inferRestaurantStaffCode(restaurantStaffCode: string | null | undefined, members: StaffOpsMember[]) {
  if (restaurantStaffCode) return restaurantStaffCode;
  const employeeCode = members.find((member) => member.employeeCode && member.employeeCode.length > 6)?.employeeCode;
  return employeeCode ? employeeCode.slice(0, -6) : "Chưa cấp";
}

function CopyTextButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? "Đã sao chép" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
      className={copied ? "border-[#0F4D3A]/30 bg-[#E5EEE2] text-[#0F4D3A]" : undefined}
    >
      {copied ? <Check size={17} /> : <Copy size={17} />}
    </IconButton>
  );
}

function CredentialsScreen({
  bundle,
  restaurantName,
  restaurantStaffCode,
  search,
  onSearch,
  onOpenMember
}: {
  bundle: StaffOperationsBundle;
  restaurantName: string;
  restaurantStaffCode?: string | null;
  search: string;
  onSearch: (value: string) => void;
  onOpenMember: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "locked" | "ready">("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkState, bulkAction, bulkPending] = useActionState(resetStaffAppPasswordsAction, undefined);
  useActionSuccessRefresh(bulkState);

  const query = normalizeText(search);
  const staffCode = inferRestaurantStaffCode(restaurantStaffCode, bundle.members);
  const loginUrl = "/staff/login";
  const credentialMembers = useMemo(() => bundle.members.filter((member) => !member.isArchived), [bundle.members]);
  const filteredMembers = useMemo(
    () =>
      credentialMembers.filter((member) => {
        const matchesQuery = !query || normalizeText(`${member.fullName} ${member.employeeCode ?? ""} ${member.phone ?? ""} ${member.roleTitle} ${member.primaryBranchName ?? ""}`).includes(query);
        const matchesFilter =
          filter === "all" ||
          (filter === "pending" && member.mustChangeAppPassword) ||
          (filter === "locked" && (isAppPasswordLocked(member) || member.accountStatus === "blocked" || member.employmentStatus === "suspended")) ||
          (filter === "ready" && credentialLabel(member) === "Sẵn sàng");
        return matchesQuery && matchesFilter;
      }),
    [credentialMembers, filter, query]
  );
  const visibleUserIds = new Set(filteredMembers.map((member) => member.userId));
  const selectedVisibleCount = selectedUserIds.filter((userId) => visibleUserIds.has(userId)).length;
  const pendingPasswordCount = credentialMembers.filter((member) => member.mustChangeAppPassword).length;
  const lockedCount = credentialMembers.filter((member) => isAppPasswordLocked(member) || member.accountStatus === "blocked" || member.employmentStatus === "suspended").length;
  const readyCount = credentialMembers.filter((member) => credentialLabel(member) === "Sẵn sàng").length;

  function toggleMember(userId: string, checked: boolean) {
    setSelectedUserIds((current) => checked ? (current.includes(userId) ? current : [...current, userId]) : current.filter((item) => item !== userId));
  }

  function toggleVisible(checked: boolean) {
    setSelectedUserIds((current) => {
      if (!checked) return current.filter((userId) => !visibleUserIds.has(userId));
      return [...new Set([...current, ...filteredMembers.map((member) => member.userId)])];
    });
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="overflow-hidden p-0">
          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-[#0F4D3A]">Đăng nhập app nhân viên</p>
              <h1 className="mt-2 text-[32px] font-black text-[#2B2B2B]">Tài khoản nhân viên</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-[#5E5A54]">Quản lý mã nhân viên, mật khẩu app lần đầu và cấp lại mật khẩu bằng dữ liệu thật của {restaurantName}.</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#0F4D3A] text-white"><ShieldCheck size={23} /></span>
          </div>
          <div className="grid border-t border-[#D8D1C7] md:grid-cols-2">
            <div className="border-b border-[#D8D1C7] p-5 md:border-b-0 md:border-r">
              <p className="text-xs font-black uppercase text-[#5E5A54]">Mã quán</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-2xl font-black text-[#2B2B2B]">{staffCode}</p>
                {staffCode !== "Chưa cấp" ? <CopyTextButton value={staffCode} label="Sao chép mã quán" /> : null}
              </div>
            </div>
            <div className="p-5">
              <p className="text-xs font-black uppercase text-[#5E5A54]">URL đăng nhập</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-base font-black text-[#2B2B2B]">{loginUrl}</p>
                <CopyTextButton value={loginUrl} label="Sao chép URL đăng nhập" />
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="grid grid-cols-3 gap-2">
            <MetricMini label="Sẵn sàng" value={readyCount} />
            <MetricMini label="Cần đổi" value={pendingPasswordCount} />
            <MetricMini label="Khóa" value={lockedCount} />
          </div>
          <form action={bulkAction} className="mt-3 grid gap-3">
            <input type="hidden" name="userIds" value={JSON.stringify(selectedUserIds.filter((userId) => visibleUserIds.has(userId)))} />
            <input type="hidden" name="reason" value="Chủ quán cấp lại mật khẩu app từ trung tâm tài khoản nhân viên" />
            <StaffButton type="submit" disabled={bulkPending || selectedVisibleCount === 0} className="w-full"><RefreshCw size={17} /> {bulkPending ? "Đang cấp..." : `Cấp lại ${selectedVisibleCount || ""} mật khẩu`}</StaffButton>
            <ActionMessage state={bulkState} />
          </form>
        </Panel>
      </section>

      {bulkState?.temporaryCredentials?.length ? <TemporaryCredentialsPanel credentials={bulkState.temporaryCredentials} /> : null}

      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_150px] lg:items-center">
          <label className="relative block">
            <span className="sr-only">Tìm tài khoản nhân viên</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74716B]" size={18} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} className="staff-redesign-input pl-10" placeholder="Tìm tên, mã nhân viên, SĐT..." />
          </label>
          <SelectPill value={filter} onChange={(value) => setFilter(value as typeof filter)} label="Trạng thái đăng nhập" options={[{ value: "all", label: "Tất cả" }, { value: "pending", label: "Cần đổi mật khẩu" }, { value: "locked", label: "Đang khóa" }, { value: "ready", label: "Sẵn sàng" }]} fluid />
          <StaffButton variant="secondary" onClick={() => toggleVisible(selectedVisibleCount !== filteredMembers.length)}><Check size={17} /> {selectedVisibleCount === filteredMembers.length && filteredMembers.length ? "Bỏ chọn" : "Chọn trang"}</StaffButton>
        </div>
      </Panel>

      <Panel className="hidden overflow-hidden lg:block">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase text-[#37342F]">
            <tr>
              <th className="w-12 px-4 py-3"><input type="checkbox" checked={filteredMembers.length > 0 && selectedVisibleCount === filteredMembers.length} onChange={(event) => toggleVisible(event.target.checked)} aria-label="Chọn tất cả tài khoản hiển thị" /></th>
              <th className="px-4 py-3">Nhân viên</th>
              <th className="px-4 py-3">Mã đăng nhập</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Lần cuối</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D8D1C7]">
            {filteredMembers.map((member) => (
              <CredentialTableRow key={member.id} member={member} selected={selectedUserIds.includes(member.userId)} onSelect={(checked) => toggleMember(member.userId, checked)} onOpen={() => onOpenMember(member.id)} />
            ))}
          </tbody>
        </table>
        {!filteredMembers.length ? <InlineEmptyState title="Không có tài khoản phù hợp" text="Đổi bộ lọc hoặc tìm bằng mã nhân viên khác." /> : null}
      </Panel>

      <div className="space-y-3 lg:hidden">
        {filteredMembers.map((member) => (
          <CredentialMobileCard key={member.id} member={member} selected={selectedUserIds.includes(member.userId)} onSelect={(checked) => toggleMember(member.userId, checked)} onOpen={() => onOpenMember(member.id)} />
        ))}
        {!filteredMembers.length ? <EmptyState title="Không có tài khoản phù hợp" text="Đổi bộ lọc hoặc tìm bằng mã nhân viên khác." /> : null}
      </div>
    </div>
  );
}

function TemporaryCredentialsPanel({ credentials }: { credentials: NonNullable<StaffActionState["temporaryCredentials"]> }) {
  return (
    <Panel className="border-[#0F4D3A]/25 bg-[#E8F6EE] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0F4D3A]">Mật khẩu tạm vừa cấp</h2>
          <p className="mt-1 text-sm font-semibold text-[#3F3D39]">Chỉ gửi cho đúng nhân viên và yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
        </div>
        <StatusChip tone="success">{credentials.length} tài khoản</StatusChip>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {credentials.map((item) => (
          <div key={item.userId} className="grid gap-3 rounded-xl border border-[#0F4D3A]/15 bg-white/75 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#2B2B2B]">{item.staffName}</p>
              <p className="mt-1 font-mono text-sm font-black text-[#0F4D3A]">{item.employeeCode}</p>
              <p className="mt-1 break-all font-mono text-sm font-black text-[#2B2B2B]">{item.temporaryPassword}</p>
            </div>
            <CopyTextButton value={`${item.employeeCode}\n${item.temporaryPassword}`} label="Sao chép thông tin đăng nhập" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CredentialTableRow({ member, selected, onSelect, onOpen }: { member: StaffOpsMember; selected: boolean; onSelect: (checked: boolean) => void; onOpen: () => void }) {
  const [state, action, pending] = useActionState(resetStaffAppPasswordAction, undefined);
  useActionSuccessRefresh(state);
  const label = credentialLabel(member);
  return (
    <tr className="bg-white transition hover:bg-[#FFF9F0]">
      <td className="px-4 py-3"><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Chọn ${member.fullName}`} /></td>
      <td className="px-4 py-3">
        <button type="button" onClick={onOpen} className="flex min-h-10 min-w-0 items-center gap-3 text-left">
          <Avatar name={member.fullName} active={member.activeSessionCount > 0} />
          <span className="min-w-0"><span className="block truncate text-sm font-black text-[#2B2B2B]">{member.fullName}</span><span className="block truncate text-xs font-semibold text-[#5E5A54]">{member.roleTitle} · {member.primaryBranchName ?? "Chưa gán"}</span></span>
        </button>
      </td>
      <td className="px-4 py-3"><span className="font-mono text-sm font-black text-[#2B2B2B]">{member.employeeCode ?? "Chưa đồng bộ"}</span></td>
      <td className="px-4 py-3"><StatusChip tone={credentialTone(member)}>{label}</StatusChip>{member.appPasswordAttempts > 0 ? <p className="mt-1 text-xs font-semibold text-[#A33D10]">Sai {member.appPasswordAttempts} lần</p> : null}</td>
      <td className="px-4 py-3 text-sm font-semibold text-[#3F3D39]">{formatDateTime(member.lastSeenAt)}</td>
      <td className="px-4 py-3 text-right">
        <form action={action} className="inline-flex flex-col items-end gap-2">
          <input type="hidden" name="userId" value={member.userId} />
          <input type="hidden" name="reason" value="Chủ quán cấp lại mật khẩu app từ trung tâm tài khoản" />
          <StaffButton type="submit" variant="secondary" disabled={pending}><RefreshCw size={16} /> {pending ? "Đang cấp..." : "Cấp lại"}</StaffButton>
          {state?.temporaryPassword ? <div className="max-w-[260px] rounded-lg border border-[#0F4D3A]/15 bg-[#E8F6EE] p-2 text-left text-xs font-bold text-[#0F4D3A]"><p>{state.employeeCode ?? member.employeeCode}</p><p className="break-all">{state.temporaryPassword}</p></div> : <ActionMessage state={state} />}
        </form>
      </td>
    </tr>
  );
}

function CredentialMobileCard({ member, selected, onSelect, onOpen }: { member: StaffOpsMember; selected: boolean; onSelect: (checked: boolean) => void; onOpen: () => void }) {
  const [state, action, pending] = useActionState(resetStaffAppPasswordAction, undefined);
  useActionSuccessRefresh(state);
  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} className="mt-3" aria-label={`Chọn ${member.fullName}`} />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar name={member.fullName} active={member.activeSessionCount > 0} />
          <span className="min-w-0"><span className="block truncate text-base font-black text-[#2B2B2B]">{member.fullName}</span><span className="block truncate text-xs font-semibold text-[#5E5A54]">{member.employeeCode ?? "Chưa đồng bộ"}</span></span>
        </button>
        <StatusChip tone={credentialTone(member)}>{credentialLabel(member)}</StatusChip>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#F5F8F1] p-3 text-sm font-semibold text-[#3F3D39]"><span>{member.roleTitle}</span><span className="text-right">{formatDateTime(member.lastSeenAt)}</span></div>
      <form action={action} className="mt-3 grid gap-2">
        <input type="hidden" name="userId" value={member.userId} />
        <input type="hidden" name="reason" value="Chủ quán cấp lại mật khẩu app từ trung tâm tài khoản" />
        <StaffButton type="submit" variant="secondary" disabled={pending} className="w-full"><RefreshCw size={16} /> {pending ? "Đang cấp..." : "Cấp lại mật khẩu"}</StaffButton>
        {state?.temporaryPassword ? <div className="rounded-lg border border-[#0F4D3A]/15 bg-[#E8F6EE] p-3 text-sm font-bold text-[#0F4D3A]"><p>{state.employeeCode ?? member.employeeCode}</p><p className="break-all">{state.temporaryPassword}</p></div> : <ActionMessage state={state} />}
      </form>
    </Panel>
  );
}

function StaffDetailScreen({ member, bundle, onBack, onPermissions }: { member: StaffOpsMember; bundle: StaffOperationsBundle; onBack: () => void; onPermissions: () => void }) {
  const [activeTab, setActiveTab] = useState<"profile" | "schedule" | "payroll" | "security">("profile");
  const [profileState, profileAction, savingProfile] = useActionState(updateStaffProfileAction, undefined);
  const [accountState, accountAction, updatingAccount] = useActionState(setStaffAccountStateAction, undefined);
  const [passwordState, passwordAction, resettingPassword] = useActionState(resetStaffAppPasswordAction, undefined);
  const [assignmentState, assignmentAction, assigningShift] = useActionState(assignStaffShiftAction, undefined);
  const [assignmentUpdateState, assignmentUpdateAction, updatingAssignment] = useActionState(updateStaffShiftAssignmentAction, undefined);
  const [cancelState, cancelAction, cancellingAssignment] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  const [reviewState, reviewAction, creatingReview] = useActionState(createStaffReviewAction, undefined);
  const [contractState, contractAction, creatingContract] = useActionState(createStaffContractAction, undefined);
  const [documentState, documentAction, creatingDocument] = useActionState(createStaffDocumentAction, undefined);
  const [deviceState, deviceAction, creatingDevice] = useActionState(createStaffDeviceAction, undefined);
  const [deviceTrustState, deviceTrustAction, updatingDeviceTrust] = useActionState(updateStaffDeviceTrustAction, undefined);
  const [forceLogoutState, forceLogoutAction, forcingLogout] = useActionState(forceStaffSessionsLogoutAction, undefined);

  useActionSuccessRefresh(profileState);
  useActionSuccessRefresh(accountState);
  useActionSuccessRefresh(passwordState);
  useActionSuccessRefresh(assignmentState);
  useActionSuccessRefresh(assignmentUpdateState);
  useActionSuccessRefresh(cancelState);
  useActionSuccessRefresh(reviewState);
  useActionSuccessRefresh(contractState);
  useActionSuccessRefresh(documentState);
  useActionSuccessRefresh(deviceState);
  useActionSuccessRefresh(deviceTrustState);
  useActionSuccessRefresh(forceLogoutState);

  const timesheet = bundle.timesheets.find((item) => item.staffMemberId === member.id) ?? null;
  const status = statusLabel(member);
  const roles = bundle.roles.filter((role) => role.scope === "STAFF" || role.scope === "ADMIN");
  const branches = branchOptions(bundle.branches);
  const memberAssignments = [...bundle.shiftAssignments]
    .filter((assignment) => assignment.staffMemberId === member.id)
    .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.shiftName.localeCompare(right.shiftName, "vi"));
  const memberAttendance = bundle.attendanceFeed.filter((item) => item.staffMemberId === member.id);
  const memberApprovals = bundle.approvals.filter((item) => item.staffMemberId === member.id);
  const memberReviews = bundle.reviews.filter((item) => item.staffMemberId === member.id);
  const memberContracts = [...bundle.contracts]
    .filter((item) => item.staffMemberId === member.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const activeContract = memberContracts.find((contract) => contract.status === "active") ?? memberContracts[0] ?? null;
  const memberDocuments = [...bundle.documents]
    .filter((item) => item.staffMemberId === member.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const memberDevices = [...bundle.devices]
    .filter((item) => item.staffMemberId === member.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const trustedDeviceCount = memberDevices.filter((device) => device.trustedForAttendance).length;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-[#2B2B2B]"><ArrowLeft size={18} /> Danh sách nhân viên / {member.fullName}</button>
      <Panel className="p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={member.fullName} active={status === "Đang làm"} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black leading-tight text-[#2B2B2B] sm:text-[28px]">{member.fullName}</h1>
                <StatusChip tone={statusTone(status)}>{status}</StatusChip>
                <StatusChip tone={credentialTone(member)}>{credentialLabel(member)}</StatusChip>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-3 text-sm font-bold text-[#3F3D39]"><span>{member.employeeCode ?? `EMP-${member.id.slice(0, 4).toUpperCase()}`}</span><span>{member.roleTitle || roleLabel(member.roleCode)}</span><span>{member.primaryBranchName ?? "Chưa gán chi nhánh"}</span></p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[440px]">
            <MetricMini label="Ca tuần" value={memberAssignments.filter((assignment) => assignment.status !== "cancelled").length} />
            <MetricMini label="Giờ công" value={timesheet ? formatHours(timesheet.workMinutes) : "0p"} />
            <MetricMini label="Điểm" value={timesheet ? `${timesheet.attendanceScore}%` : "--"} />
            <MetricMini label="Thiết bị" value={memberDevices.length ? `${trustedDeviceCount}/${memberDevices.length}` : "0"} />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#D8D1C7] bg-[#F5F8F1] p-1 text-sm font-black text-[#4B4945] sm:grid-cols-4">
        <DetailTabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={UserRound}>Thông tin</DetailTabButton>
        <DetailTabButton active={activeTab === "schedule"} onClick={() => setActiveTab("schedule")} icon={CalendarClock}>Lịch làm</DetailTabButton>
        <DetailTabButton active={activeTab === "payroll"} onClick={() => setActiveTab("payroll")} icon={BarChart3}>Lương thưởng</DetailTabButton>
        <DetailTabButton active={activeTab === "security"} onClick={() => setActiveTab("security")} icon={ShieldCheck}>Bảo mật</DetailTabButton>
      </div>

      {activeTab === "profile" ? (
        <StaffProfileTab
          member={member}
          timesheet={timesheet}
          roles={roles}
          branches={branches}
          onPermissions={onPermissions}
          profileAction={profileAction}
          profileState={profileState}
          savingProfile={savingProfile}
          accountAction={accountAction}
          accountState={accountState}
          updatingAccount={updatingAccount}
          passwordAction={passwordAction}
          passwordState={passwordState}
          resettingPassword={resettingPassword}
        />
      ) : null}

      {activeTab === "schedule" ? (
        <StaffScheduleTab
          member={member}
          bundle={bundle}
          assignments={memberAssignments}
          attendance={memberAttendance}
          approvals={memberApprovals}
          assignmentAction={assignmentAction}
          assignmentState={assignmentState}
          assigningShift={assigningShift}
          assignmentUpdateAction={assignmentUpdateAction}
          assignmentUpdateState={assignmentUpdateState}
          updatingAssignment={updatingAssignment}
          cancelAction={cancelAction}
          cancelState={cancelState}
          cancellingAssignment={cancellingAssignment}
        />
      ) : null}

      {activeTab === "payroll" ? (
        <StaffPayrollTab
          member={member}
          timesheet={timesheet}
          contract={activeContract}
          contracts={memberContracts}
          reviews={memberReviews}
          reviewAction={reviewAction}
          reviewState={reviewState}
          creatingReview={creatingReview}
          contractAction={contractAction}
          contractState={contractState}
          creatingContract={creatingContract}
        />
      ) : null}

      {activeTab === "security" ? (
        <StaffSecurityTab
          member={member}
          documents={memberDocuments}
          devices={memberDevices}
          documentAction={documentAction}
          documentState={documentState}
          creatingDocument={creatingDocument}
          deviceAction={deviceAction}
          deviceState={deviceState}
          creatingDevice={creatingDevice}
          deviceTrustAction={deviceTrustAction}
          deviceTrustState={deviceTrustState}
          updatingDeviceTrust={updatingDeviceTrust}
          forceLogoutAction={forceLogoutAction}
          forceLogoutState={forceLogoutState}
          forcingLogout={forcingLogout}
        />
      ) : null}
    </div>
  );
}

function DetailTabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: LucideIcon; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 transition", active ? "bg-white text-[#0F4D3A] shadow-[0_2px_8px_rgba(43,43,43,0.06)]" : "text-[#4B4945] hover:bg-white/60")}>
      <Icon size={17} />
      <span className="truncate">{children}</span>
    </button>
  );
}

function StaffProfileTab({
  member,
  timesheet,
  roles,
  branches,
  onPermissions,
  profileAction,
  profileState,
  savingProfile,
  accountAction,
  accountState,
  updatingAccount,
  passwordAction,
  passwordState,
  resettingPassword
}: {
  member: StaffOpsMember;
  timesheet: StaffOperationsBundle["timesheets"][number] | null;
  roles: StaffOpsRoleSummary[];
  branches: StaffOpsBranchSummary[];
  onPermissions: () => void;
  profileAction: (payload: FormData) => void;
  profileState?: StaffActionState;
  savingProfile: boolean;
  accountAction: (payload: FormData) => void;
  accountState?: StaffActionState;
  updatingAccount: boolean;
  passwordAction: (payload: FormData) => void;
  passwordState?: StaffActionState;
  resettingPassword: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 text-xl font-black"><UserRound size={20} /> Liên hệ</h2>
            <div className="mt-4 grid gap-4 border-t border-[#D8D1C7] pt-4 sm:grid-cols-2">
              <InfoLine label="Số điện thoại" value={member.phone ?? "Chưa cập nhật"} />
              <InfoLine label="Ngày sinh" value={member.dateOfBirth ? formatDate(member.dateOfBirth) : "Chưa cập nhật"} />
              <InfoLine label="Quê quán" value={member.hometown ?? "Chưa cập nhật"} />
              <InfoLine label="Email" value={member.email} />
              <InfoLine label="Khẩn cấp" value={member.emergencyContactName ? `${member.emergencyContactName} · ${member.emergencyContactPhone ?? ""}` : "Chưa cập nhật"} />
            </div>
          </Panel>
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 text-xl font-black"><BriefcaseBusiness size={20} /> Công việc</h2>
            <div className="mt-4 grid gap-4 border-t border-[#D8D1C7] pt-4 sm:grid-cols-2">
              <InfoLine label="Chi nhánh" value={member.primaryBranchName ?? "Chưa gán"} dot />
              <InfoLine label="Mã nhân viên" value={member.employeeCode ?? "Chưa đồng bộ"} />
              <InfoLine label="Vai trò" value={member.roleTitle || roleLabel(member.roleCode)} />
              <InfoLine label="Công tháng" value={timesheet ? `${timesheet.attendanceCount} ca · ${formatHours(timesheet.workMinutes)}` : "Chưa có dữ liệu"} />
            </div>
          </Panel>
        </div>

        <Panel className="p-5">
          <form action={profileAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="userId" value={member.userId} />
            <Field label="Họ tên"><input name="fullName" required defaultValue={member.fullName} className="staff-redesign-input" /></Field>
            <Field label="Số điện thoại"><input name="phone" defaultValue={member.phone ?? ""} className="staff-redesign-input" /></Field>
            <Field label="Ngày sinh"><input name="dateOfBirth" type="date" defaultValue={member.dateOfBirth ?? ""} className="staff-redesign-input" /></Field>
            <Field label="Quê quán"><input name="hometown" defaultValue={member.hometown ?? ""} className="staff-redesign-input" /></Field>
            <Field label="Username"><input name="username" defaultValue={member.username ?? ""} className="staff-redesign-input" /></Field>
            <Field label="Vai trò"><select name="roleCode" defaultValue={member.roleCode} className="staff-redesign-input">{roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}</select></Field>
            <Field label="Chi nhánh"><select name="branchId" defaultValue={member.primaryBranchId ?? ""} className="staff-redesign-input"><option value="">Chưa gán chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
            <Field label="Trạng thái"><select name="employmentStatus" defaultValue={member.employmentStatus} className="staff-redesign-input"><option value="active">Đang làm</option><option value="suspended">Tạm khóa</option><option value="resigned">Nghỉ việc</option></select></Field>
            <Field label="Liên hệ khẩn cấp"><input name="emergencyContactName" defaultValue={member.emergencyContactName ?? ""} className="staff-redesign-input" /></Field>
            <Field label="SĐT khẩn cấp"><input name="emergencyContactPhone" defaultValue={member.emergencyContactPhone ?? ""} className="staff-redesign-input" /></Field>
            <Field label="Ghi chú" className="md:col-span-2"><input name="notes" defaultValue={member.notes ?? ""} className="staff-redesign-input" /></Field>
            <div className="md:col-span-2"><ActionMessage state={profileState} /></div>
            <div className="flex justify-end md:col-span-2"><StaffButton type="submit" disabled={savingProfile}><Check size={18} /> {savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}</StaffButton></div>
          </form>
        </Panel>
      </div>

      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#2B2B2B]">Tài khoản</h2>
          <StatusChip tone={credentialTone(member)}>{credentialLabel(member)}</StatusChip>
        </div>
        <div className="mt-4 grid gap-3">
          <form action={passwordAction} className="grid gap-2">
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="reason" value="Chủ quán cấp lại mật khẩu app từ hồ sơ nhân sự" />
            <StaffButton type="submit" disabled={resettingPassword} variant="secondary" className="w-full"><KeyRound size={18} /> {resettingPassword ? "Đang cấp..." : "Cấp lại mật khẩu"}</StaffButton>
          </form>
          <form action={accountAction}>
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="nextState" value={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "active" : "suspended"} />
            <input type="hidden" name="reason" value={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "Khôi phục từ hồ sơ nhân sự" : "Tạm khóa từ hồ sơ nhân sự"} />
            <StaffButton type="submit" disabled={updatingAccount} variant={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "secondary" : "danger"} className="w-full"><LockKeyhole size={18} /> {member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "Mở khóa" : "Khóa tài khoản"}</StaffButton>
          </form>
          <form action={accountAction}>
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="nextState" value="archived" />
            <input type="hidden" name="reason" value="Lưu trữ từ hồ sơ nhân sự" />
            <StaffButton type="submit" disabled={updatingAccount} variant="secondary" className="w-full"><X size={18} /> Lưu trữ</StaffButton>
          </form>
          <StaffButton variant="ghost" onClick={onPermissions} className="w-full"><KeyRound size={18} /> Phân quyền</StaffButton>
          <ActionMessage state={accountState} />
          <ActionMessage state={passwordState} />
          {passwordState?.temporaryPassword ? <div className="rounded-xl border border-[#0F4D3A]/20 bg-[#E8F6EE] px-4 py-3 text-sm font-bold text-[#0F4D3A]"><p>{passwordState.employeeCode ?? member.employeeCode}</p><p className="mt-1 break-all">{passwordState.temporaryPassword}</p></div> : null}
        </div>
      </Panel>
    </div>
  );
}

function StaffSecurityTab({
  member,
  documents,
  devices,
  documentAction,
  documentState,
  creatingDocument,
  deviceAction,
  deviceState,
  creatingDevice,
  deviceTrustAction,
  deviceTrustState,
  updatingDeviceTrust,
  forceLogoutAction,
  forceLogoutState,
  forcingLogout
}: {
  member: StaffOpsMember;
  documents: StaffOperationsBundle["documents"];
  devices: StaffOperationsBundle["devices"];
  documentAction: (payload: FormData) => void;
  documentState?: StaffActionState;
  creatingDocument: boolean;
  deviceAction: (payload: FormData) => void;
  deviceState?: StaffActionState;
  creatingDevice: boolean;
  deviceTrustAction: (payload: FormData) => void;
  deviceTrustState?: StaffActionState;
  updatingDeviceTrust: boolean;
  forceLogoutAction: (payload: FormData) => void;
  forceLogoutState?: StaffActionState;
  forcingLogout: boolean;
}) {
  const missingCoreDocs = ["identity_card", "contract"].filter((type) => !documents.some((document) => document.documentType === type && document.status === "complete"));
  const trustedDevices = devices.filter((device) => device.trustedForAttendance);
  const completedDocuments = documents.filter((item) => item.status === "complete").length;
  const documentMetric = documents.length ? `${completedDocuments}/${documents.length}` : "0";
  const deviceTrustMetric = devices.length ? `${trustedDevices.length}/${devices.length}` : "0";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Panel className="p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricMini label="Hồ sơ" value={documentMetric} />
            <MetricMini label="Thiết bị" value={devices.length} />
            <MetricMini label="Tin cậy" value={deviceTrustMetric} />
          </div>
          <form action={forceLogoutAction} className="mt-4 grid gap-3 rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <Field label="Buộc đăng xuất app nhân viên">
              <input name="reason" defaultValue="Chủ quán buộc đăng xuất để bảo vệ tài khoản nhân viên" className="staff-redesign-input" />
            </Field>
            <StaffButton type="submit" variant="danger" disabled={forcingLogout || member.activeSessionCount <= 0} className="w-full"><LogOut size={17} /> {forcingLogout ? "Đang xử lý..." : member.activeSessionCount > 0 ? `Đăng xuất ${member.activeSessionCount}` : "Không có phiên"}</StaffButton>
            <div className="sm:col-span-2"><ActionMessage state={forceLogoutState} /></div>
          </form>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#D8D1C7] p-5">
            <div>
              <h2 className="text-xl font-black text-[#2B2B2B]">Tài liệu nhân sự</h2>
              <p className="mt-1 text-sm font-semibold text-[#5E5A54]">CCCD, giấy sức khỏe, hợp đồng và chứng nhận đào tạo.</p>
            </div>
            <StatusChip tone={missingCoreDocs.length ? "warning" : "success"}>{missingCoreDocs.length ? `Thiếu ${missingCoreDocs.length}` : "Đủ lõi"}</StatusChip>
          </div>
          <div className="divide-y divide-[#E5DDD2]">
            {documents.map((document) => (
              <div key={document.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_130px_120px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#2B2B2B]">{document.documentName}</p>
                  <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{documentTypeLabel(document.documentType)} · {formatDate(document.createdAt)}</p>
                  {document.note ? <p className="mt-1 truncate text-xs font-semibold text-[#756E64]">{document.note}</p> : null}
                </div>
                <StatusChip tone={documentStatusTone(document.status)}>{documentStatusLabel(document.status)}</StatusChip>
                {document.fileUrl ? <a href={document.fileUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs font-black text-[#0F4D3A]"><FileText size={15} /> Mở file</a> : <span className="text-xs font-bold text-[#756E64]">Chưa có link</span>}
              </div>
            ))}
            {!documents.length ? <InlineEmptyState title="Chưa có tài liệu" text="Thêm hồ sơ thật để chủ quán đối soát nhân sự và hợp đồng." /> : null}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#D8D1C7] p-5">
            <div>
              <h2 className="text-xl font-black text-[#2B2B2B]">Thiết bị & chấm công</h2>
              <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Quản lý fingerprint và quyền tin cậy khi chấm công.</p>
            </div>
            <StatusChip tone={trustedDevices.length ? "success" : "neutral"}>{trustedDevices.length} thiết bị tin cậy</StatusChip>
          </div>
          <div className="divide-y divide-[#E5DDD2]">
            {devices.map((device) => (
              <div key={device.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_140px_160px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#2B2B2B]">{device.deviceName}</p>
                  <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{deviceTypeLabel(device.deviceType)} · {device.serialNumber || "chưa serial"}</p>
                  <p className="mt-1 truncate font-mono text-xs font-bold text-[#756E64]">{device.deviceFingerprint || "chưa có fingerprint"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusChip tone={deviceStatusTone(device.status)}>{deviceStatusLabel(device.status)}</StatusChip>
                  <StatusChip tone={device.trustedForAttendance ? "success" : "neutral"}>{device.trustedForAttendance ? "Tin cậy" : "Chưa duyệt"}</StatusChip>
                </div>
                <form action={deviceTrustAction} className="grid gap-2">
                  <input type="hidden" name="deviceId" value={device.id} />
                  <input type="hidden" name="trustedForAttendance" value={device.trustedForAttendance ? "false" : "true"} />
                  <input type="hidden" name="reason" value={device.trustedForAttendance ? "Gỡ tin cậy chấm công từ hồ sơ nhân sự" : "Duyệt tin cậy chấm công từ hồ sơ nhân sự"} />
                  <button type="submit" disabled={updatingDeviceTrust || device.status !== "assigned" || (!device.trustedForAttendance && !device.deviceFingerprint)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs font-black text-[#2B2B2B] disabled:opacity-50">
                    {device.trustedForAttendance ? "Gỡ tin cậy" : "Duyệt thiết bị"}
                  </button>
                </form>
              </div>
            ))}
            {!devices.length ? <InlineEmptyState title="Chưa có thiết bị" text="Cấp thiết bị hoặc ghi nhận fingerprint để kiểm soát chấm công." /> : null}
          </div>
          <div className="border-t border-[#E5DDD2] p-4"><ActionMessage state={deviceTrustState} /></div>
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel className="p-5">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#2B2B2B]"><FileText size={20} /> Thêm tài liệu</h2>
          <form action={documentAction} className="mt-4 grid gap-3">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <input name="documentName" required placeholder="Tên tài liệu" className="staff-redesign-input" />
            <select name="documentType" defaultValue="identity_card" className="staff-redesign-input"><option value="identity_card">CCCD/CMND</option><option value="health_certificate">Giấy sức khỏe</option><option value="contract">Hợp đồng</option><option value="training">Đào tạo</option><option value="other">Khác</option></select>
            <select name="status" defaultValue="complete" className="staff-redesign-input"><option value="complete">Đủ hồ sơ</option><option value="missing">Thiếu / cần bổ sung</option><option value="expired">Hết hạn</option></select>
            <input name="fileUrl" type="url" placeholder="https://..." className="staff-redesign-input" />
            <input name="note" placeholder="Ghi chú" className="staff-redesign-input" />
            <StaffButton type="submit" disabled={creatingDocument} className="w-full"><Plus size={17} /> {creatingDocument ? "Đang thêm..." : "Thêm tài liệu"}</StaffButton>
            <ActionMessage state={documentState} />
          </form>
        </Panel>

        <Panel className="p-5">
          <h2 className="flex items-center gap-2 text-xl font-black text-[#2B2B2B]"><Smartphone size={20} /> Cấp thiết bị</h2>
          <form action={deviceAction} className="mt-4 grid gap-3">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <input name="deviceName" required placeholder="VD: iPhone thu ngân" className="staff-redesign-input" />
            <select name="deviceType" defaultValue="phone" className="staff-redesign-input"><option value="phone">Điện thoại</option><option value="tablet">Tablet</option><option value="pos">POS</option><option value="cash_drawer">Két tiền</option><option value="other">Khác</option></select>
            <input name="serialNumber" placeholder="Serial / mã tài sản" className="staff-redesign-input" />
            <input name="deviceFingerprint" placeholder="Fingerprint thiết bị" className="staff-redesign-input" />
            <select name="trustedForAttendance" defaultValue="false" className="staff-redesign-input"><option value="false">Chưa duyệt chấm công</option><option value="true">Duyệt chấm công ngay</option></select>
            <input name="issuedAt" type="date" defaultValue={today} className="staff-redesign-input" />
            <input name="note" placeholder="Ghi chú thiết bị" className="staff-redesign-input" />
            <StaffButton type="submit" disabled={creatingDevice} variant="secondary" className="w-full"><Smartphone size={17} /> {creatingDevice ? "Đang cấp..." : "Cấp thiết bị"}</StaffButton>
            <ActionMessage state={deviceState} />
          </form>
        </Panel>
      </aside>
    </div>
  );
}

function StaffScheduleTab({
  member,
  bundle,
  assignments,
  attendance,
  approvals,
  assignmentAction,
  assignmentState,
  assigningShift,
  assignmentUpdateAction,
  assignmentUpdateState,
  updatingAssignment,
  cancelAction,
  cancelState,
  cancellingAssignment
}: {
  member: StaffOpsMember;
  bundle: StaffOperationsBundle;
  assignments: StaffOpsShiftAssignment[];
  attendance: StaffOpsAttendanceFeedItem[];
  approvals: StaffOpsApprovalItem[];
  assignmentAction: (payload: FormData) => void;
  assignmentState?: StaffActionState;
  assigningShift: boolean;
  assignmentUpdateAction: (payload: FormData) => void;
  assignmentUpdateState?: StaffActionState;
  updatingAssignment: boolean;
  cancelAction: (payload: FormData) => void;
  cancelState?: StaffActionState;
  cancellingAssignment: boolean;
}) {
  const activeAssignments = assignments.filter((assignment) => assignment.status !== "cancelled");
  const week = getWeekRange();
  const canAssignMember = isShiftAssignableMember(member);
  const primaryBranchShiftIds = new Set(bundle.shifts.filter((shift) => !member.primaryBranchId || !shift.branchId || shift.branchId === member.primaryBranchId).map((shift) => shift.id));
  const shiftOptions = bundle.shifts.filter((shift) => primaryBranchShiftIds.has(shift.id));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <Panel className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {week.map((day) => {
              const count = activeAssignments.filter((assignment) => assignment.scheduledDate === day.iso).length;
              return <div key={day.iso} className={cn("rounded-lg border p-2 text-center", day.iso === today ? "border-[#0F4D3A] bg-[#E5EEE2]" : "border-[#D8D1C7] bg-white")}><p className="text-xs font-black text-[#5E5A54]">{day.weekday}</p><p className="mt-1 text-base font-black text-[#2B2B2B]">{day.day}</p><p className="mt-1 text-xs font-semibold text-[#0F4D3A]">{count} ca</p></div>;
            })}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#D8D1C7] p-4">
            <h2 className="text-xl font-black">Lịch đã gán</h2>
            <StatusChip tone="brand">{activeAssignments.length} ca</StatusChip>
          </div>
          <div className="divide-y divide-[#D8D1C7]">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-[#2B2B2B]">{assignment.shiftName}</p><StatusChip tone={assignment.status === "cancelled" ? "danger" : assignment.status === "completed" ? "success" : "neutral"}>{shiftAssignmentStatusLabel(assignment.status)}</StatusChip></div>
                  <p className="mt-1 text-sm font-semibold text-[#5E5A54]">{formatDate(assignment.scheduledDate)} · {assignment.branchName ?? member.primaryBranchName ?? "Toàn quán"}</p>
                </div>
                {assignment.status !== "cancelled" ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                    <form action={assignmentUpdateAction} className="grid gap-2 sm:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_96px]">
                      <input type="hidden" name="shiftAssignmentId" value={assignment.id} />
                      <input type="hidden" name="staffMemberId" value={member.id} />
                      <select name="shiftId" defaultValue={assignment.shiftId} className="staff-redesign-input">{bundle.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>)}</select>
                      <input name="scheduledDate" type="date" defaultValue={assignment.scheduledDate} className="staff-redesign-input" />
                      <input type="hidden" name="note" value="Sửa ca từ hồ sơ nhân viên" />
                      <button type="submit" disabled={updatingAssignment} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0F4D3A] px-3 text-xs font-black text-white disabled:opacity-60">{updatingAssignment ? "Lưu..." : "Lưu"}</button>
                    </form>
                    <form action={cancelAction}>
                      <input type="hidden" name="shiftAssignmentId" value={assignment.id} />
                      <input type="hidden" name="note" value="Hủy ca từ hồ sơ nhân viên" />
                      <button type="submit" disabled={cancellingAssignment} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[#D8D1C7] bg-[#FFF0D9] px-3 text-xs font-black text-[#A33D10] disabled:opacity-60">Hủy</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
            {!assignments.length ? <InlineEmptyState title="Chưa có ca" text="Gán ca ở khung bên phải để lịch nhân viên cập nhật ngay." /> : null}
          </div>
          <div className="grid gap-2 border-t border-[#D8D1C7] p-4"><ActionMessage state={assignmentUpdateState} /><ActionMessage state={cancelState} /></div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Chấm công gần đây</h2><a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#D8D1C7] px-3 text-xs font-black text-[#2B2B2B]"><Download size={15} /> CSV</a></div>
          <div className="mt-4 grid gap-2">
            {attendance.slice(0, 6).map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-[#E5DDD2] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-black text-[#2B2B2B]">{item.shiftName ?? "Ca đột xuất"}</p><p className="text-xs font-semibold text-[#5E5A54]">{formatDate(item.clockInAt)} · {item.branchName ?? "Chi nhánh"}</p></div><p className="text-sm font-black text-[#2B2B2B]">{attendanceLabel(item)}</p><StatusChip tone={item.state === "late" ? "danger" : item.state === "overtime" ? "warning" : "success"}>{item.state === "late" ? "Đi trễ" : item.state === "overtime" ? "Tăng ca" : "Đúng giờ"}</StatusChip></div>)}
            {!attendance.length ? <InlineEmptyState title="Chưa có công" text="Dữ liệu sẽ xuất hiện khi nhân viên check-in bằng GPS, QR, WiFi hoặc chấm hộ." /> : null}
          </div>
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel className="p-5">
          <h2 className="text-xl font-black text-[#2B2B2B]">Gán ca nhanh</h2>
          {!canAssignMember ? <p className="mt-3 rounded-lg border border-[#F28C28]/25 bg-[#FFF0D9] p-3 text-sm font-bold text-[#93540A]">Nhân viên đang không ở trạng thái hoạt động nên chưa thể gán ca.</p> : null}
          <form action={assignmentAction} className="mt-4 grid gap-3">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <select name="shiftId" className="staff-redesign-input" disabled={!shiftOptions.length}>{shiftOptions.length ? shiftOptions.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>) : <option value="">Chưa có mẫu ca</option>}</select>
            <input name="scheduledDate" type="date" defaultValue={today} className="staff-redesign-input" />
            <input type="hidden" name="note" value="Gán ca từ hồ sơ nhân viên" />
            <StaffButton type="submit" disabled={assigningShift || !shiftOptions.length || !canAssignMember} className="w-full"><CalendarClock size={17} /> {assigningShift ? "Đang gán..." : "Gán ca"}</StaffButton>
            <ActionMessage state={assignmentState} />
          </form>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-xl font-black text-[#2B2B2B]">Yêu cầu</h2>
          <div className="mt-4 grid gap-2">
            {approvals.slice(0, 5).map((approval) => <div key={approval.id} className="rounded-lg border border-[#E5DDD2] bg-white p-3"><p className="text-sm font-black text-[#2B2B2B]">{requestLabel(approval.requestType)}</p><p className="mt-1 text-xs font-semibold text-[#5E5A54]">{formatDateTime(approval.createdAt)} · {approval.reason ?? "Không có ghi chú"}</p><StatusChip tone={approval.status === "approved" ? "success" : approval.status === "rejected" ? "danger" : "warning"}>{approval.status === "pending" ? "Chờ duyệt" : approval.status === "approved" ? "Đã duyệt" : "Đã từ chối"}</StatusChip></div>)}
            {!approvals.length ? <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-3 text-sm font-semibold text-[#5E5A54]">Không có yêu cầu mở.</p> : null}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function StaffPayrollTab({
  member,
  timesheet,
  contract,
  contracts,
  reviews,
  reviewAction,
  reviewState,
  creatingReview,
  contractAction,
  contractState,
  creatingContract
}: {
  member: StaffOpsMember;
  timesheet: StaffOperationsBundle["timesheets"][number] | null;
  contract: StaffOperationsBundle["contracts"][number] | null;
  contracts: StaffOperationsBundle["contracts"];
  reviews: StaffOperationsBundle["reviews"];
  reviewAction: (payload: FormData) => void;
  reviewState?: StaffActionState;
  creatingReview: boolean;
  contractAction: (payload: FormData) => void;
  contractState?: StaffActionState;
  creatingContract: boolean;
}) {
  const suggestedScore = Math.max(1, Math.min(5, Math.round(((timesheet?.attendanceScore ?? 100) / 20) * 10) / 10));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportCard label="Giờ công" value={timesheet ? formatHours(timesheet.workMinutes) : "0p"} tone="brand" />
          <ReportCard label="Đi muộn" value={timesheet ? `${timesheet.lateCount} lần` : "0"} tone="warning" />
          <ReportCard label="Tăng ca" value={timesheet ? formatHours(timesheet.overtimeMinutes) : "0p"} tone="success" />
          <ReportCard label="Lương base" value={formatVnd(contract?.salaryAmount)} tone="dark" />
        </div>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#D8D1C7] p-4"><h2 className="text-xl font-black">Timesheet payroll-ready</h2><a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#D8D1C7] px-3 text-xs font-black text-[#2B2B2B]"><Download size={15} /> Xuất CSV</a></div>
          <div className="grid gap-0 md:grid-cols-2">
            <PayrollLine label="Số ca tính công" value={timesheet?.attendanceCount ?? 0} />
            <PayrollLine label="Giờ công" value={timesheet ? formatHours(timesheet.workMinutes) : "0p"} />
            <PayrollLine label="Phút đi trễ" value={timesheet ? formatHours(timesheet.lateMinutes) : "0p"} />
            <PayrollLine label="Tăng ca duyệt" value={timesheet ? formatHours(timesheet.approvedOvertimeMinutes) : "0p"} />
            <PayrollLine label="Nghỉ có lương" value={`${timesheet?.paidLeaveDays ?? 0} ngày`} />
            <PayrollLine label="Nghỉ không lương" value={`${timesheet?.unpaidLeaveDays ?? 0} ngày`} />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#D8D1C7] p-4"><h2 className="text-xl font-black">Hồ sơ lương / hợp đồng</h2></div>
          <div className="divide-y divide-[#D8D1C7]">
            {contracts.map((item) => <div key={item.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_140px_120px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-black text-[#2B2B2B]">{item.jobTitle || item.templateCode || "Hồ sơ lương"}</p><p className="text-xs font-semibold text-[#5E5A54]">{formatDate(item.startDate)}{item.endDate ? ` - ${formatDate(item.endDate)}` : ""}</p></div><p className="text-sm font-black text-[#2B2B2B]">{formatVnd(item.salaryAmount)}</p><StatusChip tone={item.status === "active" ? "success" : item.status === "draft" ? "warning" : "neutral"}>{contractStatusLabel(item.status)}</StatusChip></div>)}
            {!contracts.length ? <InlineEmptyState title="Chưa có hồ sơ lương" text="Tạo hồ sơ ở khung bên phải để dùng cho payroll/export sau này." /> : null}
          </div>
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel className="p-5">
          <h2 className="text-xl font-black text-[#2B2B2B]">Tạo hồ sơ lương</h2>
          <form action={contractAction} className="mt-4 grid gap-3">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <select name="templateCode" className="staff-redesign-input" defaultValue="restaurant_part_time"><option value="restaurant_fixed_term">Toàn thời gian có thời hạn</option><option value="restaurant_indefinite">Toàn thời gian không thời hạn</option><option value="restaurant_part_time">Part-time theo ca</option><option value="restaurant_probation">Thử việc</option></select>
            <input name="jobTitle" defaultValue={member.roleTitle || roleLabel(member.roleCode)} className="staff-redesign-input" placeholder="Chức danh" />
            <input name="workLocation" defaultValue={member.primaryBranchName ?? ""} className="staff-redesign-input" placeholder="Nơi làm việc" />
            <input name="salaryAmount" type="number" min="0" step="1000" className="staff-redesign-input" placeholder="Lương cơ bản" />
            <input name="salaryPaymentMethod" defaultValue="Theo tháng / theo ca theo chính sách quán" className="staff-redesign-input" />
            <input name="workingTime" defaultValue="Theo lịch ca trên LogiVN" className="staff-redesign-input" />
            <input name="startDate" type="date" defaultValue={today} className="staff-redesign-input" />
            <input name="endDate" type="date" className="staff-redesign-input" />
            <input type="hidden" name="eSignatureStatus" value="draft" />
            <input name="note" className="staff-redesign-input" placeholder="Ghi chú payroll" />
            <StaffButton type="submit" disabled={creatingContract} className="w-full"><BriefcaseBusiness size={17} /> {creatingContract ? "Đang tạo..." : "Tạo hồ sơ"}</StaffButton>
            <ActionMessage state={contractState} />
          </form>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-xl font-black text-[#2B2B2B]">Đánh giá thưởng</h2>
          <form action={reviewAction} className="mt-4 grid gap-3">
            <input type="hidden" name="staffMemberId" value={member.id} />
            <input name="periodLabel" defaultValue={payrollPeriodLabel()} className="staff-redesign-input" />
            <input name="score" type="number" min="1" max="5" step="0.5" defaultValue={suggestedScore} className="staff-redesign-input" />
            <input name="note" className="staff-redesign-input" placeholder="Ghi chú thưởng/phạt" />
            <StaffButton type="submit" disabled={creatingReview} variant="secondary" className="w-full"><CheckCircle2 size={17} /> {creatingReview ? "Đang lưu..." : "Lưu đánh giá"}</StaffButton>
            <ActionMessage state={reviewState} />
          </form>
          <div className="mt-4 grid gap-2">
            {reviews.slice(0, 4).map((review) => <div key={review.id} className="rounded-lg border border-[#E5DDD2] bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-[#2B2B2B]">{review.periodLabel}</p><StatusChip tone={review.score >= 4 ? "success" : review.score >= 3 ? "neutral" : "warning"}>{review.score}/5</StatusChip></div>{review.note ? <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{review.note}</p> : null}</div>)}
            {!reviews.length ? <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-3 text-sm font-semibold text-[#5E5A54]">Chưa có đánh giá.</p> : null}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function PayrollLine({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-[#D8D1C7] p-4 md:border-r"><p className="text-xs font-black uppercase text-[#5E5A54]">{label}</p><p className="mt-2 text-base font-black text-[#2B2B2B]">{value}</p></div>;
}

function InfoLine({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">{label}</p><p className="mt-2 flex min-w-0 items-center gap-2 break-words text-base font-bold text-[#2B2B2B] lg:text-lg">{dot ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0F4D3A]" /> : null}{value}</p></div>;
}

function AddStaffScreen({ bundle, onCancel, onSuccess }: { bundle: StaffOperationsBundle; onCancel: () => void; onSuccess: (state: StaffActionState) => void }) {
  const [state, action, pending] = useActionState(createStaffAction, undefined);
  useActionSuccessRefresh(state, onSuccess);
  const roles = bundle.roles.filter((role) => role.scope === "STAFF" || ["manager", "cashier", "waiter", "kitchen", "delivery"].includes(String(role.code)));
  const branches = branchOptions(bundle.branches);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-base font-bold text-[#3F3D39]">Nhân viên › Thêm mới</p>
        <h1 className="mt-8 text-[32px] font-black leading-tight text-[#2B2B2B]">Thêm nhân viên mới</h1>
        <p className="mt-3 text-base font-semibold text-[#3F3D39]">Tạo hồ sơ gọn: hệ thống tự cấp mã nhân viên và mật khẩu app lần đầu.</p>
      </div>
      <form action={action} className="space-y-6">
        <Panel className="p-6 sm:p-8">
          <h2 className="text-2xl font-black text-[#2B2B2B]">Thông tin cá nhân</h2>
          <div className="mt-4 border-t border-[#D8D1C7] pt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Họ và tên *"><input required name="fullName" placeholder="VD: Nguyễn Văn A" className="staff-redesign-input" /></Field>
            <Field label="Ngày sinh *"><input required name="dateOfBirth" type="date" className="staff-redesign-input" /></Field>
            <Field label="Quê quán *"><input required name="hometown" placeholder="VD: Nam Định" className="staff-redesign-input" /></Field>
            <Field label="Số điện thoại *"><input required name="phone" placeholder="09xx xxx xxx" className="staff-redesign-input" /></Field>
          </div>
          <h2 className="mt-8 text-2xl font-black text-[#2B2B2B]">Công việc</h2>
          <div className="mt-4 border-t border-[#D8D1C7] pt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Vị trí *"><select required name="roleCode" className="staff-redesign-input">{roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}</select></Field>
            <Field label="Chi nhánh"><select name="branchId" className="staff-redesign-input"><option value="">Chưa gán chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
            <Field label="Ghi chú" className="sm:col-span-2"><input name="notes" placeholder="Ví dụ: part-time cuối tuần" className="staff-redesign-input" /></Field>
          </div>
          <div className="mt-8 border-t border-[#D8D1C7] pt-6"><ActionMessage state={state} /></div>
          <div className="mt-6 flex justify-end gap-4">
            <StaffButton variant="secondary" onClick={onCancel}>Hủy bỏ</StaffButton>
            <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0F4D3A] px-8 text-sm font-black text-white shadow-[0_8px_20px_rgba(15,77,58,0.16)] disabled:opacity-60">{pending ? "Đang lưu..." : "Tiếp theo"}<ChevronRight size={18} /></button>
          </div>
        </Panel>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("grid gap-2 text-sm font-black text-[#2B2B2B]", className)}><span>{label}</span>{children}</label>;
}

function AddSuccessScreen({ member, credentials, onList, onProfile }: { member: StaffOpsMember | null; credentials: { employeeCode?: string | null; temporaryPassword?: string | null } | null; onList: () => void; onProfile: () => void }) {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] place-items-center py-10">
      <div className="w-full max-w-[560px] text-center">
        <span className="mx-auto grid h-28 w-28 place-items-center rounded-full border-4 border-[#A9C5A1] bg-[#DDF8E9] text-[#0F4D3A]"><CheckCircle2 size={62} /></span>
        <h1 className="mt-8 text-[32px] font-black leading-tight text-[#2B2B2B]">Thêm nhân viên thành công!</h1>
        <p className="mx-auto mt-3 max-w-md text-base font-semibold text-[#3F3D39]">Gửi mã nhân viên và mật khẩu tạm này cho nhân viên. Mật khẩu chỉ nên dùng để đăng nhập lần đầu.</p>
        <Panel className="mx-auto mt-8 p-7 text-left">
          <div className="flex items-center gap-5"><Avatar name={member?.fullName ?? "Hồ sơ mới"} /><div><p className="text-[28px] font-black">{member?.fullName ?? "Hồ sơ vừa tạo"}</p><StatusChip tone="success">Đã lưu</StatusChip></div></div>
          <div className="mt-6 grid gap-4 border-t border-[#D8D1C7] pt-5 sm:grid-cols-2">
            <InfoLine label="Mã nhân viên" value={credentials?.employeeCode ?? member?.employeeCode ?? "Đang đồng bộ"} />
            <InfoLine label="Mật khẩu tạm" value={credentials?.temporaryPassword ?? "Chỉ hiển thị sau khi tạo"} />
            <InfoLine label="Vai trò" value={member?.roleTitle ?? "Cập nhật sau khi tải lại"} />
            <InfoLine label="Chi nhánh" value={member?.primaryBranchName ?? "Chưa gán"} />
          </div>
        </Panel>
        <div className="mt-8 grid grid-cols-2 gap-5"><StaffButton variant="secondary" onClick={onList} className="min-h-16"><ArrowLeft size={20} /> Về danh sách</StaffButton><StaffButton onClick={onProfile} className="min-h-16">Xem hồ sơ <ChevronRight size={20} /></StaffButton></div>
      </div>
    </div>
  );
}

function ShiftScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [assignmentState, assignmentAction, assigning] = useActionState(assignStaffShiftAction, undefined);
  const [assignmentUpdateState, assignmentUpdateAction, updatingAssignment] = useActionState(updateStaffShiftAssignmentAction, undefined);
  const [templateState, templateAction, creatingTemplate] = useActionState(createStaffShiftTemplateAction, undefined);
  const [templateUpdateState, templateUpdateAction, updatingTemplate] = useActionState(updateStaffShiftTemplateAction, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  useActionSuccessRefresh(assignmentState);
  useActionSuccessRefresh(assignmentUpdateState);
  useActionSuccessRefresh(templateState);
  useActionSuccessRefresh(templateUpdateState);
  useActionSuccessRefresh(cancelState);
  const week = getWeekRange();
  const branches = branchOptions(bundle.branches);
  const activeMembers = bundle.members.filter(isShiftAssignableMember);
  const inactiveMemberCount = bundle.members.filter((member) => !member.isArchived && !isShiftAssignableMember(member)).length;
  const activeAssignments = bundle.shiftAssignments.filter((assignment) => assignment.status !== "cancelled");
  return (
    <>
      <div className="lg:hidden">
        <MobileShiftManagementScreen bundle={bundle} />
      </div>
      <div className="hidden space-y-5 lg:block">
        <section className="flex flex-col justify-between gap-4 border-b border-[#D8D1C7] pb-5 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-[32px] font-black text-[#2B2B2B]">Lịch ca làm</h1>
            <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Gán, sửa và hủy ca thật theo tuần hiện tại. Chỉ nhân viên đang hoạt động được phân ca.</p>
          </div>
          <div className="flex gap-3"><span className="inline-flex h-11 items-center rounded-xl border border-[#D8D1C7] bg-white px-5 text-sm font-black text-[#2B2B2B]">Tuần này</span><StaffButton onClick={() => document.getElementById("staff-shift-template-form")?.scrollIntoView({ block: "center", behavior: "smooth" })}><Plus size={18} /> Tạo ca</StaffButton></div>
        </section>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_386px]">
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <div className="grid min-w-[1040px] grid-cols-[250px_repeat(7,1fr)] border-b border-[#D8D1C7] text-center">
                <div className="flex items-center px-5 text-sm font-black uppercase tracking-[0.12em] text-[#3F3D39]">Nhân viên</div>
                {week.map((day) => <div key={day.iso} className="border-l border-[#D8D1C7] p-3"><p className="text-sm font-bold">{day.weekday}</p><p className="text-xl font-black">{day.day}</p></div>)}
              </div>
              {activeMembers.map((member) => (
                <div key={member.id} className="grid min-w-[1040px] grid-cols-[250px_repeat(7,1fr)] border-b border-[#D8D1C7]">
                  <div className="flex items-center gap-4 px-5 py-4"><Avatar name={member.fullName} /><span><span className="block font-black">{member.fullName}</span><span className="text-sm font-medium text-[#3F3D39]">{member.roleTitle}</span></span></div>
                  {week.map((day, dayIndex) => {
                    const assignment = activeAssignments.find((item) => item.staffMemberId === member.id && item.scheduledDate === day.iso);
                    return <div key={day.iso} className="min-h-24 border-l border-[#D8D1C7] p-2">{assignment ? <div className={cn("rounded-lg border p-3 text-sm font-bold", dayIndex % 3 === 0 ? "border-[#0F4D3A]/25 bg-[#DDF8E9] text-[#0F4D3A]" : dayIndex % 3 === 1 ? "border-[#0F4D3A]/20 bg-[#0F4D3A] text-white" : "border-[#F28C28]/25 bg-[#FFF0D9] text-[#93540A]")}><div className="flex items-start justify-between gap-2"><p>{assignment.shiftName}</p><form action={cancelAction}><input type="hidden" name="shiftAssignmentId" value={assignment.id} /><input type="hidden" name="note" value="Huỷ từ lịch Staff" /><button type="submit" disabled={cancelling} className="grid h-7 w-7 place-items-center rounded-lg bg-white/70 text-[#A33D10]" aria-label="Huỷ ca"><X size={14} /></button></form></div><p className="mt-3 text-xs opacity-75">{assignment.branchName ?? "Toàn quán"}</p></div> : <div className="grid h-full min-h-20 place-items-center rounded-lg border border-dashed border-[#D8D1C7] text-xs font-bold text-[#6F6A62]">Trống</div>}</div>;
                  })}
                </div>
              ))}
              {!activeMembers.length ? <div className="p-6"><InlineEmptyState title="Chưa có nhân viên" text="Tạo nhân viên trước khi gán ca làm." /></div> : null}
            </div>
          </Panel>
          <Panel className="overflow-hidden">
            <div className="border-b border-[#D8D1C7] p-5"><h2 className="text-xl font-black">Điều phối ca</h2></div>
            <div className="space-y-5 p-5">
              <form action={assignmentAction} className="grid gap-3 rounded-xl border border-[#D8D1C7] bg-white p-4">
                <p className="text-sm font-black uppercase tracking-[0.08em] text-[#0F4D3A]">Gán ca</p>
                <ActionMessage state={assignmentState} />
                <select name="staffMemberId" className="staff-redesign-input" disabled={!activeMembers.length}>{activeMembers.length ? activeMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>) : <option value="">Chưa có nhân viên hoạt động</option>}</select>
                <select name="shiftId" className="staff-redesign-input" disabled={!bundle.shifts.length}>{bundle.shifts.length ? bundle.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>) : <option value="">Chưa có mẫu ca</option>}</select>
                <input name="scheduledDate" type="date" defaultValue={today} className="staff-redesign-input" />
                <input type="hidden" name="note" value="Gán ca từ lịch Staff" />
                <button type="submit" disabled={assigning || !activeMembers.length || !bundle.shifts.length} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F4D3A] text-sm font-black text-white disabled:opacity-60"><Plus size={17} /> {assigning ? "Đang gán..." : "Gán ca"}</button>
                {inactiveMemberCount ? <p className="text-xs font-bold text-[#93540A]">{inactiveMemberCount} nhân viên đang khóa/nghỉ việc đã được ẩn khỏi danh sách gán ca.</p> : null}
              </form>
              <form action={assignmentUpdateAction} className="grid gap-3 rounded-xl border border-[#D8D1C7] bg-white p-4">
                <p className="text-sm font-black uppercase tracking-[0.08em] text-[#93540A]">Sửa phân ca</p>
                <ActionMessage state={assignmentUpdateState} />
                <select name="shiftAssignmentId" className="staff-redesign-input" disabled={!activeAssignments.length}>{activeAssignments.length ? activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.staffName} · {assignment.shiftName} · {assignment.scheduledDate}</option>) : <option value="">Chưa có ca đang hoạt động</option>}</select>
                <select name="staffMemberId" className="staff-redesign-input" disabled={!activeMembers.length}>{activeMembers.length ? activeMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>) : <option value="">Chưa có nhân viên hoạt động</option>}</select>
                <select name="shiftId" className="staff-redesign-input" disabled={!bundle.shifts.length}>{bundle.shifts.length ? bundle.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</option>) : <option value="">Chưa có mẫu ca</option>}</select>
                <input name="scheduledDate" type="date" defaultValue={today} className="staff-redesign-input" />
                <input name="note" placeholder="Lý do chỉnh ca" className="staff-redesign-input" />
                <button type="submit" disabled={updatingAssignment || !activeAssignments.length || !activeMembers.length || !bundle.shifts.length} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-[#FFF7EB] text-sm font-black text-[#2B2B2B] disabled:opacity-60"><Check size={17} /> {updatingAssignment ? "Đang sửa..." : "Lưu phân ca"}</button>
              </form>
            </div>
          </Panel>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_386px]">
          <Panel className="p-5">
            <form id="staff-shift-template-form" action={templateAction} className="grid gap-4 md:grid-cols-6">
              <input name="name" placeholder="Tên ca mới" className="staff-redesign-input md:col-span-2" />
              <select name="branchId" className="staff-redesign-input md:col-span-2"><option value="">Toàn quán</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
              <input name="startTime" type="time" defaultValue="08:00" className="staff-redesign-input" />
              <input name="endTime" type="time" defaultValue="16:00" className="staff-redesign-input" />
              <input type="hidden" name="recurringWeekdays" value="[1,2,3,4,5]" />
              <button type="submit" disabled={creatingTemplate} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white md:col-span-6">{creatingTemplate ? "Đang tạo..." : "Tạo mẫu ca"}</button>
            </form>
            <div className="mt-3"><ActionMessage state={templateState} /><ActionMessage state={cancelState} /></div>
          </Panel>
          <Panel className="max-h-[420px] overflow-auto p-5">
            <h2 className="text-xl font-black text-[#2B2B2B]">Mẫu ca hiện có</h2>
            <div className="mt-4 space-y-3">
              {bundle.shifts.map((shift) => (
                <details key={shift.id} className="rounded-xl border border-[#D8D1C7] bg-white p-4">
                  <summary className="cursor-pointer text-sm font-black text-[#2B2B2B]">{shift.name} · {shift.startTime}-{shift.endTime}</summary>
                  <form action={templateUpdateAction} className="mt-4 grid gap-3">
                    <input type="hidden" name="shiftId" value={shift.id} />
                    <input name="name" defaultValue={shift.name} className="staff-redesign-input" />
                    <select name="branchId" defaultValue={shift.branchId ?? ""} className="staff-redesign-input"><option value="">Toàn quán</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                    <div className="grid grid-cols-2 gap-3"><input name="startTime" type="time" defaultValue={shift.startTime} className="staff-redesign-input" /><input name="endTime" type="time" defaultValue={shift.endTime} className="staff-redesign-input" /></div>
                    <input type="hidden" name="allowedLateMinutes" value={shift.allowedLateMinutes} />
                    <input type="hidden" name="overtimeThresholdMinutes" value={shift.overtimeThresholdMinutes} />
                    <input type="hidden" name="attendanceRadiusMeters" value={shift.attendanceRadiusMeters} />
                    <input type="hidden" name="recurringWeekdays" value={JSON.stringify(shift.recurringWeekdays)} />
                    <button type="submit" disabled={updatingTemplate} className="min-h-10 rounded-xl bg-[#F5F8F1] text-sm font-black text-[#0F4D3A] disabled:opacity-60">{updatingTemplate ? "Đang lưu..." : "Lưu mẫu ca"}</button>
                  </form>
                </details>
              ))}
              <ActionMessage state={templateUpdateState} />
              {!bundle.shifts.length ? <InlineEmptyState title="Chưa có mẫu ca" text="Tạo ca sáng, chiều, tối trước khi gán lịch." /> : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function AttendanceScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [clockInState, clockInAction, clockingIn] = useActionState(manualClockInStaffAction, undefined);
  const [clockOutState, clockOutAction, clockingOut] = useActionState(manualClockOutStaffAction, undefined);
  const [adjustState, adjustAction, adjustingAttendance] = useActionState(adjustStaffAttendanceAction, undefined);
  useActionSuccessRefresh(clockInState);
  useActionSuccessRefresh(clockOutState);
  useActionSuccessRefresh(adjustState);
  const [qrState, setQrState] = useState<StaffAttendanceQrTokenResult | null>(null);
  const [wifiState, setWifiState] = useState<StaffAttendanceWifiNetworkResult | null>(null);
  const [utilityError, setUtilityError] = useState("");
  const [dateFilter, setDateFilter] = useState(today);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const branches = branchOptions(bundle.branches);
  const [utilityBranchId, setUtilityBranchId] = useState(() => branches[0]?.id ?? "");
  const activeBranch = branches.find((branch) => branch.id === utilityBranchId) ?? branches[0];
  const openAttendance = bundle.attendanceFeed.filter((item) => !item.clockOutAt);
  const pendingAttendanceApprovals = bundle.attendanceFeed.filter((item) => item.approvalState === "pending").length;
  const highRiskAttendance = bundle.attendanceFeed.filter((item) => attendanceRiskScore(item) >= 55).length;
  const manualAttendance = bundle.attendanceFeed.filter((item) => item.source === "manual" || item.source === "offline_sync").length;
  const qrConfigBlocked = Boolean(bundle.opsConfig?.attendanceQrSecretRequired && !bundle.opsConfig?.attendanceQrSecretConfigured);
  const filteredFeed = bundle.attendanceFeed.filter((item) => {
    const matchesDate = !dateFilter || item.clockInAt?.slice(0, 10) === dateFilter;
    const branchName = branches.find((branch) => branch.id === branchFilter)?.name;
    const matchesBranch = branchFilter === "all" || !branchName || item.branchName === branchName;
    const matchesStatus = statusFilter === "all" || item.state === statusFilter;
    return matchesDate && matchesBranch && matchesStatus;
  });
  const onTimeRate = bundle.attendanceFeed.length ? Math.round((bundle.attendanceFeed.filter((item) => item.state === "on_time" || item.state === "overtime").length / bundle.attendanceFeed.length) * 100) : 100;
  async function generateQr() {
    setUtilityError("");
    if (qrConfigBlocked) {
      setUtilityError("Thiếu STAFF_ATTENDANCE_QR_SECRET nên production chưa thể tạo QR chấm công hằng ngày.");
      return;
    }
    if (!activeBranch?.id) {
      setUtilityError("Cần có chi nhánh thật trước khi tạo QR chấm công.");
      return;
    }
    try {
      setQrState(await createStaffAttendanceQrToken({ branchId: activeBranch.id, mode: "daily_branch" }));
    } catch (error) {
      setUtilityError(error instanceof Error ? error.message : "Không thể tạo QR hôm nay.");
    }
  }
  async function registerWifi() {
    setUtilityError("");
    if (!activeBranch?.id) {
      setUtilityError("Cần có chi nhánh thật trước khi lưu WiFi chấm công.");
      return;
    }
    try {
      setWifiState(await registerStaffAttendanceWifiNetwork({ branchId: activeBranch.id, label: `${activeBranch.name} WiFi` }));
    } catch (error) {
      setUtilityError(error instanceof Error ? error.message : "Không thể lưu WiFi.");
    }
  }
  return (
    <>
      <div className="lg:hidden">
        <MobileAttendanceManagementScreen
          bundle={bundle}
          clockInAction={clockInAction}
          clockOutAction={clockOutAction}
          adjustAction={adjustAction}
          clockingIn={clockingIn}
          clockingOut={clockingOut}
          adjustingAttendance={adjustingAttendance}
          generateQr={generateQr}
          registerWifi={registerWifi}
          utilityBranchId={utilityBranchId}
          onUtilityBranchChange={setUtilityBranchId}
          utilityState={{ qrState, wifiState, utilityError }}
          qrConfigBlocked={qrConfigBlocked}
        />
      </div>
      <div className="hidden space-y-6 lg:block">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Kiểm soát chấm công</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-[#2B2B2B]">Chấm công, QR và WiFi</h1>
          <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Dữ liệu thật từ GPS, QR, WiFi và thao tác quản lý.</p>
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-[#E5DDD2] bg-white p-2">
          <MetricMini label="Đúng giờ" value={`${onTimeRate}%`} />
          <MetricMini label="Đang mở" value={openAttendance.length} />
          <MetricMini label="Chờ duyệt" value={pendingAttendanceApprovals} />
          <MetricMini label="Rủi ro" value={highRiskAttendance} />
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1fr_386px]">
        <Panel className="p-6"><h2 className="text-2xl font-black">Bộ lọc dữ liệu</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><Field label="Ngày"><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="staff-redesign-input" /></Field><Field label="Chi nhánh"><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="staff-redesign-input"><option value="all">Tất cả chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><Field label="Trạng thái"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="staff-redesign-input"><option value="all">Tất cả trạng thái</option><option value="on_time">Đúng giờ</option><option value="late">Đi trễ</option><option value="absent">Vắng mặt</option><option value="overtime">Tăng ca</option></select></Field></div></Panel>
        <Panel className="p-6"><h2 className="text-2xl font-black">Tỷ lệ đúng giờ</h2><p className="mt-2 text-sm font-medium text-[#3F3D39]">Ngày {formatDate(today)}</p><div className="mt-4 flex items-center gap-7"><div className="grid h-28 w-28 place-items-center rounded-full border-[14px] border-[#0F4D3A] border-l-[#A33D10]"><span className="text-2xl font-black">{onTimeRate}%</span></div><div className="space-y-3 text-sm font-bold text-[#3F3D39]"><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#0F4D3A]" />Đúng giờ</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#A33D10]" />Đi trễ/Vắng</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#93540A]" />{manualAttendance} log thủ công/offline</p></div></div></Panel>
      </div>
      <Panel className="overflow-hidden">
        <div className="grid gap-5 p-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Field label="Chi nhánh kiểm soát"><select value={utilityBranchId} onChange={(event) => setUtilityBranchId(event.target.value)} className="staff-redesign-input"><option value="">Chọn chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <StaffButton onClick={generateQr} disabled={qrConfigBlocked} className="w-full"><Fingerprint size={18} /> QR ngày</StaffButton>
              <StaffButton variant="secondary" onClick={registerWifi} className="w-full"><Wifi size={18} /> Lưu WiFi</StaffButton>
            </div>
            {qrConfigBlocked ? <p className="rounded-xl border border-[#A33D10]/20 bg-[#FFF0D9] px-3 py-2 text-sm font-bold text-[#A33D10]">Thiếu QR secret cho production.</p> : null}
            {utilityError ? <p className="rounded-xl border border-[#F28C28]/25 bg-[#FFF0D9] px-3 py-2 text-sm font-bold text-[#A33D10]">{utilityError}</p> : null}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0F4D3A]">QR theo ngày</p>
                  <h2 className="mt-1 text-xl font-black text-[#2B2B2B]">Mã chấm công theo ngày</h2>
                  <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Reset theo ngày và theo chi nhánh để giảm dùng lại mã cũ.</p>
                </div>
                <StatusChip tone={qrState ? "success" : "neutral"}>{qrState ? "Đã tạo" : "Chưa tạo"}</StatusChip>
              </div>
              {qrState ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
                  <Image src={qrState.qrImageUrl} alt={`QR chấm công ${qrState.branchName}`} width={128} height={128} unoptimized className="h-32 w-32 rounded-xl border border-[#D8D1C7] bg-white object-contain" />
                  <div className="min-w-0 text-sm font-semibold text-[#3F3D39]">
                    <p className="font-black text-[#2B2B2B]">{qrState.branchName}</p>
                    <p className="mt-1">Ngày mã: {qrState.qrDate ? formatDate(qrState.qrDate) : formatDate(today)}</p>
                    <p className="mt-1">Hết hạn: {formatDateTime(qrState.expiresAt)}</p>
                    <div className="mt-3 flex items-center gap-2"><CopyTextButton value={qrState.attendanceUrl} label="Sao chép link QR" /><a href={qrState.attendanceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs font-black text-[#0F4D3A]">Mở link</a></div>
                  </div>
                </div>
              ) : <p className="mt-4 rounded-lg border border-dashed border-[#D8D1C7] bg-white px-3 py-4 text-sm font-semibold text-[#5E5A54]">Chọn chi nhánh thật rồi tạo QR hôm nay.</p>}
            </div>
            <div className="rounded-xl border border-[#E5DDD2] bg-[#F9F7F0] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[#93540A]">WiFi chấm công</p>
                  <h2 className="mt-1 text-xl font-black text-[#2B2B2B]">Mạng quán đang tin cậy</h2>
                  <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Lưu IP/CIDR hiện tại làm lớp đối chiếu khi nhân viên check-in.</p>
                </div>
                <StatusChip tone={wifiState ? "success" : "neutral"}>{wifiState ? "Đã lưu" : "Chưa lưu"}</StatusChip>
              </div>
              <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm font-semibold text-[#3F3D39]">
                <p><span className="font-black text-[#2B2B2B]">Chi nhánh:</span> {activeBranch?.name ?? "Chưa chọn"}</p>
                <p><span className="font-black text-[#2B2B2B]">WiFi/IP:</span> {wifiState?.publicIpCidr ?? "Chưa lưu từ backend"}</p>
                <p><span className="font-black text-[#2B2B2B]">Cách dùng:</span> nhân viên vẫn check-in bằng app, hệ thống đối chiếu thêm WiFi/GPS/QR.</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#D8D1C7] p-6"><h2 className="text-2xl font-black">Danh sách bản ghi</h2><a href={STAFF_ACTIVITY_EXPORT_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-[#4B4945] hover:bg-[#F5F1E9]"><Download size={17} /> Xuất CSV</a></div>
        <div className="hidden lg:block"><AttendanceTable feed={filteredFeed} members={bundle.members} clockOutAction={clockOutAction} clockingOut={clockingOut} /></div>
        <div className="space-y-4 p-4 lg:hidden">{filteredFeed.map((item) => <AttendanceCard key={item.id} item={item} />)}</div>
        <div className="border-t border-[#D8D1C7] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <form action={clockInAction} className="grid gap-3 rounded-xl border border-[#D8D1C7] bg-white p-4 md:grid-cols-6">
              <p className="text-sm font-black uppercase tracking-[0.08em] text-[#0F4D3A] md:col-span-6">Chấm công hộ</p>
              <select name="staffMemberId" className="staff-redesign-input md:col-span-2">{bundle.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
              <select name="branchId" className="staff-redesign-input md:col-span-2"><option value="">Chi nhánh theo hồ sơ</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
              <input name="note" required defaultValue="Chủ quán chấm công hộ sau khi xác nhận trực tiếp với nhân viên" className="staff-redesign-input md:col-span-5" />
              <button type="submit" disabled={clockingIn || !bundle.members.length} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white disabled:opacity-60">{clockingIn ? "Đang chấm..." : "Vào ca hộ"}</button>
            </form>
            <ManualClockOutQueue openAttendance={openAttendance} clockOutAction={clockOutAction} clockingOut={clockingOut} />
          </div>
          <div className="mt-3"><ActionMessage state={clockInState} /><ActionMessage state={clockOutState} /></div>
          <AttendanceAdjustmentPanel feed={filteredFeed} adjustAction={adjustAction} adjusting={adjustingAttendance} state={adjustState} />
        </div>
      </Panel>
      </div>
    </>
  );
}

function AttendanceTable({ feed, members, clockOutAction, clockingOut }: { feed: StaffOpsAttendanceFeedItem[]; members: StaffOpsMember[]; clockOutAction: (payload: FormData) => void; clockingOut: boolean }) {
  return (
    <table className="w-full text-left">
      <thead className="border-b border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em]">
        <tr>
          <th className="px-7 py-4">Nhân viên</th>
          <th className="px-4 py-4">Ca làm</th>
          <th className="px-4 py-4">Nguồn</th>
          <th className="px-4 py-4">Giờ vào</th>
          <th className="px-4 py-4">Giờ ra</th>
          <th className="px-4 py-4">Rủi ro</th>
          <th className="px-7 py-4 text-right">Hành động</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#D8D1C7]">
        {feed.map((item) => {
          const member = members.find((candidate) => candidate.id === item.staffMemberId);
          const risk = attendanceRiskScore(item);
          return (
            <tr key={item.id} className="bg-white hover:bg-[#FFF9F0]">
              <td className="px-7 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={item.fullName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-black text-[#2B2B2B]">{item.fullName}</span>
                    <span className="text-sm font-medium text-[#3F3D39]">{member?.roleTitle ?? item.branchName ?? "Nhân viên"}</span>
                  </span>
                </div>
              </td>
              <td className="px-4 py-4 text-sm font-bold text-[#2B2B2B]">{item.shiftName ?? "Ca đột xuất"}</td>
              <td className="px-4 py-4">
                <div className="text-sm font-black text-[#2B2B2B]">{attendanceSourceLabel(item.source)}</div>
                <div className="mt-0.5 text-xs font-semibold text-[#6B655B]">{item.distanceMeters !== null ? `${Math.round(item.distanceMeters)}m` : item.approvalState === "auto_approved" ? "Tự duyệt" : item.approvalState}</div>
              </td>
              <td className={cn("px-4 py-4 font-bold", item.state === "late" && "text-[#A33D10]")}>{shortTime(item.clockInAt)}</td>
              <td className="px-4 py-4 font-bold">{item.clockOutAt ? shortTime(item.clockOutAt) : "--:--"}</td>
              <td className="px-4 py-4">
                <div className="flex flex-col items-start gap-1">
                  <StatusChip tone={attendanceRiskTone(risk)}>{attendanceRiskLabel(risk)}</StatusChip>
                  <span className="text-xs font-semibold text-[#6B655B]">{attendanceStateLabel(item.state)} · {risk}/100</span>
                </div>
              </td>
              <td className="px-7 py-4 text-right">
                {!item.clockOutAt ? (
                  <form action={clockOutAction} className="inline-flex">
                    <input type="hidden" name="attendanceLogId" value={item.id} />
                    <input type="hidden" name="staffMemberId" value={item.staffMemberId} />
                    <input type="hidden" name="branchId" value={item.branchId ?? ""} />
                    <input type="hidden" name="note" value="Kết ca hộ nhanh từ bảng chấm công sau khi quản lý xác nhận" />
                    <button disabled={clockingOut} className="grid h-11 w-11 place-items-center rounded-xl border border-[#D8D1C7] bg-white" aria-label="Kết ca hộ"><Check size={18} /></button>
                  </form>
                ) : <StatusChip tone="success">Đã kết ca</StatusChip>}
              </td>
            </tr>
          );
        })}
        {!feed.length ? (
          <tr>
            <td colSpan={7} className="px-7 py-8">
              <InlineEmptyState title="Không có bản ghi chấm công" text="Đổi bộ lọc hoặc chờ nhân viên check-in bằng GPS, QR hoặc WiFi." />
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function AttendanceCard({ item }: { item: StaffOpsAttendanceFeedItem }) {
  const risk = attendanceRiskScore(item);
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={item.fullName} />
          <div className="min-w-0">
            <p className="truncate text-xl font-black text-[#2B2B2B]">{item.fullName}</p>
            <p className="truncate text-sm font-semibold text-[#3F3D39]">{item.branchName ?? "Chi nhánh"} · {attendanceSourceLabel(item.source)}</p>
          </div>
        </div>
        <StatusChip tone={attendanceRiskTone(risk)}>{attendanceRiskLabel(risk)}</StatusChip>
      </div>
      <div className="mt-4 grid grid-cols-2 divide-x divide-[#D8D1C7] rounded-xl bg-[#F5F8F1] p-4 text-lg font-black">
        <span className={item.state === "late" ? "text-[#A33D10]" : "text-[#0F4D3A]"}>{shortTime(item.clockInAt)}</span>
        <span className="pl-4 text-[#77736D]">{item.clockOutAt ? shortTime(item.clockOutAt) : "--:--"}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#5E5A54]">
        <span className="rounded-full bg-[#ECE9E3] px-2 py-1">{attendanceStateLabel(item.state)}</span>
        <span className="rounded-full bg-[#ECE9E3] px-2 py-1">Rủi ro {risk}/100</span>
        {item.distanceMeters !== null ? <span className="rounded-full bg-[#ECE9E3] px-2 py-1">{Math.round(item.distanceMeters)}m</span> : null}
      </div>
    </Panel>
  );
}

function ManualClockOutQueue({
  openAttendance,
  clockOutAction,
  clockingOut,
  compact
}: {
  openAttendance: StaffOpsAttendanceFeedItem[];
  clockOutAction: (payload: FormData) => void;
  clockingOut: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3 rounded-xl border border-[#D8D1C7] bg-white p-4", compact ? "" : "md:grid-cols-1")}>
      <p className="text-sm font-black uppercase text-[#93540A]">Kết ca hộ</p>
      {openAttendance.length ? (
        <div className="grid gap-2">
          {openAttendance.map((item) => (
            <form key={item.id} action={clockOutAction} className="grid gap-2 rounded-lg border border-[#E5DDD2] bg-[#FFFDF8] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)_112px] sm:items-center">
              <input type="hidden" name="attendanceLogId" value={item.id} />
              <input type="hidden" name="staffMemberId" value={item.staffMemberId} />
              <input type="hidden" name="branchId" value={item.branchId ?? ""} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#2B2B2B]">{item.fullName}</p>
                <p className="mt-0.5 text-xs font-semibold text-[#5E5A54]">{shortTime(item.clockInAt)} · {item.branchName ?? "Chi nhánh"}</p>
              </div>
              <input name="note" required defaultValue="Chủ quán kết ca hộ sau khi xác nhận giờ ra" className="h-10 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs font-bold text-[#2B2B2B] outline-none focus:border-[#0F4D3A]" />
              <button type="submit" disabled={clockingOut} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#D8D1C7] bg-[#FFF7EB] px-3 text-xs font-black text-[#2B2B2B] disabled:opacity-60">
                {clockingOut ? "Đang kết..." : "Kết ca"}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-3 text-sm font-semibold text-[#5E5A54]">Không có phiên công đang mở.</p>
      )}
    </div>
  );
}

function AttendanceAdjustmentPanel({
  feed,
  adjustAction,
  adjusting,
  state,
  compact
}: {
  feed: StaffOpsAttendanceFeedItem[];
  adjustAction: (payload: FormData) => void;
  adjusting: boolean;
  state?: StaffActionState;
  compact?: boolean;
}) {
  return (
    <details className={cn("mt-4 rounded-xl border border-[#D8D1C7] bg-white", compact ? "p-4" : "p-5")}>
      <summary className="cursor-pointer text-sm font-black uppercase text-[#0F4D3A]">Sửa công</summary>
      <div className="mt-4 grid gap-3">
        {state ? <ActionMessage state={state} /> : null}
        {feed.length ? (
          feed.map((item) => (
            <form key={item.id} action={adjustAction} className="grid gap-3 rounded-lg border border-[#E5DDD2] bg-[#FFFDF8] p-3 md:grid-cols-[minmax(0,1fr)_170px_170px_minmax(160px,1fr)_96px] md:items-end">
              <input type="hidden" name="attendanceLogId" value={item.id} />
              <input type="hidden" name="staffMemberId" value={item.staffMemberId} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#2B2B2B]">{item.fullName}</p>
                <p className="mt-1 text-xs font-semibold text-[#5E5A54]">{item.shiftName ?? "Ca đột xuất"} · {item.branchName ?? "Chi nhánh"}</p>
                <p className="mt-2 rounded-lg bg-white px-2 py-1 text-xs font-bold text-[#6B655B]">Trước: {shortTime(item.clockInAt)} → {item.clockOutAt ? shortTime(item.clockOutAt) : "chưa ra"}</p>
              </div>
              <Field label="Giờ vào"><input name="clockInAt" type="datetime-local" defaultValue={dateTimeLocalValue(item.clockInAt)} className="staff-redesign-input" /></Field>
              <Field label="Giờ ra"><input name="clockOutAt" type="datetime-local" defaultValue={dateTimeLocalValue(item.clockOutAt)} className="staff-redesign-input" /></Field>
              <Field label="Lý do"><input name="note" required defaultValue="Sửa công theo xác nhận quản lý" className="staff-redesign-input" /></Field>
              <button type="submit" disabled={adjusting} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0F4D3A] px-3 text-xs font-black text-white disabled:opacity-60">
                {adjusting ? "Lưu..." : "Lưu"}
              </button>
            </form>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-3 text-sm font-semibold text-[#5E5A54]">Không có bản ghi công theo bộ lọc hiện tại.</p>
        )}
      </div>
    </details>
  );
}

function RequestsScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [reviewState, reviewAction, reviewing] = useActionState(reviewAttendanceApprovalAction, undefined);
  useActionSuccessRefresh(reviewState);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const requests = bundle.approvals.filter((item) => item.status === statusFilter);
  return (
    <div className="space-y-6">
      <div className="flex gap-3 overflow-x-auto">{(["pending", "approved", "rejected"] as const).map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cn("min-h-14 rounded-full px-7 text-lg font-black", statusFilter === status ? "bg-[#0F4D3A] text-white" : "bg-[#ECE9E3] text-[#4B4945]")}>{status === "pending" ? "Đang chờ" : status === "approved" ? "Đã duyệt" : "Đã từ chối"}</button>)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        {requests.map((request) => <RequestCard key={request.id} request={request} action={reviewAction} reviewing={reviewing} />)}
        {!requests.length ? <EmptyState title="Không có yêu cầu phù hợp" text="Các đơn nghỉ phép, đổi ca, tăng ca và đối soát chấm công sẽ xuất hiện từ dữ liệu thật." /> : null}
      </div>
      <ActionMessage state={reviewState} />
    </div>
  );
}

function RequestCard({ request, action, reviewing }: { request: StaffOpsApprovalItem; action: (payload: FormData) => void; reviewing: boolean }) {
  return (
    <Panel className="p-6">
      <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><Avatar name={request.fullName} /><div><p className="text-2xl font-medium text-[#2B2B2B]">{request.fullName}</p><p className="text-base font-semibold text-[#5E5A54]">{request.branchName ?? "Nhân sự"}</p></div></div><span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#ECE9E3] px-3 text-base font-semibold text-[#3F3D39]"><CalendarClock size={17} /> {requestLabel(request.requestType)}</span></div>
      <div className="mt-5 space-y-2 text-xl font-medium text-[#2B2B2B]"><p className="flex items-center gap-3"><Clock3 size={22} className="text-[#77736D]" />{formatDateTime(request.createdAt)}</p><p className="flex items-center gap-3"><ListChecks size={22} className="text-[#77736D]" />{request.reason ?? "Không có ghi chú"}</p></div>
      {request.status === "pending" ? <form action={action} className="mt-6 grid grid-cols-2 gap-4"><input type="hidden" name="approvalId" value={request.id} /><input type="hidden" name="note" value="Duyệt từ giao diện Staff mới" /><button name="decision" value="rejected" disabled={reviewing} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#ECE9E3] text-lg font-black text-[#4B4945]"><X size={20} /> Từ chối</button><button name="decision" value="approved" disabled={reviewing} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#0F4D3A] text-lg font-black text-white"><Check size={20} /> Duyệt</button></form> : <StatusChip tone={request.status === "approved" ? "success" : "danger"}>{request.status === "approved" ? "Đã duyệt" : "Đã từ chối"}</StatusChip>}
    </Panel>
  );
}

function PermissionsScreen({ bundle, selectedMember }: { bundle: StaffOperationsBundle; selectedMember: StaffOpsMember | null }) {
  const [roleId, setRoleId] = useState(bundle.roles[0]?.id ?? "");
  const [state, action, pending] = useActionState(updateStaffRolePermissionsAction, undefined);
  useActionSuccessRefresh(state);
  const role = bundle.roles.find((item) => item.id === roleId) ?? bundle.roles[0];
  const [selectedPermissions, setSelectedPermissions] = useState<StaffPermissionKey[]>(role?.permissions ?? []);
  const selectedPermissionSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions]);
  const selectedDangerPermissionCount = selectedPermissions.filter(isDangerPermission).length;

  function togglePermission(permission: StaffPermissionKey, checked: boolean) {
    setSelectedPermissions((current) => {
      if (checked) return current.includes(permission) ? current : [...current, permission];
      return current.filter((item) => item !== permission);
    });
  }

  return (
    <div className="space-y-6">
      <section><p className="text-base font-bold text-[#3F3D39]">Nhân viên / Phân quyền</p><h1 className="mt-3 text-[32px] font-black text-[#2B2B2B]">Ma trận quyền theo vai trò</h1><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#5E5A54]"><UserRound size={18} /> {selectedMember ? `Nhân viên đang xem: ${selectedMember.fullName}. Gán vai trò ở hồ sơ nhân viên.` : "Chọn vai trò để chỉnh quyền áp dụng cho nhóm nhân sự."}</p></section>
      <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <input type="hidden" name="roleId" value={role?.id ?? ""} />
        <div className="space-y-6">
          <Panel className="p-6"><h2 className="text-2xl font-black">Nhóm quyền cơ bản</h2><p className="mt-1 text-base font-medium text-[#5E5A54]">Chọn vai trò để chỉnh quyền thật của vai trò đó.</p><div className="mt-5 grid gap-4 md:grid-cols-3">{bundle.roles.map((item) => <button key={item.id} type="button" onClick={() => { setRoleId(item.id); setSelectedPermissions(item.permissions); }} className={cn("min-h-32 rounded-xl border-2 p-4 text-left transition", roleId === item.id ? "border-[#0F4D3A] bg-[#E5EEE2]" : "border-[#D8D1C7] bg-[#F8F5EF]")}><span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#0F4D3A]"><KeyRound size={20} /></span><span className="mt-4 block text-lg font-black">{item.title}</span><span className="mt-1 block text-sm font-medium text-[#5E5A54]">{item.permissionCount} quyền</span></button>)}</div></Panel>
          <Panel className="overflow-hidden"><div className="border-b border-[#D8D1C7] p-6"><h2 className="text-2xl font-black">Ma trận quyền chi tiết</h2></div><div className="divide-y divide-[#D8D1C7]">{bundle.permissionGroups.map((group) => <div key={group.key} className="grid gap-4 p-5 lg:grid-cols-[240px_minmax(0,1fr)]"><div><p className="text-lg font-black">{group.title}</p><p className="mt-1 text-sm font-medium text-[#5E5A54]">{group.description}</p></div><div className="grid gap-3 sm:grid-cols-2">{group.permissions.map((permission) => <label key={permission} className="relative flex min-h-12 items-center gap-3 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm font-bold"><input type="checkbox" name="permissions" value={permission} checked={selectedPermissionSet.has(permission)} onChange={(event) => togglePermission(permission, event.target.checked)} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" /><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#BDB5AA] bg-white text-white peer-checked:border-[#0F4D3A] peer-checked:bg-[#0F4D3A]"><Check size={15} /></span><span className="min-w-0 flex-1">{staffPermissionLabel(permission)}</span>{isDangerPermission(permission) ? <span className="rounded-full bg-[#FFF0D9] px-2 py-1 text-[10px] uppercase text-[#93540A]">nhạy cảm</span> : null}</label>)}</div></div>)}</div></Panel>
        </div>
        <aside className="space-y-5"><Panel className="p-6"><h2 className="text-2xl font-black">Tóm tắt quyền</h2><p className="mt-2 text-lg font-black text-[#0F4D3A]">{role?.title ?? "Vai trò"}</p><p className="mt-1 text-sm font-medium text-[#5E5A54]">{role?.description}</p><div className="mt-5 grid grid-cols-2 gap-3"><MetricMini label="Tổng quyền" value={selectedPermissions.length} /><MetricMini label="Nhạy cảm" value={selectedDangerPermissionCount} /></div><button type="submit" disabled={pending || !role?.id} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white">{pending ? "Đang lưu..." : "Lưu phân quyền"}</button><div className="mt-3"><ActionMessage state={state} /></div></Panel></aside>
      </form>
    </div>
  );
}

function ReportsScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const totalStaff = bundle.members.length;
  const totalHours = bundle.timesheets.reduce((sum, item) => sum + item.workMinutes, 0);
  const avgAttendance = bundle.timesheets.length ? Math.round(bundle.timesheets.reduce((sum, item) => sum + item.attendanceScore, 0) / bundle.timesheets.length) : 100;
  const topBranch = [...bundle.branches].sort((left, right) => right.activeStaff - left.activeStaff || right.coverageScore - left.coverageScore)[0] ?? null;
  const roleRows = roleDistributionRows(bundle.members);
  const timesheetRows = bundle.timesheets.filter((item) => item.workMinutes > 0 || item.attendanceCount > 0).sort((left, right) => right.workMinutes - left.workMinutes).slice(0, 7);
  return (
    <>
      <div className="lg:hidden">
        <MobileReportsScreen bundle={bundle} totalStaff={totalStaff} totalHours={totalHours} avgAttendance={avgAttendance} />
      </div>
      <div className="hidden space-y-8 lg:block">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-[32px] font-black text-[#2B2B2B]">Báo cáo hiệu suất</h1><p className="mt-2 text-base font-medium text-[#3F3D39]">Dữ liệu thật từ nhân sự, chấm công, ca làm và timesheet hiện có.</p></div><div className="flex gap-3"><span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-bold text-[#2B2B2B]"><CalendarClock size={18} /> Tháng này</span><a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-bold text-[#2B2B2B] hover:border-[#0F4D3A]/35"><Download size={18} /> Xuất CSV</a></div></section>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><ReportCard label="Nhân sự" value={totalStaff} tone="brand" /><ReportCard label="Giờ công" value={formatHours(totalHours)} tone="warning" /><ReportCard label="Điểm công" value={`${avgAttendance}%`} tone="success" /><ReportCard label="Chi nhánh nổi bật" value={topBranch?.name ?? "Chưa có"} tone="dark" /></div>
      <PayrollPeriodWorkspace bundle={bundle} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_386px]"><Panel className="p-7"><h2 className="text-2xl font-black">Giờ công theo nhân viên</h2>{timesheetRows.length ? <ReportBarChart rows={timesheetRows.map((item) => ({ label: item.fullName, value: item.workMinutes, display: formatHours(item.workMinutes) }))} /> : <InlineEmptyState title="Chưa có dữ liệu giờ công" text="Khi nhân viên chấm công hoặc chốt ca, biểu đồ sẽ tự cập nhật từ timesheet thật." />}</Panel><Panel className="p-7"><h2 className="text-2xl font-black">Cơ cấu vai trò</h2><div className="mx-auto mt-8 grid h-56 w-56 place-items-center rounded-full border-[20px] border-[#0F4D3A] border-l-[#A9C5A1] border-t-[#F28C28]"><span className="text-center"><span className="block text-3xl font-black">{totalStaff}</span><span className="text-sm font-medium">nhân sự thật</span></span></div><div className="mt-8 space-y-4 text-lg font-medium">{roleRows.length ? roleRows.map((row, index) => <Legend key={row.label} label={row.label} value={`${row.percent}%`} color={index === 0 ? "#0F4D3A" : index === 1 ? "#F28C28" : "#A9C5A1"} />) : <p className="text-base font-semibold text-[#5E5A54]">Chưa có nhân sự để phân bổ vai trò.</p>}</div></Panel></div>
      <Panel className="overflow-hidden"><div className="p-7"><h2 className="text-2xl font-black">Hiệu suất chi nhánh</h2></div><table className="hidden w-full text-left lg:table"><thead className="border-y border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em]"><tr><th className="px-7 py-4">Chi nhánh</th><th className="px-4 py-4">Nhân sự active</th><th className="px-4 py-4">Giờ công</th><th className="px-4 py-4">Điểm phủ ca</th><th className="px-7 py-4">Trạng thái</th></tr></thead><tbody>{bundle.branches.map((branch) => { const branchMinutes = bundle.timesheets.filter((item) => item.branchName === branch.name).reduce((sum, item) => sum + item.workMinutes, 0); return <tr key={branch.id} className="border-b border-[#D8D1C7]"><td className="px-7 py-5 font-black">{branch.name}</td><td className="px-4 py-5">{branch.activeStaff}</td><td className="px-4 py-5">{formatHours(branchMinutes)}</td><td className="px-4 py-5"><span className="inline-block h-2 rounded-full bg-[#0F4D3A]" style={{ width: `${Math.max(10, Math.min(112, branch.coverageScore * 1.12))}px` }} /> {branch.coverageScore}/100</td><td className="px-7 py-5"><StatusChip tone={branch.coverageScore >= 80 ? "success" : branch.coverageScore >= 55 ? "neutral" : "danger"}>{branch.coverageScore >= 80 ? "Ổn định" : branch.coverageScore >= 55 ? "Cần theo dõi" : "Thiếu phủ ca"}</StatusChip></td></tr>; })}</tbody></table></Panel>
      </div>
    </>
  );
}

function PayrollPeriodWorkspace({ bundle, compact = false }: { bundle: StaffOperationsBundle; compact?: boolean }) {
  const payrollRows = [...bundle.timesheets].sort((left, right) => right.workMinutes - left.workMinutes || right.attendanceScore - left.attendanceScore);
  const totalWorkMinutes = payrollRows.reduce((sum, item) => sum + item.workMinutes, 0);
  const totalLateMinutes = payrollRows.reduce((sum, item) => sum + item.lateMinutes, 0);
  const totalOvertimeMinutes = payrollRows.reduce((sum, item) => sum + item.overtimeMinutes, 0);
  const totalApprovedOvertimeMinutes = payrollRows.reduce((sum, item) => sum + item.approvedOvertimeMinutes, 0);
  const pendingPayrollApprovals = payrollRows.reduce((sum, item) => sum + item.pendingApprovals, 0);
  const overtimeGap = Math.max(0, totalOvertimeMinutes - totalApprovedOvertimeMinutes);
  const blockerRows = payrollRows.filter((item) => payrollStatus(item).tone === "danger");
  const payrollReadyCount = payrollRows.filter((item) => payrollStatus(item).tone === "success").length;
  const readinessScore = clampPercent(100 - pendingPayrollApprovals * 7 - blockerRows.length * 5 - Math.ceil(totalLateMinutes / 30) * 2 - Math.ceil(overtimeGap / 60) * 4);
  const readinessTone = readinessScore >= 90 ? "success" : readinessScore >= 75 ? "warning" : "danger";
  const visibleRows = payrollRows.slice(0, compact ? 4 : 8);
  const bonusCandidates = payrollRows
    .map((timesheet) => {
      const review = latestReviewForStaff(bundle.reviews, timesheet.staffMemberId);
      const status = payrollStatus(timesheet);
      const label = status.tone === "danger" ? "Cần giữ lương" : review && review.score >= 4 ? "Đề xuất thưởng" : timesheet.attendanceScore >= 92 && timesheet.lateCount === 0 ? "Đề xuất thưởng" : "Theo dõi";
      const tone: "success" | "danger" | "neutral" = status.tone === "danger" ? "danger" : label === "Đề xuất thưởng" ? "success" : "neutral";
      return { timesheet, review, label, tone };
    })
    .filter((item) => item.label !== "Theo dõi" || item.timesheet.pendingApprovals > 0)
    .slice(0, 4);
  const checklist = [
    { label: "Duyệt request công/lương", done: pendingPayrollApprovals === 0, detail: pendingPayrollApprovals ? `${pendingPayrollApprovals} yêu cầu còn chờ` : "Không còn request chờ" },
    { label: "Khớp tăng ca", done: overtimeGap === 0, detail: overtimeGap ? `${formatHours(overtimeGap)} OT chưa duyệt` : "OT đã khớp duyệt" },
    { label: "Rà soát đi muộn", done: totalLateMinutes < 30, detail: `${formatHours(totalLateMinutes)} đi muộn` }
  ];

  if (compact) {
    return (
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0F4D3A]">Lương/thưởng</p>
            <h2 className="mt-1 text-2xl font-black text-[#2B2B2B]">{payrollPeriodLabel()}</h2>
          </div>
          <StatusChip tone={readinessTone}>{readinessScore}% sẵn sàng</StatusChip>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricMini label="Giờ công" value={formatHours(totalWorkMinutes)} />
          <MetricMini label="Chặn lương" value={blockerRows.length} />
        </div>
        <div className="mt-4 space-y-3">
          {visibleRows.map((item) => {
            const status = payrollStatus(item);
            return (
              <div key={item.staffMemberId} className="rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-3">
                <div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-black text-[#2B2B2B]">{item.fullName}</p><StatusChip tone={status.tone}>{status.label}</StatusChip></div>
                <p className="mt-2 text-xs font-bold text-[#5E5A54]">{formatHours(item.workMinutes)} · OT duyệt {formatHours(item.approvedOvertimeMinutes)} · điểm {item.attendanceScore}/100</p>
              </div>
            );
          })}
          {!visibleRows.length ? <InlineEmptyState title="Chưa có timesheet" text="Không hiển thị lương/thưởng khi chưa có dữ liệu thật." /> : null}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F4D3A]">Đối soát lương</p>
              <h2 className="mt-1 text-2xl font-black text-[#2B2B2B]">Lương/thưởng {payrollPeriodLabel()}</h2>
              <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Tổng hợp từ timesheet, tăng ca đã duyệt, review và hợp đồng thật.</p>
            </div>
            <div className="flex gap-2"><StatusChip tone={readinessTone}>{readinessScore}% sẵn sàng</StatusChip><a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[#D8D1C7] bg-white px-3 text-xs font-black text-[#2B2B2B]"><Download size={15} /> CSV</a></div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3">
            <MetricMini label="Giờ công" value={formatHours(totalWorkMinutes)} />
            <MetricMini label="OT duyệt" value={formatHours(totalApprovedOvertimeMinutes)} />
            <MetricMini label="Sẵn lương" value={`${payrollReadyCount}/${payrollRows.length}`} />
            <MetricMini label="Cần xử lý" value={blockerRows.length} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {checklist.map((item) => (
              <div key={item.label} className="rounded-xl border border-[#E5DDD2] bg-[#FFFDF8] p-3">
                <p className="flex items-center gap-2 text-sm font-black text-[#2B2B2B]"><span className={cn("grid h-5 w-5 place-items-center rounded-full text-white", item.done ? "bg-[#0F4D3A]" : "bg-[#A33D10]")}>{item.done ? <Check size={13} /> : <X size={13} />}</span>{item.label}</p>
                <p className="mt-1 text-xs font-semibold text-[#6B655B]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#E5DDD2] bg-[#F9F7F0] p-4">
          <h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#2B2B2B]">Thưởng / giữ lương đề xuất</h3>
          <div className="mt-3 space-y-2">
            {bonusCandidates.map(({ timesheet, review, label, tone }) => (
              <div key={timesheet.staffMemberId} className="rounded-lg bg-white p-3">
                <div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-black text-[#2B2B2B]">{timesheet.fullName}</p><StatusChip tone={tone}>{label}</StatusChip></div>
                <p className="mt-1 text-xs font-semibold text-[#6B655B]">Điểm công {timesheet.attendanceScore}/100 · review {review?.score ?? "chưa có"} · muộn {timesheet.lateCount} lần</p>
              </div>
            ))}
            {!bonusCandidates.length ? <p className="rounded-lg border border-dashed border-[#D8D1C7] bg-white px-3 py-4 text-sm font-semibold text-[#5E5A54]">Chưa có ứng viên thưởng/giữ lương từ dữ liệu thật.</p> : null}
          </div>
        </div>
      </div>
      <div className="border-t border-[#E5DDD2]">
        <table className="w-full text-left">
          <thead className="bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em] text-[#37342F]"><tr><th className="px-6 py-4">Nhân viên</th><th className="px-4 py-4">Giờ công</th><th className="px-4 py-4">Tăng ca</th><th className="px-4 py-4">Đi muộn</th><th className="px-4 py-4">Ước tính lương</th><th className="px-6 py-4">Trạng thái</th></tr></thead>
          <tbody className="divide-y divide-[#E5DDD2]">
            {visibleRows.map((item) => {
              const contract = latestContractForStaff(bundle.contracts, item.staffMemberId);
              const estimatedPay = estimatePayrollAmount(item, contract);
              const status = payrollStatus(item);
              return (
                <tr key={item.staffMemberId} className="bg-white hover:bg-[#FFF9F0]">
                  <td className="px-6 py-4"><p className="font-black text-[#2B2B2B]">{item.fullName}</p><p className="text-sm font-semibold text-[#6B655B]">{item.branchName ?? "Toàn quán"}</p></td>
                  <td className="px-4 py-4 font-bold">{formatHours(item.workMinutes)}</td>
                  <td className="px-4 py-4 text-sm font-bold text-[#3F3D39]">{formatHours(item.approvedOvertimeMinutes)} / {formatHours(item.overtimeMinutes)}</td>
                  <td className="px-4 py-4 text-sm font-bold text-[#3F3D39]">{item.lateCount} lần · {formatHours(item.lateMinutes)}</td>
                  <td className="px-4 py-4 text-sm font-black text-[#2B2B2B]">{estimatedPay === null ? "Chưa có hợp đồng" : formatVnd(estimatedPay)}</td>
                  <td className="px-6 py-4"><StatusChip tone={status.tone}>{status.label}</StatusChip></td>
                </tr>
              );
            })}
            {!visibleRows.length ? <tr><td colSpan={6} className="px-6 py-8"><InlineEmptyState title="Chưa có dữ liệu payroll" text="Khi có timesheet thật, bảng lương/thưởng sẽ tự hiện." /></td></tr> : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MobileShiftManagementScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [cancelState, cancelAction, cancelling] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  useActionSuccessRefresh(cancelState);
  const week = getWeekRange().slice(0, 5);
  const branchName = bundle.branches[0]?.name ?? "Chưa có chi nhánh";
  const activeAssignments = bundle.shiftAssignments.filter((assignment) => assignment.status !== "cancelled").sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.shiftName.localeCompare(right.shiftName, "vi"));
  const assignmentsByDate = week.map((day) => ({
    day,
    assignments: activeAssignments.filter((assignment) => assignment.scheduledDate === day.iso)
  })).filter((group) => group.assignments.length > 0);

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <select className="h-14 rounded-xl border border-[#D8D1C7] bg-white px-4 text-lg font-bold text-[#2B2B2B]">
          <option>{branchName}</option>
        </select>
        <div className="flex items-center gap-5 text-lg font-black text-[#2B2B2B]">
          <ChevronLeft size={23} />
          Tuần này
          <ChevronRight size={23} />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {week.map((day, index) => (
          <button
            key={day.iso}
            type="button"
            className={cn(
              "grid h-24 place-items-center rounded-2xl border text-center",
              index === 0 ? "border-[#0F4D3A] bg-[#0F4D3A] text-white" : "border-[#E5DDD2] bg-white text-[#2B2B2B]"
            )}
          >
            <span className="text-base font-black">{day.weekday}</span>
            <span className="text-2xl font-medium">{day.day}</span>
          </button>
        ))}
      </div>
      {assignmentsByDate.length ? (
        <>
          {assignmentsByDate.map((group) => <MobileShiftSection key={group.day.iso} title={formatDate(group.day.iso)} assignments={group.assignments} cancelAction={cancelAction} cancelling={cancelling} />)}
          <ActionMessage state={cancelState} />
        </>
      ) : <EmptyState title="Chưa có lịch ca" text="Lịch ca sẽ hiển thị sau khi quản lý tạo và gán ca thật cho nhân viên." />}
    </div>
  );
}

function MobileShiftSection({ title, assignments, cancelAction, cancelling }: { title: string; assignments: StaffOpsShiftAssignment[]; cancelAction: (payload: FormData) => void; cancelling: boolean }) {
  if (!assignments.length) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl text-[#F28C28]">☼</span>
        <h2 className="text-lg font-black uppercase tracking-[0.08em] text-[#3F3D39]">{title}</h2>
        <span className="h-px flex-1 bg-[#E5DDD2]" />
      </div>
      {assignments.map((assignment) => (
        <Panel key={assignment.id} className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-medium text-[#2B2B2B]">{assignment.shiftName}</h3>
              <p className="mt-2 text-xl font-medium text-[#5E5A54]">{assignment.branchName ?? "Toàn bộ"}</p>
            </div>
            <form action={cancelAction} className="shrink-0">
              <input type="hidden" name="shiftAssignmentId" value={assignment.id} />
              <input type="hidden" name="note" value="Huỷ từ lịch mobile Staff admin" />
              <button type="submit" disabled={cancelling} className="rounded-full bg-[#FFF0D9] px-4 py-2 text-base font-bold text-[#A33D10]">Huỷ ca</button>
            </form>
          </div>
          <div className="mt-6 border-t border-[#E5DDD2] pt-5">
            <p className="flex items-center gap-3 text-2xl font-medium text-[#2B2B2B]"><Avatar name={assignment.staffName} size="sm" />{assignment.staffName}</p>
          </div>
        </Panel>
      ))}
    </section>
  );
}

function MobileAttendanceManagementScreen({
  bundle,
  clockInAction,
  clockOutAction,
  adjustAction,
  clockingIn,
  clockingOut,
  adjustingAttendance,
  generateQr,
  registerWifi,
  utilityBranchId,
  onUtilityBranchChange,
  utilityState,
  qrConfigBlocked
}: {
  bundle: StaffOperationsBundle;
  clockInAction: (payload: FormData) => void;
  clockOutAction: (payload: FormData) => void;
  adjustAction: (payload: FormData) => void;
  clockingIn: boolean;
  clockingOut: boolean;
  adjustingAttendance: boolean;
  generateQr: () => Promise<void>;
  registerWifi: () => Promise<void>;
  utilityBranchId: string;
  onUtilityBranchChange: (value: string) => void;
  utilityState: { qrState: StaffAttendanceQrTokenResult | null; wifiState: StaffAttendanceWifiNetworkResult | null; utilityError: string };
  qrConfigBlocked: boolean;
}) {
  const todayFeed = bundle.attendanceFeed.filter((item) => item.clockInAt?.slice(0, 10) === today);
  const openAttendance = todayFeed.filter((item) => !item.clockOutAt);
  const onTime = todayFeed.filter((item) => item.state === "on_time" || item.state === "overtime").length;
  const late = todayFeed.filter((item) => item.state === "late" || item.state === "absent").length;
  const branches = branchOptions(bundle.branches);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-black leading-tight text-[#2B2B2B]">Chấm công hôm nay</h1>
        <p className="mt-1 text-sm font-semibold text-[#3F3D39]">{formatDate(today)}</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Panel className="p-4"><p className="flex items-center gap-2 text-sm font-black text-[#0F4D3A]"><CheckCircle2 size={18} /> Đúng giờ</p><p className="mt-3 text-2xl font-black">{onTime}</p></Panel>
        <Panel className="p-4"><p className="flex items-center gap-2 text-sm font-black text-[#A33D10]"><Clock3 size={18} /> Đi muộn</p><p className="mt-3 text-2xl font-black">{late}</p></Panel>
      </div>
      <div className="space-y-3">
        {todayFeed.map((item) => {
          const assignment = currentAssignmentForMember(bundle.shiftAssignments, item.staffMemberId);
          return (
          <Panel key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3"><Avatar name={item.fullName} /><div className="min-w-0"><p className="truncate text-base font-black leading-tight text-[#2B2B2B]">{item.fullName}</p><p className="truncate text-sm font-semibold text-[#3F3D39]">{assignment?.shiftName ?? "Chưa gán ca"}</p></div></div>
              <StatusChip tone={item.state === "late" ? "danger" : item.state === "absent" ? "neutral" : "success"}>{item.state === "late" ? "Đi muộn" : item.state === "absent" ? "Vắng mặt" : "Đúng giờ"}</StatusChip>
            </div>
            {item.state !== "absent" ? <div className="mt-4 grid grid-cols-2 divide-x divide-[#D8D1C7] rounded-xl bg-[#F5F8F1] p-3 text-base font-black"><span className={item.state === "late" ? "text-[#A33D10]" : "text-[#0F4D3A]"}>{shortTime(item.clockInAt)}</span><span className="pl-3 text-[#77736D]">{shortTime(item.clockOutAt)}</span></div> : null}
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#3F3D39]"><MapPin size={16} /> {item.branchName ?? "Chưa gán chi nhánh"}</p>
          </Panel>
        );})}
        {!todayFeed.length ? <EmptyState title="Chưa có log chấm công hôm nay" text="Khi nhân viên check-in bằng GPS, QR hoặc WiFi, dữ liệu thật sẽ xuất hiện tại đây." /> : null}
      </div>
      <Panel className="p-5">
        <h2 className="text-xl font-black text-[#2B2B2B]">Chấm công hộ</h2>
        <form action={clockInAction} className="mt-4 grid gap-3">
          <select name="staffMemberId" className="staff-redesign-input">{bundle.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
          <select name="branchId" className="staff-redesign-input"><option value="">Chi nhánh theo hồ sơ</option>{branchOptions(bundle.branches).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <input name="note" required defaultValue="Chủ quán chấm công hộ sau khi xác nhận trực tiếp với nhân viên" className="staff-redesign-input" />
          <button type="submit" disabled={clockingIn || !bundle.members.length} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white disabled:opacity-60">{clockingIn ? "Đang xử lý..." : "Vào ca hộ"}</button>
        </form>
        <div className="mt-4 border-t border-[#D8D1C7] pt-4">
          <ManualClockOutQueue openAttendance={openAttendance} clockOutAction={clockOutAction} clockingOut={clockingOut} compact />
        </div>
        <AttendanceAdjustmentPanel feed={todayFeed} adjustAction={adjustAction} adjusting={adjustingAttendance} compact />
        <label className="mt-4 grid gap-2 text-sm font-black text-[#2B2B2B]"><span>Chi nhánh tạo QR/WiFi</span><select value={utilityBranchId} onChange={(event) => onUtilityBranchChange(event.target.value)} className="staff-redesign-input"><option value="">Chọn chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><StaffButton onClick={generateQr} disabled={qrConfigBlocked}><Fingerprint size={17} /> QR ngày</StaffButton><StaffButton variant="secondary" onClick={registerWifi}><Wifi size={17} /> WiFi</StaffButton></div>
        {qrConfigBlocked ? <p className="mt-3 rounded-xl bg-[#FFF0D9] p-3 text-sm font-bold text-[#A33D10]">Thiếu QR secret production.</p> : null}
        {utilityState.qrState ? <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#F5F8F1] p-3 text-sm font-semibold text-[#5E5A54]"><Image src={utilityState.qrState.qrImageUrl} alt={`QR chấm công ${utilityState.qrState.branchName}`} width={88} height={88} unoptimized className="h-[88px] w-[88px] rounded-lg bg-white object-contain" /><span>{utilityState.qrState.branchName}<br />Hết hạn {formatDateTime(utilityState.qrState.expiresAt)}</span></div> : null}
        {utilityState.utilityError || utilityState.wifiState ? <p className="mt-3 rounded-xl bg-[#F5F8F1] p-3 text-sm font-semibold text-[#5E5A54]">{utilityState.utilityError || utilityState.wifiState?.publicIpCidr}</p> : null}
      </Panel>
    </div>
  );
}

function MobileReportsScreen({ bundle, totalStaff, totalHours, avgAttendance }: { bundle: StaffOperationsBundle; totalStaff: number; totalHours: number; avgAttendance: number }) {
  const topStaff = bundle.timesheets.filter((item) => item.workMinutes > 0 || item.attendanceCount > 0).sort((left, right) => right.workMinutes - left.workMinutes).slice(0, 4);
  const reportBars = topStaff.slice(0, 7).map((item) => ({ label: item.fullName, value: item.workMinutes, display: formatHours(item.workMinutes) }));
  return (
    <div className="space-y-5">
      <section><h1 className="text-2xl font-black leading-tight text-[#2B2B2B]">Báo cáo</h1><p className="mt-1 text-sm font-semibold text-[#3F3D39]">Tổng quan hiệu suất hoạt động</p></section>
      <div className="grid grid-cols-3 rounded-xl bg-[#F5F8F1] p-1 text-center text-sm font-black text-[#4B4945]"><button className="min-h-11 rounded-lg">Hôm nay</button><button className="min-h-11 rounded-lg bg-white text-[#2B2B2B] shadow-[0_2px_8px_rgba(43,43,43,0.06)]">Tuần này</button><button className="min-h-11 rounded-lg">Tháng này</button></div>
      <div className="grid grid-cols-2 gap-3"><Panel className="p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#3F3D39]"><BriefcaseBusiness size={18} /> Nhân sự</p><p className="mt-3 text-2xl font-black text-[#2B2B2B]">{totalStaff}</p><p className="mt-1 text-xs font-bold text-[#5E5A54]">Từ hồ sơ thật</p></Panel><Panel className="p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#3F3D39]"><Clock3 size={18} /> Giờ công</p><p className="mt-3 text-2xl font-black text-[#2B2B2B]">{formatHours(totalHours)}</p><p className="mt-1 text-xs font-bold text-[#5E5A54]">Điểm công {avgAttendance}%</p></Panel></div>
      <PayrollPeriodWorkspace bundle={bundle} compact />
      <Panel className="p-5"><h2 className="text-xl font-black text-[#2B2B2B]">Giờ công theo nhân viên</h2>{reportBars.length ? <ReportBarChart rows={reportBars} compact /> : <InlineEmptyState title="Chưa có giờ công" text="Báo cáo sẽ cập nhật khi có dữ liệu chấm công thật." />}</Panel>
      <Panel className="p-5"><h2 className="text-xl font-black text-[#2B2B2B]">Top nhân viên tích cực</h2>{topStaff.length ? <div className="mt-5 space-y-4">{topStaff.map((item) => <div key={item.staffMemberId} className="flex items-center gap-3"><Avatar name={item.fullName} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[#2B2B2B]">{item.fullName}</p><p className="text-xs font-semibold text-[#5E5A54]">{item.branchName ?? "Nhân viên"}</p></div><p className="text-sm font-black">{formatHours(item.workMinutes)}</p></div>)}</div> : <InlineEmptyState title="Chưa có xếp hạng" text="Không hiển thị nhân viên ảo khi chưa có timesheet." />}</Panel>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-[#F5F8F1] p-3 lg:p-4"><p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#5E5A54]">{label}</p><p className="mt-1.5 text-xl font-black text-[#2B2B2B]">{value}</p></div>;
}

function ReportCard({ label, value, tone }: { label: string; value: ReactNode; tone: "brand" | "warning" | "success" | "dark" }) {
  return <Panel className="p-5"><span className={cn("grid h-10 w-10 place-items-center rounded-full", tone === "brand" && "bg-[#E5EEE2] text-[#0F4D3A]", tone === "warning" && "bg-[#FFD8A8] text-[#93540A]", tone === "success" && "bg-[#A9C5A1] text-[#0F4D3A]", tone === "dark" && "bg-[#0F4D3A] text-white")}><BarChart3 size={19} /></span><p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-[#2B2B2B]">{label}</p><p className="mt-2 truncate text-2xl font-black leading-tight text-[#2B2B2B]">{value}</p></Panel>;
}

function Legend({ label, value, color }: { label: string; value: string; color: string }) {
  return <p className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />{label}</span><span className="font-black">{value}</span></p>;
}

function roleDistributionRows(members: StaffOpsMember[]) {
  const counts = new Map<string, number>();
  for (const member of members) {
    const label = member.roleTitle || roleLabel(member.roleCode);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "vi"))
    .slice(0, 3)
    .map(([label, count]) => ({ label, count, percent: members.length ? Math.round((count / members.length) * 100) : 0 }));
}

function ReportBarChart({ rows, compact }: { rows: Array<{ label: string; value: number; display: string }>; compact?: boolean }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className={cn("mt-8 space-y-4", compact && "mt-6")}> 
      {rows.map((row) => (
        <div key={row.label} className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-sm font-black text-[#2B2B2B]"><span className="truncate">{row.label}</span><span>{row.display}</span></div>
          <div className="h-4 overflow-hidden rounded-full bg-[#F5F8F1]"><div className="h-full rounded-full bg-[#0F4D3A]" style={{ width: `${Math.max(8, Math.round((row.value / max) * 100))}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function InlineEmptyState({ title, text }: { title: string; text: string }) {
  return <div className="mt-8 grid min-h-48 place-items-center rounded-xl border border-dashed border-[#D8D1C7] bg-[#FFFDF8] p-6 text-center"><div><h3 className="text-xl font-black text-[#2B2B2B]">{title}</h3><p className="mt-2 text-sm font-semibold text-[#5E5A54]">{text}</p></div></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <Panel className="grid min-h-56 place-items-center p-7 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E5EEE2] text-[#0F4D3A]"><CheckCircle2 size={28} /></span><h2 className="mt-4 text-2xl font-black text-[#2B2B2B]">{title}</h2><p className="mt-2 text-base font-medium text-[#5E5A54]">{text}</p>{action ? <div className="mt-5">{action}</div> : null}</div></Panel>;
}
