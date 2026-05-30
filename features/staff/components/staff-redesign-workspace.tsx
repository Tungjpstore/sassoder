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
  Download,
  Fingerprint,
  KeyRound,
  ListChecks,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  Settings,
  Store,
  UserRound,
  UsersRound,
  Wifi,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  assignStaffShiftAction,
  cancelStaffShiftAssignmentAction,
  createStaffAction,
  createStaffShiftTemplateAction,
  manualClockInStaffAction,
  manualClockOutStaffAction,
  reviewAttendanceApprovalAction,
  setStaffAccountStateAction,
  updateStaffProfileAction,
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
};

type StaffView = "staff" | "shifts" | "attendance" | "requests" | "permissions" | "reports" | "detail" | "add" | "success";
type PrimaryView = Exclude<StaffView, "detail" | "add" | "success">;

const navItems: Array<{ key: PrimaryView; label: string; icon: LucideIcon }> = [
  { key: "staff", label: "Nhân viên", icon: UsersRound },
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

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest || 0}p`;
  return rest ? `${hours}h ${rest}p` : `${hours}h`;
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
        size === "md" && "h-12 w-12 text-sm",
        size === "lg" && "h-24 w-24 text-2xl"
      )}
    >
      {initials(name)}
      {active !== undefined ? <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white", active ? "bg-[#0F4D3A]" : "bg-[#A6A19A]")} /> : null}
    </span>
  );
}

export function StaffRedesignWorkspace({ bundle, restaurantId, restaurantName }: StaffRedesignWorkspaceProps) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<StaffView>("staff");
  const [lastPrimaryView, setLastPrimaryView] = useState<PrimaryView>("staff");
  const [selectedMemberId, setSelectedMemberId] = useState(bundle.members[0]?.id ?? "");
  const [createdStaffUserId, setCreatedStaffUserId] = useState<string | null>(null);
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
    <main className="staff-brand-page text-[#2B2B2B]">
      <DesktopSidebar activeView={lastPrimaryView} onNavigate={openView} />
      <section className="min-h-screen lg:pl-80">
        <TopBar title={pageTitle} restaurantName={restaurantName} search={search} onSearch={setSearch} onAdd={() => openView("add")} unreadCount={bundle.unreadNotificationCount} onNotifications={markNotificationsRead} />
        <MobileHeader title={pageTitle} onAdd={() => openView("add")} unreadCount={bundle.unreadNotificationCount} onNotifications={markNotificationsRead} />
        <div className="mx-auto w-full max-w-[1280px] px-5 pb-28 pt-6 sm:px-7 lg:px-8 lg:pb-10 lg:pt-8">
          <OperationNotice message={operationMessage} />
          {activeView === "staff" ? <StaffListScreen bundle={bundle} search={search} onSearch={setSearch} onOpenMember={openMember} onAdd={() => openView("add")} onNavigate={openView} /> : null}
          {activeView === "detail" && selectedMember ? <StaffDetailScreen member={selectedMember} bundle={bundle} onBack={() => setActiveView(lastPrimaryView)} onPermissions={() => openView("permissions")} /> : null}
          {activeView === "add" ? <AddStaffScreen bundle={bundle} onCancel={() => setActiveView(lastPrimaryView)} onSuccess={(staffUserId) => { setCreatedStaffUserId(staffUserId ?? null); openView("success"); }} /> : null}
          {activeView === "success" ? <AddSuccessScreen member={createdMember ?? selectedMember ?? bundle.members[0] ?? null} onList={() => openView("staff")} onProfile={() => { const profile = createdMember ?? selectedMember; return profile ? openMember(profile.id) : openView("staff"); }} /> : null}
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
    <aside className="staff-brand-sidebar fixed inset-y-0 left-0 z-40 hidden w-80 border-r lg:flex lg:flex-col">
      <div className="px-8 pb-7 pt-8">
        <LogiVNLogo priority className="h-12 w-auto" />
        <span>
          <span className="mt-2 block text-sm font-medium tracking-[0.08em] text-[#0F4D3A]">SMART ORDERING. BETTER SERVICE.</span>
        </span>
      </div>
      <nav className="flex-1 space-y-2 px-3" aria-label="Staff workspace">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                "flex min-h-14 w-full items-center gap-4 rounded-xl px-5 text-left text-base font-bold transition",
                active ? "border-r-4 border-[#0F4D3A] bg-[#E5EEE2] text-[#2B2B2B]" : "text-[#3F3D39] hover:bg-[#F7F2EA]"
              )}
            >
              <Icon size={24} strokeWidth={2.2} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="space-y-4 px-5 pb-7">
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
    <header className="staff-brand-topbar sticky top-0 z-30 hidden h-20 items-center justify-between border-b px-8 lg:flex">
      <label className="relative block w-full max-w-[560px]">
        <span className="sr-only">Tìm kiếm</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#74716B]" size={23} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="h-12 w-full rounded-xl border border-[#CFC8BE] bg-white pl-12 pr-4 text-base font-medium outline-none transition placeholder:text-[#74716B] focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10"
          placeholder={title === "Báo cáo" ? "Tìm kiếm báo cáo..." : "Tìm kiếm nhân viên..."}
        />
      </label>
      <div className="flex items-center gap-5">
        <StaffButton onClick={onAdd} className="min-w-[190px]"><Plus size={18} /> Thêm nhân viên</StaffButton>
        <span className="h-10 w-px bg-[#D8D1C7]" />
        <IconButton label={unreadCount ? `Đánh dấu ${unreadCount} thông báo đã đọc` : "Thông báo"} onClick={onNotifications} className="border-transparent bg-transparent"><Bell size={23} />{unreadCount ? <span className="absolute mt-[-23px] ml-[18px] h-2.5 w-2.5 rounded-full bg-[#F28C28]" /> : null}</IconButton>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#0F4D3A] text-sm font-black text-white ring-2 ring-[#D8D1C7]">{restaurantName.charAt(0).toUpperCase()}</span>
      </div>
    </header>
  );
}

function MobileHeader({ title, onAdd, unreadCount, onNotifications }: { title: string; onAdd: () => void; unreadCount: number; onNotifications: () => void }) {
  return (
    <header className="staff-brand-mobile-header sticky top-0 z-30 flex h-[68px] items-center justify-between border-b px-5 lg:hidden">
      <div className="flex items-center gap-4">
        <h1 className="max-w-[180px] truncate text-3xl font-black leading-none text-[#2B2B2B] sm:max-w-none">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Thêm nhân viên" onClick={onAdd} className="border-transparent bg-transparent"><Plus size={30} /></IconButton>
        <IconButton label={unreadCount ? `Đánh dấu ${unreadCount} thông báo đã đọc` : "Thông báo"} onClick={onNotifications} className="border-transparent bg-transparent"><Bell size={28} />{unreadCount ? <span className="absolute mt-[-28px] ml-[22px] h-2.5 w-2.5 rounded-full bg-[#F28C28]" /> : null}</IconButton>
      </div>
    </header>
  );
}

function MobileBottomNav({ activeView, onNavigate }: { activeView: PrimaryView; onNavigate: (view: StaffView) => void }) {
  const items = navItems.filter((item) => item.key !== "permissions");
  return (
    <nav className="staff-brand-bottom-nav fixed inset-x-0 bottom-0 z-40 grid h-[86px] grid-cols-5 border-t px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 lg:hidden" aria-label="Staff mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.key;
        return (
          <button key={item.key} type="button" onClick={() => onNavigate(item.key)} className={cn("grid min-h-16 place-items-center rounded-xl text-xs font-semibold transition", active ? "text-[#0F4D3A]" : "text-[#3F3D39]")}>
            <Icon size={27} strokeWidth={active ? 2.6 : 2.1} aria-hidden="true" />
            <span className="mt-0.5 truncate">{item.key === "staff" ? "Nhân viên" : item.key === "shifts" ? "Ca làm" : item.key === "attendance" ? "Chấm công" : item.key === "requests" ? "Yêu cầu" : "Báo cáo"}</span>
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
        const matchesQuery = !query || normalizeText(`${member.fullName} ${member.phone ?? ""} ${member.email} ${member.roleTitle} ${member.primaryBranchName ?? ""}`).includes(query);
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

  return (
    <div className="space-y-6">
      <section className="hidden lg:block">
        <h1 className="text-[32px] font-black leading-tight text-[#2B2B2B]">Quản lý Nhân viên</h1>
        <p className="mt-1 text-lg font-medium text-[#4B4945]">Tổng quan và danh sách nhân sự trong ca làm việc hôm nay.</p>
      </section>

      <section>
        <p className="mb-3 text-sm font-black uppercase tracking-[0.08em] text-[#3F3D39] lg:hidden">Hôm nay</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <Panel key={item.label} className="flex h-[126px] items-center justify-between p-6 lg:h-32">
                <div>
                  <p className="flex items-center gap-2 text-base font-semibold text-[#3F3D39]"><span className={cn("h-2.5 w-2.5 rounded-full", item.tone === "success" ? "bg-[#0F4D3A]" : item.tone === "danger" ? "bg-[#A33D10]" : item.tone === "brand" ? "bg-[#0F4D3A]" : "bg-[#3B2500]")} />{item.label}</p>
                  <p className={cn("mt-3 text-[42px] font-black leading-none", item.tone === "danger" ? "text-[#A33D10]" : "text-[#2B2B2B]")}>{item.value}</p>
                </div>
                <span className={cn("hidden h-16 w-16 place-items-center rounded-full lg:grid", item.tone === "success" ? "bg-[#A9C5A1] text-[#0F4D3A]" : item.tone === "danger" ? "bg-[#FFE2C6] text-[#A33D10]" : item.tone === "brand" ? "bg-[#E5EEE2] text-[#0F4D3A]" : "bg-[#6B3D00] text-[#FFF7EB]")}>
                  <Icon size={28} />
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
        {filteredMembers.slice(0, 12).map((member) => (
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
      <select value={value} onChange={(event) => onChange(event.target.value)} className={cn("appearance-none rounded-xl border border-[#D8D1C7] bg-[#F9F7F3] py-0 pl-4 pr-10 text-base font-semibold text-[#2B2B2B] outline-none focus:border-[#0F4D3A]", compact ? "h-12 rounded-full" : "h-12 min-w-[158px]", compact && !fluid && "min-w-[148px]", fluid && "w-full truncate pl-3 pr-8")}> 
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
            <th className="px-7 py-4">Nhân viên</th>
            <th className="px-4 py-4">Vị trí</th>
            <th className="px-4 py-4">Ca hôm nay</th>
            <th className="px-4 py-4">Trạng thái</th>
            <th className="px-4 py-4">Chi nhánh</th>
            <th className="px-7 py-4 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D8D1C7]">
          {members.slice(0, 8).map((member) => {
            const assignment = currentAssignmentForMember(bundle.shiftAssignments, member.id);
            const attendance = bundle.attendanceFeed.find((item) => item.staffMemberId === member.id);
            const label = statusLabel(member);
            return (
              <tr key={member.id} className="bg-white transition hover:bg-[#FFF9F0]">
                <td className="px-7 py-5">
                  <button type="button" onClick={() => onOpenMember(member.id)} className="flex min-h-12 items-center gap-4 text-left">
                    <Avatar name={member.fullName} active={label === "Đang làm"} />
                    <span>
                      <span className="block text-lg font-black text-[#2B2B2B]">{member.fullName}</span>
                      <span className="block text-sm font-semibold text-[#4B4945]">EMP-{member.id.slice(0, 4).toUpperCase()}</span>
                    </span>
                  </button>
                </td>
                <td className="px-4 py-5 text-base font-medium text-[#3F3D39]">{member.roleTitle || roleLabel(member.roleCode)}</td>
                <td className="px-4 py-5 text-base font-bold text-[#2B2B2B]">{assignment ? `${assignment.shiftName.includes(":") ? "" : ""}${attendanceLabel(attendance)}` : "--:--"}</td>
                <td className="px-4 py-5"><StatusChip tone={statusTone(label)}>{label}</StatusChip></td>
                <td className="px-4 py-5 text-base font-medium text-[#3F3D39]">{member.primaryBranchName ?? "Chưa gán"}</td>
                <td className="px-7 py-5">
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
      <div className="flex items-center justify-between border-t border-[#D8D1C7] px-7 py-4 text-base font-medium text-[#3F3D39]">
        <span>Hiển thị 1-{Math.min(members.length, 8)} trên tổng số {members.length} nhân viên</span>
        <div className="flex items-center gap-4"><ChevronLeft className="text-[#B8B1A7]" /><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#0F4D3A] text-sm font-bold text-white">1</span><span>2</span><span>3</span><ChevronRight /></div>
      </div>
    </Panel>
  );
}

function StaffMobileCard({ member, bundle, onOpen, onAttendance }: { member: StaffOpsMember; bundle: StaffOperationsBundle; onOpen: () => void; onAttendance: () => void }) {
  const assignment = currentAssignmentForMember(bundle.shiftAssignments, member.id);
  const attendance = bundle.attendanceFeed.find((item) => item.staffMemberId === member.id);
  const label = statusLabel(member);
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-4 text-left">
          <Avatar name={member.fullName} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-[26px] font-black leading-tight text-[#2B2B2B]">{member.fullName}</span>
            <span className="mt-1 block truncate text-lg font-medium text-[#3F3D39]">{member.roleTitle} • {member.primaryBranchName ?? "Chưa gán"}</span>
          </span>
        </button>
        <StatusChip tone={statusTone(label)}>{label}</StatusChip>
      </div>
      <div className="mt-5 flex min-h-16 items-center gap-3 rounded-xl bg-[#F5F8F1] px-4 text-lg font-semibold text-[#2B2B2B]"><Clock3 size={22} className="text-[#77736D]" />{assignment ? `${assignment.shiftName}: ${attendanceLabel(attendance)}` : "Chưa có ca hôm nay"}</div>
      <div className="mt-5 grid grid-cols-[minmax(124px,1.15fr)_minmax(92px,1fr)] gap-2">
        <StaffButton variant={label === "Đang làm" ? "secondary" : "ghost"} onClick={onAttendance} className="min-h-[56px] whitespace-nowrap px-3 text-sm"><Fingerprint size={22} /> Chấm công</StaffButton>
        <StaffButton variant="secondary" onClick={onOpen} className="min-h-[56px] whitespace-nowrap px-3 text-sm"><UserRound size={21} /> Hồ sơ</StaffButton>
      </div>
    </Panel>
  );
}

function StaffDetailScreen({ member, bundle, onBack, onPermissions }: { member: StaffOpsMember; bundle: StaffOperationsBundle; onBack: () => void; onPermissions: () => void }) {
  const [profileState, profileAction, savingProfile] = useActionState(updateStaffProfileAction, undefined);
  const [accountState, accountAction, updatingAccount] = useActionState(setStaffAccountStateAction, undefined);
  useActionSuccessRefresh(profileState);
  useActionSuccessRefresh(accountState);
  const timesheet = bundle.timesheets.find((item) => item.staffMemberId === member.id);
  const status = statusLabel(member);
  const roles = bundle.roles.filter((role) => role.scope === "STAFF" || role.scope === "ADMIN");
  const branches = branchOptions(bundle.branches);
  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-[#2B2B2B]"><ArrowLeft size={18} /> Staff List / {member.fullName}</button>
      <Panel className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={member.fullName} active={status === "Đang làm"} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[40px] font-black leading-tight text-[#2B2B2B]">{member.fullName}</h1>
                <StatusChip tone={statusTone(status)}>{status.toUpperCase()}</StatusChip>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-4 text-lg font-medium text-[#3F3D39]"><span>EMP-{member.id.slice(0, 4).toUpperCase()}</span><span>{member.primaryBranchName ?? "Chưa gán chi nhánh"}</span></p>
            </div>
          </div>
          <StaffButton variant="secondary" onClick={onPermissions}><KeyRound size={18} /> Phân quyền</StaffButton>
        </div>
      </Panel>
      <div className="flex gap-8 border-b border-[#D8D1C7] text-base font-black"><span className="border-b-2 border-[#0F4D3A] pb-4 text-[#0F4D3A]">Thông tin</span><span className="pb-4 text-[#5E5A54]">Lịch làm việc</span><span className="pb-4 text-[#5E5A54]">Lương & Thưởng</span></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-7">
          <h2 className="flex items-center gap-3 text-[28px] font-black"><UserRound size={28} /> Liên hệ</h2>
          <div className="mt-6 border-t border-[#D8D1C7] pt-6 space-y-8">
            <InfoLine label="Số điện thoại" value={member.phone ?? "Chưa cập nhật"} />
            <InfoLine label="Email" value={member.email} />
            <InfoLine label="Liên hệ khẩn cấp" value={member.emergencyContactName ? `${member.emergencyContactName} · ${member.emergencyContactPhone ?? ""}` : "Chưa cập nhật"} />
          </div>
        </Panel>
        <Panel className="p-7">
          <h2 className="flex items-center gap-3 text-[28px] font-black"><BriefcaseBusiness size={28} /> Công việc</h2>
          <div className="mt-6 border-t border-[#D8D1C7] pt-6 space-y-8">
            <InfoLine label="Chi nhánh" value={member.primaryBranchName ?? "Chưa gán"} dot />
            <InfoLine label="Vai trò" value={member.roleTitle || roleLabel(member.roleCode)} />
            <InfoLine label="Chấm công tháng" value={timesheet ? `${timesheet.attendanceCount} ca · ${formatHours(timesheet.workMinutes)}` : "Chưa có dữ liệu"} />
          </div>
        </Panel>
      </div>
      <Panel className="p-7">
        <form action={profileAction} className="grid gap-5 md:grid-cols-2">
          <input type="hidden" name="userId" value={member.userId} />
          <Field label="Họ tên"><input name="fullName" required defaultValue={member.fullName} className="staff-redesign-input" /></Field>
          <Field label="Số điện thoại"><input name="phone" defaultValue={member.phone ?? ""} className="staff-redesign-input" /></Field>
          <Field label="Username"><input name="username" defaultValue={member.username ?? ""} className="staff-redesign-input" /></Field>
          <Field label="PIN mới"><input name="pin" inputMode="numeric" minLength={4} maxLength={8} placeholder={member.hasPin ? "Giữ trống nếu không đổi" : "4-8 số"} className="staff-redesign-input" /></Field>
          <Field label="Vai trò"><select name="roleCode" defaultValue={member.roleCode} className="staff-redesign-input">{roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}</select></Field>
          <Field label="Chi nhánh"><select name="branchId" defaultValue={member.primaryBranchId ?? ""} className="staff-redesign-input"><option value="">Chưa gán chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
          <Field label="Trạng thái"><select name="employmentStatus" defaultValue={member.employmentStatus} className="staff-redesign-input"><option value="active">Đang làm</option><option value="suspended">Tạm khóa</option><option value="resigned">Nghỉ việc</option></select></Field>
          <Field label="Liên hệ khẩn cấp"><input name="emergencyContactName" defaultValue={member.emergencyContactName ?? ""} className="staff-redesign-input" /></Field>
          <Field label="SĐT khẩn cấp"><input name="emergencyContactPhone" defaultValue={member.emergencyContactPhone ?? ""} className="staff-redesign-input" /></Field>
          <Field label="Ghi chú" className="md:col-span-2"><input name="notes" defaultValue={member.notes ?? ""} className="staff-redesign-input" /></Field>
          <div className="md:col-span-2"><ActionMessage state={profileState} /></div>
          <div className="flex justify-end md:col-span-2"><StaffButton type="submit" disabled={savingProfile}><Check size={18} /> {savingProfile ? "Đang lưu..." : "Lưu hồ sơ thật"}</StaffButton></div>
        </form>
      </Panel>
      <Panel className="p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#2B2B2B]">Kiểm soát tài khoản</h2>
            <p className="mt-1 text-sm font-semibold text-[#5E5A54]">Các thao tác này ghi audit log và cập nhật trạng thái đăng nhập của nhân sự.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={accountAction}>
              <input type="hidden" name="userId" value={member.userId} />
              <input type="hidden" name="nextState" value={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "active" : "suspended"} />
              <input type="hidden" name="reason" value={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "Khôi phục từ hồ sơ nhân sự" : "Tạm khóa từ hồ sơ nhân sự"} />
              <StaffButton type="submit" disabled={updatingAccount} variant={member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "secondary" : "danger"}><LockKeyhole size={18} /> {member.accountStatus === "blocked" || member.employmentStatus === "suspended" ? "Mở khóa" : "Khóa tài khoản"}</StaffButton>
            </form>
            <form action={accountAction}>
              <input type="hidden" name="userId" value={member.userId} />
              <input type="hidden" name="nextState" value="archived" />
              <input type="hidden" name="reason" value="Lưu trữ từ hồ sơ nhân sự" />
              <StaffButton type="submit" disabled={updatingAccount} variant="secondary"><X size={18} /> Lưu trữ</StaffButton>
            </form>
          </div>
        </div>
        <div className="mt-4"><ActionMessage state={accountState} /></div>
      </Panel>
    </div>
  );
}

function InfoLine({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return <div><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">{label}</p><p className="mt-2 flex items-center gap-2 text-xl font-medium text-[#2B2B2B]">{dot ? <span className="h-2.5 w-2.5 rounded-full bg-[#0F4D3A]" /> : null}{value}</p></div>;
}

function AddStaffScreen({ bundle, onCancel, onSuccess }: { bundle: StaffOperationsBundle; onCancel: () => void; onSuccess: (staffUserId?: string) => void }) {
  const [state, action, pending] = useActionState(createStaffAction, undefined);
  useActionSuccessRefresh(state, (nextState) => onSuccess(nextState.staffUserId));
  const roles = bundle.roles.filter((role) => role.scope === "STAFF" || ["manager", "cashier", "waiter", "kitchen", "delivery"].includes(String(role.code)));
  const branches = branchOptions(bundle.branches);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-base font-bold text-[#3F3D39]">Staff › Add New</p>
        <h1 className="mt-8 text-[44px] font-black leading-tight text-[#2B2B2B]">Thêm nhân viên mới</h1>
        <p className="mt-3 text-xl font-medium text-[#3F3D39]">Điền thông tin cơ bản để tạo hồ sơ nhân viên vào hệ thống LogiVN.</p>
      </div>
      <form action={action} className="space-y-6">
        <Panel className="p-6 sm:p-8">
          <h2 className="text-[28px] font-black text-[#2B2B2B]">Thông tin cá nhân</h2>
          <div className="mt-4 border-t border-[#D8D1C7] pt-6 grid gap-6 sm:grid-cols-2">
            <Field label="Họ và tên *"><input required name="fullName" placeholder="VD: Nguyễn Văn A" className="staff-redesign-input" /></Field>
            <Field label="Số điện thoại *"><input required name="phone" placeholder="09xx xxx xxx" className="staff-redesign-input" /></Field>
            <Field label="Email (Tùy chọn)" className="sm:col-span-2"><input name="email" type="email" placeholder="nguyenvana@example.com" className="staff-redesign-input" /></Field>
            <Field label="Mã PIN chấm công"><input name="pin" inputMode="numeric" minLength={4} maxLength={6} placeholder="4-6 số" className="staff-redesign-input" /></Field>
            <Field label="Ghi chú"><input name="notes" placeholder="Ví dụ: part-time cuối tuần" className="staff-redesign-input" /></Field>
          </div>
          <h2 className="mt-10 text-[28px] font-black text-[#2B2B2B]">Thông tin công việc</h2>
          <div className="mt-4 border-t border-[#D8D1C7] pt-6 grid gap-6 sm:grid-cols-2">
            <Field label="Vị trí *"><select required name="roleCode" className="staff-redesign-input">{roles.map((role) => <option key={role.id} value={role.code}>{role.title}</option>)}</select></Field>
            <Field label="Chi nhánh"><select name="branchId" className="staff-redesign-input"><option value="">Chưa gán chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
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

function AddSuccessScreen({ member, onList, onProfile }: { member: StaffOpsMember | null; onList: () => void; onProfile: () => void }) {
  return (
    <div className="grid min-h-[calc(100vh-9rem)] place-items-center py-10">
      <div className="w-full max-w-[560px] text-center">
        <span className="mx-auto grid h-28 w-28 place-items-center rounded-full border-4 border-[#A9C5A1] bg-[#DDF8E9] text-[#0F4D3A]"><CheckCircle2 size={62} /></span>
        <h1 className="mt-8 text-[40px] font-black leading-tight text-[#2B2B2B]">Thêm nhân viên thành công!</h1>
        <p className="mx-auto mt-3 max-w-md text-lg font-medium text-[#3F3D39]">Hồ sơ nhân viên mới đã được tạo và lưu trữ an toàn trong hệ thống.</p>
        <Panel className="mx-auto mt-8 p-7 text-left">
          <div className="flex items-center gap-5"><Avatar name={member?.fullName ?? "Hồ sơ mới"} /><div><p className="text-[28px] font-black">{member?.fullName ?? "Hồ sơ vừa tạo"}</p><StatusChip tone="success">Đã lưu</StatusChip></div></div>
          <div className="mt-6 grid grid-cols-2 gap-5 border-t border-[#D8D1C7] pt-5"><InfoLine label="Vai trò" value={member?.roleTitle ?? "Cập nhật sau khi tải lại"} /><InfoLine label="Chi nhánh" value={member?.primaryBranchName ?? "Chưa gán"} /></div>
        </Panel>
        <div className="mt-8 grid grid-cols-2 gap-5"><StaffButton variant="secondary" onClick={onList} className="min-h-16"><ArrowLeft size={20} /> Về danh sách</StaffButton><StaffButton onClick={onProfile} className="min-h-16">Xem hồ sơ <ChevronRight size={20} /></StaffButton></div>
      </div>
    </div>
  );
}

function ShiftScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [assignmentState, assignmentAction, assigning] = useActionState(assignStaffShiftAction, undefined);
  const [templateState, templateAction, creatingTemplate] = useActionState(createStaffShiftTemplateAction, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  useActionSuccessRefresh(assignmentState);
  useActionSuccessRefresh(templateState);
  useActionSuccessRefresh(cancelState);
  const week = getWeekRange();
  const branches = branchOptions(bundle.branches);
  const openShifts = bundle.shifts.slice(0, 4);
  return (
    <>
      <div className="lg:hidden">
        <MobileShiftManagementScreen bundle={bundle} />
      </div>
      <div className="hidden space-y-5 lg:block">
      <section className="flex flex-col justify-between gap-4 border-b border-[#D8D1C7] pb-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-7"><h1 className="text-[40px] font-black text-[#2B2B2B]">Schedule</h1><div className="flex h-14 items-center gap-4 rounded-xl border border-[#D8D1C7] bg-white px-4 text-base font-bold"><ChevronLeft size={20} /> Tuần này <ChevronRight size={20} /></div></div>
        <div className="flex gap-3"><span className="inline-flex h-11 items-center rounded-xl border border-[#D8D1C7] bg-white px-5 text-sm font-black text-[#2B2B2B]">Tuần này</span><StaffButton onClick={() => document.getElementById("staff-shift-template-form")?.scrollIntoView({ block: "center", behavior: "smooth" })}><Plus size={18} /> Tạo ca</StaffButton></div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <div className="grid min-w-[920px] grid-cols-[250px_repeat(7,1fr)] border-b border-[#D8D1C7] text-center">
            <div className="flex items-center px-5 text-sm font-black uppercase tracking-[0.12em] text-[#3F3D39]">Staff</div>
            {week.map((day, index) => <div key={day.iso} className={cn("border-l border-[#D8D1C7] p-3", index === 2 && "border-t-4 border-t-[#0F4D3A] bg-[#E5EEE2]")}><p className="text-sm font-bold">{day.weekday}</p><p className="text-2xl font-black">{day.day}</p></div>)}
          </div>
          <div className="overflow-x-auto">
            {bundle.members.slice(0, 5).map((member) => (
              <div key={member.id} className="grid min-w-[920px] grid-cols-[250px_repeat(7,1fr)] border-b border-[#D8D1C7]">
                <div className="flex items-center gap-4 px-5 py-4"><Avatar name={member.fullName} /><span><span className="block font-black">{member.fullName}</span><span className="text-sm font-medium text-[#3F3D39]">{member.roleTitle}</span></span></div>
                {week.map((day, dayIndex) => {
                  const assignment = bundle.shiftAssignments.find((item) => item.staffMemberId === member.id && item.scheduledDate === day.iso);
                  return <div key={day.iso} className="min-h-24 border-l border-[#D8D1C7] p-2">{assignment ? <div className={cn("rounded-lg border p-3 text-sm font-bold", dayIndex % 3 === 0 ? "border-[#0F4D3A]/25 bg-[#DDF8E9] text-[#0F4D3A]" : dayIndex % 3 === 1 ? "border-[#0F4D3A]/20 bg-[#0F4D3A] text-white" : "border-[#F28C28]/25 bg-[#FFF0D9] text-[#93540A]")}><div className="flex items-start justify-between gap-2"><p>{assignment.shiftName}</p><form action={cancelAction}><input type="hidden" name="shiftAssignmentId" value={assignment.id} /><input type="hidden" name="note" value="Huỷ từ lịch Staff" /><button type="submit" disabled={cancelling} className="grid h-7 w-7 place-items-center rounded-lg bg-white/70 text-[#A33D10]" aria-label="Huỷ ca"><X size={14} /></button></form></div><p className="mt-3 text-xs opacity-75">{assignment.branchName ?? "Chưa gán chi nhánh"}</p></div> : <div className="grid h-full min-h-20 place-items-center rounded-lg border border-dashed border-[#D8D1C7] text-xl font-light text-[#6F6A62]">{dayIndex === 2 ? "+" : "Off"}</div>}</div>;
                })}
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#D8D1C7] p-5"><h2 className="text-2xl font-black">Open Shifts</h2><span className="grid h-8 w-8 place-items-center rounded-full bg-[#EEEAE3] text-sm font-black">{openShifts.length}</span></div>
          <div className="space-y-3 p-5">
            <p className="text-base font-medium text-[#3F3D39]">Drag and drop để gán ca, hoặc chọn nhanh bên dưới.</p>
            {openShifts.map((shift) => <div key={shift.id} className="rounded-xl border border-[#D8D1C7] bg-white p-4"><p className="font-black">{shift.name}</p><p className="mt-2 flex items-center gap-2 font-medium"><Clock3 size={17} />{shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}</p></div>)}
          </div>
          <form action={assignmentAction} className="mt-auto space-y-3 border-t border-[#D8D1C7] p-5">
            <ActionMessage state={assignmentState} />
            <select name="staffMemberId" className="staff-redesign-input">{bundle.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
            <select name="shiftId" className="staff-redesign-input">{bundle.shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select>
            <input name="scheduledDate" type="date" defaultValue={today} className="staff-redesign-input" />
            <button type="submit" disabled={assigning} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#A6A19A] bg-white text-sm font-black text-[#2B2B2B]"><Plus size={17} /> {assigning ? "Đang gán..." : "Gán ca"}</button>
          </form>
        </Panel>
      </div>
      <Panel className="p-5">
        <form id="staff-shift-template-form" action={templateAction} className="grid gap-4 md:grid-cols-6">
          <input name="name" placeholder="Tên ca mới" className="staff-redesign-input md:col-span-2" />
          <select name="branchId" className="staff-redesign-input md:col-span-2"><option value="">Toàn quán</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <input name="startTime" type="time" defaultValue="08:00" className="staff-redesign-input" />
          <input name="endTime" type="time" defaultValue="16:00" className="staff-redesign-input" />
          <input type="hidden" name="recurringWeekdays" value="1,2,3,4,5" />
          <button type="submit" disabled={creatingTemplate} className="md:col-span-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white">{creatingTemplate ? "Đang tạo..." : "Tạo mẫu ca"}</button>
        </form>
        <div className="mt-3"><ActionMessage state={templateState} /><ActionMessage state={cancelState} /></div>
      </Panel>
      </div>
    </>
  );
}

function AttendanceScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [clockInState, clockInAction, clockingIn] = useActionState(manualClockInStaffAction, undefined);
  const [clockOutState, clockOutAction, clockingOut] = useActionState(manualClockOutStaffAction, undefined);
  useActionSuccessRefresh(clockInState);
  useActionSuccessRefresh(clockOutState);
  const [qrState, setQrState] = useState<StaffAttendanceQrTokenResult | null>(null);
  const [wifiState, setWifiState] = useState<StaffAttendanceWifiNetworkResult | null>(null);
  const [utilityError, setUtilityError] = useState("");
  const [dateFilter, setDateFilter] = useState(today);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const branches = branchOptions(bundle.branches);
  const activeBranch = branches[0];
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
          clockingIn={clockingIn}
          generateQr={generateQr}
          registerWifi={registerWifi}
          utilityState={{ qrState, wifiState, utilityError }}
        />
      </div>
      <div className="hidden space-y-6 lg:block">
      <section><h1 className="text-[32px] font-black text-[#2B2B2B]">Quản lý Chấm công</h1><p className="mt-1 text-lg font-medium text-[#3F3D39]">Theo dõi dữ liệu vào/ra và xử lý chấm công hộ khi cần.</p></section>
      <div className="grid gap-5 xl:grid-cols-[1fr_386px]">
        <Panel className="p-6"><h2 className="text-2xl font-black">Bộ lọc dữ liệu</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><Field label="Ngày"><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="staff-redesign-input" /></Field><Field label="Chi nhánh"><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="staff-redesign-input"><option value="all">Tất cả chi nhánh</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><Field label="Trạng thái"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="staff-redesign-input"><option value="all">Tất cả trạng thái</option><option value="on_time">Đúng giờ</option><option value="late">Đi trễ</option><option value="absent">Vắng mặt</option><option value="overtime">Tăng ca</option></select></Field></div></Panel>
        <Panel className="p-6"><h2 className="text-2xl font-black">Tỷ lệ đúng giờ</h2><p className="mt-2 text-sm font-medium text-[#3F3D39]">Ngày {formatDate(today)}</p><div className="mt-4 flex items-center gap-7"><div className="grid h-28 w-28 place-items-center rounded-full border-[14px] border-[#0F4D3A] border-l-[#A33D10]"><span className="text-2xl font-black">{onTimeRate}%</span></div><div className="space-y-3 text-base font-medium"><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#0F4D3A]" />Đúng giờ</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-[#A33D10]" />Đi trễ/Vắng</p></div></div></Panel>
      </div>
      <Panel className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <div><h2 className="text-xl font-black">QR hằng ngày</h2><p className="mt-1 text-sm font-medium text-[#5E5A54]">Mỗi chi nhánh dùng một mã theo ngày để giảm gian lận.</p><StaffButton onClick={generateQr} className="mt-4 w-full"><Fingerprint size={18} /> Tạo QR hôm nay</StaffButton></div>
          <div><h2 className="text-xl font-black">WiFi quán</h2><p className="mt-1 text-sm font-medium text-[#5E5A54]">Ghi nhận IP mạng hiện tại làm lớp xác thực phụ.</p><StaffButton variant="secondary" onClick={registerWifi} className="mt-4 w-full"><Wifi size={18} /> Lưu WiFi hiện tại</StaffButton></div>
          <div className="rounded-xl bg-[#F5F8F1] p-4 text-sm font-semibold text-[#3F3D39]">{qrState ? <div className="flex items-center gap-4"><Image src={qrState.qrImageUrl} alt={`QR chấm công ${qrState.branchName}`} width={112} height={112} unoptimized className="h-28 w-28 rounded-xl border border-[#D8D1C7] bg-white object-contain" /><p>QR: {qrState.branchName}<br />Hết hạn {formatDateTime(qrState.expiresAt)}</p></div> : null}{wifiState ? <p className="mt-2">WiFi: {wifiState.publicIpCidr}</p> : null}{utilityError ? <p className="text-[#A33D10]">{utilityError}</p> : !qrState && !wifiState ? "Chọn thao tác để tạo mã kiểm soát chấm công." : null}</div>
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#D8D1C7] p-6"><h2 className="text-2xl font-black">Danh sách bản ghi</h2><a href={STAFF_ACTIVITY_EXPORT_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-[#4B4945] hover:bg-[#F5F1E9]"><Download size={17} /> Xuất CSV</a></div>
        <div className="hidden lg:block"><AttendanceTable feed={filteredFeed} members={bundle.members} clockOutAction={clockOutAction} clockingOut={clockingOut} /></div>
        <div className="space-y-4 p-4 lg:hidden">{filteredFeed.slice(0, 8).map((item) => <AttendanceCard key={item.id} item={item} />)}</div>
        <div className="border-t border-[#D8D1C7] p-5"><form action={clockInAction} className="grid gap-3 md:grid-cols-5"><select name="staffMemberId" className="staff-redesign-input md:col-span-2">{bundle.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select><select name="branchId" className="staff-redesign-input md:col-span-2"><option value="">Chi nhánh theo hồ sơ</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button type="submit" disabled={clockingIn || !bundle.members.length} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white">{clockingIn ? "Đang chấm..." : "Chấm công hộ"}</button></form><div className="mt-3"><ActionMessage state={clockInState} /><ActionMessage state={clockOutState} /></div></div>
      </Panel>
      </div>
    </>
  );
}

function AttendanceTable({ feed, members, clockOutAction, clockingOut }: { feed: StaffOpsAttendanceFeedItem[]; members: StaffOpsMember[]; clockOutAction: (payload: FormData) => void; clockingOut: boolean }) {
  return <table className="w-full text-left"><thead className="border-b border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em]"><tr><th className="px-7 py-4">Nhân viên</th><th className="px-4 py-4">Ca làm</th><th className="px-4 py-4">Giờ vào</th><th className="px-4 py-4">Giờ ra</th><th className="px-4 py-4">Trạng thái</th><th className="px-7 py-4 text-right">Hành động</th></tr></thead><tbody className="divide-y divide-[#D8D1C7]">{feed.slice(0, 8).map((item) => { const member = members.find((candidate) => candidate.id === item.staffMemberId); return <tr key={item.id}><td className="px-7 py-5"><div className="flex items-center gap-3"><Avatar name={item.fullName} size="sm" /><span><span className="block font-black">{item.fullName}</span><span className="text-sm font-medium text-[#3F3D39]">{member?.roleTitle ?? item.branchName ?? "Nhân viên"}</span></span></div></td><td className="px-4 py-5 font-medium">Ca làm</td><td className={cn("px-4 py-5 font-bold", item.state === "late" && "text-[#A33D10]")}>{shortTime(item.clockInAt)}</td><td className="px-4 py-5 font-bold">{item.clockOutAt ? shortTime(item.clockOutAt) : "--:--"}</td><td className="px-4 py-5"><StatusChip tone={item.state === "late" ? "danger" : item.state === "on_time" ? "success" : "neutral"}>{item.state === "late" ? "Đi trễ" : item.state === "on_time" ? "Đúng giờ" : item.state === "overtime" ? "Tăng ca" : item.state === "absent" ? "Vắng mặt" : "Chưa bắt đầu"}</StatusChip></td><td className="px-7 py-5 text-right">{!item.clockOutAt ? <form action={clockOutAction} className="inline-flex"><input type="hidden" name="attendanceLogId" value={item.id} /><input type="hidden" name="staffMemberId" value={item.staffMemberId} /><input type="hidden" name="branchId" value="" /><button disabled={clockingOut} className="grid h-11 w-11 place-items-center rounded-xl border border-[#D8D1C7]"><Check size={18} /></button></form> : <StatusChip tone="success">Đã kết ca</StatusChip>}</td></tr>; })}</tbody></table>;
}

function AttendanceCard({ item }: { item: StaffOpsAttendanceFeedItem }) {
  return <Panel className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Avatar name={item.fullName} /><div><p className="text-xl font-black">{item.fullName}</p><p className="text-sm font-semibold text-[#3F3D39]">{item.branchName ?? "Chi nhánh"}</p></div></div><StatusChip tone={item.state === "late" ? "danger" : "success"}>{item.state === "late" ? "Đi muộn" : "Đúng giờ"}</StatusChip></div><div className="mt-4 grid grid-cols-2 divide-x divide-[#D8D1C7] rounded-xl bg-[#F5F8F1] p-4 text-lg font-black"><span>{shortTime(item.clockInAt)}</span><span className="pl-4">{item.clockOutAt ? shortTime(item.clockOutAt) : "--:--"}</span></div></Panel>;
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
        {requests.slice(0, 8).map((request) => <RequestCard key={request.id} request={request} action={reviewAction} reviewing={reviewing} />)}
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
      <section><p className="text-base font-bold text-[#3F3D39]">Staff List / Permissions</p><h1 className="mt-3 text-[40px] font-black text-[#2B2B2B]">Phân quyền nhân viên</h1><p className="mt-1 flex items-center gap-2 text-lg font-medium text-[#3F3D39]"><UserRound size={20} /> {selectedMember?.fullName ?? "Chọn nhân viên"}</p></section>
      <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <input type="hidden" name="roleId" value={role?.id ?? ""} />
        <div className="space-y-6">
          <Panel className="p-6"><h2 className="text-2xl font-black">Nhóm quyền cơ bản</h2><p className="mt-1 text-base font-medium text-[#5E5A54]">Chọn một vai trò chính để thiết lập nhanh các quyền hạn tiêu chuẩn.</p><div className="mt-5 grid gap-4 md:grid-cols-3">{bundle.roles.slice(0, 6).map((item) => <button key={item.id} type="button" onClick={() => { setRoleId(item.id); setSelectedPermissions(item.permissions); }} className={cn("min-h-32 rounded-xl border-2 p-4 text-left transition", roleId === item.id ? "border-[#0F4D3A] bg-[#E5EEE2]" : "border-[#D8D1C7] bg-[#F8F5EF]")}><span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#0F4D3A]"><KeyRound size={20} /></span><span className="mt-4 block text-lg font-black">{item.title}</span><span className="mt-1 block text-sm font-medium text-[#5E5A54]">{item.permissionCount} quyền</span></button>)}</div></Panel>
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
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-[42px] font-black text-[#2B2B2B]">Báo cáo hiệu suất</h1><p className="mt-2 text-xl font-medium text-[#3F3D39]">Dữ liệu thật từ nhân sự, chấm công, ca làm và timesheet hiện có.</p></div><div className="flex gap-3"><span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-bold text-[#2B2B2B]"><CalendarClock size={18} /> Tháng này</span><a href={STAFF_TIMESHEET_EXPORT_URL} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-bold text-[#2B2B2B] hover:border-[#0F4D3A]/35"><Download size={18} /> Xuất CSV</a></div></section>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"><ReportCard label="Nhân sự" value={totalStaff} tone="brand" /><ReportCard label="Giờ công" value={formatHours(totalHours)} tone="warning" /><ReportCard label="Điểm công" value={`${avgAttendance}%`} tone="success" /><ReportCard label="Chi nhánh nổi bật" value={topBranch?.name ?? "Chưa có"} tone="dark" /></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_386px]"><Panel className="p-7"><h2 className="text-2xl font-black">Giờ công theo nhân viên</h2>{timesheetRows.length ? <ReportBarChart rows={timesheetRows.map((item) => ({ label: item.fullName, value: item.workMinutes, display: formatHours(item.workMinutes) }))} /> : <InlineEmptyState title="Chưa có dữ liệu giờ công" text="Khi nhân viên chấm công hoặc chốt ca, biểu đồ sẽ tự cập nhật từ timesheet thật." />}</Panel><Panel className="p-7"><h2 className="text-2xl font-black">Cơ cấu vai trò</h2><div className="mx-auto mt-8 grid h-56 w-56 place-items-center rounded-full border-[20px] border-[#0F4D3A] border-l-[#A9C5A1] border-t-[#F28C28]"><span className="text-center"><span className="block text-3xl font-black">{totalStaff}</span><span className="text-sm font-medium">nhân sự thật</span></span></div><div className="mt-8 space-y-4 text-lg font-medium">{roleRows.length ? roleRows.map((row, index) => <Legend key={row.label} label={row.label} value={`${row.percent}%`} color={index === 0 ? "#0F4D3A" : index === 1 ? "#F28C28" : "#A9C5A1"} />) : <p className="text-base font-semibold text-[#5E5A54]">Chưa có nhân sự để phân bổ vai trò.</p>}</div></Panel></div>
      <Panel className="overflow-hidden"><div className="p-7"><h2 className="text-2xl font-black">Hiệu suất chi nhánh</h2></div><table className="hidden w-full text-left lg:table"><thead className="border-y border-[#D8D1C7] bg-[#FCFAF6] text-xs font-black uppercase tracking-[0.13em]"><tr><th className="px-7 py-4">Chi nhánh</th><th className="px-4 py-4">Nhân sự active</th><th className="px-4 py-4">Chi phí công</th><th className="px-4 py-4">Điểm phủ ca</th><th className="px-7 py-4">Trạng thái</th></tr></thead><tbody>{bundle.branches.map((branch) => <tr key={branch.id} className="border-b border-[#D8D1C7]"><td className="px-7 py-5 font-black">{branch.name}</td><td className="px-4 py-5">{branch.activeStaff}</td><td className="px-4 py-5">Chưa cấu hình</td><td className="px-4 py-5"><span className="inline-block h-2 rounded-full bg-[#0F4D3A]" style={{ width: `${Math.max(10, Math.min(112, branch.coverageScore * 1.12))}px` }} /> {branch.coverageScore}/100</td><td className="px-7 py-5"><StatusChip tone={branch.coverageScore >= 80 ? "success" : branch.coverageScore >= 55 ? "neutral" : "danger"}>{branch.coverageScore >= 80 ? "Ổn định" : branch.coverageScore >= 55 ? "Cần theo dõi" : "Thiếu phủ ca"}</StatusChip></td></tr>)}</tbody></table></Panel>
      </div>
    </>
  );
}

function MobileShiftManagementScreen({ bundle }: { bundle: StaffOperationsBundle }) {
  const [cancelState, cancelAction, cancelling] = useActionState(cancelStaffShiftAssignmentAction, undefined);
  useActionSuccessRefresh(cancelState);
  const week = getWeekRange().slice(0, 5);
  const branchName = bundle.branches[0]?.name ?? "Chưa có chi nhánh";
  const morning = bundle.shiftAssignments.filter((assignment) => /sáng|morning|07|08/i.test(assignment.shiftName)).slice(0, 2);
  const afternoon = bundle.shiftAssignments.filter((assignment) => !morning.some((item) => item.id === assignment.id)).slice(0, 2);
  const hasAssignments = morning.length > 0 || afternoon.length > 0;

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
      {hasAssignments ? (
        <>
          <MobileShiftSection title="Ca sáng (06:00 - 14:00)" assignments={morning} cancelAction={cancelAction} cancelling={cancelling} />
          <MobileShiftSection title="Ca chiều (14:00 - 22:00)" assignments={afternoon} cancelAction={cancelAction} cancelling={cancelling} />
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
  clockingIn,
  generateQr,
  registerWifi,
  utilityState
}: {
  bundle: StaffOperationsBundle;
  clockInAction: (payload: FormData) => void;
  clockingIn: boolean;
  generateQr: () => Promise<void>;
  registerWifi: () => Promise<void>;
  utilityState: { qrState: StaffAttendanceQrTokenResult | null; wifiState: StaffAttendanceWifiNetworkResult | null; utilityError: string };
}) {
  const todayFeed = bundle.attendanceFeed.filter((item) => item.clockInAt?.slice(0, 10) === today).slice(0, 4);
  const onTime = todayFeed.filter((item) => item.state === "on_time" || item.state === "overtime").length;
  const late = todayFeed.filter((item) => item.state === "late" || item.state === "absent").length;

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-[38px] font-black leading-tight text-[#2B2B2B]">Chấm công hôm nay</h1>
        <p className="mt-2 text-xl font-medium text-[#3F3D39]">{formatDate(today)}</p>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <Panel className="p-6"><p className="flex items-center gap-2 text-lg font-black text-[#0F4D3A]"><CheckCircle2 size={24} /> Đúng giờ</p><p className="mt-6 text-[42px] font-black">{onTime}</p></Panel>
        <Panel className="p-6"><p className="flex items-center gap-2 text-lg font-black text-[#A33D10]"><Clock3 size={24} /> Đi muộn</p><p className="mt-6 text-[42px] font-black">{late}</p></Panel>
      </div>
      <div className="space-y-4">
        {todayFeed.map((item) => {
          const assignment = currentAssignmentForMember(bundle.shiftAssignments, item.staffMemberId);
          return (
          <Panel key={item.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4"><Avatar name={item.fullName} /><div><p className="text-[28px] font-black leading-tight text-[#2B2B2B]">{item.fullName}</p><p className="text-xl font-medium text-[#3F3D39]">{assignment?.shiftName ?? "Chưa gán ca"}</p></div></div>
              <StatusChip tone={item.state === "late" ? "danger" : item.state === "absent" ? "neutral" : "success"}>{item.state === "late" ? "Đi muộn" : item.state === "absent" ? "Vắng mặt" : "Đúng giờ"}</StatusChip>
            </div>
            {item.state !== "absent" ? <div className="mt-5 grid grid-cols-2 divide-x divide-[#D8D1C7] rounded-xl bg-[#F5F8F1] p-4 text-xl font-black"><span className={item.state === "late" ? "text-[#A33D10]" : "text-[#0F4D3A]"}>{shortTime(item.clockInAt)}</span><span className="pl-4 text-[#77736D]">{shortTime(item.clockOutAt)}</span></div> : null}
            <p className="mt-4 flex items-center gap-2 text-lg font-medium text-[#3F3D39]"><MapPin size={19} /> {item.branchName ?? "Chưa gán chi nhánh"}</p>
          </Panel>
        );})}
        {!todayFeed.length ? <EmptyState title="Chưa có log chấm công hôm nay" text="Khi nhân viên check-in bằng GPS, QR hoặc WiFi, dữ liệu thật sẽ xuất hiện tại đây." /> : null}
      </div>
      <Panel className="p-5">
        <h2 className="text-2xl font-black text-[#2B2B2B]">Chấm công hộ</h2>
        <form action={clockInAction} className="mt-4 grid gap-3">
          <select name="staffMemberId" className="staff-redesign-input">{bundle.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
          <select name="branchId" className="staff-redesign-input"><option value="">Chi nhánh theo hồ sơ</option>{branchOptions(bundle.branches).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <button type="submit" disabled={clockingIn} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0F4D3A] text-sm font-black text-white">{clockingIn ? "Đang xử lý..." : "Chấm công hộ"}</button>
        </form>
        <div className="mt-4 grid grid-cols-2 gap-3"><StaffButton onClick={generateQr}><Fingerprint size={17} /> QR ngày</StaffButton><StaffButton variant="secondary" onClick={registerWifi}><Wifi size={17} /> WiFi</StaffButton></div>
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
    <div className="space-y-7">
      <section><h1 className="text-[40px] font-black leading-tight text-[#2B2B2B]">Báo cáo</h1><p className="mt-2 text-xl font-medium text-[#3F3D39]">Tổng quan hiệu suất hoạt động</p></section>
      <div className="grid grid-cols-3 rounded-2xl bg-[#F5F8F1] p-1 text-center text-lg font-black text-[#4B4945]"><button className="min-h-14 rounded-xl">Hôm nay</button><button className="min-h-14 rounded-xl bg-white text-[#2B2B2B] shadow-[0_2px_8px_rgba(43,43,43,0.06)]">Tuần này</button><button className="min-h-14 rounded-xl">Tháng này</button></div>
      <div className="grid grid-cols-2 gap-4"><Panel className="p-6"><p className="flex items-center gap-2 text-xl font-bold text-[#3F3D39]"><BriefcaseBusiness size={23} /> Nhân sự</p><p className="mt-6 text-[38px] font-black text-[#2B2B2B]">{totalStaff}</p><p className="mt-2 text-sm font-bold text-[#5E5A54]">Từ hồ sơ thật</p></Panel><Panel className="p-6"><p className="flex items-center gap-2 text-xl font-bold text-[#3F3D39]"><Clock3 size={23} /> Giờ công</p><p className="mt-6 text-[38px] font-black text-[#2B2B2B]">{formatHours(totalHours)}</p><p className="mt-2 text-sm font-bold text-[#5E5A54]">Điểm công {avgAttendance}%</p></Panel></div>
      <Panel className="p-7"><h2 className="text-[30px] font-black text-[#2B2B2B]">Giờ công theo nhân viên</h2>{reportBars.length ? <ReportBarChart rows={reportBars} compact /> : <InlineEmptyState title="Chưa có giờ công" text="Báo cáo sẽ cập nhật khi có dữ liệu chấm công thật." />}</Panel>
      <Panel className="p-7"><h2 className="text-[30px] font-black text-[#2B2B2B]">Top nhân viên tích cực</h2>{topStaff.length ? <div className="mt-6 space-y-5">{topStaff.map((item) => <div key={item.staffMemberId} className="flex items-center gap-4"><Avatar name={item.fullName} /><div className="min-w-0 flex-1"><p className="truncate text-xl font-black text-[#2B2B2B]">{item.fullName}</p><p className="text-lg font-medium text-[#5E5A54]">{item.branchName ?? "Nhân viên"}</p></div><p className="text-xl font-black">{formatHours(item.workMinutes)}</p></div>)}</div> : <InlineEmptyState title="Chưa có xếp hạng" text="Không hiển thị nhân viên ảo khi chưa có timesheet." />}</Panel>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl bg-[#F5F8F1] p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-[#5E5A54]">{label}</p><p className="mt-2 text-2xl font-black text-[#2B2B2B]">{value}</p></div>;
}

function ReportCard({ label, value, tone }: { label: string; value: ReactNode; tone: "brand" | "warning" | "success" | "dark" }) {
  return <Panel className="p-7"><span className={cn("grid h-12 w-12 place-items-center rounded-full", tone === "brand" && "bg-[#E5EEE2] text-[#0F4D3A]", tone === "warning" && "bg-[#FFD8A8] text-[#93540A]", tone === "success" && "bg-[#A9C5A1] text-[#0F4D3A]", tone === "dark" && "bg-[#0F4D3A] text-white")}><BarChart3 size={22} /></span><p className="mt-6 text-sm font-black uppercase tracking-[0.08em] text-[#2B2B2B]">{label}</p><p className="mt-3 truncate text-[30px] font-black leading-tight text-[#2B2B2B]">{value}</p></Panel>;
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
