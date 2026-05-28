"use client";

import { Bell, CheckCircle2, ChefHat, ChevronRight, CreditCard, ListChecks, Utensils } from "lucide-react";
import type { StaffOpsMobileOps, StaffOpsMobileWorkItem, StaffOpsMember } from "@/features/staff/types";
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

function roleWorkHint(roleCode: string) {
  if (roleCode === "kitchen") return "Ưu tiên món đang chờ và hoàn tất khi bếp giao món.";
  if (roleCode === "cashier") return "Ưu tiên thanh toán, đối soát và các cảnh báo cần xác nhận.";
  if (roleCode === "delivery") return "Theo dõi đơn giao, liên hệ khách và cập nhật trạng thái.";
  if (roleCode === "waiter") return "Ưu tiên bàn gọi, đơn mới và yêu cầu phục vụ.";
  return "Theo dõi các việc cần xử lý trong ca theo quyền của bạn.";
}

export function StaffWorkPanel({
  staff,
  mobileOps,
  sortedWorkItems,
  processingWorkItemKey,
  onRunWorkItem
}: {
  staff: StaffOpsMember;
  mobileOps: StaffOpsMobileOps;
  sortedWorkItems: StaffOpsMobileWorkItem[];
  processingWorkItemKey: string | null;
  onRunWorkItem: (item: StaffOpsMobileWorkItem) => void;
}) {
  return (
    <>
      <StaffMobilePanel className="bg-[var(--dashboard-glass-strong)]">
        <StaffMobileSectionHeader title="Hàng việc trong ca" eyebrow={staff.roleTitle} action={<StaffStatusPill tone={mobileOps.urgentCount ? "warning" : "success"}>{mobileOps.urgentCount} gấp</StaffStatusPill>} />
        <p className="dashboard-body-copy">{roleWorkHint(staff.roleCode)}</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <StaffMetricTile label="Đơn" value={mobileOps.pendingOrders} icon={<ListChecks size={16} aria-hidden="true" />} tone="primary" />
          <StaffMetricTile label="Bếp" value={mobileOps.cookingOrders} icon={<ChefHat size={16} aria-hidden="true" />} tone="success" />
          <StaffMetricTile label="Tiền" value={mobileOps.waitingPayments} icon={<CreditCard size={16} aria-hidden="true" />} tone="warning" />
          <StaffMetricTile label="Gọi" value={mobileOps.serviceRequests} icon={<Bell size={16} aria-hidden="true" />} tone="neutral" />
        </div>
      </StaffMobilePanel>

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Cần xử lý" eyebrow="Live queue" />
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

      <StaffMobilePanel>
        <StaffMobileSectionHeader title="Theo vai trò" eyebrow="Role mode" />
        <div className="grid gap-2">
          {[
            { label: "Phục vụ", active: staff.roleCode === "waiter", icon: Utensils, text: "Bàn gọi, đơn mới, phục vụ món" },
            { label: "Bếp", active: staff.roleCode === "kitchen", icon: ChefHat, text: "Món cần làm, đang nấu, hoàn tất" },
            { label: "Thu ngân", active: staff.roleCode === "cashier", icon: CreditCard, text: "Thanh toán, xác nhận, cảnh báo" }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border p-3", item.active ? staffToneClass("primary") : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]")}>
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-current/20">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-xs font-medium opacity-75">{item.text}</span>
                </span>
              </div>
            );
          })}
        </div>
      </StaffMobilePanel>
    </>
  );
}
