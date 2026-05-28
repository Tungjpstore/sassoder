"use client";

import { CalendarClock, CheckCircle2, Clock3, RefreshCw, Send, UserRound } from "lucide-react";
import type { StaffRequestCreatePayload } from "@/features/staff/api/client";
import type { StaffOpsApprovalItem, StaffOpsMobileShiftSwapCandidate, StaffOpsShiftAssignment } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { StaffMobileEmptyState, StaffMobilePanel, StaffMobileSectionHeader, StaffPrimaryButton, StaffSecondaryButton, StaffStatusPill, staffToneClass } from "./staff-mobile-primitives";
import { formatDate, requestStatusLabel, staffRequestLabel } from "./staff-mobile-utils";

export type StaffMobileRequestKind = StaffRequestCreatePayload["requestType"];

const staffRequestKinds: Array<{ key: StaffMobileRequestKind; label: string; icon: typeof CalendarClock }> = [
  { key: "leave_request", label: "Nghỉ phép", icon: CalendarClock },
  { key: "shift_swap", label: "Đổi ca", icon: RefreshCw },
  { key: "overtime", label: "Tăng ca", icon: Clock3 }
];

function requestTone(status: StaffOpsApprovalItem["status"]) {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "cancelled") return "danger";
  return "warning";
}

export type StaffRequestDraft = {
  kind: StaffMobileRequestKind;
  reason: string;
  fromDate: string;
  toDate: string;
  leaveType: NonNullable<StaffRequestCreatePayload["leaveType"]>;
  overtimeMinutes: number;
  shiftAssignmentId: string;
  targetStaffMemberId: string;
};

export function StaffRequestsPanel({
  draft,
  onDraftChange,
  upcomingAssignments,
  shiftSwapCandidates,
  recentRequests,
  requestBlockedReason,
  submitting,
  submitLabel,
  onSubmit
}: {
  draft: StaffRequestDraft;
  onDraftChange: (patch: Partial<StaffRequestDraft>) => void;
  upcomingAssignments: StaffOpsShiftAssignment[];
  shiftSwapCandidates: StaffOpsMobileShiftSwapCandidate[];
  recentRequests: StaffOpsApprovalItem[];
  requestBlockedReason: string | null;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
}) {
  const pendingRequestCount = recentRequests.filter((request) => request.status === "pending").length;

  return (
    <>
      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Gửi yêu cầu nhanh" eyebrow="Request center" action={<StaffStatusPill tone={pendingRequestCount ? "warning" : "success"}>{pendingRequestCount} chờ</StaffStatusPill>} />
        <div className="grid grid-cols-3 gap-2">
          {staffRequestKinds.map((item) => {
            const Icon = item.icon;
            const active = draft.kind === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onDraftChange({ kind: item.key })}
                className={cn(
                  "grid min-h-14 place-items-center gap-1 rounded-xl border px-2 text-[11px] font-semibold transition active:scale-[0.99]",
                  active ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[var(--glow-primary)]" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2.5">
          {draft.kind === "leave_request" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Từ ngày</span>
                <input type="date" autoComplete="off" value={draft.fromDate} onChange={(event) => onDraftChange({ fromDate: event.target.value })} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm font-semibold outline-none" />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Đến ngày</span>
                <input type="date" autoComplete="off" value={draft.toDate} onChange={(event) => onDraftChange({ toDate: event.target.value })} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm font-semibold outline-none" />
              </label>
              <div className="col-span-2 grid grid-cols-2 gap-2">
                {[
                  { key: "unpaid", label: "Không lương" },
                  { key: "paid", label: "Có lương" },
                  { key: "sick", label: "Nghỉ ốm" },
                  { key: "emergency", label: "Nghỉ gấp" }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onDraftChange({ leaveType: item.key as StaffRequestDraft["leaveType"] })}
                    className={cn("min-h-11 rounded-xl border px-3 text-xs font-semibold", draft.leaveType === item.key ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {draft.kind === "shift_swap" ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Ca muốn đổi</span>
                <select value={draft.shiftAssignmentId} onChange={(event) => onDraftChange({ shiftAssignmentId: event.target.value })} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm font-semibold outline-none">
                  <option value="">Chọn ca sắp tới</option>
                  {upcomingAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.shiftName} · {formatDate(assignment.scheduledDate)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2">
                {shiftSwapCandidates.slice(0, 4).map((candidate) => {
                  const active = draft.targetStaffMemberId === candidate.id;
                  return (
                    <button key={candidate.id} type="button" onClick={() => onDraftChange({ targetStaffMemberId: active ? "" : candidate.id })} className={cn("grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border p-2 text-left", active ? staffToneClass("primary") : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]")}>
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-current/20"><UserRound size={15} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{candidate.fullName}</span>
                        <span className="block truncate text-xs font-medium opacity-70">{candidate.roleTitle} · {candidate.primaryBranchName ?? "Toàn quán"}</span>
                      </span>
                    </button>
                  );
                })}
                {!shiftSwapCandidates.length ? <p className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">Chưa có đồng nghiệp gợi ý. Quản lý sẽ tự sắp xếp.</p> : null}
              </div>
            </div>
          ) : null}

          {draft.kind === "overtime" ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Ngày OT</span>
                <input type="date" autoComplete="off" value={draft.fromDate} onChange={(event) => onDraftChange({ fromDate: event.target.value })} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm font-semibold outline-none" />
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 90, 120].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => onDraftChange({ overtimeMinutes: minutes })}
                    className={cn("min-h-11 rounded-xl border px-2 text-xs font-semibold transition active:scale-[0.99]", draft.overtimeMinutes === minutes ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]")}
                  >
                    {minutes}p
                  </button>
                ))}
              </div>
              <input type="number" inputMode="numeric" min="15" max="720" step="15" value={draft.overtimeMinutes} onChange={(event) => onDraftChange({ overtimeMinutes: Number(event.target.value) || 15 })} className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm font-semibold outline-none" />
            </div>
          ) : null}

          <textarea
            value={draft.reason}
            onChange={(event) => onDraftChange({ reason: event.target.value })}
            rows={2}
            placeholder="Lý do ngắn gọn..."
            className="min-h-20 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-medium outline-none"
          />
          {requestBlockedReason ? <div aria-live="polite" className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">{requestBlockedReason}</div> : null}
          <StaffPrimaryButton onClick={onSubmit} disabled={submitting || Boolean(requestBlockedReason)}>
            <Send size={16} aria-hidden="true" />
            {submitLabel}
          </StaffPrimaryButton>
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Yêu cầu gần đây" eyebrow="Status" />
        <div className="grid gap-2">
          {recentRequests.map((request) => (
            <article key={request.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{staffRequestLabel(request.requestType)}</p>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{request.reason ?? "Đã gửi cho quản lý"}</p>
              </div>
              <StaffStatusPill tone={requestTone(request.status)}>{requestStatusLabel(request.status)}</StaffStatusPill>
            </article>
          ))}
          {!recentRequests.length ? <StaffMobileEmptyState icon={<CheckCircle2 size={18} aria-hidden="true" />} title="Chưa có yêu cầu" text="Các yêu cầu nghỉ, đổi ca hoặc tăng ca sẽ hiển thị tại đây." /> : null}
        </div>
      </StaffMobilePanel>
    </>
  );
}
