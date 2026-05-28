"use client";

import { CalendarClock, Clock3, Fingerprint, ShieldCheck } from "lucide-react";
import type { StaffAttendanceMachine } from "./staff-attendance-machine";
import type { StaffOpsAttendanceFeedItem, StaffOpsMember, StaffOpsShiftAssignment } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { StaffMetricTile, StaffMobileEmptyState, StaffMobilePanel, StaffMobileSectionHeader, StaffStatusPill } from "./staff-mobile-primitives";
import { attendanceStateLabel, formatDate, formatTime, shiftStatusLabel } from "./staff-mobile-utils";

export function StaffTodayPanel({
  staff,
  machine,
  activeAttendance,
  latestAttendance,
  currentShift,
  todayAssignments,
  recentAttendance,
  activeDuration
}: {
  staff: StaffOpsMember;
  machine: StaffAttendanceMachine;
  activeAttendance: StaffOpsAttendanceFeedItem | null;
  latestAttendance: StaffOpsAttendanceFeedItem | null;
  currentShift: StaffOpsShiftAssignment | null;
  todayAssignments: StaffOpsShiftAssignment[];
  recentAttendance: StaffOpsAttendanceFeedItem[];
  activeDuration: string;
}) {
  const needsAttention = machine.state === "blocked" || machine.state.includes("needs") || machine.state === "queued_offline";

  return (
    <>
      <section className="admin-hero-panel rounded-[14px] p-4 text-[var(--foreground)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="dashboard-eyebrow">Hôm nay</p>
            <h1 className="dashboard-page-title mt-2">{machine.title}</h1>
            <p className="dashboard-body-copy mt-2 line-clamp-2">{activeAttendance ? `${formatTime(activeAttendance.clockInAt)} · ${activeDuration}` : currentShift ? `${currentShift.shiftName} · ${formatDate(currentShift.scheduledDate)}` : machine.detail}</p>
          </div>
          <StaffStatusPill tone={machine.state === "blocked" ? "danger" : machine.state.includes("needs") ? "warning" : "success"}>
            {machine.shortSourceLabel}
          </StaffStatusPill>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StaffMetricTile icon={<Clock3 size={16} aria-hidden="true" />} label="Thời lượng" value={activeAttendance ? activeDuration : "--"} tone={activeAttendance ? "primary" : "muted"} />
          <StaffMetricTile icon={<Fingerprint size={16} aria-hidden="true" />} label="Check-in" value={formatTime(activeAttendance?.clockInAt ?? latestAttendance?.clockInAt)} tone={activeAttendance ? "success" : "muted"} />
        </div>
      </section>

      {needsAttention ? (
        <StaffMobilePanel className={cn(machine.state === "blocked" ? "border-[var(--accent)]/30 bg-[var(--danger-soft)]" : "border-[var(--accent)]/20 bg-[var(--accent-soft)]")}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">{machine.recoveryLabel}</p>
              <p className="mt-0.5 line-clamp-1 text-xs font-medium text-[var(--muted-foreground)]">{machine.detail}</p>
            </div>
            <StaffStatusPill tone={machine.state === "blocked" ? "danger" : "warning"}>{machine.shortSourceLabel}</StaffStatusPill>
          </div>
        </StaffMobilePanel>
      ) : null}

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Ca hôm nay" action={<StaffStatusPill tone={todayAssignments.length ? "success" : "muted"}>{todayAssignments.length} ca</StaffStatusPill>} />
        <div className="grid gap-2">
          {todayAssignments.map((assignment) => (
            <article key={assignment.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{assignment.shiftName}</p>
                  <p className="mt-1 truncate text-xs font-medium text-[var(--muted-foreground)]">{formatDate(assignment.scheduledDate)} · {assignment.branchName ?? staff.primaryBranchName ?? "Toàn quán"}</p>
                </div>
                <StaffStatusPill tone={assignment.status === "cancelled" ? "danger" : assignment.status === "scheduled" ? "neutral" : "success"}>{shiftStatusLabel(assignment.status)}</StaffStatusPill>
              </div>
            </article>
          ))}
          {!todayAssignments.length ? <StaffMobileEmptyState icon={<CalendarClock size={18} aria-hidden="true" />} title="Chưa có ca hôm nay" text="Báo quản lý nếu cần vào ca." /> : null}
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Gần đây" />
        <div className="grid gap-2">
          {recentAttendance.map((item) => (
            <article key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{attendanceStateLabel(item.state)}</p>
                <p className="mt-1 truncate text-xs font-medium text-[var(--muted-foreground)]">{item.branchName ?? "Toàn quán"} · {formatTime(item.clockInAt)} - {formatTime(item.clockOutAt)}</p>
              </div>
              <StaffStatusPill tone={item.state === "late" || item.state === "early_leave" ? "warning" : "success"}>{item.source.toUpperCase()}</StaffStatusPill>
            </article>
          ))}
          {!recentAttendance.length ? <StaffMobileEmptyState icon={<ShieldCheck size={18} aria-hidden="true" />} title="Chưa có lịch sử công" /> : null}
        </div>
      </StaffMobilePanel>
    </>
  );
}
