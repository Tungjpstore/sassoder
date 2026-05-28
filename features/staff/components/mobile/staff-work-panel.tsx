"use client";

import { Bell, CheckCircle2, ChefHat, ChevronRight, CreditCard, ListChecks } from "lucide-react";
import type { StaffOpsMobileOps, StaffOpsMobileWorkItem } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { StaffMetricTile, StaffMobileEmptyState, StaffMobilePanel, StaffMobileSectionHeader, StaffStatusPill, staffToneClass } from "./staff-mobile-primitives";
import { priorityLabel, relativeTime, workItemKey } from "./staff-mobile-utils";

function workItemIcon(kind: StaffOpsMobileWorkItem["kind"]) {
  if (kind === "kitchen_order") return ChefHat;
  if (kind === "payment_waiting") return CreditCard;
  if (kind === "service_request") return Bell;
  return ListChecks;
}

function workItemTone(priority: StaffOpsMobileWorkItem["priority"]) {
  if (priority === "high") return "warning";
  if (priority === "medium") return "primary";
  return "muted";
}

export function StaffWorkPanel({
  mobileOps,
  sortedWorkItems,
  processingWorkItemKey,
  onRunWorkItem
}: {
  mobileOps: StaffOpsMobileOps;
  sortedWorkItems: StaffOpsMobileWorkItem[];
  processingWorkItemKey: string | null;
  onRunWorkItem: (item: StaffOpsMobileWorkItem) => void;
}) {
  return (
    <>
      <StaffMobilePanel className="bg-[var(--dashboard-glass-strong)]">
        <StaffMobileSectionHeader title="Việc trong ca" action={<StaffStatusPill tone={mobileOps.urgentCount ? "warning" : "success"}>{mobileOps.urgentCount} gấp</StaffStatusPill>} />
        <div className="grid grid-cols-4 gap-2">
          <StaffMetricTile label="Đơn" value={mobileOps.pendingOrders} icon={<ListChecks size={16} aria-hidden="true" />} tone="primary" />
          <StaffMetricTile label="Bếp" value={mobileOps.cookingOrders} icon={<ChefHat size={16} aria-hidden="true" />} tone="success" />
          <StaffMetricTile label="Tiền" value={mobileOps.waitingPayments} icon={<CreditCard size={16} aria-hidden="true" />} tone="warning" />
          <StaffMetricTile label="Gọi" value={mobileOps.serviceRequests} icon={<Bell size={16} aria-hidden="true" />} tone="neutral" />
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Cần xử lý" />
        <div className="grid gap-2">
          {sortedWorkItems.map((item) => {
            const Icon = workItemIcon(item.kind);
            const key = workItemKey(item);
            const isProcessing = processingWorkItemKey === key;
            return (
              <article key={key} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                  <span className={cn("grid h-11 w-11 place-items-center rounded-xl border", staffToneClass(workItemTone(item.priority)))}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
                      {item.tableName ? <StaffStatusPill tone="neutral" className="min-h-6 px-2 text-[11px]">{item.tableName}</StaffStatusPill> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
                      {priorityLabel(item.priority)} · {relativeTime(item.createdAt)} · {item.subtitle}
                    </p>
                  </div>
                </div>
                {item.action && item.actionLabel ? (
                  <button
                    type="button"
                    onClick={() => onRunWorkItem(item)}
                    disabled={isProcessing}
                    className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[var(--glow-primary)] transition active:scale-[0.99] disabled:opacity-55"
                  >
                    {isProcessing ? "Đang xử lý..." : item.actionLabel}
                    {!isProcessing ? <ChevronRight size={16} aria-hidden="true" /> : null}
                  </button>
                ) : null}
              </article>
            );
          })}
          {!sortedWorkItems.length ? <StaffMobileEmptyState icon={<CheckCircle2 size={18} aria-hidden="true" />} title="Chưa có việc cần xử lý" text="Khi có đơn, thanh toán hoặc yêu cầu phục vụ mới, hàng việc sẽ cập nhật tại đây." /> : null}
        </div>
      </StaffMobilePanel>
    </>
  );
}
