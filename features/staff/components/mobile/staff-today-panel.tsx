"use client";

import { CalendarClock, CheckCircle2, Clock3, Fingerprint, MapPin, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import type { StaffAttendanceMachine } from "./staff-attendance-machine";
import type { StaffOpsAttendanceFeedItem, StaffOpsMember, StaffOpsShiftAssignment } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { StaffMetricTile, StaffMobileEmptyState, StaffMobilePanel, StaffMobileSectionHeader, StaffStatusPill, staffToneClass } from "./staff-mobile-primitives";
import { attendanceStateLabel, durationBetween, formatDate, formatTime, shiftStatusLabel } from "./staff-mobile-utils";

export function StaffTodayPanel({
  staff,
  machine,
  activeAttendance,
  latestAttendance,
  currentShift,
  todayAssignments,
  recentAttendance,
  activeDuration,
  nowMs
}: {
  staff: StaffOpsMember;
  machine: StaffAttendanceMachine;
  activeAttendance: StaffOpsAttendanceFeedItem | null;
  latestAttendance: StaffOpsAttendanceFeedItem | null;
  currentShift: StaffOpsShiftAssignment | null;
  todayAssignments: StaffOpsShiftAssignment[];
  recentAttendance: StaffOpsAttendanceFeedItem[];
  activeDuration: string;
  nowMs: number;
}) {
  return (
    <>
      <section className="admin-hero-panel rounded-[14px] p-4 text-[var(--foreground)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="dashboard-eyebrow">Hôm nay</p>
            <h1 className="dashboard-page-title mt-2">{machine.title}</h1>
            <p className="dashboard-body-copy mt-2 line-clamp-2">{machine.detail}</p>
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

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Sẵn sàng chấm công" eyebrow="Readiness" action={<StaffStatusPill tone={machine.canSubmit ? "success" : "warning"}>{machine.recoveryLabel}</StaffStatusPill>} />
        <div className="grid grid-cols-2 gap-2">
          {machine.readiness.map((item) => (
            <div key={item.label} className={cn("rounded-xl border p-3", staffToneClass(item.tone))}>
              <p className="truncate text-[11px] font-semibold uppercase opacity-75">{item.label}</p>
              <p className="mt-1 truncate text-sm font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Ca hôm nay" eyebrow={staff.roleTitle} action={<StaffStatusPill tone={todayAssignments.length ? "success" : "muted"}>{todayAssignments.length} ca</StaffStatusPill>} />
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
          {!todayAssignments.length ? <StaffMobileEmptyState icon={<CalendarClock size={18} aria-hidden="true" />} title="Chưa có ca hôm nay" text="Nếu bạn vẫn cần vào ca, hãy báo quản lý để tạo ca hoặc duyệt chấm công thủ công." /> : null}
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Timeline công" eyebrow="Attendance" />
        <div className="grid gap-2">
          {currentShift ? (
            <TimelineItem icon={<CalendarClock size={15} aria-hidden="true" />} title={currentShift.shiftName} meta={`${formatDate(currentShift.scheduledDate)} · ${currentShift.branchName ?? staff.primaryBranchName ?? "Toàn quán"}`} tone="neutral" />
          ) : null}
          {activeAttendance ? (
            <TimelineItem icon={<MapPin size={15} aria-hidden="true" />} title="Đã check-in" meta={`${formatTime(activeAttendance.clockInAt)} · ${durationBetween(activeAttendance.clockInAt, activeAttendance.clockOutAt, nowMs)}`} tone="success" />
          ) : latestAttendance ? (
            <TimelineItem icon={<CheckCircle2 size={15} aria-hidden="true" />} title={attendanceStateLabel(latestAttendance.state)} meta={`${formatTime(latestAttendance.clockInAt)} - ${formatTime(latestAttendance.clockOutAt)}`} tone="neutral" />
          ) : (
            <TimelineItem icon={<Clock3 size={15} aria-hidden="true" />} title="Chưa chấm công" meta="Mở app tại quán để bắt đầu ca." tone="warning" />
          )}
          {machine.state === "queued_offline" ? <TimelineItem icon={<WifiOff size={15} aria-hidden="true" />} title="Đang chờ đồng bộ" meta="Công offline chưa được xác nhận trên hệ thống." tone="warning" /> : <TimelineItem icon={<Wifi size={15} aria-hidden="true" />} title="Đồng bộ hệ thống" meta="Trạng thái công sẽ cập nhật realtime cho quản lý." tone="success" />}
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Lịch sử gần đây" eyebrow="3 lượt mới nhất" />
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
          {!recentAttendance.length ? <StaffMobileEmptyState icon={<ShieldCheck size={18} aria-hidden="true" />} title="Chưa có lịch sử công" text="Các lượt chấm công sẽ hiển thị ở đây sau khi được ghi nhận." /> : null}
        </div>
      </StaffMobilePanel>
    </>
  );
}

function TimelineItem({ icon, title, meta, tone }: { icon: React.ReactNode; title: string; meta: string; tone: "success" | "warning" | "neutral" }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg border", staffToneClass(tone))}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-[var(--muted-foreground)]">{meta}</span>
      </span>
    </div>
  );
}
