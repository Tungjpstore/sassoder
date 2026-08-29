"use client";

/* BillingPanelV2 — gói LogiVN dạng v2:
 *   - Step nav (7 step) như cũ, nhưng dùng tokens v2 (bỏ hex hard-code)
 *   - Layout 2 cột: Plan card + benefits aside, hoặc grid step tuỳ ngữ cảnh
 *   - Server actions giữ nguyên: requestSubscriptionPaymentAction
 *   - Deeplink ?section=billing&billingStep=...&paymentId=... vẫn hoạt động
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Download,
  Hourglass,
  LockKeyhole,
  QrCode,
  ReceiptText,
  TimerReset
} from "lucide-react";
import { requestSubscriptionPaymentAction } from "@/app/dashboard/actions";
import { Badge, Panel } from "@/components/dashboard-v2/primitives";
import { Button } from "@/components/dashboard-v2/button";
import { SUBSCRIPTION_EXPIRY_NOTICE_DAYS } from "@/lib/billing/subscription-warning";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { featureLabels, type PlanFeatureKey } from "@/services/billing/plan-features";
import type { getRestaurantBillingPortal } from "@/services/subscription-service";
import { normalizeBillingStep, type BillingStepKey } from "./section-states";

export { normalizeBillingStep, type BillingStepKey };

type BillingPortal = Awaited<ReturnType<typeof getRestaurantBillingPortal>>;
type BillingPlanView = BillingPortal["plans"][number];
type BillingPaymentView = BillingPortal["paymentRequests"][number];

const billingSteps: Array<{ key: BillingStepKey; index: number; title: string; shortTitle: string; subtitle: string }> = [
  { key: "current", index: 1, title: "Gói hiện tại", shortTitle: "Gói", subtitle: "Xem nhanh gói đang dùng và mức sử dụng" },
  { key: "compare", index: 2, title: "So sánh gói", shortTitle: "So sánh", subtitle: "Dễ dàng so sánh và chọn gói phù hợp" },
  { key: "payment", index: 3, title: "Thanh toán", shortTitle: "QR", subtitle: "Thanh toán nhanh chóng qua VietQR" },
  { key: "processing", index: 4, title: "Đang xử lý", shortTitle: "Xử lý", subtitle: "Theo dõi trạng thái thanh toán" },
  { key: "history", index: 5, title: "Lịch sử giao dịch", shortTitle: "Lịch sử", subtitle: "Tất cả giao dịch và hoá đơn" },
  { key: "detail", index: 6, title: "Chi tiết giao dịch", shortTitle: "Chi tiết", subtitle: "Thông tin chi tiết hoá đơn" },
  { key: "manage", index: 7, title: "Quản lý gói", shortTitle: "Quản lý", subtitle: "Nâng cấp, hạ cấp hoặc huỷ gói" }
];

function billingStepHref(step: BillingStepKey, paymentId?: string | null) {
  const params = new URLSearchParams({ section: "billing", billingStep: step });
  if (paymentId) params.set("paymentId", paymentId);
  return `/dashboard/settings?${params.toString()}`;
}

/* openInvoicePrint — dựng hoá đơn HTML và mở hộp thoại in (cho phép "Lưu thành PDF").
 * Thuần client, không cần backend tạo file. */
function openInvoicePrint(input: {
  planName: string;
  amount: number;
  months: number;
  method: string;
  transferContent: string;
  createdAt: string | null | undefined;
  confirmedAt: string | null | undefined;
  status: string;
  bankAccountName?: string | null;
  bankCode?: string | null;
}) {
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "₫";
  const fmtDt = (v: string | null | undefined) => (v && !Number.isNaN(new Date(v).getTime()) ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—");
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hoá đơn ${input.transferContent}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  body{margin:0;padding:40px;color:#14201b}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#5b6b63;font-size:13px}
  .box{border:1px solid #d9e2dc;border-radius:12px;padding:20px;margin-top:20px}
  .row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;border-bottom:1px solid #eef3f0}
  .row:last-child{border-bottom:0}
  .total{font-size:18px;font-weight:700;border-top:2px solid #14201b;margin-top:8px;padding-top:12px}
  .tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#e8f3ee;color:#0f4d3a;font-size:12px;font-weight:700}
  @media print{button{display:none}}
</style></head><body>
  <h1>HOÁ ĐƠN GÓI DỊCH VỤ LogiVN</h1>
  <p class="muted">Mã giao dịch: <strong>${input.transferContent}</strong></p>
  <span class="tag">${input.status === "confirmed" ? "Đã thanh toán" : input.status === "waiting_confirm" ? "Đang xử lý" : input.status}</span>
  <div class="box">
    <div class="row"><span>Gói dịch vụ</span><strong>${input.planName}</strong></div>
    <div class="row"><span>Chu kỳ</span><strong>${input.months} tháng</strong></div>
    <div class="row"><span>Phương thức</span><strong>${input.method}</strong></div>
    <div class="row"><span>Ngân hàng nhận</span><strong>${input.bankCode ?? "—"} · ${input.bankAccountName ?? ""}</strong></div>
    <div class="row"><span>Ngày tạo</span><strong>${fmtDt(input.createdAt)}</strong></div>
    <div class="row"><span>Ngày xác nhận</span><strong>${fmtDt(input.confirmedAt)}</strong></div>
    <div class="row"><span>Tạm tính</span><strong>${fmt(input.amount)}</strong></div>
    <div class="row"><span>VAT (0%)</span><strong>${fmt(0)}</strong></div>
    <div class="row total"><span>Tổng cộng</span><span>${fmt(input.amount)}</span></div>
  </div>
  <p class="muted" style="margin-top:24px">Hoá đơn được tạo từ Dashboard LogiVN lúc ${fmtDt(new Date().toISOString())}.</p>
  <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;border:0;border-radius:8px;background:#0f4d3a;color:#fff;font-weight:700;cursor:pointer">In / Lưu PDF</button>
</body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 400);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "Chưa có";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

function planShortName(plan: Pick<BillingPlanView, "name" | "code">) {
  if (plan.code === "pro") return "PRO";
  if (plan.code === "premium") return "PREMIUM";
  return plan.name.replace(/^LogiVN\s*/i, "").toUpperCase();
}

function planFeatureList(plan: BillingPlanView) {
  return Array.isArray(plan.features) ? plan.features.filter((f): f is string => typeof f === "string") : [];
}

function limitLabel(limit: number | null | undefined, unit: string | undefined) {
  if (limit === null || limit === undefined) return "Theo gói";
  return `${new Intl.NumberFormat("vi-VN").format(limit)}${unit ? ` ${unit}` : ""}`;
}

function usagePercent(used: number, limit: number | null | undefined) {
  if (!limit || limit <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function periodProgress(start: string | null | undefined, end: string | null | undefined, daysLeft: number) {
  const sT = start ? new Date(start).getTime() : Number.NaN;
  const eT = end ? new Date(end).getTime() : Number.NaN;
  if (!Number.isNaN(sT) && !Number.isNaN(eT) && eT > sT) {
    const totalMs = eT - sT;
    const remainingMs = Math.max(0, Math.min(totalMs, daysLeft * 86_400_000));
    return Math.max(4, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)));
  }
  if (daysLeft <= 0) return 100;
  return Math.max(8, Math.min(100, 100 - Math.round((daysLeft / 30) * 100)));
}

function statusLabel(status: string, hasPending: boolean, usable: boolean) {
  if (usable && hasPending) return "Đang hoạt động";
  const labels: Record<string, string> = {
    trialing: "Đang dùng thử",
    pending_payment: "Chờ thanh toán",
    active: "Đang hoạt động",
    past_due: "Quá hạn",
    suspended: "Tạm dừng",
    cancelled: "Đã huỷ",
    expired: "Hết hạn"
  };
  return labels[status] ?? status;
}

function paymentStatusLabel(status: BillingPaymentView["status"]) {
  const labels: Record<BillingPaymentView["status"], string> = {
    waiting_confirm: "Đang xử lý",
    confirmed: "Thành công",
    rejected: "Thất bại",
    expired: "Hết hạn"
  };
  return labels[status] ?? status;
}

function paymentTone(status: BillingPaymentView["status"]): "ok" | "orange" | "danger" {
  if (status === "confirmed") return "ok";
  if (status === "rejected" || status === "expired") return "danger";
  return "orange";
}

function Progress({ value, tone = "jade" }: { value: number; tone?: "jade" | "orange" }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
      <div
        className={cn("h-full rounded-full", tone === "jade" ? "bg-[var(--d-jade)]" : "bg-[var(--d-orange)]")}
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function UsageCard({ label, value, meta, percent, tone = "jade" }: { label: string; value: string; meta: string; percent: number; tone?: "jade" | "orange" }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="d-num mt-2 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{value}</p>
      <div className="mt-2"><Progress value={percent} tone={tone} /></div>
      <p className="mt-1.5 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)]">{meta}</p>
    </div>
  );
}

type Props = {
  billing: BillingPortal;
  billingError: string | null;
  tableCount: number;
  menuItemCount: number;
  staffCount: number;
  activeStep: BillingStepKey;
  selectedPaymentId: string | null;
  gatedFeatureKey: PlanFeatureKey | null;
};

export function BillingPanelV2({ billing, billingError, tableCount, menuItemCount, staffCount, activeStep, selectedPaymentId, gatedFeatureKey }: Props) {
  const pending = billing.pendingPayment;
  const pendingChange = billing.pendingChange;
  const sortedPlans = billing.plans.filter((plan) => plan.monthly_price > 0);
  const pendingPlan = pending ? billing.plans.find((p) => p.id === pending.plan_id) ?? null : null;
  const latestPayment = pending ?? billing.paymentRequests[0] ?? null;
  const selectedPayment = selectedPaymentId ? billing.paymentRequests.find((p) => p.id === selectedPaymentId) ?? latestPayment : latestPayment;
  const selectedPlan = selectedPayment ? billing.plans.find((p) => p.id === selectedPayment.plan_id) ?? billing.currentPlan : billing.currentPlan;
  const periodStart = billing.subscription.current_period_start || billing.subscription.trial_started_at || billing.subscription.created_at;
  const periodEnd = billing.subscription.current_period_end || billing.subscription.trial_ends_at;
  const elapsed = periodProgress(periodStart, periodEnd, billing.daysLeft);
  const accessLabel = statusLabel(billing.subscription.status, Boolean(pending), billing.usable);
  const tableF = billing.resolvedSnapshot.features.tables;
  const staffF = billing.resolvedSnapshot.features.staff;
  const aiQuota = billing.resolvedSnapshot.quotas.ai_chatbot ?? billing.resolvedSnapshot.quotas.ai_menu_generation ?? billing.resolvedSnapshot.features.ai_chatbot?.usage ?? null;
  const exportQuota = billing.resolvedSnapshot.quotas.export_pdf ?? billing.resolvedSnapshot.features.export_pdf?.usage ?? null;
  const aiPct = aiQuota ? usagePercent(aiQuota.used, aiQuota.limit) : null;
  const exportPct = exportQuota ? usagePercent(exportQuota.used, exportQuota.limit) : null;
  const currentBenefits = Object.values(billing.resolvedSnapshot.features).filter((f) => f.state === "active" && f.includedInPlan).slice(0, 5);
  const premiumBenefits = Object.values(billing.resolvedSnapshot.features).filter((f) => f.state === "locked_plan" && f.badge === "PREMIUM").slice(0, 4);
  const gatedLabel = gatedFeatureKey ? featureLabels[gatedFeatureKey] : null;
  const showGated = Boolean(gatedLabel && billing.currentPlan.code !== "premium");
  const confirmed = billing.paymentRequests.filter((p) => p.status === "confirmed").length;
  const waiting = billing.paymentRequests.filter((p) => p.status === "waiting_confirm").length;
  const failed = billing.paymentRequests.filter((p) => p.status === "rejected" || p.status === "expired").length;
  const detailPaymentId = selectedPayment?.id ?? null;

  const stepIdx = Math.max(0, billingSteps.findIndex((s) => s.key === activeStep));
  const stepMeta = billingSteps[stepIdx] ?? billingSteps[0];
  const prevStep = billingSteps[stepIdx - 1]?.key ?? null;
  const nextStep = billingSteps[stepIdx + 1]?.key ?? null;

  const processingSteps = pending
    ? [
        { label: "Đã nhận yêu cầu", state: "done" as const },
        { label: "Đang xác nhận", state: "active" as const },
        { label: "Kích hoạt gói", state: "pending" as const }
      ]
    : latestPayment?.status === "confirmed"
      ? [
          { label: "Đã nhận yêu cầu", state: "done" as const },
          { label: "Đã xác nhận", state: "done" as const },
          { label: "Đã kích hoạt", state: "done" as const }
        ]
      : [
          { label: "Tạo thanh toán", state: "pending" as const },
          { label: "Xác nhận", state: "pending" as const },
          { label: "Kích hoạt", state: "pending" as const }
        ];

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      {billingError ? (
        <div className="flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-orange-600)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{billingError}</span>
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="d-eyebrow">Bước {stepMeta.index} / {billingSteps.length}</p>
          <h3 className="mt-1 text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">{stepMeta.title}</h3>
          <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{stepMeta.subtitle}</p>
        </div>
        <Badge tone={billing.usable ? "ok" : "orange"}>{accessLabel}</Badge>
      </header>

      <nav aria-label="Billing flow" className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 md:grid md:grid-cols-7 md:overflow-visible">
        {billingSteps.map((step) => {
          const on = step.key === activeStep;
          return (
            <Link
              key={step.key}
              href={billingStepHref(step.key, step.key === "detail" ? detailPaymentId : undefined)}
              aria-current={on ? "step" : undefined}
              className={cn(
                "inline-flex min-h-9 min-w-[100px] shrink-0 items-center gap-1.5 rounded-[var(--d-r-md)] border px-2.5 text-left transition md:w-full md:min-w-0",
                on
                  ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"
                  : "border-transparent bg-[var(--d-surface-2)] text-[var(--d-text-muted)] hover:border-[var(--d-line)] hover:bg-[var(--d-surface)]"
              )}
            >
              <span className={cn("d-num grid h-6 w-6 place-items-center rounded-full text-[length:var(--d-fs-2xs)] font-bold", on ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "bg-[var(--d-surface)] text-[var(--d-text-faint)]")}>{step.index}</span>
              <span className="hidden truncate text-[length:var(--d-fs-xs)] font-semibold sm:block">{step.title}</span>
              <span className="truncate text-[length:var(--d-fs-xs)] font-semibold sm:hidden">{step.shortTitle}</span>
            </Link>
          );
        })}
      </nav>

      {pendingChange?.summary ? (
        <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
          {pendingChange.summary}
        </p>
      ) : null}

      {activeStep === "current" ? (
        <div className="grid gap-[var(--d-s-4)] xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel className="p-[var(--d-s-5)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone="orange"><Crown size={11} className="mr-1 inline" />{planShortName(billing.currentPlan)}</Badge>
              <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{billing.daysLeft > 0 ? `Còn ${billing.daysLeft} ngày` : "Cần gia hạn"}</span>
            </div>
            <p className="d-num mt-3 text-[length:var(--d-fs-display)] font-bold text-[var(--d-text)]">
              {formatVnd(billing.currentPlan.monthly_price)}
              <span className="ml-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">/ tháng</span>
            </p>
            <p className="mt-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Gia hạn vào <span className="font-semibold text-[var(--d-text)]">{fmtDate(periodEnd)}</span></p>
            <div className="mt-3"><Progress value={elapsed} /></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <form action={requestSubscriptionPaymentAction}>
                <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                <input type="hidden" name="months" value="1" />
                <Button type="submit" variant="primary" size="md" className="w-full">Gia hạn ngay</Button>
              </form>
              <Link href={billingStepHref("compare")} className="inline-flex h-10 items-center justify-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:text-[var(--d-primary)]">
                Nâng cấp gói
              </Link>
            </div>
            <div className="mt-5">
              <p className="d-eyebrow">Sử dụng tài nguyên</p>
              <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{fmtDate(periodStart)} → {fmtDate(periodEnd)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <UsageCard label="Bàn" value={`${tableCount}/${limitLabel(tableF?.limit, tableF?.unit)}`} meta={tableF?.limit ? `${usagePercent(tableCount, tableF.limit)}%` : "Theo gói"} percent={usagePercent(tableCount, tableF?.limit)} />
                <UsageCard label="Nhân viên" value={`${staffCount}/${limitLabel(staffF?.limit, staffF?.unit)}`} meta={staffF?.limit ? `${usagePercent(staffCount, staffF.limit)}%` : "Theo gói"} percent={usagePercent(staffCount, staffF?.limit)} />
                <UsageCard label="Trợ lý AI" value={aiQuota ? `${new Intl.NumberFormat("vi-VN").format(aiQuota.used)}/${limitLabel(aiQuota.limit, aiQuota.unit)}` : "Chưa ghi nhận"} meta={aiQuota ? `${aiPct ?? 0}%` : "Dữ liệu chưa ghi nhận"} percent={aiPct ?? 0} tone="orange" />
                <UsageCard label="Export PDF" value={exportQuota ? `${new Intl.NumberFormat("vi-VN").format(exportQuota.used)}/${limitLabel(exportQuota.limit, exportQuota.unit)}` : `${menuItemCount} món`} meta={exportQuota ? `${exportPct ?? 0}%` : "Menu thật trong hệ thống"} percent={exportPct ?? 100} />
              </div>
            </div>
          </Panel>

          <Panel className="p-[var(--d-s-5)]">
            <p className="d-eyebrow">Quyền lợi gói {planShortName(billing.currentPlan)}</p>
            <div className="mt-3 grid gap-2">
              {currentBenefits.map((f) => (
                <p key={f.key} className="flex items-start gap-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                  <Check size={14} className="mt-0.5 shrink-0 text-[var(--d-primary)]" />
                  <span>{f.label}</span>
                </p>
              ))}
            </div>
            <Link href={billingStepHref("compare")} className="mt-4 inline-flex items-center gap-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)]">
              Xem tất cả quyền lợi <ArrowRight size={13} />
            </Link>
            {premiumBenefits.length ? (
              <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] p-[var(--d-s-3)]">
                <Badge tone="orange"><Crown size={10} className="mr-1 inline" />Premium</Badge>
                <p className="mt-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Mở thêm khi nâng cấp</p>
                <div className="mt-2 grid gap-1.5">
                  {premiumBenefits.map((f) => (
                    <p key={f.key} className="flex items-start gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      <LockKeyhole size={11} className="mt-0.5 shrink-0 text-[var(--d-orange-600)]" />
                      <span>{f.label}</span>
                    </p>
                  ))}
                </div>
                <Link href={billingStepHref("compare")} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] text-[length:var(--d-fs-xs)] font-bold text-[var(--d-on-jade)] transition hover:bg-[var(--d-jade-700)]">
                  Xem gói Premium
                </Link>
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {activeStep === "compare" ? (
        <div className="grid gap-[var(--d-s-4)]">
          {showGated ? (
            <div className="flex flex-col gap-2 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] p-[var(--d-s-4)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Badge tone="orange"><LockKeyhole size={11} className="mr-1 inline" />Premium</Badge>
                <p className="mt-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{gatedLabel} thuộc nhóm cần nâng cấp Premium</p>
                <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Bạn vẫn giữ toàn bộ quyền Pro hiện tại. Nâng Premium để mở thêm tính năng này.</p>
              </div>
              <a href="#billing-plan-premium" className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-4 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">Xem Premium</a>
            </div>
          ) : null}

          <div className="grid gap-[var(--d-s-3)] lg:grid-cols-2">
            {sortedPlans.map((plan) => {
              const isCurrent = plan.id === billing.currentPlan.id;
              const isUpgrade = plan.monthly_price > billing.currentPlan.monthly_price;
              const isDowngrade = plan.monthly_price < billing.currentPlan.monthly_price;
              const downgradeDisabled = isDowngrade && billing.usable;
              const isPremium = plan.code === "premium";
              const features = planFeatureList(plan);
              return (
                <article
                  key={plan.id}
                  id={plan.code ? `billing-plan-${plan.code}` : undefined}
                  className={cn(
                    "relative rounded-[var(--d-r-lg)] border bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)] transition",
                    isPremium ? "border-[var(--d-orange)]/40" : "border-[var(--d-line)]",
                    isCurrent && "ring-1 ring-[var(--d-jade)]"
                  )}
                >
                  {isPremium ? (
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-[var(--d-r-pill)] bg-[var(--d-orange)] px-3 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase text-white">
                      Phổ biến nhất
                    </span>
                  ) : null}
                  <div className="text-center">
                    <p className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{planShortName(plan)}</p>
                    <p className={cn("d-num mt-2 text-[length:var(--d-fs-display)] font-bold", isPremium ? "text-[var(--d-orange-600)]" : "text-[var(--d-text)]")}>{formatVnd(plan.monthly_price)}</p>
                    <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">/ tháng</p>
                  </div>
                  <form action={requestSubscriptionPaymentAction} className="mt-4 grid gap-2">
                    <input type="hidden" name="planCode" value={plan.code} />
                    <select name="months" defaultValue="1" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold outline-none focus:border-[var(--d-jade)]">
                      <option value="1">1 tháng</option>
                      <option value="3">3 tháng</option>
                      <option value="6">6 tháng</option>
                      <option value="12">12 tháng</option>
                    </select>
                    <Button type="submit" variant={isPremium ? "primary" : "secondary"} size="md" disabled={downgradeDisabled}>
                      {isCurrent ? "Gia hạn gói" : isUpgrade ? "Chọn gói" : "Hạ gói"}
                    </Button>
                  </form>
                  <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
                    {features.slice(0, 8).map((f) => (
                      <p key={f} className="flex items-start gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                        <Check size={12} className="mt-0.5 shrink-0 text-[var(--d-primary)]" />
                        <span>{f}</span>
                      </p>
                    ))}
                  </div>
                  {downgradeDisabled ? (
                    <p className="mt-3 rounded-[var(--d-r-sm)] border border-[var(--d-orange)]/25 bg-[var(--d-accent-soft)] px-2.5 py-2 text-[length:var(--d-fs-2xs)] font-semibold leading-4 text-[var(--d-orange-600)]">
                      Hạ gói được xử lý sau kỳ hiện tại để không mất quyền đang dùng.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <p className="text-center text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">Tất cả gói đều bao gồm: QR Order, Menu, Đơn hàng, Khách hàng, Báo cáo cơ bản.</p>
        </div>
      ) : null}

      {activeStep === "payment" ? (
        pending ? (
          <div className="grid gap-[var(--d-s-4)] lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel className="p-[var(--d-s-5)]">
              <h3 className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">Thanh toán gói {planShortName(pendingPlan ?? billing.currentPlan)}</h3>
              <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Quét mã QR để thanh toán</p>
              <div className="mt-4 flex items-start gap-2 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2.5 text-[length:var(--d-fs-xs)] font-semibold leading-5 text-[var(--d-orange-600)]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>Vui lòng chuyển đúng nội dung và số tiền để hệ thống xác nhận tự động.</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Số tiền</p>
                  <p className="d-num mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{formatVnd(pending.amount)}</p>
                </div>
                <div>
                  <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Ngân hàng nhận</p>
                  <p className="mt-1 font-bold text-[var(--d-text)]">{billing.billing.bankCode}</p>
                  <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{billing.billing.bankAccountName}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Nội dung chuyển khoản</p>
                  <p className="d-num mt-2 inline-flex max-w-full break-all rounded-[var(--d-r-sm)] bg-[var(--d-surface-2)] px-3 py-2 font-mono text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{pending.transfer_content}</p>
                </div>
              </div>
              <Link href={billingStepHref("processing")} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">
                Tôi đã thanh toán <ArrowRight size={14} />
              </Link>
              <div className="mt-4"><PaymentAutoSync /></div>
            </Panel>
            <Panel className="p-[var(--d-s-4)] text-center">
              <Image src={pending.qrUrl} alt="QR thanh toán" width={240} height={240} className="mx-auto h-auto max-w-full rounded-[var(--d-r-md)]" />
              <p className="mt-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Tạo lúc</p>
              <p className="d-num text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{fmtDateTime(pending.created_at)}</p>
            </Panel>
          </div>
        ) : (
          <Panel className="grid place-items-center p-[var(--d-s-6)] text-center">
            <div className="grid gap-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[var(--d-primary)]">
                <QrCode size={24} />
              </div>
              <h3 className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">Chưa có QR thanh toán</h3>
              <p className="mx-auto max-w-md text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Chọn gói hoặc gia hạn để hệ thống tạo VietQR.</p>
              <div className="mx-auto grid w-full max-w-xs gap-2">
                <Link href={billingStepHref("compare")} className="inline-flex h-10 items-center justify-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-4 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">
                  Chọn gói
                </Link>
                <form action={requestSubscriptionPaymentAction}>
                  <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                  <input type="hidden" name="months" value="1" />
                  <Button type="submit" variant="secondary" size="md" className="w-full">Tạo QR gia hạn</Button>
                </form>
              </div>
            </div>
          </Panel>
        )
      ) : null}

      {activeStep === "processing" ? (
        <Panel className="grid place-items-center p-[var(--d-s-6)] text-center">
          <div className="grid gap-4">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[var(--d-primary)]">
              <Hourglass size={36} />
            </div>
            <div>
              <h3 className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">
                {pending ? "Đang xác nhận thanh toán" : latestPayment?.status === "confirmed" ? "Giao dịch đã hoàn tất" : "Không có thanh toán đang xử lý"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                {pending ? "Bạn sẽ được kích hoạt quyền gói mới ngay khi xác nhận thành công." : "Yêu cầu mới sẽ hiện ở đây khi có."}
              </p>
            </div>
            <div className="mx-auto grid w-full max-w-sm gap-2">
              {processingSteps.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                  <span className={cn(
                    "grid h-7 w-7 place-items-center rounded-full",
                    s.state === "done" && "bg-[var(--d-jade)] text-[var(--d-on-jade)]",
                    s.state === "active" && "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
                    s.state === "pending" && "bg-[var(--d-surface-3)] text-[var(--d-text-faint)]"
                  )}>
                    {s.state === "done" ? <Check size={13} /> : s.state === "active" ? <TimerReset size={13} /> : null}
                  </span>
                  <span className={cn("text-[length:var(--d-fs-sm)] font-semibold", s.state === "pending" ? "text-[var(--d-text-faint)]" : "text-[var(--d-text)]")}>{s.label}</span>
                </div>
              ))}
            </div>
            {pending ? <PaymentAutoSync /> : null}
          </div>
        </Panel>
      ) : null}

      {activeStep === "history" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="ok">Tất cả {billing.paymentRequests.length}</Badge>
            <Badge tone="ok">Thành công {confirmed}</Badge>
            <Badge tone="orange">Đang xử lý {waiting}</Badge>
            <Badge tone="danger">Thất bại {failed}</Badge>
          </div>
          {billing.paymentRequests.length ? (
            <Panel className="overflow-hidden">
              <div className="grid gap-2 p-[var(--d-s-3)] md:hidden">
                {billing.paymentRequests.slice(0, 8).map((p) => {
                  const plan = billing.plans.find((x) => x.id === p.plan_id) ?? billing.currentPlan;
                  return (
                    <article key={p.id} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{planShortName(plan)}</p>
                          <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{fmtDate(p.confirmed_at ?? p.created_at)}</p>
                        </div>
                        <Badge tone={paymentTone(p.status)}>{paymentStatusLabel(p.status)}</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-[var(--d-line)] pt-3">
                        <p className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(p.amount)}</p>
                        <Link href={billingStepHref("detail", p.id)} className="inline-flex h-9 items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]">Xem</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left text-[length:var(--d-fs-xs)]">
                  <thead className="bg-[var(--d-surface-2)] text-[var(--d-text-faint)]">
                    <tr>
                      <th className="px-[var(--d-s-4)] py-3 font-bold uppercase tracking-[var(--d-track-wide)]">Ngày</th>
                      <th className="px-[var(--d-s-4)] py-3 font-bold uppercase tracking-[var(--d-track-wide)]">Gói</th>
                      <th className="px-[var(--d-s-4)] py-3 font-bold uppercase tracking-[var(--d-track-wide)]">Số tiền</th>
                      <th className="px-[var(--d-s-4)] py-3 font-bold uppercase tracking-[var(--d-track-wide)]">Trạng thái</th>
                      <th className="px-[var(--d-s-4)] py-3 text-right font-bold uppercase tracking-[var(--d-track-wide)]">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.paymentRequests.slice(0, 8).map((p) => {
                      const plan = billing.plans.find((x) => x.id === p.plan_id) ?? billing.currentPlan;
                      return (
                        <tr key={p.id} className="border-t border-[var(--d-line)]">
                          <td className="px-[var(--d-s-4)] py-3 font-semibold text-[var(--d-text-muted)]">{fmtDate(p.confirmed_at ?? p.created_at)}</td>
                          <td className="px-[var(--d-s-4)] py-3 font-bold text-[var(--d-text)]">{planShortName(plan)}</td>
                          <td className="px-[var(--d-s-4)] py-3 d-num font-bold text-[var(--d-text)]">{formatVnd(p.amount)}</td>
                          <td className="px-[var(--d-s-4)] py-3"><Badge tone={paymentTone(p.status)}>{paymentStatusLabel(p.status)}</Badge></td>
                          <td className="px-[var(--d-s-4)] py-3 text-right">
                            <Link href={billingStepHref("detail", p.id)} className="inline-flex h-8 items-center rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-primary)] transition hover:border-[var(--d-jade)]">Xem</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : (
            <Panel className="grid place-items-center p-[var(--d-s-6)] text-center">
              <div>
                <ReceiptText size={32} className="mx-auto text-[var(--d-text-faint)]" />
                <p className="mt-3 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Chưa có giao dịch</p>
                <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Giao dịch mới sẽ xuất hiện sau khi tạo VietQR.</p>
              </div>
            </Panel>
          )}
        </div>
      ) : null}

      {activeStep === "detail" ? (
        selectedPayment ? (
          <div className="grid gap-[var(--d-s-4)] xl:grid-cols-[minmax(0,1fr)_320px]">
            <Panel className="p-[var(--d-s-5)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="d-num break-all font-mono text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">#{selectedPayment.transfer_content}</p>
                  <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{fmtDateTime(selectedPayment.created_at)}</p>
                </div>
                <Badge tone={paymentTone(selectedPayment.status)}>{paymentStatusLabel(selectedPayment.status)}</Badge>
              </div>
              <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
                <p className="d-eyebrow">Thông tin thanh toán</p>
                <div className="mt-3 grid gap-2 text-[length:var(--d-fs-sm)]">
                  <Row label="Gói dịch vụ" value={planShortName(selectedPlan)} />
                  <Row label="Chu kỳ" value={`${selectedPayment.months} tháng`} />
                  <Row label="Phương thức" value={selectedPayment.method} />
                  <Row label="Mã giao dịch" value={selectedPayment.transfer_content} mono />
                  <Row label="Ngày xác nhận" value={fmtDateTime(selectedPayment.confirmed_at)} />
                </div>
              </div>
              {selectedPayment.rejected_reason ? (
                <p className="mt-3 rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] p-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
                  {selectedPayment.rejected_reason}
                </p>
              ) : null}
            </Panel>
            <Panel className="p-[var(--d-s-5)]">
              <p className="d-eyebrow">Chi tiết hoá đơn</p>
              <div className="mt-3 grid gap-2 text-[length:var(--d-fs-sm)]">
                <Row label="Tạm tính" value={formatVnd(selectedPayment.amount)} />
                <Row label="VAT (0%)" value={formatVnd(0)} />
                <div className="mt-1 flex items-center justify-between border-t border-[var(--d-line)] pt-3 text-[length:var(--d-fs-h3)]">
                  <span className="font-semibold text-[var(--d-text)]">Tổng cộng</span>
                  <span className="d-num font-bold text-[var(--d-text)]">{formatVnd(selectedPayment.amount)}</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="mt-4 w-full"
                onClick={() =>
                  openInvoicePrint({
                    planName: planShortName(selectedPlan),
                    amount: selectedPayment.amount,
                    months: selectedPayment.months,
                    method: selectedPayment.method,
                    transferContent: selectedPayment.transfer_content,
                    createdAt: selectedPayment.created_at,
                    confirmedAt: selectedPayment.confirmed_at,
                    status: selectedPayment.status,
                    bankAccountName: billing.billing.bankAccountName,
                    bankCode: billing.billing.bankCode
                  })
                }
              >
                <Download size={15} /> Tải / In hoá đơn
              </Button>
            </Panel>
          </div>
        ) : (
          <Panel className="grid place-items-center p-[var(--d-s-6)] text-center">
            <div>
              <ReceiptText size={32} className="mx-auto text-[var(--d-text-faint)]" />
              <p className="mt-3 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">Chưa có chi tiết giao dịch</p>
              <p className="mt-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Tạo thanh toán để xem mã giao dịch và QR.</p>
            </div>
          </Panel>
        )
      ) : null}

      {activeStep === "manage" ? (
        <div className="grid gap-[var(--d-s-4)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="p-[var(--d-s-5)] text-center">
            <Badge tone="orange"><Crown size={11} className="mr-1 inline" />{planShortName(billing.currentPlan)}</Badge>
            <p className="d-num mt-3 text-[length:var(--d-fs-display)] font-bold text-[var(--d-text)]">{formatVnd(billing.currentPlan.monthly_price)}</p>
            <p className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">/ tháng</p>
            <Badge tone={billing.usable ? "ok" : "orange"} className="mt-3">{accessLabel}</Badge>
            <p className="mt-4 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">Gia hạn vào</p>
            <p className="mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{fmtDate(periodEnd)} {billing.daysLeft > 0 ? `(còn ${billing.daysLeft} ngày)` : ""}</p>
            <div className="mt-3"><Progress value={elapsed} /></div>
          </Panel>
          <div className="grid gap-3">
            {pendingChange ? (
              <p className="rounded-[var(--d-r-md)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
                {pendingChange.summary}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3">
              <Link href={billingStepHref("compare")} className="inline-flex h-10 items-center justify-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-4 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">Nâng cấp</Link>
              <form action={requestSubscriptionPaymentAction}>
                <input type="hidden" name="planCode" value={billing.currentPlan.code} />
                <input type="hidden" name="months" value="1" />
                <Button type="submit" variant="secondary" size="md" className="w-full">Gia hạn</Button>
              </form>
              <button type="button" disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-danger-fg)] opacity-60">
                <LockKeyhole size={14} /> Huỷ qua hỗ trợ
              </button>
            </div>
            <Panel className="p-[var(--d-s-4)]">
              <p className="d-eyebrow">Nguyên tắc xử lý gói</p>
              <div className="mt-2 grid gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
                <p>Gia hạn nối tiếp kỳ hiện tại, không làm mất ngày còn lại.</p>
                <p>Nâng cấp đổi quyền ngay sau khi xác minh thanh toán.</p>
                <p>Hạ gói được xử lý an toàn sau kỳ để không mất quyền đang dùng.</p>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {prevStep ? (
          <Link href={billingStepHref(prevStep, prevStep === "detail" ? detailPaymentId : undefined)} className="inline-flex h-10 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:text-[var(--d-primary)]">
            <ArrowLeft size={14} /> Quay lại
          </Link>
        ) : <span />}
        {nextStep ? (
          <Link href={billingStepHref(nextStep, nextStep === "detail" ? detailPaymentId : undefined)} className="inline-flex h-10 items-center gap-1.5 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">
            Tiếp tục <ArrowRight size={14} />
          </Link>
        ) : (
          <Link href="/dashboard/settings" className="inline-flex h-10 items-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-5 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] hover:bg-[var(--d-jade-700)]">Hoàn tất</Link>
        )}
      </footer>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--d-text-muted)]">{label}</span>
      <span className={cn("text-right font-semibold text-[var(--d-text)]", mono && "break-all font-mono text-[length:var(--d-fs-xs)]")}>{value}</span>
    </div>
  );
}

/* PaymentAutoSync — tự động làm mới để bắt trạng thái xác nhận từ platform-admin.
 * Vì xác nhận thanh toán do hệ thống/admin xử lý ngoài luồng, chủ quán không phải
 * tự reload — màn hình tự cập nhật khi gói được kích hoạt. */
function PaymentAutoSync({ intervalSeconds = 10 }: { intervalSeconds?: number }) {
  const router = useRouter();
  const [secs, setSecs] = useState(intervalSeconds);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          setChecking(true);
          router.refresh();
          window.setTimeout(() => setChecking(false), 1200);
          return intervalSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [router, intervalSeconds]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-[var(--d-s-4)] py-2.5">
      <span className="inline-flex items-center gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
        <TimerReset size={14} className={cn("text-[var(--d-primary)]", checking && "animate-spin")} />
        {checking ? "Đang kiểm tra trạng thái…" : `Tự động kiểm tra sau ${secs}s`}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={checking}
        onClick={() => {
          setChecking(true);
          setSecs(intervalSeconds);
          router.refresh();
          window.setTimeout(() => setChecking(false), 1200);
        }}
      >
        Kiểm tra ngay
      </Button>
    </div>
  );
}
