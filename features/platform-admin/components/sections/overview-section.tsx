import Link from "next/link";
import { Banknote, Building2, CreditCard, Database, KeyRound, PackageCheck, ShieldCheck } from "lucide-react";
import { confirmSubscriptionPaymentAction } from "@/app/admin/actions";
import { ModuleMap } from "@/features/platform-admin/components/module-map";
import {
  MetricCard,
  PrimaryButton,
  SectionCard,
  formatNumber
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";
import { formatVnd } from "@/lib/money";

export function Overview({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      {snapshot.warnings.length ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-semibold leading-6 text-orange-800">
          Cần chạy migration mới nhất: {snapshot.warnings.join(" · ")}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cửa hàng" value={formatNumber(snapshot.metrics.tenants)} detail={`${snapshot.metrics.activeTenants} đang hoạt động`} icon={Building2} tone="info" />
        <MetricCard label="Subscription active" value={formatNumber(snapshot.metrics.activeSubscriptions)} detail={`${snapshot.metrics.trialingSubscriptions} quán đang trial 30 ngày`} icon={PackageCheck} tone="good" />
        <MetricCard label="MRR nền tảng" value={formatVnd(snapshot.metrics.mrr)} detail="Chỉ tính phí SaaS của LogiVN, không đọc doanh thu quán" icon={Banknote} tone="good" />
        <MetricCard label="Chờ xác minh" value={formatNumber(snapshot.metrics.pendingPayments)} detail="Giao dịch VietQR mua/gia hạn gói" icon={CreditCard} tone={snapshot.metrics.pendingPayments ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <SectionCard title="Việc cần xử lý ngay">
          <div className="grid gap-2">
            {snapshot.payments.filter((payment) => payment.status === "waiting_confirm").slice(0, 6).map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{payment.restaurantName} · {formatVnd(payment.amount)}</p>
                  <p className="mt-1 font-mono text-xs text-orange-700">{payment.transferContent}</p>
                </div>
                <div className="flex gap-2">
                  <form action={confirmSubscriptionPaymentAction}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <PrimaryButton tone="orange">Xác minh</PrimaryButton>
                  </form>
                  <Link href="/admin/billing" className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-semibold text-orange-700">
                    Chi tiết
                  </Link>
                </div>
              </div>
            ))}
            {!snapshot.metrics.pendingPayments ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                Không có giao dịch gói nào đang chờ xác minh.
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Guardrails thương mại">
          <div className="grid gap-3 text-sm leading-6 text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck size={16} /> Tách quyền rõ ràng</div>
              `/admin` chỉ là control plane nền tảng; không đọc danh sách đơn, bill hay doanh thu riêng của quán.
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><KeyRound size={16} /> Trial abuse</div>
              {snapshot.metrics.abuseSignals ? `${snapshot.metrics.abuseSignals} email có dấu hiệu tạo trial nhiều lần.` : "Chưa có tín hiệu lạm dụng trial."}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950"><Database size={16} /> RLS + service role</div>
              Tenant data vẫn được bảo vệ bằng RLS; tác vụ nền tảng dùng service-role ở server.
            </div>
          </div>
        </SectionCard>
      </div>

      <ModuleMap snapshot={snapshot} />
    </div>
  );
}
