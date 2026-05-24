import { Banknote, CircleDot, CreditCard } from "lucide-react";
import {
  confirmSubscriptionPaymentAction,
  rejectSubscriptionPaymentAction,
  resolveBillingAnomalyAction
} from "@/app/admin/actions";
import {
  MetricCard,
  PrimaryButton,
  SectionCard,
  badgeTone,
  formatDateTime,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import {
  cutoverSourceLabel,
  cutoverStatusLabel,
  paymentStatusLabel
} from "@/features/platform-admin/labels";
import { billingAnomalyActionLabel, canResolveBillingAnomaly } from "@/features/platform-admin/lib/billing";
import type { Snapshot } from "@/features/platform-admin/types";
import { formatVnd } from "@/lib/money";

export function Billing({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Chờ xác minh" value={formatNumber(snapshot.metrics.pendingPayments)} detail="Chủ nền tảng xác nhận thủ công" icon={CreditCard} tone="warning" />
        <MetricCard label="MRR" value={formatVnd(snapshot.metrics.mrr)} detail="Doanh thu SaaS dự kiến hằng tháng" icon={Banknote} tone="good" />
        <MetricCard label="Trial" value={formatNumber(snapshot.metrics.trialingSubscriptions)} detail="Cần chuyển đổi sau 30 ngày" icon={CircleDot} tone="info" />
      </div>

      <SectionCard title="Billing v2 cutover health">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Trạng thái</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={badgeTone(statusTone(snapshot.billingCutover.status === "healthy" ? "live" : snapshot.billingCutover.status === "partial" ? "needs_review" : "needs_config"))}>
                  {cutoverStatusLabel[snapshot.billingCutover.status]}
                </span>
                <span className={badgeTone(statusTone(snapshot.billingCutover.source === "v2" ? "live" : snapshot.billingCutover.source === "mixed" ? "needs_review" : "needs_config"))}>
                  {cutoverSourceLabel[snapshot.billingCutover.source]}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Màn này giúp nhìn nhanh coverage giữa legacy billing và billing v2 sau migration/backfill.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Legacy</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3"><span>Subscriptions</span><strong>{formatNumber(snapshot.billingCutover.legacy.subscriptions)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payments</span><strong>{formatNumber(snapshot.billingCutover.legacy.payments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Pending</span><strong>{formatNumber(snapshot.billingCutover.legacy.pendingPayments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>AI successes</span><strong>{formatNumber(snapshot.billingCutover.legacy.aiUsageSuccess)}</strong></div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Billing v2</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <div className="flex items-center justify-between gap-3"><span>Plans</span><strong>{formatNumber(snapshot.billingCutover.v2.plans)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Entitlements</span><strong>{formatNumber(snapshot.billingCutover.v2.entitlements)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Subscriptions</span><strong>{formatNumber(snapshot.billingCutover.v2.subscriptions)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Invoices</span><strong>{formatNumber(snapshot.billingCutover.v2.invoices)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payments</span><strong>{formatNumber(snapshot.billingCutover.v2.payments)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Payment logs</span><strong>{formatNumber(snapshot.billingCutover.v2.paymentLogs)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Usage quotas</span><strong>{formatNumber(snapshot.billingCutover.v2.usageQuotas)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Feature usage</span><strong>{formatNumber(snapshot.billingCutover.v2.featureUsageLogs)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Trial usage</span><strong>{formatNumber(snapshot.billingCutover.v2.trialUsage)}</strong></div>
                <div className="flex items-center justify-between gap-3"><span>Upgrade events</span><strong>{formatNumber(snapshot.billingCutover.v2.upgradeEvents)}</strong></div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {snapshot.billingCutover.checks.map((check) => (
              <div key={check.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{check.label}</p>
                  <span className={badgeTone(check.status === "pass" ? "good" : check.status === "warn" ? "warning" : "danger")}>
                    {check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              CLI check: <code className="rounded bg-white px-1.5 py-0.5 text-slate-950">npm run billing:verify</code>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Billing anomalies cần xử lý">
        <div className="grid gap-3">
          {snapshot.billingCutover.anomalies.length ? (
            snapshot.billingCutover.anomalies.map((anomaly) => (
              <div key={`${anomaly.key}-${anomaly.subscriptionId ?? anomaly.paymentId ?? anomaly.restaurantId}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{anomaly.restaurantName}</p>
                    <p className="mt-1 text-xs text-slate-500">{anomaly.restaurantSlug}.logivn.com</p>
                  </div>
                  <span className={badgeTone(anomaly.severity === "danger" ? "danger" : "warning")}>
                    {anomaly.severity === "danger" ? "Cần xử lý gấp" : "Cần rà soát"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{anomaly.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  {anomaly.subscriptionId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">subscription {anomaly.subscriptionId.slice(0, 8)}</span> : null}
                  {anomaly.paymentId ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">payment {anomaly.paymentId.slice(0, 8)}</span> : null}
                </div>
                {canResolveBillingAnomaly(anomaly) ? (
                  <form action={resolveBillingAnomalyAction} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs leading-5 text-slate-500">
                      <p className="font-semibold text-slate-700">Safe reconcile</p>
                      <p>Chỉ cập nhật trạng thái/metadata đã được guard server-side và ghi audit log.</p>
                    </div>
                    <input type="hidden" name="key" value={anomaly.key} />
                    {anomaly.subscriptionId ? <input type="hidden" name="subscriptionId" value={anomaly.subscriptionId} /> : null}
                    {anomaly.paymentId ? <input type="hidden" name="paymentId" value={anomaly.paymentId} /> : null}
                    <PrimaryButton tone={anomaly.severity === "danger" ? "orange" : "soft"}>
                      {billingAnomalyActionLabel(anomaly)}
                    </PrimaryButton>
                  </form>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                    Thiếu định danh để tự động xử lý. Cần rà soát thủ công bằng CLI audit.
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              Chưa phát hiện anomaly billing rõ ràng trong snapshot hiện tại.
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Audit sâu hơn bằng CLI: <code className="rounded bg-white px-1.5 py-0.5 text-slate-950">npm run billing:audit</code>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Giao dịch mua/gia hạn gói">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Quán</th>
                <th className="px-3 py-3">Gói</th>
                <th className="px-3 py-3">Nội dung CK</th>
                <th className="px-3 py-3 text-right">Số tiền</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Ngày tạo</th>
                <th className="px-3 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {snapshot.payments.map((payment) => (
                <tr key={payment.id} className="bg-white align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-950">{payment.restaurantName}</p>
                    <p className="mt-1 text-xs text-slate-500">{payment.restaurantSlug}.logivn.com</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{payment.planName} · {payment.months} tháng</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{payment.transferContent}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-950">{formatVnd(payment.amount)}</td>
                  <td className="px-3 py-3"><span className={badgeTone(statusTone(payment.status))}>{paymentStatusLabel[payment.status] ?? payment.status}</span></td>
                  <td className="px-3 py-3 text-slate-500">{formatDateTime(payment.createdAt)}</td>
                  <td className="px-3 py-3">
                    {payment.status === "waiting_confirm" ? (
                      <div className="flex justify-end gap-2">
                        <form action={confirmSubscriptionPaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <PrimaryButton tone="orange">Xác minh</PrimaryButton>
                        </form>
                        <form action={rejectSubscriptionPaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input type="hidden" name="reason" value="Không khớp giao dịch ngân hàng" />
                          <PrimaryButton tone="soft">Từ chối</PrimaryButton>
                        </form>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-slate-500">{payment.confirmedAt ? `Xong ${formatDateTime(payment.confirmedAt)}` : payment.rejectedReason ?? "Đã xử lý"}</p>
                    )}
                  </td>
                </tr>
              ))}
              {!snapshot.payments.length ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>Chưa có giao dịch gói.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
