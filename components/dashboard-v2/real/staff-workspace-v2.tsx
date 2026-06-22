"use client";

/* RealStaffWorkspaceV2 — production /dashboard/staff.
 * Layout v2 đầy đủ tính năng vận hành PWA staff:
 *  - Quản lý nhân viên: tạo, sửa, vô hiệu hoá, đổi role
 *  - Mã NV (PWA login): cấp lại mật khẩu app + force logout phiên thiết bị
 *  - Phân quyền: PERMISSION_PROFILE
 *  - Chấm công hộ: clock-in / clock-out manual
 *  - Duyệt yêu cầu chấm công: approve / reject
 *  - Realtime mobile + dashboard
 *  - Drawer "Quản lý nâng cao" mở legacy StaffRedesignWorkspace cho contracts/devices/reviews/shift templates
 */

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  FolderOpen,
  KeyRound,
  LogIn,
  LogOut,
  Phone,
  Plus,
  Settings2,
  ShieldCheck,
  Star,
  UserCog,
  Users,
  XCircle
} from "lucide-react";
import { FilterTabs, Toolbar, DataTable, type Column } from "../workspace-ui";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { RealtimeStatusBadge } from "../realtime";
import {
  createStaffAction,
  manualClockInStaffAction,
  manualClockOutStaffAction,
  resetStaffAppPasswordAction,
  reviewAttendanceApprovalAction,
  setStaffAccountStateAction,
  updateOwnerDashboardProfileAction,
  updateStaffProfileAction,
  updateStaffRoleAction,
  type StaffActionState
} from "@/app/dashboard/actions/staff";
import { useStaffMobileRealtime } from "@/features/staff/components/mobile/use-staff-mobile-realtime";
import { uploadStaffMemberAvatar } from "@/features/staff/api/client";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { staffPermissionLabel } from "@/lib/staff-permissions";
import { isStaffRecentlyActive, describeTodayAttendance, describeRole, MetricStrip, StatusPill, StaffIdentityCard } from "@/features/staff/ui";
import { cn } from "@/lib/utils";
import type { StaffOperationsBundle, StaffOpsMember } from "@/features/staff/types";
import type { StaffPayrollDeductions, StaffPayrollPeriod, StaffPayrollProfile, StaffPayslip } from "@/features/staff/services/staff-payroll-compute";
import { DEFAULT_PAYROLL_HOURLY_RATE, DEFAULT_PAYROLL_OT_MULTIPLIER, summarizePayroll } from "@/features/staff/services/staff-payroll-compute";

type Props = {
  bundle: StaffOperationsBundle;
  restaurantId: string;
  restaurantName: string;
  restaurantStaffCode: string | null;
  payrollDeductions: StaffPayrollDeductions;
  payrollProfiles: StaffPayrollProfile[];
  payrollPeriods: StaffPayrollPeriod[];
  payrollPayslips: StaffPayslip[];
  payrollDataError?: string | null;
};

type Tab = "all" | "online" | "owner" | "manager" | "staff" | "blocked";
type View = "team" | "shifts" | "attendance" | "payroll" | "compliance";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  delivery: "Giao hàng",
  marketing: "Marketing",
  accountant: "Kế toán"
};

const ROLE_TONE: Record<string, "jade" | "info" | "neutral" | "orange"> = {
  owner: "jade",
  manager: "info",
  cashier: "info",
  waiter: "neutral",
  kitchen: "neutral",
  delivery: "neutral",
  marketing: "orange",
  accountant: "orange"
};

const APPROVAL_TYPE_LABEL: Record<string, string> = {
  outside_location: "Chấm công ngoài vùng",
  attendance_edit: "Sửa giờ chấm công",
  overtime: "Đăng ký tăng ca",
  shift_override: "Đổi ca",
  manual_clock_in: "Chấm công hộ",
  leave_request: "Xin nghỉ",
  shift_swap: "Hoán ca",
  device_restriction: "Giới hạn thiết bị"
};

function isOnlineMember(m: StaffOpsMember) {
  return isStaffRecentlyActive(m.lastSeenAt);
}

function isOwnerMember(member: StaffOpsMember) {
  return member.roleCode === "owner";
}

function isOperationalMember(member: StaffOpsMember) {
  return !isOwnerMember(member) && !member.isArchived && member.employmentStatus !== "resigned";
}

function shiftLabel(m: StaffOpsMember) {
  return describeTodayAttendance(m).label;
}

function initials(name: string) {
  return name.replace(/^(Anh|Chị|Em|Bà|Ông)\s*/i, "").trim().charAt(0).toUpperCase() || "?";
}

export function RealStaffWorkspaceV2(props: Props) {
  const { bundle, restaurantId, restaurantStaffCode } = props;
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<View>("team");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rtState = useStaffMobileRealtime({ restaurantId, onRefresh: () => router.refresh() });

  const operationalMembers = useMemo(() => bundle.members.filter(isOperationalMember), [bundle.members]);
  const accountCount = bundle.members.length;
  const ownerCount = useMemo(() => bundle.members.filter(isOwnerMember).length, [bundle.members]);
  const totalMembers = operationalMembers.length;
  const onlineCount = useMemo(() => operationalMembers.filter(isOnlineMember).length, [operationalMembers]);
  const managerCount = useMemo(
    () => operationalMembers.filter((m) => m.roleCode === "manager").length,
    [operationalMembers]
  );
  const staffCount = useMemo(
    () => operationalMembers.filter((m) => m.roleCode !== "manager").length,
    [operationalMembers]
  );
  const blockedCount = useMemo(() => bundle.members.filter((m) => m.accountStatus === "blocked").length, [bundle.members]);
  const attentionToday = useMemo(
    () => operationalMembers.filter((m) => m.todayAttendanceState === "late" || m.todayAttendanceState === "absent" || m.todayAttendanceState === "early_leave").length,
    [operationalMembers]
  );
  const pendingApprovals = useMemo(
    () => bundle.approvals.filter((a) => a.status === "pending").length,
    [bundle.approvals]
  );

  const visible = useMemo(() => {
    if (tab === "all") return bundle.members;
    if (tab === "online") return operationalMembers.filter(isOnlineMember);
    if (tab === "owner") return bundle.members.filter(isOwnerMember);
    if (tab === "manager") return operationalMembers.filter((m) => m.roleCode === "manager");
    if (tab === "blocked") return bundle.members.filter((m) => m.accountStatus === "blocked");
    return operationalMembers.filter((m) => m.roleCode !== "manager");
  }, [bundle.members, operationalMembers, tab]);

  const selected = bundle.members.find((m) => m.id === selectedId) ?? null;

  const cols: Column<StaffOpsMember>[] = [
    {
      key: "name",
      header: "Nhân viên",
      width: "1.6fr",
      render: (m) => (
        <span className="inline-flex items-center gap-2.5">
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatarUrl} alt={m.fullName} className="h-9 w-9 rounded-full border border-[var(--d-line)] object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">{initials(m.fullName)}</span>
          )}
          <span>
            <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{m.fullName}</span>
            <span className="block text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">
              {m.employeeCode ? `Mã ${m.employeeCode}` : "Chưa cấp mã"}
            </span>
          </span>
        </span>
      )
    },
    { key: "role", header: "Vai trò", render: (m) => <StatusPill descriptor={describeRole(m.roleCode, m.roleTitle)} /> },
    {
      key: "branch",
      header: "Chi nhánh",
      render: (m) => <span className="text-[var(--d-text-muted)]">{m.primaryBranchName ?? "Chưa gán"}</span>
    },
    {
      key: "shift",
      header: "Hôm nay",
      render: (m) => <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{shiftLabel(m)}</span>
    },
    {
      key: "status",
      header: "Trạng thái",
      align: "right",
      render: (m) => {
        const online = isOnlineMember(m);
        const blocked = m.accountStatus === "blocked";
        if (blocked) return <Badge tone="danger">Đã khoá</Badge>;
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold", online ? "text-[var(--d-ok-fg)]" : "text-[var(--d-text-faint)]")}>
            <span className={cn("h-2 w-2 rounded-full", online ? "bg-[var(--d-ok-fg)]" : "bg-[var(--d-text-faint)]")} />
            {online ? "Đang làm" : "Nghỉ"}
          </span>
        );
      }
    }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Đội ngũ vận hành" title="Nhân viên">
        <RealtimeStatusBadge state={rtState === "idle" ? "connecting" : rtState} />
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Mời nhân viên
        </Button>
      </Toolbar>

      {/* Cảnh báo cấu hình mã chấm công */}
      {!bundle.opsConfig.attendanceQrSecretConfigured ? (
        <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--d-orange-600)]" />
          <span className="font-semibold text-[var(--d-orange-600)]">
            Chưa cấu hình STAFF_ATTENDANCE_QR_SECRET — chấm công bằng QR động sẽ không hoạt động an toàn cho production.
          </span>
        </div>
      ) : null}

      <section>
        <p className="d-eyebrow mb-2">Hôm nay</p>
        <MetricStrip
          items={[
            { label: "Đang trong ca", value: String(onlineCount), tone: "ok" },
            { label: "Đi muộn / vắng", value: String(attentionToday), tone: attentionToday > 0 ? "orange" : "neutral" },
            { label: "Chờ duyệt", value: String(pendingApprovals), tone: pendingApprovals > 0 ? "danger" : "neutral" },
            { label: "Tổng đội ngũ", value: String(totalMembers), tone: "jade" }
          ]}
        />
      </section>

      {/* View tabs — chuyển đổi giữa các góc nhìn quản lý nhân sự */}
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {([
          { key: "team", label: "Đội ngũ", icon: <Users size={14} /> },
          { key: "shifts", label: "Ca & Lịch", icon: <Clock3 size={14} /> },
          { key: "attendance", label: "Chấm công & Duyệt", icon: <ShieldCheck size={14} /> },
          { key: "payroll", label: "Lương", icon: <UserCog size={14} /> },
          { key: "compliance", label: "Hồ sơ & Tuân thủ", icon: <FolderOpen size={14} /> }
        ] as const).map((v) => {
          const on = view === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--d-r-pill)] border px-4 text-[length:var(--d-fs-sm)] font-semibold transition",
                on
                  ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                  : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
              )}
            >
              {v.icon}
              {v.label}
            </button>
          );
        })}
      </nav>

      {view === "team" ? (
        <TeamView
          tab={tab}
          setTab={setTab}
          accountCount={accountCount}
          totalMembers={totalMembers}
          onlineCount={onlineCount}
          ownerCount={ownerCount}
          managerCount={managerCount}
          staffCount={staffCount}
          blockedCount={blockedCount}
          visible={visible}
          cols={cols}
          onSelectMember={(id) => setSelectedId(id)}
          onCreateOpen={() => setCreateOpen(true)}
          pendingApprovals={pendingApprovals}
          approvals={bundle.approvals}
          onApprovalsChanged={() => router.refresh()}
        />
      ) : null}

      {view === "shifts" ? (
        <ShiftsView bundle={bundle} onChanged={() => router.refresh()} />
      ) : null}

      {view === "payroll" ? (
        <PayrollView
          bundle={bundle}
          payrollDeductions={props.payrollDeductions}
          payrollProfiles={props.payrollProfiles}
          payrollPeriods={props.payrollPeriods}
          payrollPayslips={props.payrollPayslips}
          payrollDataError={props.payrollDataError ?? null}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {view === "attendance" ? (
        <div className="flex flex-col gap-[var(--d-s-4)]">
          <AttendanceView bundle={bundle} onChanged={() => router.refresh()} />
          <AttendanceSettingsView bundle={bundle} onChanged={() => router.refresh()} />
        </div>
      ) : null}

      {view === "compliance" ? (
        <AdvancedStaffPanel bundle={bundle} onChanged={() => router.refresh()} />
      ) : null}

      {selected ? (
        <StaffMemberDrawer
          member={selected}
          bundle={bundle}
          restaurantStaffCode={restaurantStaffCode}
          onClose={() => setSelectedId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      <CreateStaffModal
        open={createOpen}
        bundle={bundle}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

    </div>
  );
}

function PendingApprovalsBanner({
  approvals,
  totalCount,
  onResolved
}: {
  approvals: StaffOperationsBundle["approvals"];
  totalCount: number;
  onResolved: () => void;
}) {
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function review(id: string, decision: "approved" | "rejected") {
    if (pendingId) return;
    setPendingId(id);
    const fd = new FormData();
    fd.set("approvalId", id);
    fd.set("decision", decision);
    fd.set("reviewNote", decision === "approved" ? "Đã duyệt nhanh từ dashboard" : "Đã từ chối từ dashboard");
    try {
      const res = await reviewAttendanceApprovalAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(decision === "approved" ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu");
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xử lý được yêu cầu");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] p-[var(--d-s-4)]">
      <div className="flex items-center justify-between gap-2">
        <p className="d-eyebrow text-[var(--d-orange-600)]">{totalCount} yêu cầu chờ duyệt</p>
      </div>
      <div className="mt-3 grid gap-2">
        {approvals.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">
                {a.fullName} · {APPROVAL_TYPE_LABEL[a.requestType] ?? a.requestType}
              </span>
              <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                {a.branchName ?? "Chi nhánh chưa rõ"}
                {a.reason ? ` · ${a.reason}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void review(a.id, "rejected")}
                disabled={pendingId === a.id}
              >
                <XCircle size={13} /> Từ chối
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void review(a.id, "approved")}
                disabled={pendingId === a.id}
              >
                <CheckCircle2 size={13} /> Duyệt
              </Button>
            </span>
          </div>
        ))}
        {totalCount > approvals.length ? (
          <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            + {totalCount - approvals.length} yêu cầu khác — mở "Quản lý chi tiết" để xem hết.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function StaffMemberDrawer({
  member,
  bundle,
  restaurantStaffCode,
  onClose,
  onChanged
}: {
  member: StaffOpsMember;
  bundle: StaffOperationsBundle;
  restaurantStaffCode: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"profile" | "credentials" | "permissions" | "attendance">("profile");
  const [pending, startTransition] = useTransition();
  const [resetState, resetAction, resetPending] = useActionState(resetStaffAppPasswordAction, undefined);
  const [stateActionState, stateActionFn, statePending] = useActionState(setStaffAccountStateAction, undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isOwnerProfile = member.roleCode === "owner";

  useEffect(() => {
    if (resetState?.success || stateActionState?.success) onChanged();
  }, [resetState, stateActionState, onChanged]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const online = isOnlineMember(member);
  const blocked = member.accountStatus === "blocked";
  const lockExpiry = member.appPasswordLockedUntil ? new Date(member.appPasswordLockedUntil) : null;
  const isAppLocked = Boolean(lockExpiry && lockExpiry.getTime() > nowMs);
  const profileTabs = isOwnerProfile
    ? [
        { key: "profile", label: "Hồ sơ chủ quán" },
        { key: "credentials", label: "Tài khoản" },
        { key: "permissions", label: "Quyền quản trị" }
      ]
    : [
        { key: "profile", label: "Hồ sơ" },
        { key: "credentials", label: "Mã NV & mật khẩu" },
        { key: "permissions", label: "Phân quyền" },
        { key: "attendance", label: "Chấm công" }
      ];
  const activeProfileTab = isOwnerProfile && tab === "attendance" ? "profile" : tab;

  function copyCode() {
    if (!member.employeeCode) return;
    navigator.clipboard.writeText(member.employeeCode).then(
      () => toast.success("Đã sao chép mã nhân viên"),
      () => toast.error("Không sao chép được")
    );
  }

  function saveProfile(fd: FormData) {
    startTransition(async () => {
      const res = await updateStaffProfileAction(undefined, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Đã lưu hồ sơ nhân viên");
        onChanged();
      }
    });
  }

  function saveOwnerProfile(fd: FormData) {
    startTransition(async () => {
      const res = await updateOwnerDashboardProfileAction(undefined, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Đã lưu hồ sơ chủ quán");
        onChanged();
      }
    });
  }

  function changeRole(roleCode: string) {
    if (roleCode === member.roleCode) return;
    const fd = new FormData();
    fd.set("userId", member.userId);
    fd.set("permissionProfile", roleCode);
    startTransition(async () => {
      const res = await updateStaffRoleAction(undefined, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Đã đổi vai trò sang ${ROLE_LABEL[roleCode] ?? roleCode}`);
        onChanged();
      }
    });
  }

  const memberOpenAttendance = useMemo(
    () => bundle.attendanceFeed.find((attendance) => attendance.staffMemberId === member.id && !attendance.clockOutAt) ?? null,
    [bundle.attendanceFeed, member.id]
  );

  function manualClock(action: "in" | "out") {
    const fd = new FormData();
    fd.set("staffMemberId", member.id);
    const branchId = action === "out" ? memberOpenAttendance?.branchId ?? member.primaryBranchId : member.primaryBranchId;
    if (branchId) fd.set("branchId", branchId);
    if (action === "out" && memberOpenAttendance?.id) fd.set("attendanceLogId", memberOpenAttendance.id);
    fd.set("note", action === "in" ? "Quản lý chấm công hộ vào ca từ hồ sơ nhân viên" : "Quản lý kết ca hộ từ hồ sơ nhân viên");
    startTransition(async () => {
      const res = action === "in"
        ? await manualClockInStaffAction(undefined, fd)
        : await manualClockOutStaffAction(undefined, fd);
      if (res.error) toast.error(res.error);
      else {
        toast.success(action === "in" ? "Đã chấm công vào hộ" : "Đã chấm công ra hộ");
        onChanged();
      }
    });
  }

  const profileFormId = `staff-profile-${member.id}`;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={member.fullName}
      subtitle={isOwnerProfile ? "Hồ sơ chủ quán" : `${ROLE_LABEL[member.roleCode] ?? member.roleTitle}${member.employeeCode ? ` · Mã ${member.employeeCode}` : ""}`}
      headerMeta={
        <>
          {isOwnerProfile ? <Badge tone="jade"><ShieldCheck size={10} className="mr-1 inline" />Quản trị hệ thống</Badge> : <Badge tone={online ? "ok" : "neutral"}>{online ? "Đang làm" : "Nghỉ"}</Badge>}
          {blocked ? <Badge tone="danger">Đã khoá</Badge> : null}
          {!isOwnerProfile && isAppLocked ? <Badge tone="orange">App tạm khoá</Badge> : null}
          {!isOwnerProfile && member.suspiciousScore > 60 ? <Badge tone="orange"><Star size={10} className="mr-1 inline" />{member.suspiciousScore}</Badge> : null}
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {member.phone ? (
            <a
              href={`tel:${member.phone}`}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-5 text-[length:var(--d-fs-body)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]"
            >
              <Phone size={15} /> Gọi
            </a>
          ) : null}
          {!isOwnerProfile ? (
            <>
              {memberOpenAttendance ? (
                <Button type="button" variant="secondary" size="lg" onClick={() => manualClock("out")} disabled={pending}>
                  <LogOut size={14} /> Kết ca hộ
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="lg" onClick={() => manualClock("in")} disabled={pending}>
                  <LogIn size={14} /> Chấm vào hộ
                </Button>
              )}
            </>
          ) : null}
          <Button type="submit" form={profileFormId} variant="primary" size="lg" className="flex-1" disabled={pending}>
            {pending ? "Đang lưu…" : "Lưu hồ sơ"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-4)]">
        <StaffIdentityCard
          fullName={member.fullName}
          employeeCode={isOwnerProfile ? member.email : member.employeeCode}
          role={describeRole(member.roleCode, member.roleTitle)}
          shift={isOwnerProfile ? { label: "Tài khoản dashboard", tone: "jade", icon: ShieldCheck } : describeTodayAttendance(member)}
          avatarUrl={member.avatarUrl}
        />
        {isOwnerProfile ? <OwnerProfileNotice member={member} /> : null}
        {/* Tabs */}
        <FilterTabs
          active={activeProfileTab}
          onChange={(k) => setTab(k as typeof tab)}
          tabs={profileTabs}
        />

        {activeProfileTab === "profile" ? (
          isOwnerProfile ? (
            <OwnerProfilePanel member={member} formId={profileFormId} onSave={saveOwnerProfile} />
          ) : (
            <ProfilePanel member={member} bundle={bundle} formId={profileFormId} onSave={saveProfile} />
          )
        ) : null}

        {activeProfileTab === "credentials" ? (
          isOwnerProfile ? (
            <OwnerAccountPanel member={member} blocked={blocked} />
          ) : (
            <CredentialsPanel
              member={member}
              restaurantStaffCode={restaurantStaffCode}
              blocked={blocked}
              isAppLocked={isAppLocked}
              lockExpiry={lockExpiry}
              resetState={resetState}
              resetAction={resetAction}
              resetPending={resetPending}
              stateActionFn={stateActionFn}
              statePending={statePending}
              onCopyCode={copyCode}
              onChanged={onChanged}
            />
          )
        ) : null}

        {activeProfileTab === "permissions" ? (
          <PermissionsPanel
            member={member}
            bundle={bundle}
            onChangeRole={changeRole}
            pending={pending}
            readOnly={isOwnerProfile}
            readOnlyReason="Vai trò chủ quán là quyền gốc của quán. Không đổi role owner trong hồ sơ nhân viên."
          />
        ) : null}

        {!isOwnerProfile && activeProfileTab === "attendance" ? (
          <AttendancePanel member={member} bundle={bundle} />
        ) : null}
      </div>
    </Drawer>
  );
}

function StaffAvatarUploader({ member, audience = "staff" }: { member: StaffOpsMember; audience?: "staff" | "owner" }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      await uploadStaffMemberAvatar(member.id, file);
      toast.success(audience === "owner" ? "Đã cập nhật ảnh đại diện chủ quán" : "Đã cập nhật ảnh đại diện nhân viên");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể tải ảnh đại diện.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex items-center gap-[var(--d-s-4)] rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatarUrl} alt={member.fullName} className="h-16 w-16 rounded-full border border-[var(--d-line)] object-cover" />
      ) : (
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-h3)] font-bold text-[var(--d-primary)]">{initials(member.fullName)}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Ảnh đại diện</p>
        <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          {audience === "owner" ? "JPG, PNG hoặc WebP, tối đa 3MB. Dùng cho hồ sơ quản trị dashboard." : "JPG, PNG hoặc WebP, tối đa 3MB. Đồng bộ ngay với app nhân viên."}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => void handleFile(event.currentTarget.files?.[0] ?? null)}
      />
      <Button type="button" variant="secondary" size="md" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Đang tải…" : member.avatarUrl ? "Đổi ảnh" : "Tải ảnh"}
      </Button>
    </section>
  );
}

function OwnerProfilePanel({
  member,
  formId,
  onSave
}: {
  member: StaffOpsMember;
  formId: string;
  onSave: (fd: FormData) => void;
}) {
  return (
    <form id={formId} action={(fd) => onSave(fd)} className="flex flex-col gap-[var(--d-s-4)]">
      <input type="hidden" name="userId" value={member.userId} />

      <StaffAvatarUploader member={member} audience="owner" />

      <section className="grid gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="d-eyebrow">Thông tin quản trị</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Hồ sơ chủ quán chỉ dùng cho dashboard. Không áp dụng PIN tạo đơn, chi nhánh làm việc, trạng thái ca hay bảng công.
          </p>
        </div>
        <FormField label="Họ tên chủ quán" name="fullName" defaultValue={member.fullName} required full />
        <FormField label="SĐT liên hệ" name="phone" defaultValue={member.phone ?? ""} placeholder="0901234567" />
        <FormField label="Username dashboard" name="username" defaultValue={member.username ?? ""} placeholder="chuquan" />
        <div className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Email đăng nhập</span>
          <div className="flex h-10 items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
            {member.email || "Chưa có email"}
          </div>
        </div>
      </section>
    </form>
  );
}

function OwnerProfileNotice({ member }: { member: StaffOpsMember }) {
  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-primary)]/20 bg-[var(--d-primary-soft)] p-[var(--d-s-4)]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface)] text-[var(--d-primary)]">
          <ShieldCheck size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Đây là hồ sơ chủ quán</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Tài khoản này dùng để quản trị dashboard, phân quyền và vận hành quán. Các thao tác theo ca như chấm công hộ, kết ca hộ, điểm danh GPS/QR/WiFi không áp dụng cho chủ quán.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Tile label="Email đăng nhập" value={member.email || "Chưa có"} />
            <Tile label="Quyền" value={`${member.permissions.length} quyền`} />
          </div>
        </div>
      </div>
    </section>
  );
}

function OwnerAccountPanel({ member, blocked }: { member: StaffOpsMember; blocked: boolean }) {
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Tài khoản dashboard</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Chủ quán đăng nhập dashboard bằng tài khoản quản trị. Mật khẩu app staff, mã NV và trạng thái chấm công không dùng cho hồ sơ này.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Tile label="Email" value={member.email || "Chưa có"} />
          <Tile label="Username" value={member.username || "Chưa đặt"} />
          <Tile label="Trạng thái" value={blocked ? "Đã khoá" : "Đang hoạt động"} />
        </div>
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Bảo mật & phạm vi</p>
        <div className="mt-3 grid gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <div className="flex justify-between gap-2"><span>Vai trò hệ thống</span><span className="font-bold text-[var(--d-text)]">Chủ quán</span></div>
          <div className="flex justify-between gap-2"><span>Phiên thiết bị</span><span className="d-num font-bold text-[var(--d-text)]">{member.activeSessionCount}</span></div>
          <div className="flex justify-between gap-2"><span>Lần online gần nhất</span><span className="font-bold text-[var(--d-text)]">{member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleString("vi-VN") : "—"}</span></div>
        </div>
        <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
          Các hành động nhạy cảm của chủ quán như đổi mật khẩu đăng nhập dashboard hoặc thu hồi owner nên đi qua luồng tài khoản/bảo mật riêng, không đặt chung với thao tác nhân viên theo ca.
        </p>
      </section>
    </div>
  );
}

function ProfilePanel({
  member,
  bundle,
  formId,
  onSave
}: {
  member: StaffOpsMember;
  bundle: StaffOperationsBundle;
  formId: string;
  onSave: (fd: FormData) => void;
}) {
  return (
    <form id={formId} action={(fd) => onSave(fd)} className="flex flex-col gap-[var(--d-s-4)]">
      <input type="hidden" name="userId" value={member.userId} />
      <input type="hidden" name="roleCode" value={member.roleCode} />

      <StaffAvatarUploader member={member} />

      <section className="grid gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] sm:grid-cols-2">
        <FormField label="Họ tên" name="fullName" defaultValue={member.fullName} required full />
        <FormField label="SĐT" name="phone" defaultValue={member.phone ?? ""} placeholder="0901234567" />
        <FormField label="Username (login dashboard)" name="username" defaultValue={member.username ?? ""} placeholder="anhnam" />
        <FormField label="Ngày sinh" name="dateOfBirth" type="date" defaultValue={member.dateOfBirth ?? ""} />
        <FormField label="Quê quán" name="hometown" defaultValue={member.hometown ?? ""} />
        <FormField label="PIN tạo đơn (4 số)" name="pin" defaultValue="" placeholder="Để trống = giữ PIN cũ" maxLength={4} />
      </section>

      <section className="grid gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] sm:grid-cols-2">
        <p className="d-eyebrow sm:col-span-2">Vận hành</p>
        <FormSelect label="Chi nhánh chính" name="branchId" defaultValue={member.primaryBranchId ?? ""} options={[
          { value: "", label: "Chưa gán" },
          ...bundle.branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))
        ]} />
        <FormSelect label="Trạng thái nhân sự" name="employmentStatus" defaultValue={member.employmentStatus} options={[
          { value: "active", label: "Đang làm" },
          { value: "suspended", label: "Tạm ngừng" },
          { value: "resigned", label: "Đã nghỉ việc" }
        ]} />
        <FormField label="Liên hệ khẩn cấp (tên)" name="emergencyContactName" defaultValue={member.emergencyContactName ?? ""} />
        <FormField label="SĐT khẩn cấp" name="emergencyContactPhone" defaultValue={member.emergencyContactPhone ?? ""} />
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú nội bộ</span>
          <textarea
            name="notes"
            defaultValue={member.notes ?? ""}
            maxLength={500}
            placeholder="VD: Hợp đồng thử việc 2 tháng, kinh nghiệm pha chế…"
            className="min-h-20 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
      </section>
    </form>
  );
}

function CredentialsPanel({
  member,
  restaurantStaffCode,
  blocked,
  isAppLocked,
  lockExpiry,
  resetState,
  resetAction,
  resetPending,
  stateActionFn,
  statePending,
  onCopyCode,
  onChanged
}: {
  member: StaffOpsMember;
  restaurantStaffCode: string | null;
  blocked: boolean;
  isAppLocked: boolean;
  lockExpiry: Date | null;
  resetState: StaffActionState | undefined;
  resetAction: (formData: FormData) => void;
  resetPending: boolean;
  stateActionFn: (formData: FormData) => void;
  statePending: boolean;
  onCopyCode: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [forcePending, startForce] = useTransition();

  function forceLogoutSessions() {
    if (forcePending) return;
    if (member.activeSessionCount <= 0) {
      toast.error("Nhân viên không có phiên đăng nhập nào đang hoạt động.");
      return;
    }
    if (!window.confirm(`Buộc đăng xuất toàn bộ ${member.activeSessionCount} phiên/thiết bị của ${member.fullName}? Nhân viên sẽ phải đăng nhập lại trên app PWA.`)) {
      return;
    }
    startForce(async () => {
      const fd = new FormData();
      fd.set("staffMemberId", member.id);
      fd.set("reason", "Chủ quán buộc đăng xuất phiên/thiết bị từ Dashboard v2");
      try {
        const { forceStaffSessionsLogoutAction } = await import("@/app/dashboard/actions/staff");
        const res = await forceStaffSessionsLogoutAction(undefined, fd);
        if (res.error) throw new Error(res.error);
        toast.success(res.success ?? "Đã buộc đăng xuất phiên nhân viên");
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không buộc đăng xuất được phiên");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Thông tin đăng nhập PWA staff</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Nhân viên dùng app PWA tại <code className="rounded bg-[var(--d-surface)] px-1 font-mono text-[length:var(--d-fs-2xs)]">/staff</code> để đăng nhập với mã quán + mã NV + mật khẩu.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Mã quán</p>
            <p className="d-num mt-1 break-all font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{restaurantStaffCode ?? "Chưa cấp"}</p>
          </div>
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Mã nhân viên</p>
              {member.employeeCode ? (
                <button type="button" onClick={onCopyCode} className="text-[var(--d-primary)]" aria-label="Sao chép mã">
                  <Copy size={12} />
                </button>
              ) : null}
            </div>
            <p className="d-num mt-1 break-all font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{member.employeeCode ?? "Chưa cấp"}</p>
          </div>
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Trạng thái</p>
            <p className={cn("mt-1 text-[length:var(--d-fs-sm)] font-bold", blocked ? "text-[var(--d-danger-fg)]" : isAppLocked ? "text-[var(--d-orange-600)]" : "text-[var(--d-primary)]")}>
              {blocked ? "Tài khoản đã khoá" : isAppLocked ? "App tạm khoá" : "Đang hoạt động"}
            </p>
            {isAppLocked && lockExpiry ? (
              <p className="mt-0.5 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">Mở lại lúc {lockExpiry.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <div className="flex justify-between gap-2"><span>Số lần sai mật khẩu app</span><span className="d-num font-bold">{member.appPasswordAttempts}/5</span></div>
          <div className="flex justify-between gap-2"><span>Phiên thiết bị</span><span className="d-num font-bold">{member.activeSessionCount}</span></div>
          <div className="flex justify-between gap-2"><span>Lần online gần nhất</span><span className="font-bold">{member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleString("vi-VN") : "—"}</span></div>
        </div>
      </section>

      {/* Reset password */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Cấp lại mật khẩu app</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Cấp lại khi nhân viên quên hoặc mất thiết bị. Mật khẩu tạm sẽ hiện ngay sau khi reset, hệ thống tự logout mọi phiên cũ.
        </p>
        <form action={resetAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="userId" value={member.userId} />
          <input type="hidden" name="reason" value="Chủ quán cấp lại mật khẩu app từ Dashboard v2" />
          <Button type="submit" variant="primary" size="md" disabled={resetPending}>
            <KeyRound size={14} /> {resetPending ? "Đang cấp…" : "Cấp lại mật khẩu app"}
          </Button>
        </form>
        {resetState?.temporaryPassword ? (
          <div className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] p-3">
            <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">Mật khẩu tạm cho {member.employeeCode ?? member.fullName}</p>
            <p className="d-num mt-1 break-all font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{resetState.temporaryPassword}</p>
            <p className="mt-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">Gửi mật khẩu tạm cho nhân viên qua kênh an toàn (Telegram, gọi điện). Nhân viên sẽ được yêu cầu đổi mật khẩu sau lần đăng nhập đầu.</p>
          </div>
        ) : null}
        {resetState?.error ? (
          <p className="mt-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-danger-fg)]">{resetState.error}</p>
        ) : null}
      </section>

      {/* Phiên & thiết bị đăng nhập */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Phiên & thiết bị đăng nhập</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Buộc đăng xuất khi nghi ngờ lộ mật khẩu, mất thiết bị hoặc nhân viên nghỉ việc. Toàn bộ phiên app PWA hiện hành sẽ bị huỷ ngay.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Phiên đang hoạt động:
            <span className="d-num font-bold text-[var(--d-text)]">{member.activeSessionCount}</span>
          </span>
          <Button
            type="button"
            variant="danger"
            size="md"
            onClick={forceLogoutSessions}
            disabled={forcePending || member.activeSessionCount <= 0}
          >
            <LogOut size={14} /> {forcePending ? "Đang đăng xuất…" : "Buộc đăng xuất tất cả phiên"}
          </Button>
        </div>
      </section>

      {/* Block / unblock */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Trạng thái tài khoản</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Khoá tài khoản sẽ ngăn nhân viên đăng nhập app PWA và buộc logout mọi phiên hiện hành.
        </p>
        <form action={stateActionFn} className="mt-3">
          <input type="hidden" name="userId" value={member.userId} />
          <input type="hidden" name="nextState" value={blocked ? "active" : "blocked"} />
          <input type="hidden" name="reason" value="Cập nhật trạng thái nhân viên từ Dashboard v2" />
          <Button type="submit" variant={blocked ? "primary" : "danger"} size="md" disabled={statePending}>
            {blocked ? <><CheckCircle2 size={14} /> Mở lại tài khoản</> : <><XCircle size={14} /> Khoá tài khoản</>}
          </Button>
        </form>
      </section>
    </div>
  );
}

function PermissionsPanel({
  member,
  bundle,
  onChangeRole,
  pending,
  readOnly = false,
  readOnlyReason
}: {
  member: StaffOpsMember;
  bundle: StaffOperationsBundle;
  onChangeRole: (roleCode: string) => void;
  pending: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Vai trò</p>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          {readOnly ? readOnlyReason : "Đổi vai trò sẽ cập nhật quyền theo template chuẩn. Tinh chỉnh chi tiết quyền per-role tại \"Quản lý chi tiết\"."}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.roles?.map((r) => {
            const active = r.code === member.roleCode;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onChangeRole(String(r.code))}
                disabled={pending || active || readOnly}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[var(--d-r-md)] border p-3 text-left transition",
                  active
                    ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]"
                    : "border-[var(--d-line)] bg-[var(--d-surface-2)] hover:border-[var(--d-line-strong)]",
                  pending && "opacity-60"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{r.title}</span>
                  {active ? <Badge tone="ok">Đang dùng</Badge> : null}
                </span>
                <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.permissionCount} quyền · {r.dangerPermissionCount} nguy hiểm</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Quyền chi tiết ({member.permissions.length})</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {member.permissions.length === 0 ? (
            <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Vai trò này chưa có quyền nào.</p>
          ) : (
            member.permissions.map((p) => (
              <Badge key={p} tone="neutral">{staffPermissionLabel(p)}</Badge>
            ))
          )}
        </div>
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Để tinh chỉnh từng quyền cho role (ví dụ tách quyền "huỷ đơn"/"in bill" cho cashier), mở "Quản lý chi tiết" → tab Phân quyền.
        </p>
      </section>
    </div>
  );
}

function AttendancePanel({
  member,
  bundle
}: {
  member: StaffOpsMember;
  bundle: StaffOperationsBundle;
}) {
  const memberAttendance = bundle.attendanceFeed.filter((a) => a.staffMemberId === member.id).slice(0, 10);
  const openAttendance = memberAttendance.find((attendance) => !attendance.clockOutAt) ?? null;
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="grid grid-cols-3 gap-2">
        <Tile label="Trễ ca hôm nay" value={`${member.lateMinutesToday}p`} />
        <Tile label="Tăng ca hôm nay" value={`${member.overtimeMinutesToday}p`} />
        <Tile label="Phiên thiết bị" value={String(member.activeSessionCount)} />
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="d-eyebrow">Trạng thái ca hiện tại</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
              {openAttendance ? `Đang trong ca tại ${openAttendance.branchName ?? "chi nhánh chưa rõ"}` : "Không có ca đang mở"}
            </p>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              {openAttendance
                ? `Vào ca lúc ${new Date(openAttendance.clockInAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. Nút chính trong hồ sơ sẽ kết ca hộ đúng phiên này.`
                : "Nút chính trong hồ sơ sẽ chấm vào hộ. Nếu nhân viên báo đã vào ca nhưng hệ thống không thấy, kiểm tra lịch sử và yêu cầu đối soát trước khi sửa công."}
            </p>
          </div>
          <Badge tone={openAttendance ? "ok" : "neutral"}>{openAttendance ? "Ca mở" : "Sẵn sàng vào ca"}</Badge>
        </div>
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Lịch sử chấm công ({memberAttendance.length})</p>
        {memberAttendance.length === 0 ? (
          <p className="mt-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Chưa có lịch sử chấm công.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {memberAttendance.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-2.5 text-[length:var(--d-fs-xs)]">
                <span>
                  <span className="block font-bold text-[var(--d-text)]">
                    {new Date(a.clockInAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {a.clockOutAt ? ` → ${new Date(a.clockOutAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                  <span className="block text-[var(--d-text-muted)]">
                    {a.shiftName ?? "Không có ca"} · {a.branchName ?? "—"} · qua {a.source}
                  </span>
                </span>
                <Badge
                  tone={
                    a.state === "on_time" ? "ok" :
                    a.state === "late" || a.state === "early_leave" ? "orange" :
                    a.state === "absent" ? "danger" : "info"
                  }
                >
                  {a.state === "on_time" ? "Đúng giờ" :
                   a.state === "late" ? `Trễ ${a.lateMinutes}p` :
                   a.state === "early_leave" ? "Về sớm" :
                   a.state === "overtime" ? `Tăng ca ${a.overtimeMinutes}p` :
                   "Vắng"}
                </Badge>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Sửa giờ / xoá log chấm công và xem heatmap đầy đủ tại "Quản lý chi tiết".
        </p>
      </section>
    </div>
  );
}

function CreateStaffModal({
  open,
  bundle,
  onClose,
  onCreated
}: {
  open: boolean;
  bundle: StaffOperationsBundle;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StaffActionState | null>(null);
  const [requiredDraft, setRequiredDraft] = useState({ fullName: "", roleCode: "waiter" });
  const canCreateStaff = requiredDraft.fullName.trim().length >= 2 && requiredDraft.roleCode.trim().length > 0;
  if (!open) return null;

  function copy(value: string | null | undefined, label: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(
      () => toast.success(`Đã sao chép ${label}`),
      () => toast.error("Không sao chép được")
    );
  }

  function finish() {
    setResult(null);
    onCreated();
  }

  if (result) {
    return (
      <Modal open onClose={finish} title="Đã tạo nhân viên" subtitle="Thông tin đăng nhập PWA" size="md">
        <div className="grid gap-3">
          <div className="rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] p-3">
            <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">
              Gửi mã nhân viên và mật khẩu này cho nhân viên qua kênh an toàn (Telegram, gọi điện). Nhân viên sẽ được yêu cầu đổi mật khẩu ngay sau lần đăng nhập đầu tại <code className="rounded bg-[var(--d-surface)] px-1 font-mono">/staff</code>.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Mã nhân viên</p>
                <p className="d-num mt-1 break-all font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{result.employeeCode ?? "—"}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(result.employeeCode, "mã nhân viên")}>
                <Copy size={13} /> Copy
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Mật khẩu lần đầu</p>
                <p className="d-num mt-1 break-all font-mono text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{result.temporaryPassword ?? "—"}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(result.temporaryPassword, "mật khẩu")}>
                <Copy size={13} /> Copy
              </Button>
            </div>
          </div>
          <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
            <Button type="button" variant="secondary" size="md" onClick={() => setResult(null)}>
              <Plus size={15} /> Tạo nhân viên khác
            </Button>
            <Button type="button" variant="primary" size="md" onClick={finish}>Xong</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Mời nhân viên" subtitle="Nhân sự" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          if (!canCreateStaff) {
            toast.error("Vui lòng nhập đầy đủ thông tin bắt buộc trước khi tạo nhân viên.");
            return;
          }
          setSubmitting(true);
          try {
            const res = await createStaffAction(undefined, fd);
            if (res.error) {
              toast.error(res.error);
              return;
            }
            toast.success("Đã tạo nhân viên — mã NV và mật khẩu đã sẵn sàng");
            setResult(res);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không tạo được nhân viên");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2">
          <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text)]">Tạo nhanh tài khoản nhân viên</p>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Chỉ cần nhập các trường bắt buộc. Email nội bộ, mật khẩu lần đầu và mã NV sẽ được tự sinh nếu để trống.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[length:var(--d-fs-2xs)] font-bold">
            <span className="rounded-full border border-[var(--d-danger-fg)]/20 bg-[var(--d-danger-bg)] px-2 py-1 text-[var(--d-danger-fg)]">Bắt buộc</span>
            <span className="rounded-full border border-[var(--d-line)] bg-[var(--d-surface)] px-2 py-1 text-[var(--d-text-muted)]">Tùy chọn</span>
            <span className="rounded-full border border-[var(--d-primary)]/20 bg-[var(--d-primary-soft)] px-2 py-1 text-[var(--d-primary)]">Tự tạo nếu trống</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Họ tên"
            name="fullName"
            required
            requirement="required"
            full
            placeholder="VD: Nguyễn Văn A"
            onValueChange={(value) => setRequiredDraft((current) => ({ ...current, fullName: value }))}
          />
          <FormField label="Email login dashboard" name="email" type="email" requirement="generated" placeholder="Để trống = tạo email nội bộ" />
          <FormField label="Mật khẩu lần đầu" name="password" type="text" requirement="generated" placeholder="Để trống = tự tạo mật khẩu mạnh" />
          <FormField label="PIN tạo đơn (4 số)" name="pin" maxLength={4} requirement="optional" placeholder="VD: 1234" />
          <FormField label="SĐT" name="phone" requirement="optional" placeholder="0901234567" />
          <FormField label="Ngày sinh" name="dateOfBirth" type="date" requirement="optional" />
          <FormField label="Quê quán" name="hometown" requirement="optional" placeholder="VD: Cần Thơ" />
          <FormSelect
            label="Vai trò"
            name="roleCode"
            defaultValue="waiter"
            requirement="required"
            onValueChange={(value) => setRequiredDraft((current) => ({ ...current, roleCode: value }))}
            options={[
              { value: "manager", label: "Quản lý" },
              { value: "cashier", label: "Thu ngân" },
              { value: "waiter", label: "Phục vụ" },
              { value: "kitchen", label: "Bếp" },
              { value: "delivery", label: "Giao hàng" },
              { value: "marketing", label: "Marketing" },
              { value: "accountant", label: "Kế toán" }
            ]}
          />
          <FormSelect
            label="Chi nhánh"
            name="branchId"
            defaultValue=""
            requirement="optional"
            options={[
              { value: "", label: "Chưa gán" },
              ...bundle.branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))
            ]}
          />
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <FieldLabel label="Ghi chú nội bộ" requirement="optional" />
            <textarea name="notes" maxLength={500} placeholder="VD: Hợp đồng thử việc 2 tháng" className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <div className="mt-1 flex flex-col gap-2 border-t border-[var(--d-line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn("text-[length:var(--d-fs-xs)] font-semibold", canCreateStaff ? "text-[var(--d-text-faint)]" : "text-[var(--d-danger-fg)]")}>
            {canCreateStaff ? "Đã đủ thông tin bắt buộc để tạo nhân viên." : "Cần nhập Họ tên và chọn Vai trò trước khi tạo."}
          </p>
          <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting || !canCreateStaff}>
            <Plus size={15} /> {submitting ? "Đang tạo…" : "Mời nhân viên"}
          </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

type FieldRequirement = "required" | "optional" | "generated";

function FieldLabel({ label, requirement }: { label: string; requirement?: FieldRequirement }) {
  const badge = requirement
    ? {
        required: "Bắt buộc",
        optional: "Tùy chọn",
        generated: "Tự tạo nếu trống"
      }[requirement]
    : null;

  return (
    <span className="flex items-center justify-between gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
      <span>{label}</span>
      {badge ? (
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-black leading-none",
            requirement === "required" && "border-[var(--d-danger-fg)]/20 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
            requirement === "optional" && "border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]",
            requirement === "generated" && "border-[var(--d-primary)]/20 bg-[var(--d-primary-soft)] text-[var(--d-primary)]"
          )}
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  requirement,
  full,
  maxLength,
  onValueChange
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  requirement?: FieldRequirement;
  full?: boolean;
  maxLength?: number;
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <FieldLabel label={label} requirement={requirement} />
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
      />
    </label>
  );
}

function FormSelect({
  label,
  name,
  defaultValue,
  requirement,
  options,
  onValueChange
}: {
  label: string;
  name: string;
  defaultValue?: string;
  requirement?: FieldRequirement;
  options: { value: string; label: string }[];
  onValueChange?: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel label={label} requirement={requirement} />
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function payrollPeriodStatusLabel(status: StaffPayrollPeriod["status"]) {
  const labels: Record<StaffPayrollPeriod["status"], string> = {
    draft: "Nháp",
    reviewing: "Đối soát",
    closed: "Đã chốt",
    void: "Đã huỷ"
  };
  return labels[status];
}

function payslipStatusLabel(status: StaffPayslip["status"]) {
  const labels: Record<StaffPayslip["status"], string> = {
    draft: "Nháp",
    approved: "Đã duyệt",
    paid: "Đã trả",
    void: "Đã huỷ"
  };
  return labels[status];
}

function TeamView({
  tab,
  setTab,
  accountCount,
  totalMembers,
  onlineCount,
  ownerCount,
  managerCount,
  staffCount,
  blockedCount,
  visible,
  cols,
  onSelectMember,
  onCreateOpen,
  pendingApprovals,
  approvals,
  onApprovalsChanged
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  accountCount: number;
  totalMembers: number;
  onlineCount: number;
  ownerCount: number;
  managerCount: number;
  staffCount: number;
  blockedCount: number;
  visible: StaffOpsMember[];
  cols: Column<StaffOpsMember>[];
  onSelectMember: (id: string) => void;
  onCreateOpen: () => void;
  pendingApprovals: number;
  approvals: StaffOperationsBundle["approvals"];
  onApprovalsChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      {pendingApprovals > 0 ? (
        <PendingApprovalsBanner
          approvals={approvals.filter((a) => a.status === "pending").slice(0, 4)}
          totalCount={pendingApprovals}
          onResolved={onApprovalsChanged}
        />
      ) : null}

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "all", label: "Tất cả", count: accountCount },
          { key: "online", label: "Đang làm", count: onlineCount },
          { key: "owner", label: "Chủ quán", count: ownerCount },
          { key: "manager", label: "Quản lý", count: managerCount },
          { key: "staff", label: "Nhân viên", count: staffCount },
          { key: "blocked", label: "Đã khoá", count: blockedCount }
        ]}
      />

      <DataTable
        columns={cols}
        rows={visible}
        onRowClick={(m) => onSelectMember(m.id)}
        empty={
          <EmptyState
            icon={<Users size={20} />}
            title="Không có nhân viên"
            description="Mời nhân viên để cấp mã NV và mật khẩu PWA."
            action={<Button variant="primary" size="md" onClick={onCreateOpen}><Plus size={15} /> Mời nhân viên</Button>}
          />
        }
      />
    </div>
  );
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function ShiftsView({
  bundle,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  onChanged: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundle.shifts.find((s) => s.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="d-eyebrow">Cấu hình ca làm</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">
              Template ca ({bundle.shifts.length})
            </h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Mỗi template ca có giờ vào / giờ ra, biên trễ cho phép, ngưỡng tăng ca và bán kính chấm công GPS.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Tạo template ca
          </Button>
        </header>

        {bundle.shifts.length === 0 ? (
          <EmptyState
            icon={<Clock3 size={20} />}
            title="Chưa có template ca nào"
            description="Tạo template để gán ca theo tuần, tự động đếm trễ giờ và OT."
            className="mt-3"
            action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Tạo template ca</Button>}
          />
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {bundle.shifts.map((s) => (
              <article key={s.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{s.name}</p>
                    <p className="d-num mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-primary)]">
                      {s.startTime} → {s.endTime}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId(s.id)}
                    className="text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] hover:underline"
                  >
                    Sửa
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <span
                      key={label}
                      className={cn(
                        "d-num inline-flex h-6 w-6 items-center justify-center rounded-[var(--d-r-sm)] text-[length:var(--d-fs-2xs)] font-bold",
                        s.recurringWeekdays?.includes(idx)
                          ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                          : "bg-[var(--d-surface)] text-[var(--d-text-faint)]"
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                  <span>Trễ: <span className="d-num font-bold text-[var(--d-text)]">{s.allowedLateMinutes}p</span></span>
                  <span>OT: <span className="d-num font-bold text-[var(--d-text)]">{s.overtimeThresholdMinutes}p</span></span>
                  <span>GPS: <span className="d-num font-bold text-[var(--d-text)]">{s.attendanceRadiusMeters}m</span></span>
                </div>
                <p className="mt-2 truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
                  {s.branchName ?? "Tất cả chi nhánh"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="d-eyebrow">Phân ca tuần này</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">
              Lịch ca theo ngày
            </h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Bấm vào ô trống để gán ca cho nhân viên. Bấm vào ca đã xếp để xem chi tiết hoặc huỷ.
            </p>
          </div>
          <Badge tone="neutral">{bundle.shiftAssignments.length} ca tuần này</Badge>
        </header>
        <WeekScheduleGrid bundle={bundle} onChanged={onChanged} />
      </section>

      <ShiftTemplateModal
        open={createOpen}
        bundle={bundle}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
          toast.success("Đã tạo template ca");
          onChanged();
        }}
      />

      <ShiftTemplateModal
        open={Boolean(editing)}
        bundle={bundle}
        existing={editing}
        onClose={() => setEditingId(null)}
        onCreated={() => {
          setEditingId(null);
          router.refresh();
          toast.success("Đã cập nhật template ca");
          onChanged();
        }}
      />
    </div>
  );
}

function ShiftTemplateModal({
  open,
  bundle,
  existing,
  onClose,
  onCreated
}: {
  open: boolean;
  bundle: StaffOperationsBundle;
  existing?: StaffOperationsBundle["shifts"][number] | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.recurringWeekdays ?? [1, 2, 3, 4, 5]);
  if (!open) return null;

  function toggleDay(idx: number) {
    setWeekdays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  }

  return (
    <Modal open onClose={onClose} title={existing ? "Sửa template ca" : "Tạo template ca"} subtitle="Cấu hình chấm công" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            // Convert weekdays to JSON string for backend
            fd.set("recurringWeekdays", JSON.stringify(weekdays));
            if (existing) {
              fd.set("shiftId", existing.id);
              const { updateStaffShiftTemplateAction } = await import("@/app/dashboard/actions/staff");
              const res = await updateStaffShiftTemplateAction(undefined, fd);
              if (res.error) throw new Error(res.error);
            } else {
              const { createStaffShiftTemplateAction } = await import("@/app/dashboard/actions/staff");
              const res = await createStaffShiftTemplateAction(undefined, fd);
              if (res.error) throw new Error(res.error);
            }
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không lưu được template ca");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormField label="Tên ca" name="name" defaultValue={existing?.name} required full placeholder="VD: Ca sáng, Ca tối, Ca chiều cuối tuần" />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Giờ bắt đầu" name="startTime" type="time" defaultValue={existing?.startTime ?? "07:00"} required />
          <FormField label="Giờ kết thúc" name="endTime" type="time" defaultValue={existing?.endTime ?? "15:00"} required />
        </div>
        <FormSelect
          label="Chi nhánh"
          name="branchId"
          defaultValue={existing?.branchId ?? ""}
          options={[
            { value: "", label: "Tất cả chi nhánh" },
            ...bundle.branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))
          ]}
        />

        <div className="grid gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ngày trong tuần</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(idx)}
                className={cn(
                  "d-num inline-flex h-9 min-w-[44px] items-center justify-center rounded-[var(--d-r-md)] border px-3 text-[length:var(--d-fs-sm)] font-bold transition",
                  weekdays.includes(idx)
                    ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                    : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Trễ cho phép (phút)" name="allowedLateMinutes" type="number" defaultValue={String(existing?.allowedLateMinutes ?? 10)} required />
          <FormField label="Ngưỡng OT (phút)" name="overtimeThresholdMinutes" type="number" defaultValue={String(existing?.overtimeThresholdMinutes ?? 30)} required />
          <FormField label="Bán kính GPS (m)" name="attendanceRadiusMeters" type="number" defaultValue={String(existing?.attendanceRadiusMeters ?? 80)} required />
        </div>

        <p className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Trễ: số phút cho phép trễ trước khi đánh dấu "Trễ ca". OT: số phút sau giờ ra mới tính tăng ca. GPS: bán kính chấm công bằng vị trí (chỉ áp dụng khi nhân viên dùng GPS).
        </p>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang lưu…" : existing ? "Cập nhật ca" : "Tạo ca"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* PayrollView — bảng lương vận hành theo chuẩn VN.
 *
 * Backend hiện trả về StaffOpsTimesheetSummary có:
 *   workMinutes, lateMinutes, overtimeMinutes, approvedOvertimeMinutes,
 *   paidLeaveDays, unpaidLeaveDays, attendanceCount, attendanceScore.
 *
 * Backend chưa lưu salary rule per-staff. Để chủ quán có thể tính lương ngay,
 * chúng tôi cho cấu hình client-side rule mức lương theo giờ + hệ số OT
 * (chuẩn Bộ luật Lao động VN: ngày thường 1.5x, cuối tuần 2x, ngày lễ 3x).
 * Lương ước tính = workMinutes/60 × hourlyRate + approvedOvertimeMinutes/60 × otRate.
 * Chủ quán có thể export hoặc dùng làm cơ sở chốt lương qua HĐLĐ riêng.
 */
function currentMonthPayrollDraft() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toDateInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return {
    label: `Lương ${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`,
    start: toDateInput(start),
    end: toDateInput(end)
  };
}

function PayrollView({
  bundle,
  payrollDeductions,
  payrollProfiles,
  payrollPeriods,
  payrollPayslips,
  payrollDataError,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  payrollDeductions: StaffPayrollDeductions;
  payrollProfiles: StaffPayrollProfile[];
  payrollPeriods: StaffPayrollPeriod[];
  payrollPayslips: StaffPayslip[];
  payrollDataError: string | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editingDeductions, setEditingDeductions] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [generatingPeriod, setGeneratingPeriod] = useState(false);
  const [periodAction, setPeriodAction] = useState<StaffPayrollPeriod["status"] | null>(null);
  const [payslipActionId, setPayslipActionId] = useState<string | null>(null);
  const [defaultHourly, setDefaultHourly] = useState(DEFAULT_PAYROLL_HOURLY_RATE);
  const [otMultiplier, setOtMultiplier] = useState<"1.5" | "2.0" | "3.0">("1.5");
  const [perStaffRate, setPerStaffRate] = useState<Record<string, number>>({});

  // Tổng hợp tổng lương + khấu trừ
  const otRate = parseFloat(otMultiplier);
  const profileMap = useMemo(() => new Map(payrollProfiles.map((p) => [p.staffMemberId, p])), [payrollProfiles]);

  const summaries = useMemo(() => {
    return bundle.timesheets.map((t) => {
      const profile = profileMap.get(t.staffMemberId);
      const rate = perStaffRate[t.staffMemberId] ?? profile?.hourlyRate ?? defaultHourly;
      const baseHours = t.workMinutes / 60;
      const otHours = t.approvedOvertimeMinutes / 60;
      const baseSalary = Math.round(baseHours * rate);
      const otSalary = Math.round(otHours * rate * otRate);
      const gross = baseSalary + otSalary;

      const deductionSummary = summarizePayroll({
        grossMonthlySalary: gross,
        baseSalary: profile?.baseSalary ?? gross,
        dependentCount: profile?.dependentCount ?? 0,
        enrolledInInsurance: profile?.enrolledInInsurance ?? false,
        applyPersonalIncomeTax: profile?.applyPersonalIncomeTax ?? false,
        insuranceBaseAmount: profile?.insuranceBaseAmount ?? null,
        deductions: payrollDeductions
      });

      return { ts: t, rate, baseHours, otHours, baseSalary, otSalary, gross, total: gross, profile, deductionSummary };
    });
  }, [bundle.timesheets, perStaffRate, defaultHourly, otRate, profileMap, payrollDeductions]);

  const grandTotal = summaries.reduce((s, x) => s + x.gross, 0);
  const grandNet = summaries.reduce((s, x) => s + x.deductionSummary.netIncome, 0);
  const grandEmployeeInsurance = summaries.reduce((s, x) => s + x.deductionSummary.totalEmployeeInsurance, 0);
  const grandEmployerInsurance = summaries.reduce((s, x) => s + x.deductionSummary.totalEmployerInsurance, 0);
  const grandTax = summaries.reduce((s, x) => s + x.deductionSummary.personalIncomeTax, 0);
  const totalWorkHours = summaries.reduce((s, x) => s + x.baseHours, 0);
  const totalOtHours = summaries.reduce((s, x) => s + x.otHours, 0);
  const latestPeriod = payrollPeriods[0] ?? null;
  const latestPayslips = latestPeriod ? payrollPayslips.filter((payslip) => payslip.payrollPeriodId === latestPeriod.id) : [];
  const activeLatestPayslips = latestPayslips.filter((payslip) => payslip.status !== "void");
  const latestPeriodReadyToClose = latestPeriod?.status === "reviewing" && activeLatestPayslips.length > 0 && activeLatestPayslips.every((payslip) => payslip.status === "approved" || payslip.status === "paid");
  const defaultPeriod = currentMonthPayrollDraft();

  if (payrollDataError) {
    return (
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--d-danger-fg)]" />
          <div className="min-w-0">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-danger-fg)]">Không thể hiển thị lương thưởng bằng dữ liệu thật</p>
            <p className="mt-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{payrollDataError}</p>
            <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">Kiểm tra migration, RLS và quyền truy cập bảng staff_payroll_deductions / staff_payroll_profiles trước khi chốt lương.</p>
          </div>
        </div>
      </section>
    );
  }

  function copyAllToCsv() {
    const hasRealPayslips = latestPayslips.length > 0;
    const headers = hasRealPayslips
      ? ["Kỳ lương", "Trạng thái kỳ", "Mã NV", "Họ tên", "Ngày bắt đầu", "Ngày kết thúc", "Số công", "Giờ làm", "OT", "Trễ phút", "Gross", "BH NV đóng", "BH NSDLĐ", "Thuế TNCN", "Net thực lĩnh", "Trạng thái phiếu"]
      : ["Họ tên", "Chi nhánh", "Giờ làm", "OT", "Mức lương/giờ", "Lương cơ bản", "Lương OT", "Gross", "BH NV đóng", "BH NSDLĐ", "Thuế TNCN", "Net thực lĩnh", "Trễ ca", "Phép có lương", "Phép không lương"];
    const rows = hasRealPayslips
      ? latestPayslips.map((payslip) => [
        latestPeriod?.periodLabel ?? "",
        latestPeriod?.status ?? "",
        payslip.employeeCode ?? "",
        payslip.staffName,
        payslip.periodStart,
        payslip.periodEnd,
        String(payslip.attendanceCount),
        (payslip.workMinutes / 60).toFixed(2),
        (payslip.overtimeMinutes / 60).toFixed(2),
        String(payslip.lateMinutes),
        payslip.grossPay.toString(),
        payslip.employeeInsuranceTotal.toString(),
        payslip.employerInsuranceTotal.toString(),
        payslip.personalIncomeTax.toString(),
        payslip.netPay.toString(),
        payslip.status
      ])
      : summaries.map((s) => [
        s.ts.fullName,
        s.ts.branchName ?? "",
        s.baseHours.toFixed(2),
        s.otHours.toFixed(2),
        s.rate.toString(),
        s.baseSalary.toString(),
        s.otSalary.toString(),
        s.gross.toString(),
        s.deductionSummary.totalEmployeeInsurance.toString(),
        s.deductionSummary.totalEmployerInsurance.toString(),
        s.deductionSummary.personalIncomeTax.toString(),
        s.deductionSummary.netIncome.toString(),
        String(s.ts.lateMinutes),
        String(s.ts.paidLeaveDays),
        String(s.ts.unpaidLeaveDays)
      ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hasRealPayslips ? "phieu-luong" : "bang-luong-tam"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function updatePeriodStatus(status: StaffPayrollPeriod["status"]) {
    if (!latestPeriod || periodAction) return;
    setPeriodAction(status);
    const fd = new FormData();
    fd.set("payrollPeriodId", latestPeriod.id);
    fd.set("status", status);
    try {
      const { updateStaffPayrollPeriodStatusAction } = await import("@/app/dashboard/actions/staff");
      const res = await updateStaffPayrollPeriodStatusAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(res.success ?? "Đã cập nhật kỳ lương");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được kỳ lương");
    } finally {
      setPeriodAction(null);
    }
  }

  async function updatePayslipStatus(payslipId: string, status: StaffPayslip["status"]) {
    if (payslipActionId) return;
    setPayslipActionId(payslipId);
    const fd = new FormData();
    fd.set("payslipId", payslipId);
    fd.set("status", status);
    try {
      const { updateStaffPayslipStatusAction } = await import("@/app/dashboard/actions/staff");
      const res = await updateStaffPayslipStatusAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(res.success ?? "Đã cập nhật phiếu lương");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được phiếu lương");
    } finally {
      setPayslipActionId(null);
    }
  }

  async function generatePayrollPeriod(fd: FormData) {
    if (generatingPeriod) return;
    setGeneratingPeriod(true);
    try {
      fd.set("defaultHourlyRate", String(defaultHourly));
      fd.set("overtimeMultiplier", otMultiplier);
      const { generateStaffPayrollPeriodAction } = await import("@/app/dashboard/actions/staff");
      const res = await generateStaffPayrollPeriodAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(res.success ?? "Đã tạo kỳ lương nháp");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tạo được kỳ lương");
    } finally {
      setGeneratingPeriod(false);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="d-eyebrow">Kỳ lương</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Snapshot bảng công để chốt lương</h3>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Backend đọc công đã duyệt, hồ sơ lương và rule BHXH/TNCN để tạo phiếu lương nháp. Không lấy tổng tiền từ UI.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {latestPeriod ? <Badge tone={latestPeriod.status === "closed" ? "ok" : latestPeriod.status === "reviewing" ? "orange" : latestPeriod.status === "void" ? "danger" : "info"}>{payrollPeriodStatusLabel(latestPeriod.status)}</Badge> : null}
            {latestPeriod?.status === "draft" ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => void updatePeriodStatus("reviewing")} disabled={Boolean(periodAction) || activeLatestPayslips.length === 0}>
                <Clock3 size={13} /> Đối soát
              </Button>
            ) : null}
            {latestPeriod?.status === "reviewing" ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => void updatePeriodStatus("draft")} disabled={Boolean(periodAction)}>
                  <XCircle size={13} /> Trả về nháp
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={() => void updatePeriodStatus("closed")} disabled={Boolean(periodAction) || !latestPeriodReadyToClose}>
                  <ShieldCheck size={13} /> Chốt kỳ
                </Button>
              </>
            ) : null}
            {latestPeriod && latestPeriod.status !== "closed" && latestPeriod.status !== "void" ? (
              <Button type="button" variant="danger" size="sm" onClick={() => void updatePeriodStatus("void")} disabled={Boolean(periodAction)}>
                <XCircle size={13} /> Huỷ kỳ
              </Button>
            ) : null}
          </div>
        </header>

        <form action={generatePayrollPeriod} className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.9fr_0.9fr_auto]">
          <FormField label="Tên kỳ" name="periodLabel" defaultValue={defaultPeriod.label} required />
          <FormField label="Từ ngày" name="periodStart" type="date" defaultValue={defaultPeriod.start} required />
          <FormField label="Đến ngày" name="periodEnd" type="date" defaultValue={defaultPeriod.end} required />
          <div className="flex items-end">
            <Button type="submit" variant="primary" size="md" disabled={generatingPeriod || latestPeriod?.status === "closed"}>
              <CheckCircle2 size={14} /> {generatingPeriod ? "Đang tạo…" : latestPeriod ? latestPeriod.status === "closed" ? "Kỳ đã chốt" : "Refresh kỳ nháp" : "Tạo kỳ nháp"}
            </Button>
          </div>
        </form>

        {latestPeriod?.status === "reviewing" && !latestPeriodReadyToClose ? (
          <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
            Cần duyệt tất cả phiếu lương còn hiệu lực trước khi chốt kỳ. Phiếu huỷ sẽ không tính vào tổng kỳ.
          </p>
        ) : null}

        {latestPeriod ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <Tile label="Kỳ gần nhất" value={`${latestPeriod.periodLabel}`} />
            <Tile label="Nhân viên" value={`${latestPeriod.staffCount} phiếu`} />
            <Tile label="Gross" value={`${latestPeriod.grossTotal.toLocaleString("vi-VN")}₫`} />
            <Tile label="Net" value={`${latestPeriod.netTotal.toLocaleString("vi-VN")}₫`} />
          </div>
        ) : (
          <p className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Chưa có kỳ lương nào. Tạo kỳ nháp sau khi đã duyệt công trong tháng.
          </p>
        )}

        {latestPayslips.length ? (
          <div className="mt-4 overflow-x-auto rounded-[var(--d-r-md)] border border-[var(--d-line)]">
            <table className="w-full min-w-[720px] text-left text-[length:var(--d-fs-xs)]">
              <thead className="bg-[var(--d-surface-2)] text-[var(--d-text-faint)]">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">Nhân viên</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">Trạng thái</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">Công</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">Gross</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">BH/Thuế</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-[var(--d-track-wide)]">Net</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-[var(--d-track-wide)]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {latestPayslips.slice(0, 8).map((payslip) => (
                  <tr key={payslip.id} className={cn("border-t border-[var(--d-line)]", payslip.status === "void" ? "opacity-60" : "")}>
                    <td className="px-3 py-2 font-bold text-[var(--d-text)]">{payslip.staffName}</td>
                    <td className="px-3 py-2"><Badge tone={payslip.status === "paid" ? "ok" : payslip.status === "approved" ? "info" : payslip.status === "void" ? "danger" : "neutral"}>{payslipStatusLabel(payslip.status)}</Badge></td>
                    <td className="px-3 py-2 d-num text-[var(--d-text-muted)]">{(payslip.workMinutes / 60).toFixed(1)}h · OT {(payslip.overtimeMinutes / 60).toFixed(1)}h</td>
                    <td className="px-3 py-2 d-num font-semibold text-[var(--d-text)]">{payslip.grossPay.toLocaleString("vi-VN")}₫</td>
                    <td className="px-3 py-2 d-num text-[var(--d-text-muted)]">{(payslip.employeeInsuranceTotal + payslip.personalIncomeTax).toLocaleString("vi-VN")}₫</td>
                    <td className="px-3 py-2 d-num font-bold text-[var(--d-primary)]">{payslip.netPay.toLocaleString("vi-VN")}₫</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {payslip.status === "draft" ? (
                          <Button type="button" variant="secondary" size="sm" onClick={() => void updatePayslipStatus(payslip.id, "approved")} disabled={payslipActionId === payslip.id || latestPeriod?.status === "closed"}>
                            <CheckCircle2 size={12} /> Duyệt
                          </Button>
                        ) : null}
                        {payslip.status === "approved" ? (
                          <Button type="button" variant="primary" size="sm" onClick={() => void updatePayslipStatus(payslip.id, "paid")} disabled={payslipActionId === payslip.id}>
                            <ShieldCheck size={12} /> Đã trả
                          </Button>
                        ) : null}
                        {payslip.status !== "paid" && payslip.status !== "void" && latestPeriod?.status !== "closed" ? (
                          <Button type="button" variant="danger" size="sm" onClick={() => void updatePayslipStatus(payslip.id, "void")} disabled={payslipActionId === payslip.id}>
                            <XCircle size={12} /> Huỷ
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="d-eyebrow">Cấu hình lương kỳ này</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Quy tắc tính lương</h3>
          </div>
          <Button type="button" variant="secondary" size="md" onClick={() => setEditingDeductions(true)}>
            <Settings2 size={14} /> BHXH / TNCN
          </Button>
        </header>
        <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Mức lương theo giờ chung áp dụng cho mọi nhân viên chưa có mức riêng. Hệ số OT theo Bộ luật Lao động VN: 1.5× ngày thường, 2× cuối tuần, 3× ngày lễ. BHXH/BHYT/BHTN theo NĐ 145/2020 — bấm "BHXH / TNCN" để cấu hình tỉ lệ + thuế TNCN.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Mức lương / giờ chung (₫)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={defaultHourly}
              onChange={(e) => setDefaultHourly(Math.max(0, Number(e.target.value) || 0))}
              className="d-num h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-bold outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Hệ số OT</span>
            <select
              value={otMultiplier}
              onChange={(e) => setOtMultiplier(e.target.value as typeof otMultiplier)}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              <option value="1.5">1.5× — ngày thường</option>
              <option value="2.0">2.0× — cuối tuần</option>
              <option value="3.0">3.0× — ngày lễ</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="secondary" size="md" onClick={copyAllToCsv}>
              <Copy size={14} /> Xuất bảng lương CSV
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<UserCog size={18} />} label="Tổng lương gross" value={`${grandTotal.toLocaleString("vi-VN")}₫`} helper={`${summaries.length} nhân viên`} tone="jade" />
        <MetricCard icon={<UserCog size={18} />} label="Tổng net (đã trừ)" value={`${grandNet.toLocaleString("vi-VN")}₫`} helper={`Sau BHXH + thuế TNCN`} tone="info" />
        <MetricCard icon={<ShieldCheck size={18} />} label="BH NV đóng" value={`${grandEmployeeInsurance.toLocaleString("vi-VN")}₫`} helper={`NSDLĐ: ${grandEmployerInsurance.toLocaleString("vi-VN")}₫`} tone="orange" />
        <MetricCard icon={<UserCog size={18} />} label="Thuế TNCN" value={`${grandTax.toLocaleString("vi-VN")}₫`} helper={payrollDeductions.enablePersonalIncomeTax ? "Đang áp dụng" : "Đang tắt"} tone={grandTax > 0 ? "danger" : "neutral"} />
      </section>

      <section className="overflow-x-auto rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
        <table className="w-full min-w-[820px] text-left text-[length:var(--d-fs-xs)]">
          <thead className="bg-[var(--d-surface-2)] text-[var(--d-text-faint)]">
            <tr>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Nhân viên</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Giờ làm</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">OT</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Mức lương</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Gross</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">BH NV đóng</th>
              <th className="px-[var(--d-s-4)] py-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Thuế TNCN</th>
              <th className="px-[var(--d-s-4)] py-3 text-right text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Net thực lĩnh</th>
              <th className="px-[var(--d-s-4)] py-3 text-right text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]">Hồ sơ</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-[var(--d-s-4)] py-8 text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                  Chưa có dữ liệu chấm công kỳ này. Tạo template ca và phân ca để tính lương.
                </td>
              </tr>
            ) : (
              summaries.map((s) => (
                <tr key={s.ts.staffMemberId} className="border-t border-[var(--d-line)]">
                  <td className="px-[var(--d-s-4)] py-3">
                    <p className="font-bold text-[var(--d-text)]">{s.ts.fullName}</p>
                    <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{s.ts.branchName ?? "—"}</p>
                  </td>
                  <td className="px-[var(--d-s-4)] py-3 d-num text-[var(--d-text-muted)]">{s.baseHours.toFixed(1)}h</td>
                  <td className="px-[var(--d-s-4)] py-3 d-num text-[var(--d-text-muted)]">{s.otHours.toFixed(1)}h</td>
                  <td className="px-[var(--d-s-4)] py-3">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={s.rate}
                      onChange={(e) => setPerStaffRate((p) => ({ ...p, [s.ts.staffMemberId]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="d-num h-8 w-28 rounded-[var(--d-r-sm)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-2 text-[length:var(--d-fs-xs)] font-bold outline-none focus:border-[var(--d-jade)]"
                    />
                  </td>
                  <td className="px-[var(--d-s-4)] py-3 d-num font-semibold text-[var(--d-text)]">{s.gross.toLocaleString("vi-VN")}₫</td>
                  <td className="px-[var(--d-s-4)] py-3 d-num font-semibold text-[var(--d-orange-600)]">{s.deductionSummary.totalEmployeeInsurance.toLocaleString("vi-VN")}₫</td>
                  <td className="px-[var(--d-s-4)] py-3 d-num font-semibold text-[var(--d-orange-600)]">{s.deductionSummary.personalIncomeTax.toLocaleString("vi-VN")}₫</td>
                  <td className="px-[var(--d-s-4)] py-3 d-num text-right text-[length:var(--d-fs-sm)] font-bold text-[var(--d-primary)]">{s.deductionSummary.netIncome.toLocaleString("vi-VN")}₫</td>
                  <td className="px-[var(--d-s-4)] py-3 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingProfileId(s.ts.staffMemberId)}>
                      <Settings2 size={13} />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-orange-600)]">
        <strong>Lưu ý:</strong> Mức lương / giờ là ước tính cho ca làm. Lương net hiển thị áp dụng đầy đủ BHXH/BHYT/BHTN + thuế TNCN luỹ tiến (nếu bật) theo Luật Thuế TNCN. Bấm "BHXH / TNCN" để chỉnh tỉ lệ. Bấm icon ⚙ ở mỗi nhân viên để cấu hình hồ sơ lương cá nhân (mức lương theo HĐLĐ, người phụ thuộc, có tham gia BHXH).
      </p>

      {editingDeductions ? (
        <DeductionsModal
          deductions={payrollDeductions}
          onClose={() => setEditingDeductions(false)}
          onSaved={() => {
            setEditingDeductions(false);
            onChanged();
            toast.success("Đã cập nhật cấu hình BHXH/TNCN");
          }}
        />
      ) : null}

      {editingProfileId ? (() => {
        const member = bundle.members.find((m) => m.id === editingProfileId);
        const profile = profileMap.get(editingProfileId);
        if (!member) return null;
        return (
          <PayrollProfileModal
            member={member}
            profile={profile ?? null}
            onClose={() => setEditingProfileId(null)}
            onSaved={() => {
              setEditingProfileId(null);
              onChanged();
              toast.success("Đã lưu hồ sơ lương");
            }}
          />
        );
      })() : null}
    </div>
  );
}

function AttendanceView({
  bundle,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [approvalFilter, setApprovalFilter] = useState<"pending" | "all">("pending");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<StaffOperationsBundle["attendanceFeed"][number] | null>(null);

  const filteredApprovals = bundle.approvals.filter((a) => approvalFilter === "all" || a.status === "pending");
  const recentFeed = bundle.attendanceFeed.slice(0, 20);

  async function review(id: string, decision: "approved" | "rejected") {
    if (pendingId) return;
    setPendingId(id);
    const fd = new FormData();
    fd.set("approvalId", id);
    fd.set("decision", decision);
    fd.set("reviewNote", decision === "approved" ? "Đã duyệt từ dashboard" : "Đã từ chối từ dashboard");
    try {
      const res = await reviewAttendanceApprovalAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(decision === "approved" ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xử lý được yêu cầu");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="d-eyebrow">Yêu cầu chờ duyệt</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">
              {bundle.approvals.filter((a) => a.status === "pending").length} yêu cầu cần xử lý
            </h3>
          </div>
          <div className="inline-flex rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setApprovalFilter(f)}
                className={cn(
                  "inline-flex h-8 items-center rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-semibold transition",
                  approvalFilter === f
                    ? "bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]"
                    : "text-[var(--d-text-muted)] hover:text-[var(--d-text)]"
                )}
              >
                {f === "pending" ? "Chờ duyệt" : "Tất cả"}
              </button>
            ))}
          </div>
        </header>
        {filteredApprovals.length === 0 ? (
          <p className="mt-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
            {approvalFilter === "pending" ? "Không có yêu cầu chờ duyệt nào." : "Chưa có yêu cầu nào trong kỳ."}
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            {filteredApprovals.slice(0, 12).map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                    {a.fullName} · {APPROVAL_TYPE_LABEL[a.requestType] ?? a.requestType}
                  </span>
                  <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                    {a.branchName ?? "—"} · {new Date(a.createdAt).toLocaleString("vi-VN")}
                    {a.reason ? ` · "${a.reason}"` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={a.status === "approved" ? "ok" : a.status === "rejected" ? "danger" : a.status === "cancelled" ? "neutral" : "orange"}>
                    {a.status === "pending" ? "Chờ duyệt" : a.status === "approved" ? "Đã duyệt" : a.status === "rejected" ? "Từ chối" : "Huỷ"}
                  </Badge>
                  {a.status === "pending" ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => void review(a.id, "rejected")} disabled={pendingId === a.id}>
                        <XCircle size={13} /> Từ chối
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => void review(a.id, "approved")} disabled={pendingId === a.id}>
                        <CheckCircle2 size={13} /> Duyệt
                      </Button>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="flex items-center justify-between gap-2">
          <div>
            <p className="d-eyebrow">Hoạt động chấm công</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">20 sự kiện gần nhất</h3>
          </div>
          <Badge tone="info">Realtime PWA</Badge>
        </header>
        {recentFeed.length === 0 ? (
          <p className="mt-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Chưa có hoạt động chấm công.</p>
        ) : (
          <div className="mt-3 grid gap-1.5">
            {recentFeed.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => setAdjusting(f)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-2.5 text-left text-[length:var(--d-fs-xs)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-surface)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-[var(--d-text)]">{f.fullName}</span>
                  <span className="block truncate text-[var(--d-text-muted)]">
                    {new Date(f.clockInAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {f.clockOutAt ? ` → ${new Date(f.clockOutAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : " · đang trong ca"}
                    {" · "}{f.shiftName ?? "Không có ca"} · {f.branchName ?? "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge tone="neutral">qua {f.source === "gps" ? "GPS" : f.source === "qr" ? "QR" : f.source === "wifi" ? "Wi-Fi" : f.source === "manual" ? "Hộ" : "Offline"}</Badge>
                  <Badge
                    tone={
                      f.state === "on_time" ? "ok" :
                      f.state === "late" || f.state === "early_leave" ? "orange" :
                      f.state === "absent" ? "danger" : "info"
                    }
                  >
                    {f.state === "on_time" ? "Đúng giờ" :
                     f.state === "late" ? `Trễ ${f.lateMinutes}p` :
                     f.state === "early_leave" ? "Về sớm" :
                     f.state === "overtime" ? `Tăng ca ${f.overtimeMinutes}p` :
                     "Vắng"}
                  </Badge>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {adjusting ? (
        <AdjustAttendanceModal
          log={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            onChanged();
            toast.success("Đã sửa giờ chấm công");
          }}
        />
      ) : null}

      <p className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
        Bấm vào dòng chấm công để sửa giờ vào / giờ ra (audit log sẽ ghi nhận lý do).
      </p>
    </div>
  );
}

function AttendanceSettingsView({
  bundle,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  onChanged: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const activeBranches = bundle.branches.filter((b) => b.isActive);
  const [qrBranch, setQrBranch] = useState(activeBranches[0]?.id ?? "");
  const [qrExpiry, setQrExpiry] = useState<1 | 2 | 5>(1);
  const [qrResult, setQrResult] = useState<{ qrUrl?: string; expiresAt?: string; tokenLabel?: string } | null>(null);
  const [creatingQr, setCreatingQr] = useState(false);

  const [wifiBranch, setWifiBranch] = useState(activeBranches[0]?.id ?? "");
  const [wifiLabel, setWifiLabel] = useState("");
  const [registeringWifi, setRegisteringWifi] = useState(false);

  async function createQrToken() {
    if (creatingQr || !qrBranch) return;
    setCreatingQr(true);
    setQrResult(null);
    try {
      const res = await fetch("/api/admin/staff-operations/attendance-qr-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchId: qrBranch, expiresInMinutes: qrExpiry })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Không tạo được QR chấm công");
      setQrResult({
        qrUrl: json.data?.qrImageUrl ?? json.data?.qr_image_url,
        expiresAt: json.data?.expiresAt ?? json.data?.expires_at,
        tokenLabel: json.data?.tokenLabel ?? json.data?.token_label
      });
      toast.success("Đã tạo QR chấm công mới");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được QR chấm công");
    } finally {
      setCreatingQr(false);
    }
  }

  async function registerWifi() {
    if (registeringWifi || !wifiBranch) return;
    setRegisteringWifi(true);
    try {
      const res = await fetch("/api/admin/staff-operations/attendance-wifi-networks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: wifiBranch,
          label: wifiLabel.trim() || undefined
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Không đăng ký được Wi-Fi chấm công");
      toast.success("Đã đăng ký Wi-Fi cho chi nhánh — nhân viên vẫn cần GPS chính xác khi chấm công");
      setWifiLabel("");
      router.refresh();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đăng ký được Wi-Fi chấm công");
    } finally {
      setRegisteringWifi(false);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      {/* QR token section */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header>
          <p className="d-eyebrow">Chấm công bằng QR động</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Tạo mã QR thay đổi định kỳ</h3>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Hiển thị QR ở quầy / lễ tân, nhân viên quét bằng app PWA để chấm công. Token đổi mỗi 1-5 phút để tránh nhân viên chia sẻ ảnh QR.
          </p>
        </header>

        {!bundle.opsConfig.attendanceQrSecretConfigured ? (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Production cần cấu hình <code className="rounded bg-[var(--d-surface)] px-1 font-mono">STAFF_ATTENDANCE_QR_SECRET</code> trong env. Hiện tại đang dùng fallback secret kém an toàn.
            </span>
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Chi nhánh</span>
            <select
              value={qrBranch}
              onChange={(e) => setQrBranch(e.target.value)}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              {activeBranches.length === 0 ? (
                <option value="">Chưa có chi nhánh hoạt động</option>
              ) : (
                activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.attendanceLocationConfigured ? "" : " (chưa có toạ độ)"}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Hết hạn (phút)</span>
            <select
              value={qrExpiry}
              onChange={(e) => setQrExpiry(Number(e.target.value) as 1 | 2 | 5)}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              <option value={1}>1 phút</option>
              <option value={2}>2 phút</option>
              <option value={5}>5 phút</option>
            </select>
          </label>
          <Button type="button" variant="primary" size="md" onClick={() => void createQrToken()} disabled={creatingQr || !qrBranch}>
            <KeyRound size={14} /> {creatingQr ? "Đang tạo…" : "Tạo QR mới"}
          </Button>
        </div>

        {qrResult?.qrUrl ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-start">
            <div className="rounded-[var(--d-r-md)] border-2 border-[var(--d-jade)]/40 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrResult.qrUrl} alt="QR chấm công" className="block h-[180px] w-[180px] object-contain" />
            </div>
            <div className="grid gap-2">
              <p className="d-eyebrow text-[var(--d-primary)]">QR đang hoạt động</p>
              <div className="grid gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                <span>
                  Hết hạn lúc: <strong className="text-[var(--d-text)]">{qrResult.expiresAt ? new Date(qrResult.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong>
                </span>
                {qrResult.tokenLabel ? <span>Mã token: <code className="rounded bg-[var(--d-surface-2)] px-1 font-mono">{qrResult.tokenLabel}</code></span> : null}
              </div>
              <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                Hiển thị QR ở quầy bằng máy in nhỏ hoặc tablet. Khi hết hạn, hệ thống tự xoay token mới — bạn có thể bấm "Tạo QR mới" để rotate ngay.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Wi-Fi section */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header>
          <p className="d-eyebrow">Chấm công bằng Wi-Fi</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Đăng ký Wi-Fi quán</h3>
          <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Khi nhân viên kết nối Wi-Fi đã đăng ký từ thiết bị PWA, hệ thống xác thực vị trí qua IP công cộng. Bạn cần đăng ký từ thiết bị đang ở quán, kết nối cùng Wi-Fi nhân viên dùng.
          </p>
        </header>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_minmax(0,1fr)_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Chi nhánh</span>
            <select
              value={wifiBranch}
              onChange={(e) => setWifiBranch(e.target.value)}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
            >
              {activeBranches.length === 0 ? (
                <option value="">Chưa có chi nhánh hoạt động</option>
              ) : (
                activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Nhãn Wi-Fi (tuỳ chọn)</span>
            <input
              type="text"
              value={wifiLabel}
              onChange={(e) => setWifiLabel(e.target.value)}
              maxLength={80}
              placeholder="VD: Wi-Fi tầng 1, Wi-Fi staff"
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <Button type="button" variant="primary" size="md" onClick={() => void registerWifi()} disabled={registeringWifi || !wifiBranch}>
            <ShieldCheck size={14} /> {registeringWifi ? "Đang đăng ký…" : "Đăng ký Wi-Fi"}
          </Button>
        </div>

        <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Để đăng ký Wi-Fi bằng dashboard, bạn cần mở dashboard từ chính thiết bị (laptop / tablet) đang kết nối Wi-Fi quán. Hệ thống tự đọc IP công cộng và lưu cho chi nhánh.
        </p>
      </section>

      {/* Tổng quan + biên giới hiện hữu */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
        <p className="d-eyebrow">Hiện trạng cấu hình theo chi nhánh</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.branches.map((b) => (
            <article key={b.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{b.name}</span>
                <Badge tone={b.isPrimary ? "jade" : "neutral"}>{b.isPrimary ? "Chính" : "Phụ"}</Badge>
              </div>
              <p className="mt-1 truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{b.address || "Chưa có địa chỉ"}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge tone={b.attendanceLocationConfigured ? "ok" : "orange"}>
                  {b.attendanceLocationConfigured ? "Đã ghim toạ độ" : "Chưa ghim toạ độ"}
                </Badge>
                <Badge tone={b.isActive ? "ok" : "neutral"}>{b.isActive ? "Hoạt động" : "Tạm dừng"}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
                <span>Đang làm: <strong className="d-num text-[var(--d-text)]">{b.activeStaff}</strong></span>
                <span>Trễ: <strong className="d-num text-[var(--d-text)]">{b.lateCount}</strong></span>
                <span>Coverage: <strong className="d-num text-[var(--d-text)]">{b.coverageScore}%</strong></span>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Cập nhật toạ độ chi nhánh tại <a href="/dashboard/settings?section=branches" className="font-bold text-[var(--d-primary)] underline">Cài đặt → Chi nhánh</a>. Toạ độ là gốc cho chấm công GPS.
        </p>
      </section>
    </div>
  );
}

function WeekScheduleGrid({
  bundle,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignSlot, setAssignSlot] = useState<{ memberId: string; date: string } | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<StaffOperationsBundle["shiftAssignments"][number] | null>(null);

  // Tính tuần đang xem (offset 0 = tuần hiện tại, +1 = tuần sau, -1 = tuần trước)
  const startOfWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay(); // 0=CN, 1=T2 ...
    const diff = day === 0 ? -6 : 1 - day;
    today.setDate(today.getDate() + diff + weekOffset * 7);
    return today;
  }, [weekOffset]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return {
        iso: d.toISOString().slice(0, 10),
        label: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i],
        date: d.getDate(),
        month: d.getMonth() + 1
      };
    });
  }, [startOfWeek]);

  const weekStartIso = days[0].iso;
  const weekEndIso = days[6].iso;

  // Lọc assignments trong tuần hiện tại
  const weekAssignments = useMemo(
    () => bundle.shiftAssignments.filter((a) => a.scheduledDate >= weekStartIso && a.scheduledDate <= weekEndIso),
    [bundle.shiftAssignments, weekStartIso, weekEndIso]
  );

  // Map (memberId, date) -> assignments
  const assignmentMap = useMemo(() => {
    const m = new Map<string, StaffOperationsBundle["shiftAssignments"]>();
    for (const a of weekAssignments) {
      const key = `${a.staffMemberId}:${a.scheduledDate}`;
      const list = m.get(key) ?? [];
      list.push(a);
      m.set(key, list);
    }
    return m;
  }, [weekAssignments]);

  // Chỉ hiển thị active members
  const activeMembers = bundle.members.filter((m) => m.accountStatus === "active" && isOperationalMember(m));

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setWeekOffset((v) => v - 1)}>← Tuần trước</Button>
          <Button type="button" variant={weekOffset === 0 ? "primary" : "secondary"} size="sm" onClick={() => setWeekOffset(0)}>Tuần hiện tại</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setWeekOffset((v) => v + 1)}>Tuần sau →</Button>
        </div>
        <span className="text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">
          {days[0].date}/{days[0].month} → {days[6].date}/{days[6].month}
        </span>
      </div>

      {bundle.shifts.length === 0 ? (
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
          Cần tạo ít nhất 1 template ca trước khi gán ca.
        </p>
      ) : null}

      {/* Schedule grid */}
      <div className="overflow-x-auto rounded-[var(--d-r-md)] border border-[var(--d-line)]">
        <table className="w-full min-w-[920px] text-left text-[length:var(--d-fs-xs)]">
          <thead className="bg-[var(--d-surface-2)]">
            <tr>
              <th className="px-3 py-2 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Nhân viên</th>
              {days.map((d) => (
                <th key={d.iso} className="px-2 py-2 text-center text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
                  <span className="block">{d.label}</span>
                  <span className="d-num block text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{d.date}/{d.month}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                  Chưa có nhân viên active.
                </td>
              </tr>
            ) : (
              activeMembers.map((m) => (
                <tr key={m.id} className="border-t border-[var(--d-line)]">
                  <td className="px-3 py-2">
                    <p className="font-bold text-[var(--d-text)]">{m.fullName}</p>
                    <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{ROLE_LABEL[m.roleCode] ?? m.roleTitle}</p>
                  </td>
                  {days.map((d) => {
                    const cellAssignments = assignmentMap.get(`${m.id}:${d.iso}`) ?? [];
                    return (
                      <td key={d.iso} className="border-l border-[var(--d-line)] p-1 align-top">
                        <div className="grid gap-1">
                          {cellAssignments.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setEditingAssignment(a)}
                              disabled={a.status === "cancelled"}
                              title={`${a.shiftName} · ${a.status} — bấm để sửa hoặc huỷ`}
                              className={cn(
                                "block w-full truncate rounded-[var(--d-r-sm)] px-2 py-1 text-left text-[length:var(--d-fs-2xs)] font-bold transition",
                                a.status === "completed" ? "bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)] hover:opacity-80" :
                                a.status === "swapped" ? "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)] hover:opacity-80" :
                                a.status === "cancelled" ? "bg-[var(--d-surface-3)] text-[var(--d-text-faint)] line-through" :
                                "bg-[var(--d-primary-soft)] text-[var(--d-primary)] hover:opacity-80"
                              )}
                            >
                              {a.shiftName}
                            </button>
                          ))}
                          {bundle.shifts.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setAssignSlot({ memberId: m.id, date: d.iso })}
                              className="block w-full rounded-[var(--d-r-sm)] border border-dashed border-[var(--d-line)] bg-transparent px-2 py-1 text-center text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-text-faint)] transition hover:border-[var(--d-jade)] hover:bg-[var(--d-primary-soft)] hover:text-[var(--d-primary)]"
                            >
                              + Gán
                            </button>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {assignSlot ? (
        <AssignShiftModal
          memberId={assignSlot.memberId}
          memberName={bundle.members.find((m) => m.id === assignSlot.memberId)?.fullName ?? ""}
          date={assignSlot.date}
          shifts={bundle.shifts}
          onClose={() => setAssignSlot(null)}
          onAssigned={() => {
            setAssignSlot(null);
            onChanged();
            toast.success("Đã gán ca");
          }}
        />
      ) : null}

      {editingAssignment ? (
        <EditShiftAssignmentModal
          assignment={editingAssignment}
          memberName={bundle.members.find((m) => m.id === editingAssignment.staffMemberId)?.fullName ?? editingAssignment.staffName}
          shifts={bundle.shifts}
          onClose={() => setEditingAssignment(null)}
          onSaved={(msg) => {
            setEditingAssignment(null);
            onChanged();
            toast.success(msg);
          }}
        />
      ) : null}
    </div>
  );
}

function AssignShiftModal({
  memberId,
  memberName,
  date,
  shifts,
  onClose,
  onAssigned
}: {
  memberId: string;
  memberName: string;
  date: string;
  shifts: StaffOperationsBundle["shifts"];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Gán ca cho ${memberName}`} subtitle={`Ngày ${date}`} size="sm">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            fd.set("staffMemberId", memberId);
            fd.set("scheduledDate", date);
            const { assignStaffShiftAction } = await import("@/app/dashboard/actions/staff");
            const res = await assignStaffShiftAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            onAssigned();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không gán được ca");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Chọn template ca</span>
          <select
            name="shiftId"
            required
            defaultValue={shifts[0]?.id ?? ""}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
          >
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.startTime}-{s.endTime}
                {s.branchName ? ` · ${s.branchName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú (tuỳ chọn)</span>
          <input
            name="note"
            maxLength={240}
            placeholder="VD: Đổi ca với A, mở quán sớm…"
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang gán…" : "Gán ca"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditShiftAssignmentModal({
  assignment,
  memberName,
  shifts,
  onClose,
  onSaved
}: {
  assignment: StaffOperationsBundle["shiftAssignments"][number];
  memberName: string;
  shifts: StaffOperationsBundle["shifts"];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancelAssignment() {
    if (submitting || cancelling) return;
    if (!window.confirm("Huỷ ca này?")) return;
    setCancelling(true);
    try {
      const fd = new FormData();
      fd.set("shiftAssignmentId", assignment.id);
      fd.set("note", "Huỷ ca từ dashboard tuần");
      const { cancelStaffShiftAssignmentAction } = await import("@/app/dashboard/actions/staff");
      const res = await cancelStaffShiftAssignmentAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      onSaved("Đã huỷ ca");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không huỷ được ca");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Sửa ca: ${memberName}`} subtitle={`Ngày ${assignment.scheduledDate}`} size="sm">
      <form
        action={async (fd) => {
          if (submitting || cancelling) return;
          setSubmitting(true);
          try {
            fd.set("shiftAssignmentId", assignment.id);
            fd.set("staffMemberId", assignment.staffMemberId);
            const { updateStaffShiftAssignmentAction } = await import("@/app/dashboard/actions/staff");
            const res = await updateStaffShiftAssignmentAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            onSaved("Đã sửa phân ca");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không sửa được ca");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Đổi template ca</span>
          <select
            name="shiftId"
            required
            defaultValue={assignment.shiftId}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]"
          >
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.startTime}-{s.endTime}
                {s.branchName ? ` · ${s.branchName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ngày làm</span>
          <input
            name="scheduledDate"
            type="date"
            required
            defaultValue={assignment.scheduledDate}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú (tuỳ chọn)</span>
          <input
            name="note"
            maxLength={240}
            placeholder="VD: Đổi sang ca tối, hoán ca với B…"
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="danger" size="md" onClick={() => void cancelAssignment()} disabled={submitting || cancelling}>
            <XCircle size={15} /> {cancelling ? "Đang huỷ…" : "Huỷ ca"}
          </Button>
          <span className="flex gap-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>Đóng</Button>
            <Button type="submit" variant="primary" size="md" disabled={submitting || cancelling}>
              <CheckCircle2 size={15} /> {submitting ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function AdjustAttendanceModal({
  log,
  onClose,
  onSaved
}: {
  log: StaffOperationsBundle["attendanceFeed"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Local time format YYYY-MM-DDTHH:mm cho input datetime-local
  function toLocalInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60_000);
    return local.toISOString().slice(0, 16);
  }

  return (
    <Modal open onClose={onClose} title={`Sửa giờ chấm công: ${log.fullName}`} subtitle="Audit log sẽ ghi nhận lý do" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            fd.set("attendanceLogId", log.id);
            fd.set("staffMemberId", log.staffMemberId);
            const { adjustStaffAttendanceAction } = await import("@/app/dashboard/actions/staff");
            const res = await adjustStaffAttendanceAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không sửa được công");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3 text-[length:var(--d-fs-xs)]">
          <p className="d-eyebrow text-[var(--d-text-faint)]">Bản gốc</p>
          <p className="mt-1">
            Vào: <strong className="text-[var(--d-text)]">{new Date(log.clockInAt).toLocaleString("vi-VN")}</strong>
          </p>
          <p>
            Ra: <strong className="text-[var(--d-text)]">{log.clockOutAt ? new Date(log.clockOutAt).toLocaleString("vi-VN") : "Chưa kết ca"}</strong>
          </p>
          <p>Ca: {log.shiftName ?? "—"} · Chi nhánh: {log.branchName ?? "—"} · Nguồn: {log.source}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giờ vào ca (sửa)</span>
            <input
              name="clockInAt"
              type="datetime-local"
              defaultValue={toLocalInput(log.clockInAt)}
              required
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giờ ra ca (tuỳ chọn)</span>
            <input
              name="clockOutAt"
              type="datetime-local"
              defaultValue={toLocalInput(log.clockOutAt)}
              className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Lý do sửa (bắt buộc, ≥ 2 ký tự)</span>
          <textarea
            name="note"
            required
            minLength={2}
            maxLength={240}
            placeholder="VD: Quên kết ca, GPS sai vị trí, wifi mất kết nối…"
            className="min-h-20 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          />
        </label>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <CheckCircle2 size={15} /> {submitting ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type AdvTab = "contracts" | "documents" | "reviews" | "devices" | "roles" | "incidents" | "security";

function AdvancedStaffPanel({
  bundle,
  onChanged
}: {
  bundle: StaffOperationsBundle;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<AdvTab>("contracts");
  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as AdvTab)}
        tabs={[
          { key: "contracts", label: "HĐLĐ", count: bundle.contracts.length },
          { key: "documents", label: "Tài liệu", count: bundle.documents.length },
          { key: "reviews", label: "Đánh giá", count: bundle.reviews.length },
          { key: "devices", label: "Thiết bị", count: bundle.devices.length },
          { key: "incidents", label: "Sự cố", count: bundle.incidents.length },
          { key: "roles", label: "Phân quyền", count: bundle.roles?.length ?? 0 },
          { key: "security", label: "Bảo mật" }
        ]}
      />

      {tab === "contracts" ? <ContractsPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "documents" ? <DocumentsPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "reviews" ? <ReviewsPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "devices" ? <DevicesPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "incidents" ? <IncidentsPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "roles" ? <RolesPanel bundle={bundle} onChanged={onChanged} /> : null}
      {tab === "security" ? <SecurityPanel bundle={bundle} onChanged={onChanged} /> : null}
    </div>
  );
}

const INCIDENT_SEVERITY_LABEL: Record<string, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp"
};
const INCIDENT_SEVERITY_TONE: Record<string, "neutral" | "info" | "orange" | "danger"> = {
  low: "neutral",
  normal: "info",
  high: "orange",
  urgent: "danger"
};
const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: "Mới",
  reviewing: "Đang xử lý",
  resolved: "Đã xử lý",
  dismissed: "Bỏ qua"
};
const INCIDENT_STATUS_TONE: Record<string, "orange" | "info" | "ok" | "neutral"> = {
  open: "orange",
  reviewing: "info",
  resolved: "ok",
  dismissed: "neutral"
};

function IncidentsPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const incidents = bundle.incidents.filter((i) =>
    filter === "all" ? true : i.status === "open" || i.status === "reviewing"
  );

  async function review(incidentId: string, status: "reviewing" | "resolved" | "dismissed") {
    if (pendingId) return;
    setPendingId(incidentId);
    const fd = new FormData();
    fd.set("incidentId", incidentId);
    fd.set("status", status);
    fd.set(
      "note",
      status === "reviewing"
        ? "Tiếp nhận xử lý từ Dashboard v2"
        : status === "resolved"
          ? "Đã xử lý từ Dashboard v2"
          : "Bỏ qua báo cáo từ Dashboard v2"
    );
    try {
      const { reviewStaffIncidentReportAction } = await import("@/app/dashboard/actions/staff");
      const res = await reviewStaffIncidentReportAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(res.success ?? "Đã cập nhật báo cáo sự cố");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được báo cáo sự cố");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Báo cáo sự cố do nhân viên gửi từ app PWA — tiếp nhận, đánh dấu đã xử lý hoặc bỏ qua (mọi thao tác ghi audit log).
        </p>
        <div className="inline-flex rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-8 items-center rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-semibold transition",
                filter === f
                  ? "bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]"
                  : "text-[var(--d-text-muted)] hover:text-[var(--d-text)]"
              )}
            >
              {f === "open" ? "Cần xử lý" : "Tất cả"}
            </button>
          ))}
        </div>
      </div>
      {incidents.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={filter === "open" ? "Không có sự cố cần xử lý" : "Chưa có báo cáo sự cố nào"}
          description="Nhân viên có thể gửi báo cáo sự cố (mất tiền, hỏng thiết bị, mâu thuẫn khách hàng…) từ app PWA."
        />
      ) : (
        <div className="grid gap-2">
          {incidents.map((i) => {
            const isClosed = i.status === "resolved" || i.status === "dismissed";
            return (
              <article key={i.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 shadow-[var(--d-sh-sm)]">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{i.title}</p>
                    <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      {i.staffName}
                      {i.branchName ? ` · ${i.branchName}` : ""}
                      {" · "}{new Date(i.createdAt).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={INCIDENT_SEVERITY_TONE[i.severity] ?? "neutral"}>{INCIDENT_SEVERITY_LABEL[i.severity] ?? i.severity}</Badge>
                    <Badge tone={INCIDENT_STATUS_TONE[i.status] ?? "neutral"}>{INCIDENT_STATUS_LABEL[i.status] ?? i.status}</Badge>
                  </span>
                </header>
                <p className="mt-2 whitespace-pre-wrap text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{i.description}</p>
                {i.attachmentUrl ? (
                  <a href={i.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] hover:underline">
                    Xem đính kèm →
                  </a>
                ) : null}
                {!isClosed ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                    {i.status === "open" ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => void review(i.id, "reviewing")} disabled={pendingId === i.id}>
                        <Clock3 size={13} /> Tiếp nhận
                      </Button>
                    ) : null}
                    <Button type="button" variant="secondary" size="sm" onClick={() => void review(i.id, "dismissed")} disabled={pendingId === i.id}>
                      <XCircle size={13} /> Bỏ qua
                    </Button>
                    <Button type="button" variant="primary" size="sm" onClick={() => void review(i.id, "resolved")} disabled={pendingId === i.id}>
                      <CheckCircle2 size={13} /> Đã xử lý
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
                    {i.status === "resolved" ? "Đã xử lý" : "Đã bỏ qua"}
                    {i.resolvedAt ? ` lúc ${new Date(i.resolvedAt).toLocaleString("vi-VN")}` : ""}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SecurityPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState<NonNullable<StaffActionState["temporaryCredentials"]>>([]);

  const resettableMembers = bundle.members.filter((m) => m.accountStatus !== "blocked" && isOperationalMember(m));

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === resettableMembers.length ? new Set() : new Set(resettableMembers.map((m) => m.userId))
    );
  }

  async function bulkReset() {
    if (submitting) return;
    if (selected.size === 0) {
      toast.error("Chọn ít nhất một nhân viên để cấp lại mật khẩu.");
      return;
    }
    if (!window.confirm(`Cấp lại mật khẩu app cho ${selected.size} nhân viên? Mọi phiên cũ của họ sẽ bị đăng xuất.`)) {
      return;
    }
    setSubmitting(true);
    setCredentials([]);
    try {
      const fd = new FormData();
      fd.set("userIds", JSON.stringify(Array.from(selected)));
      fd.set("reason", "Chủ quán cấp lại mật khẩu app hàng loạt từ Dashboard v2");
      const { resetStaffAppPasswordsAction } = await import("@/app/dashboard/actions/staff");
      const res = await resetStaffAppPasswordsAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      setCredentials(res.temporaryCredentials ?? []);
      setSelected(new Set());
      toast.success(res.success ?? "Đã cấp lại mật khẩu hàng loạt");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cấp lại được mật khẩu hàng loạt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="d-eyebrow">Reset mật khẩu app hàng loạt</p>
            <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              Cấp lại mật khẩu app cho nhiều nhân viên cùng lúc (ví dụ sau sự cố lộ mật khẩu). Mỗi nhân viên nhận mật khẩu tạm riêng, mọi phiên cũ tự logout.
            </p>
          </div>
          <Button type="button" variant="primary" size="md" onClick={() => void bulkReset()} disabled={submitting || selected.size === 0}>
            <KeyRound size={14} /> {submitting ? "Đang cấp…" : `Reset ${selected.size > 0 ? `(${selected.size})` : "hàng loạt"}`}
          </Button>
        </header>

        {resettableMembers.length === 0 ? (
          <p className="mt-3 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Không có nhân viên nào đủ điều kiện cấp lại mật khẩu.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
              <input
                type="checkbox"
                checked={selected.size === resettableMembers.length && resettableMembers.length > 0}
                onChange={toggleAll}
                className="h-4 w-4 accent-[var(--d-orange)]"
              />
              Chọn tất cả ({resettableMembers.length})
            </label>
            <div className="grid max-h-[320px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {resettableMembers.map((m) => {
                const checked = selected.has(m.userId);
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-[var(--d-r-sm)] border px-3 py-2 transition",
                      checked ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface-2)]"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(m.userId)}
                      className="h-4 w-4 accent-[var(--d-orange)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{m.fullName}</span>
                      <span className="block truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
                        {m.employeeCode ? `Mã ${m.employeeCode}` : "Chưa cấp mã"} · {ROLE_LABEL[m.roleCode] ?? m.roleTitle}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {credentials.length > 0 ? (
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)] p-[var(--d-s-4)]">
          <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">
            Mật khẩu tạm ({credentials.length}) — gửi cho từng nhân viên qua kênh an toàn
          </p>
          <div className="mt-3 grid gap-1.5">
            {credentials.map((c) => (
              <div key={c.userId} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2.5 text-[length:var(--d-fs-xs)]">
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--d-text)]">
                  {c.staffName}
                  {c.employeeCode ? <span className="ml-1 font-mono text-[var(--d-text-muted)]">({c.employeeCode})</span> : null}
                </span>
                <span className="d-num shrink-0 break-all font-mono font-bold text-[var(--d-text)]">{c.temporaryPassword}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">
            Danh sách này chỉ hiển thị một lần. Nhân viên sẽ được yêu cầu đổi mật khẩu sau lần đăng nhập đầu.
          </p>
        </section>
      ) : null}
    </div>
  );
}

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  official: "Chính thức",
  probation: "Thử việc",
  part_time: "Bán thời gian",
  service: "Dịch vụ / khoán",
  other: "Khác"
};
const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  active: "Đang hiệu lực",
  expired: "Hết hạn",
  terminated: "Đã chấm dứt"
};
const ESIGN_LABEL: Record<string, string> = {
  draft: "Nháp",
  pending_employee: "Chờ nhân viên ký",
  pending_employer: "Chờ chủ quán ký",
  signed: "Đã ký",
  declined: "Từ chối",
  voided: "Vô hiệu"
};
const ESIGN_TONE: Record<string, "ok" | "orange" | "danger" | "neutral"> = {
  signed: "ok",
  pending_employee: "orange",
  pending_employer: "orange",
  declined: "danger",
  voided: "danger",
  draft: "neutral"
};

function ContractsPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Hợp đồng lao động giúp chủ quán quản lý: thử việc / chính thức / part-time / dịch vụ — kèm e-sign trạng thái.
        </p>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Tạo HĐLĐ
        </Button>
      </div>
      {bundle.contracts.length === 0 ? (
        <EmptyState
          icon={<UserCog size={20} />}
          title="Chưa có HĐLĐ nào"
          description="Tạo hợp đồng để chuẩn hóa quan hệ lao động — bao gồm chế độ lương, giờ làm và nghỉ."
          action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Tạo HĐLĐ</Button>}
        />
      ) : (
        <div className="grid gap-2">
          {bundle.contracts.map((c) => (
            <article key={c.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3 shadow-[var(--d-sh-sm)]">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                    {c.staffName} · {c.contractNumber || "Không số"}
                  </p>
                  <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                    {CONTRACT_TYPE_LABEL[c.contractType] ?? c.contractType}
                    {c.jobTitle ? ` · ${c.jobTitle}` : ""}
                    {c.workLocation ? ` · ${c.workLocation}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 gap-1.5">
                  <Badge tone={c.status === "active" ? "ok" : c.status === "expired" || c.status === "terminated" ? "danger" : "neutral"}>
                    {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                  <Badge tone={ESIGN_TONE[c.eSignatureStatus] ?? "neutral"}>{ESIGN_LABEL[c.eSignatureStatus] ?? c.eSignatureStatus}</Badge>
                </span>
              </header>
              <div className="mt-2 grid gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)] sm:grid-cols-3">
                <span>Hiệu lực: <strong className="text-[var(--d-text)]">{c.startDate}{c.endDate ? ` → ${c.endDate}` : " → vĩnh viễn"}</strong></span>
                <span>Lương: <strong className="d-num text-[var(--d-text)]">{c.salaryAmount ? `${c.salaryAmount.toLocaleString("vi-VN")}₫` : "—"}</strong></span>
                <span>Trả: <strong className="text-[var(--d-text)]">{c.salaryPaymentMethod || "—"}</strong></span>
              </div>
              {c.signedDocumentUrl ? (
                <a href={c.signedDocumentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] hover:underline">
                  Xem PDF đã ký →
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {createOpen ? <CreateContractModal bundle={bundle} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onChanged(); }} /> : null}
    </div>
  );
}

function CreateContractModal({
  bundle,
  onClose,
  onCreated
}: {
  bundle: StaffOperationsBundle;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open onClose={onClose} title="Tạo HĐLĐ" subtitle="Nhân sự" size="lg">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const { createStaffContractAction } = await import("@/app/dashboard/actions/staff");
            const res = await createStaffContractAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã tạo HĐLĐ");
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không tạo được HĐLĐ");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormSelect label="Nhân viên" name="staffMemberId" options={bundle.members.map((m) => ({ value: m.id, label: `${m.fullName}${m.employeeCode ? ` (${m.employeeCode})` : ""}` }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect label="Loại HĐ" name="contractType" defaultValue="official" options={[
            { value: "official", label: "Chính thức" },
            { value: "probation", label: "Thử việc" },
            { value: "part_time", label: "Bán thời gian" },
            { value: "service", label: "Dịch vụ / khoán" },
            { value: "other", label: "Khác" }
          ]} />
          <FormSelect label="Template" name="templateCode" defaultValue="restaurant_fixed_term" options={[
            { value: "restaurant_fixed_term", label: "Chính thức xác định thời hạn" },
            { value: "restaurant_indefinite", label: "Chính thức không xác định" },
            { value: "restaurant_part_time", label: "Part-time" },
            { value: "restaurant_probation", label: "Thử việc" }
          ]} />
          <FormField label="Số HĐ" name="contractNumber" placeholder="VD: HD-2025-001" />
          <FormField label="Chức danh" name="jobTitle" placeholder="VD: Phục vụ ca tối" />
          <FormField label="Nơi làm việc" name="workLocation" full placeholder="Địa chỉ chi nhánh" />
          <FormField label="Lương / tháng (₫)" name="salaryAmount" type="number" placeholder="VD: 5000000" />
          <FormField label="Hình thức trả" name="salaryPaymentMethod" placeholder="VD: chuyển khoản hàng tháng" />
          <FormField label="Bắt đầu" name="startDate" type="date" required />
          <FormField label="Kết thúc (tuỳ chọn)" name="endDate" type="date" />
          <FormSelect label="Trạng thái e-sign" name="eSignatureStatus" defaultValue="draft" options={[
            { value: "draft", label: "Nháp" },
            { value: "pending_employee", label: "Chờ NV ký" },
            { value: "pending_employer", label: "Chờ chủ quán ký" },
            { value: "signed", label: "Đã ký" }
          ]} />
          <FormField label="Provider e-contract" name="eContractProvider" placeholder="VD: VNPT, FPT eSign" />
          <FormField label="Mã e-contract" name="eContractId" />
          <FormField label="Link PDF đã ký" name="signedDocumentUrl" type="url" placeholder="https://" />
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giờ làm việc</span>
            <textarea name="workingTime" maxLength={600} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" placeholder="VD: 8h/ngày, ca sáng 7h-15h, ca tối 15h-22h" />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Giờ nghỉ</span>
            <textarea name="restTime" maxLength={600} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" placeholder="VD: nghỉ 30 phút giữa ca, 1 ngày/tuần" />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú</span>
            <textarea name="note" maxLength={500} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
          </label>
        </div>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang tạo…" : "Tạo HĐLĐ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const DOC_TYPE_LABEL: Record<string, string> = {
  identity_card: "CCCD/CMND",
  health_certificate: "Giấy khám sức khỏe",
  contract: "HĐLĐ",
  training: "Chứng chỉ đào tạo",
  other: "Khác"
};
const DOC_STATUS_TONE: Record<string, "ok" | "orange" | "danger"> = {
  complete: "ok",
  missing: "orange",
  expired: "danger"
};

function DocumentsPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Lưu trữ CCCD, sức khỏe, chứng chỉ đào tạo của nhân viên — yêu cầu pháp lý cho ngành F&B.
        </p>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Thêm tài liệu
        </Button>
      </div>
      {bundle.documents.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={20} />}
          title="Chưa có tài liệu nào"
          description="Lưu CCCD, giấy khám sức khỏe để đáp ứng kiểm tra của cơ quan an toàn thực phẩm."
          action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Thêm tài liệu</Button>}
        />
      ) : (
        <div className="grid gap-2">
          {bundle.documents.map((d) => (
            <article key={d.id} className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                  {d.staffName} · {d.documentName}
                </span>
                <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                  {DOC_TYPE_LABEL[d.documentType] ?? d.documentType}
                  {d.fileSizeBytes ? ` · ${(d.fileSizeBytes / 1024).toFixed(0)} KB` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {d.fileUrl ? (
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]">
                    Xem file
                  </a>
                ) : null}
                <Badge tone={DOC_STATUS_TONE[d.status] ?? "neutral"}>
                  {d.status === "complete" ? "Đầy đủ" : d.status === "missing" ? "Thiếu" : "Hết hạn"}
                </Badge>
              </span>
            </article>
          ))}
        </div>
      )}
      {createOpen ? <CreateDocumentModal bundle={bundle} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onChanged(); }} /> : null}
    </div>
  );
}

function CreateDocumentModal({
  bundle,
  onClose,
  onCreated
}: {
  bundle: StaffOperationsBundle;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open onClose={onClose} title="Thêm tài liệu" subtitle="Nhân sự" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const { createStaffDocumentAction } = await import("@/app/dashboard/actions/staff");
            const res = await createStaffDocumentAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã thêm tài liệu");
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không thêm được tài liệu");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormSelect label="Nhân viên" name="staffMemberId" options={bundle.members.map((m) => ({ value: m.id, label: m.fullName }))} />
        <FormField label="Tên tài liệu" name="documentName" required placeholder="VD: CCCD Nguyễn Văn A" />
        <FormSelect label="Loại tài liệu" name="documentType" defaultValue="identity_card" options={[
          { value: "identity_card", label: "CCCD / CMND" },
          { value: "health_certificate", label: "Giấy khám sức khỏe" },
          { value: "contract", label: "Hợp đồng lao động" },
          { value: "training", label: "Chứng chỉ đào tạo" },
          { value: "other", label: "Khác" }
        ]} />
        <FormField label="Link file (R2 / Drive / OneDrive)" name="fileUrl" type="url" placeholder="https://" />
        <FormSelect label="Trạng thái" name="status" defaultValue="complete" options={[
          { value: "complete", label: "Đầy đủ" },
          { value: "missing", label: "Thiếu" },
          { value: "expired", label: "Hết hạn" }
        ]} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú</span>
          <textarea name="note" maxLength={500} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
        </label>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang lưu…" : "Lưu tài liệu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewsPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Đánh giá hiệu suất định kỳ — gắn với chu kỳ lương / xét tăng lương / khen thưởng.
        </p>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Tạo đánh giá
        </Button>
      </div>
      {bundle.reviews.length === 0 ? (
        <EmptyState
          icon={<Star size={20} />}
          title="Chưa có đánh giá nào"
          description="Đánh giá định kỳ giúp chủ quán quyết định tăng lương / khen thưởng / cảnh cáo."
          action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Tạo đánh giá</Button>}
        />
      ) : (
        <div className="grid gap-2">
          {bundle.reviews.map((r) => (
            <article key={r.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{r.staffName}</p>
                  <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.periodLabel}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="d-num inline-flex items-center gap-0.5 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-orange-600)]">
                    <Star size={14} className="fill-current" /> {r.score.toFixed(1)}
                  </span>
                  <Badge tone={r.status === "completed" ? "ok" : r.status === "archived" ? "neutral" : "orange"}>
                    {r.status === "completed" ? "Hoàn tất" : r.status === "archived" ? "Lưu trữ" : "Nháp"}
                  </Badge>
                </div>
              </header>
              {r.note ? <p className="mt-2 line-clamp-3 text-[length:var(--d-fs-xs)] italic text-[var(--d-text-muted)]">"{r.note}"</p> : null}
              <p className="mt-2 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
                Tạo: {new Date(r.createdAt).toLocaleDateString("vi-VN")}
              </p>
            </article>
          ))}
        </div>
      )}
      {createOpen ? <CreateReviewModal bundle={bundle} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onChanged(); }} /> : null}
    </div>
  );
}

function CreateReviewModal({
  bundle,
  onClose,
  onCreated
}: {
  bundle: StaffOperationsBundle;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(4);
  return (
    <Modal open onClose={onClose} title="Đánh giá nhân viên" subtitle="Nhân sự" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            fd.set("score", String(score));
            const { createStaffReviewAction } = await import("@/app/dashboard/actions/staff");
            const res = await createStaffReviewAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã lưu đánh giá");
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không lưu được đánh giá");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormSelect label="Nhân viên" name="staffMemberId" options={bundle.members.map((m) => ({ value: m.id, label: m.fullName }))} />
        <FormField label="Kỳ đánh giá" name="periodLabel" required placeholder="VD: Tháng 06/2025, Q2 2025" />

        <div className="grid gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Điểm số (1-5)</span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-[var(--d-r-md)] border transition",
                  n <= score
                    ? "border-[var(--d-orange)] bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
                    : "border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-faint)]"
                )}
                aria-label={`${n} sao`}
              >
                <Star size={18} className={n <= score ? "fill-current" : ""} />
              </button>
            ))}
            <span className="d-num ml-2 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{score.toFixed(1)}</span>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Nhận xét (tuỳ chọn)</span>
          <textarea name="note" maxLength={500} placeholder="VD: Phục vụ nhanh, thái độ tốt, cần cải thiện kỹ năng pha chế." className="min-h-24 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
        </label>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Star size={15} /> {submitting ? "Đang lưu…" : "Lưu đánh giá"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const DEVICE_TYPE_LABEL: Record<string, string> = {
  phone: "Điện thoại",
  tablet: "Máy tính bảng",
  pos: "Máy POS",
  cash_drawer: "Két tiền",
  other: "Khác"
};

function DevicesPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggleTrust(deviceId: string, currentlyTrusted: boolean) {
    if (pendingId) return;
    setPendingId(deviceId);
    const fd = new FormData();
    fd.set("deviceId", deviceId);
    fd.set("trustedForAttendance", String(!currentlyTrusted));
    fd.set("reason", currentlyTrusted ? "Gỡ tin cậy chấm công từ dashboard" : "Duyệt tin cậy chấm công từ dashboard");
    try {
      const { updateStaffDeviceTrustAction } = await import("@/app/dashboard/actions/staff");
      const res = await updateStaffDeviceTrustAction(undefined, fd);
      if (res.error) throw new Error(res.error);
      toast.success(currentlyTrusted ? "Đã gỡ tin cậy" : "Đã duyệt thiết bị tin cậy");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Quản lý thiết bị chấm công tin cậy. Chỉ thiết bị "Tin cậy" mới được dùng để chấm công GPS / Wi-Fi.
        </p>
        <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Đăng ký thiết bị
        </Button>
      </div>
      {bundle.devices.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={20} />}
          title="Chưa có thiết bị nào"
          description="Đăng ký điện thoại / tablet của nhân viên hoặc máy POS quán."
          action={<Button variant="primary" size="md" onClick={() => setCreateOpen(true)}><Plus size={15} /> Đăng ký thiết bị</Button>}
        />
      ) : (
        <div className="grid gap-2">
          {bundle.devices.map((d) => {
            const memberName = d.staffMemberId ? bundle.members.find((m) => m.id === d.staffMemberId)?.fullName : null;
            const trusted = d.trustedForAttendance;
            return (
              <article key={d.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                      {d.deviceName}
                      {memberName ? <span className="ml-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">— {memberName}</span> : null}
                    </p>
                    <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      {DEVICE_TYPE_LABEL[d.deviceType] ?? d.deviceType}
                      {d.serialNumber ? ` · S/N: ${d.serialNumber}` : ""}
                      {d.issuedAt ? ` · cấp ${d.issuedAt}` : ""}
                    </p>
                  </div>
                  <Badge tone={trusted ? "ok" : "neutral"}>{trusted ? "Tin cậy" : "Chưa tin cậy"}</Badge>
                </header>
                {d.note ? <p className="mt-2 line-clamp-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{d.note}</p> : null}
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant={trusted ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => void toggleTrust(d.id, trusted)}
                    disabled={pendingId === d.id}
                  >
                    {trusted ? <><XCircle size={13} /> Gỡ tin cậy</> : <><CheckCircle2 size={13} /> Duyệt tin cậy</>}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {createOpen ? <CreateDeviceModal bundle={bundle} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onChanged(); }} /> : null}
    </div>
  );
}

function CreateDeviceModal({
  bundle,
  onClose,
  onCreated
}: {
  bundle: StaffOperationsBundle;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <Modal open onClose={onClose} title="Đăng ký thiết bị" subtitle="Quản lý thiết bị" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const { createStaffDeviceAction } = await import("@/app/dashboard/actions/staff");
            const res = await createStaffDeviceAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã đăng ký thiết bị");
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không đăng ký được thiết bị");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormField label="Tên thiết bị" name="deviceName" required placeholder="VD: iPhone 13 của A, POS quầy 1" />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormSelect label="Loại thiết bị" name="deviceType" defaultValue="phone" options={[
            { value: "phone", label: "Điện thoại" },
            { value: "tablet", label: "Máy tính bảng" },
            { value: "pos", label: "Máy POS" },
            { value: "cash_drawer", label: "Két tiền" },
            { value: "other", label: "Khác" }
          ]} />
          <FormSelect label="Gán cho nhân viên (tuỳ chọn)" name="staffMemberId" defaultValue="" options={[
            { value: "", label: "Thiết bị chung của quán" },
            ...bundle.members.map((m) => ({ value: m.id, label: m.fullName }))
          ]} />
          <FormField label="Số seri" name="serialNumber" placeholder="VD: SN12345" />
          <FormField label="Ngày cấp" name="issuedAt" type="date" defaultValue={todayIso} required />
          <FormField label="Fingerprint (tuỳ chọn)" name="deviceFingerprint" full placeholder="Để trống nếu chưa có — chỉ cần khi duyệt chấm công" />
        </div>
        <label className="flex h-10 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold">
          <input type="checkbox" name="trustedForAttendance" value="true" className="h-4 w-4 accent-[var(--d-orange)]" />
          Cho phép thiết bị này dùng chấm công (cần fingerprint)
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú</span>
          <textarea name="note" maxLength={500} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" />
        </label>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang đăng ký…" : "Đăng ký thiết bị"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RolesPanel({ bundle, onChanged }: { bundle: StaffOperationsBundle; onChanged: () => void }) {
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const editing = bundle.roles?.find((r) => r.id === editingRoleId) ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Mỗi role có một bộ quyền chi tiết. Có thể clone role hệ thống để tạo role custom.
        </p>
        <Button variant="primary" size="md" onClick={() => setCloneOpen(true)}>
          <Plus size={15} /> Tạo role mới
        </Button>
      </div>
      <div className="grid gap-2">
        {bundle.roles?.map((r) => (
          <article key={r.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{r.title}</p>
                <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.description}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                {r.system ? <Badge tone="info">Hệ thống</Badge> : <Badge tone="neutral">Custom</Badge>}
                <Badge tone={r.scope === "ADMIN" ? "jade" : "orange"}>{r.scope === "ADMIN" ? "Admin" : "Staff"}</Badge>
              </span>
            </header>
            <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
              <strong className="d-num text-[var(--d-text)]">{r.permissionCount}</strong> quyền
              {r.dangerPermissionCount > 0 ? <> · <strong className="text-[var(--d-orange-600)]">{r.dangerPermissionCount}</strong> quyền nguy hiểm</> : null}
            </p>
            {r.preview ? (
              <p className="mt-2 line-clamp-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{r.preview}</p>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditingRoleId(r.id)}>
                <Settings2 size={13} /> Chỉnh quyền chi tiết
              </Button>
            </div>
          </article>
        ))}
      </div>

      {editing ? (
        <RolePermissionsModal
          role={editing}
          permissionGroups={bundle.permissionGroups}
          onClose={() => setEditingRoleId(null)}
          onSaved={() => {
            setEditingRoleId(null);
            onChanged();
          }}
        />
      ) : null}

      {cloneOpen ? (
        <CloneRoleModal
          roles={bundle.roles ?? []}
          onClose={() => setCloneOpen(false)}
          onCreated={() => {
            setCloneOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function RolePermissionsModal({
  role,
  permissionGroups,
  onClose,
  onSaved
}: {
  role: StaffOperationsBundle["roles"][number];
  permissionGroups: StaffOperationsBundle["permissionGroups"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissions));

  function togglePerm(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose} title={`Quyền cho role: ${role.title}`} subtitle="Phân quyền chi tiết" size="lg">
      <form
        action={async () => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const fd = new FormData();
            fd.set("roleId", role.id);
            for (const key of selected) fd.append("permissions", key);
            const { updateStaffRolePermissionsAction } = await import("@/app/dashboard/actions/staff");
            const res = await updateStaffRolePermissionsAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã cập nhật quyền role");
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không cập nhật được quyền");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Đã chọn <strong className="d-num text-[var(--d-text)]">{selected.size}</strong> quyền cho role này.
          {role.system ? " Đây là role hệ thống — sửa quyền có thể ảnh hưởng nhiều nhân viên đang dùng." : ""}
        </p>

        <div className="grid gap-3 max-h-[420px] overflow-y-auto pr-1">
          {permissionGroups.map((g) => (
            <section key={g.key} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <p className="d-eyebrow">{g.title}</p>
              {g.description ? <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{g.description}</p> : null}
              <div className="mt-3 grid gap-1.5">
                {g.permissions.map((permKey) => {
                  const checked = selected.has(permKey);
                  const isDanger = permKey.endsWith(".cancel") || permKey.endsWith(".refund") || permKey.endsWith(".archive") || permKey.endsWith(".delete") || permKey === "settings.manage";
                  return (
                    <label key={permKey} className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-[var(--d-r-sm)] border px-3 py-2 transition",
                      checked
                        ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]"
                        : "border-[var(--d-line)] bg-[var(--d-surface-2)]"
                    )}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePerm(permKey)}
                        className="h-4 w-4 accent-[var(--d-orange)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{staffPermissionLabel(permKey)}</span>
                        <span className="block font-mono text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{permKey}</span>
                      </span>
                      {isDanger ? <Badge tone="orange">Nguy hiểm</Badge> : null}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting || selected.size === 0}>
            <CheckCircle2 size={15} /> {submitting ? "Đang lưu…" : "Lưu quyền"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CloneRoleModal({
  roles,
  onClose,
  onCreated
}: {
  roles: StaffOperationsBundle["roles"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open onClose={onClose} title="Clone role" subtitle="Tạo role mới từ template hiện có" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const { cloneStaffRoleAction } = await import("@/app/dashboard/actions/staff");
            const res = await cloneStaffRoleAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            toast.success("Đã tạo role mới");
            onCreated();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không tạo được role");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <FormSelect label="Clone từ role" name="sourceRoleId" options={roles.map((r) => ({ value: r.id, label: `${r.title} (${r.permissionCount} quyền)` }))} />
        <FormField label="Tên role mới" name="name" required placeholder="VD: Phục vụ cuối tuần, Bếp trưởng" />
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Mô tả</span>
          <textarea name="description" maxLength={300} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" placeholder="VD: Có quyền cashier nhưng không xoá đơn" />
        </label>
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          Role mới sẽ được kế thừa toàn bộ quyền của role gốc. Sau đó bấm "Chỉnh quyền chi tiết" để bật/tắt từng quyền.
        </p>
        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <Plus size={15} /> {submitting ? "Đang tạo…" : "Tạo role"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeductionsModal({
  deductions,
  onClose,
  onSaved
}: {
  deductions: StaffPayrollDeductions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [enableTax, setEnableTax] = useState(deductions.enablePersonalIncomeTax);
  return (
    <Modal open onClose={onClose} title="Cấu hình BHXH / Thuế TNCN" subtitle="Theo NĐ 145/2020 + Luật Thuế TNCN VN" size="lg">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            fd.set("enablePersonalIncomeTax", String(enableTax));
            const { updateStaffPayrollDeductionsAction } = await import("@/app/dashboard/actions/staff");
            const res = await updateStaffPayrollDeductionsAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không lưu được cấu hình");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-4"
      >
        <section className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="d-eyebrow">Tỉ lệ NV đóng (% lương đóng BH)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <FormField label="BHXH" name="bhxhEmployeePercent" type="number" defaultValue={String(deductions.bhxhEmployeePercent)} />
            <FormField label="BHYT" name="bhytEmployeePercent" type="number" defaultValue={String(deductions.bhytEmployeePercent)} />
            <FormField label="BHTN" name="bhtnEmployeePercent" type="number" defaultValue={String(deductions.bhtnEmployeePercent)} />
          </div>
        </section>

        <section className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="d-eyebrow">Tỉ lệ NSDLĐ đóng (% — chỉ hiển thị, không trừ vào lương net)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <FormField label="BHXH" name="bhxhEmployerPercent" type="number" defaultValue={String(deductions.bhxhEmployerPercent)} />
            <FormField label="BHYT" name="bhytEmployerPercent" type="number" defaultValue={String(deductions.bhytEmployerPercent)} />
            <FormField label="BHTN" name="bhtnEmployerPercent" type="number" defaultValue={String(deductions.bhtnEmployerPercent)} />
          </div>
        </section>

        <section className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <p className="d-eyebrow">Mức trần / sàn BHXH</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <FormField label="Sàn (LCS, ₫)" name="insuranceBaseMin" type="number" defaultValue={String(deductions.insuranceBaseMin)} />
            <FormField label="Trần (₫, mặc định 20× LCS)" name="insuranceBaseMax" type="number" defaultValue={String(deductions.insuranceBaseMax)} />
          </div>
        </section>

        <section className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
          <header className="flex items-center justify-between gap-2">
            <p className="d-eyebrow">Thuế TNCN luỹ tiến từng phần</p>
            <label className="flex items-center gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
              <input
                type="checkbox"
                checked={enableTax}
                onChange={(e) => setEnableTax(e.target.checked)}
                className="h-4 w-4 accent-[var(--d-orange)]"
              />
              Bật khấu trừ thuế TNCN
            </label>
          </header>
          <div className={cn("mt-2 grid gap-3 sm:grid-cols-2", !enableTax && "opacity-50 pointer-events-none")}>
            <FormField label="Giảm trừ bản thân (₫/tháng)" name="personalRelief" type="number" defaultValue={String(deductions.personalRelief)} />
            <FormField label="Giảm trừ phụ thuộc (₫/người/tháng)" name="dependentReliefPerPerson" type="number" defaultValue={String(deductions.dependentReliefPerPerson)} />
          </div>
          <p className="mt-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Biểu thuế 7 bậc theo Luật Thuế TNCN VN (Điều 22): 5% / 10% / 15% / 20% / 25% / 30% / 35% — áp tự động khi tính lương net.
          </p>
        </section>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <CheckCircle2 size={15} /> {submitting ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PayrollProfileModal({
  member,
  profile,
  onClose,
  onSaved
}: {
  member: StaffOpsMember;
  profile: StaffPayrollProfile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [enrolled, setEnrolled] = useState(profile?.enrolledInInsurance ?? false);
  const [applyTax, setApplyTax] = useState(profile?.applyPersonalIncomeTax ?? false);
  return (
    <Modal open onClose={onClose} title={`Hồ sơ lương: ${member.fullName}`} subtitle="Cấu hình lương cá nhân + BHXH" size="md">
      <form
        action={async (fd) => {
          if (submitting) return;
          setSubmitting(true);
          try {
            fd.set("staffMemberId", member.id);
            fd.set("enrolledInInsurance", String(enrolled));
            fd.set("applyPersonalIncomeTax", String(applyTax));
            const { updateStaffPayrollProfileAction } = await import("@/app/dashboard/actions/staff");
            const res = await updateStaffPayrollProfileAction(undefined, fd);
            if (res.error) throw new Error(res.error);
            onSaved();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Không lưu được hồ sơ");
          } finally {
            setSubmitting(false);
          }
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Lương cơ bản (₫/tháng)" name="baseSalary" type="number" defaultValue={String(profile?.baseSalary ?? 0)} required />
          <FormField label="Lương theo giờ (₫, tuỳ chọn)" name="hourlyRate" type="number" defaultValue={profile?.hourlyRate ? String(profile.hourlyRate) : ""} placeholder="Để trống dùng mức chung" />
          <FormField label="Số người phụ thuộc" name="dependentCount" type="number" defaultValue={String(profile?.dependentCount ?? 0)} />
          <FormField label="Mức đóng BHXH (₫, tuỳ chọn)" name="insuranceBaseAmount" type="number" defaultValue={profile?.insuranceBaseAmount ? String(profile.insuranceBaseAmount) : ""} placeholder="Để trống dùng lương cơ bản" />
        </div>

        <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-sm)] font-semibold">
            <input
              type="checkbox"
              checked={enrolled}
              onChange={(e) => setEnrolled(e.target.checked)}
              className="h-4 w-4 accent-[var(--d-orange)]"
            />
            Tham gia BHXH/BHYT/BHTN bắt buộc
          </label>
          <label className="flex items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-sm)] font-semibold">
            <input
              type="checkbox"
              checked={applyTax}
              onChange={(e) => setApplyTax(e.target.checked)}
              className="h-4 w-4 accent-[var(--d-orange)]"
            />
            Khấu trừ thuế TNCN (HĐLĐ chính thức ≥ 3 tháng)
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Ghi chú</span>
          <textarea name="note" defaultValue={profile?.note ?? ""} maxLength={500} className="min-h-16 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" placeholder="VD: Bắt đầu đóng BHXH từ tháng 06/2025" />
        </label>

        <div className="mt-1 flex justify-end gap-2 border-t border-[var(--d-line)] pt-3">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting}>
            <CheckCircle2 size={15} /> {submitting ? "Đang lưu…" : "Lưu hồ sơ lương"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
