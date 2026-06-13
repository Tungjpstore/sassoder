"use client";

/* RealBillingV2 — vùng "Gói LogiVN" thiết kế lại hoàn toàn theo v2.
 * Layout đơn giản, đồng điệu các workspace v2:
 *   1. Status row mỏng — gói hiện tại + ngày còn lại + nút gia hạn
 *   2. 3 stat tiles — Bàn / Nhân viên / AI (% sử dụng)
 *   3. Plans grid — 3 cột so sánh gói, dense
 *   4. Payment list — bảng nhỏ trạng thái thanh toán gần nhất
 *   5. Pending QR — chỉ hiện khi có payment chờ
 * Backend giữ nguyên: requestSubscriptionPaymentAction.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, Check, Clock3, Crown, Hourglass, QrCode, Sparkles, Wallet } from "lucide-react";
import { requestSubscriptionPaymentAction } from "@/app/dashboard/actions";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { Button } from "../button";
import { Modal } from "../overlay";
import { formatVnd } from "@/lib/money";
import type { PlanFeatureKey } from "@/services/billing/plan-features";
import { cn } from "@/lib/utils";

type BillingPortal = {
  daysLeft: number;
  usable: boolean;
  hasPendingPayment: boolean;
  needsPayment: boolean;
  subscription: {
    status: string;
    current_period_end: string | null;
    trial_ends_at: string | null;
  };
  currentPlan: {
    id: string;
    code: string;
    name: string;
    monthly_price: number;
  };
  plans: Array<{ id: string; code: string; name: string; monthly_price: number; features?: unknown }>;
  paymentRequests: Array<{
    id: string;
    plan_id: string;
    status: string;
    amount: number;
    months: number;
    transfer_content: string;
    created_at: string;
    qrUrl: string;
  }>;
  pendingPayment: { id: string; transfer_content: string; qrUrl: string; amount: number } | null;
  pendingChange?: unknown;
  resolvedSnapshot: {
    features: Record<string, { state: string; includedInPlan?: boolean; usage?: { used: number; limit: number } | null; badge?: string | null }>;
    quotas: Record<string, { used: number; limit: number }>;
  };
};

type Props = {
  billing: BillingPortal;
  billingError?: string | null;
  tableCount: number;
  menuItemCount: number;
  staffCount: number;
  gatedFeatureKey?: PlanFeatureKey | null;
};

function planShortName(name: string) {
  return name.replace(/LogiVN\s*/i, "").trim() || name;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function statusBadge(status: string): { label: string; tone: "ok" | "orange" | "danger" | "info" | "neutral" } {
  if (status === "active") return { label: "Đang dùng", tone: "ok" };
  if (status === "trialing") return { label: "Dùng thử", tone: "info" };
  if (status === "pending_payment") return { label: "Chờ thanh toán", tone: "orange" };
  if (status === "expired" || status === "cancelled") return { label: "Đã hết hạn", tone: "danger" };
  return { label: status, tone: "neutral" };
}

function paymentBadge(status: string) {
  if (status === "confirmed") return { label: "Đã thu", tone: "ok" as const };
  if (status === "waiting_confirm" || status === "pending") return { label: "Chờ xác nhận", tone: "orange" as const };
  if (status === "rejected" || status === "expired") return { label: "Thất bại", tone: "danger" as const };
  return { label: status, tone: "neutral" as const };
}

function usagePercent(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: "Cơ bản nhất cho quán mới mở",
  growth: "Cho quán đã ổn định, 2–3 nhân viên",
  premium: "Toàn bộ tính năng nâng cao + AI"
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["Đặt món QR", "Bếp KDS", "Báo cáo cơ bản", "1 chi nhánh"],
  growth: ["Tất cả gói cơ bản", "Đặt bàn trước", "Khuyến mãi nâng cao", "3 chi nhánh", "Báo cáo email"],
  premium: ["Tất cả gói tăng trưởng", "AI tối ưu vận hành", "OCR hoá đơn", "Không giới hạn chi nhánh", "Hỗ trợ 24/7"]
};

export function RealBillingV2({ billing, billingError, tableCount, menuItemCount, staffCount }: Props) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewPlanId, setRenewPlanId] = useState<string>(billing.currentPlan.id);

  const status = statusBadge(billing.hasPendingPayment ? "pending_payment" : billing.subscription.status);
  const periodEnd = billing.subscription.current_period_end || billing.subscription.trial_ends_at;
  const sortedPlans = billing.plans.filter((p) => p.monthly_price > 0).sort((a, b) => a.monthly_price - b.monthly_price);

  const aiQuota = billing.resolvedSnapshot.quotas.ai_chatbot ?? billing.resolvedSnapshot.quotas.ai_menu_generation ?? null;
  const aiPercent = aiQuota ? usagePercent(aiQuota.used, aiQuota.limit) : 0;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      {/* 1. Status row mỏng */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">
            <Crown size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">Gói {planShortName(billing.currentPlan.name)}</h2>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
              {formatVnd(billing.currentPlan.monthly_price)}/tháng · Gia hạn vào{" "}
              <span className="d-num font-semibold text-[var(--d-text)]">{formatDate(periodEnd)}</span>
              {billing.daysLeft > 0 ? ` · Còn ${billing.daysLeft} ngày` : ""}
            </p>
          </div>
          <Button
            variant={billing.hasPendingPayment ? "secondary" : "primary"}
            size="md"
            onClick={() => setRenewOpen(true)}
          >
            {billing.hasPendingPayment ? <><Clock3 size={15} /> Theo dõi CK</> : <><Wallet size={15} /> Gia hạn</>}
          </Button>
        </div>
      </section>

      {billingError ? (
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
          {billingError}
        </div>
      ) : null}

      {/* 2. 3 stat tiles */}
      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Wallet size={18} />} label="Bàn đang dùng" value={String(tableCount)} helper={`${menuItemCount} món`} tone="jade" />
        <MetricCard icon={<Sparkles size={18} />} label="Lượt AI" value={`${aiPercent}%`} helper={aiQuota ? `${aiQuota.used}/${aiQuota.limit}` : "Chưa có quota"} tone={aiPercent >= 85 ? "danger" : aiPercent >= 60 ? "orange" : "info"} />
        <MetricCard icon={<Crown size={18} />} label="Nhân viên" value={String(staffCount)} helper="Tài khoản đang dùng" tone="orange" />
        <MetricCard icon={<Check size={18} />} label="Còn lại" value={`${billing.daysLeft}`} helper="ngày trong chu kỳ" tone={billing.daysLeft <= 7 ? "danger" : "neutral"} />
      </section>

      {/* 3. Plans grid */}
      <section className="flex flex-col gap-[var(--d-s-3)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="d-eyebrow">Chọn gói</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h2)] font-semibold text-[var(--d-text)]">So sánh gói LogiVN</h3>
          </div>
          <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            Mọi gói đều hỗ trợ VietQR · Có thể đổi bất kỳ lúc nào
          </span>
        </div>

        <div className="grid gap-[var(--d-s-3)] md:grid-cols-3">
          {sortedPlans.map((plan) => {
            const isCurrent = plan.id === billing.currentPlan.id;
            const isPremium = plan.code === "premium";
            const features = PLAN_FEATURES[plan.code] ?? [];
            return (
              <article
                key={plan.id}
                className={cn(
                  "relative flex flex-col gap-[var(--d-s-3)] rounded-[var(--d-r-lg)] border bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]",
                  isPremium ? "border-[var(--d-orange)]" : "border-[var(--d-line)]",
                  isCurrent && "ring-1 ring-[var(--d-jade)]"
                )}
              >
                {isPremium ? (
                  <span className="absolute -top-2 right-3 rounded-[var(--d-r-pill)] bg-[var(--d-orange)] px-2 py-0.5 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-white">
                    Đề xuất
                  </span>
                ) : null}
                <div>
                  <p className="d-eyebrow">{planShortName(plan.name)}</p>
                  <p className="mt-2 d-num text-[length:var(--d-fs-display)] font-bold text-[var(--d-text)]">
                    {formatVnd(plan.monthly_price)}
                    <span className="ml-1 text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text-muted)]">/tháng</span>
                  </p>
                  <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                    {PLAN_DESCRIPTIONS[plan.code] ?? "Gói LogiVN"}
                  </p>
                </div>
                <ul className="grid gap-1.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[length:var(--d-fs-sm)] text-[var(--d-text)]">
                      <Check size={14} className="mt-0.5 flex-none text-[var(--d-jade)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Badge tone="ok" className="self-start">Đang dùng</Badge>
                ) : (
                  <Button
                    variant={isPremium ? "primary" : "secondary"}
                    size="md"
                    onClick={() => {
                      setRenewPlanId(plan.id);
                      setRenewOpen(true);
                    }}
                  >
                    Chọn gói {planShortName(plan.name)}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* 4. Payment list */}
      <section className="flex flex-col gap-[var(--d-s-3)]">
        <div className="flex items-end justify-between">
          <div>
            <p className="d-eyebrow">Lịch sử thanh toán</p>
            <h3 className="mt-1 text-[length:var(--d-fs-h2)] font-semibold text-[var(--d-text)]">Yêu cầu gần nhất</h3>
          </div>
          <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {billing.paymentRequests.length} yêu cầu
          </span>
        </div>

        {billing.paymentRequests.length === 0 ? (
          <EmptyState
            icon={<Wallet size={20} />}
            title="Chưa có yêu cầu thanh toán"
            description="Yêu cầu thanh toán sẽ xuất hiện ở đây sau khi bạn chọn gói và tạo VietQR."
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
            <table className="w-full text-left text-[length:var(--d-fs-sm)]">
              <thead className="border-b border-[var(--d-line)] bg-[var(--d-surface-2)] text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
                <tr>
                  <th className="px-4 py-2.5">Mã CK</th>
                  <th className="px-4 py-2.5">Gói · Tháng</th>
                  <th className="px-4 py-2.5 text-right">Số tiền</th>
                  <th className="px-4 py-2.5">Tạo lúc</th>
                  <th className="px-4 py-2.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--d-line)]">
                {billing.paymentRequests.slice(0, 10).map((p) => {
                  const plan = billing.plans.find((pl) => pl.id === p.plan_id);
                  const st = paymentBadge(p.status);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 d-num font-semibold text-[var(--d-text)]">{p.transfer_content}</td>
                      <td className="px-4 py-2.5 text-[var(--d-text-muted)]">
                        {planShortName(plan?.name ?? "—")} · {p.months} tháng
                      </td>
                      <td className="px-4 py-2.5 text-right d-num font-bold text-[var(--d-text)]">{formatVnd(p.amount)}</td>
                      <td className="px-4 py-2.5 text-[var(--d-text-muted)]">{formatDate(p.created_at)}</td>
                      <td className="px-4 py-2.5 text-right"><Badge tone={st.tone}>{st.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Pending QR */}
      {billing.pendingPayment ? (
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)]/40 p-[var(--d-s-5)]">
          <div className="flex flex-wrap items-start gap-[var(--d-s-4)]">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-orange)] text-white">
              <Hourglass size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="d-eyebrow text-[var(--d-orange-600)]">Đang chờ xác nhận</p>
              <h3 className="mt-1 text-[length:var(--d-fs-h2)] font-semibold text-[var(--d-text)]">VietQR đã sẵn sàng</h3>
              <p className="mt-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                Quét QR hoặc chuyển khoản với nội dung{" "}
                <span className="d-num font-bold text-[var(--d-text)]">{billing.pendingPayment.transfer_content}</span>{" "}
                — Hệ thống sẽ kích hoạt gói tự động sau khi xác nhận giao dịch.
              </p>
              <p className="mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
                Số tiền: <span className="d-num">{formatVnd(billing.pendingPayment.amount)}</span>
              </p>
            </div>
            <div className="grid place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
              <Image src={billing.pendingPayment.qrUrl} alt="QR thanh toán gói LogiVN" width={160} height={160} className="rounded-[var(--d-r-sm)]" unoptimized />
            </div>
          </div>
        </section>
      ) : null}

      <RenewPlanModal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        plans={sortedPlans}
        selectedPlanId={renewPlanId}
        onSelectPlan={setRenewPlanId}
      />
    </div>
  );
}

function RenewPlanModal({
  open,
  onClose,
  plans,
  selectedPlanId,
  onSelectPlan
}: {
  open: boolean;
  onClose: () => void;
  plans: Array<{ id: string; code: string; name: string; monthly_price: number }>;
  selectedPlanId: string;
  onSelectPlan: (id: string) => void;
}) {
  if (!open) return null;
  const selected = plans.find((p) => p.id === selectedPlanId) ?? plans[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo yêu cầu thanh toán"
      subtitle="Gói LogiVN"
      size="md"
    >
      <form action={requestSubscriptionPaymentAction} className="grid gap-[var(--d-s-3)]">
        <input type="hidden" name="planCode" value={selected?.code ?? ""} />

        <fieldset className="grid gap-2">
          <legend className="text-[length:var(--d-fs-xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Chọn gói</legend>
          <div className="grid gap-2">
            {plans.map((p) => {
              const on = p.id === selectedPlanId;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--d-r-md)] border p-3 transition",
                    on ? "border-[var(--d-jade)] bg-[var(--d-primary-soft)]" : "border-[var(--d-line)] bg-[var(--d-surface-2)] hover:border-[var(--d-line-strong)]"
                  )}
                >
                  <input
                    type="radio"
                    name="planId"
                    value={p.id}
                    checked={on}
                    onChange={() => onSelectPlan(p.id)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1">
                    <span className="block font-semibold text-[var(--d-text)]">{p.name}</span>
                    <span className="d-num block text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
                      {formatVnd(p.monthly_price)}/tháng
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Số tháng</span>
          <select
            name="months"
            defaultValue="1"
            className="h-11 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] outline-none focus:border-[var(--d-jade)]"
          >
            <option value="1">1 tháng</option>
            <option value="3">3 tháng</option>
            <option value="6">6 tháng</option>
            <option value="12">12 tháng</option>
          </select>
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary"><QrCode size={15} /> Tạo VietQR</Button>
        </div>
      </form>
    </Modal>
  );
}
