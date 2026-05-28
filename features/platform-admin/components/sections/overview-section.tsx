import Link from "next/link";
import { Activity, AlertTriangle, Bot, Building2, CheckCircle2, CreditCard, Database, GitBranch, ListTree, RadioTower, ServerCog, Store, Wifi } from "lucide-react";
import { confirmSubscriptionPaymentAction, refreshPlatformAdminAction, runPlatformCronJobAction } from "@/features/platform-admin/actions";
import { MetricCard, PrimaryButton, SectionCard, badgeTone, formatNumber } from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";
import { formatVnd } from "@/lib/money";

type Tone = Parameters<typeof badgeTone>[0];

function countTone(value: number): Tone {
  if (value > 5) return "danger";
  if (value > 0) return "warning";
  return "good";
}

function CronButton({ jobKey, label }: { jobKey: "ai-ops" | "subscriptions" | "reports" | "reservations-expire"; label: string }) {
  return (
    <form action={runPlatformCronJobAction}>
      <input type="hidden" name="jobKey" value={jobKey} />
      <PrimaryButton tone="soft">{label}</PrimaryButton>
    </form>
  );
}

export function Overview({ snapshot }: { snapshot: Snapshot }) {
  const alerts = snapshot.warnings.length + snapshot.billingCutover.anomalies.length + snapshot.aiControl.failures;
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === "waiting_confirm").slice(0, 5);
  const services = [
    { label: "API", value: `${snapshot.projectAtlas.summary.backend}`, icon: ServerCog, tone: "good" as Tone, href: "/services" },
    { label: "Redis", value: snapshot.integrations.find((item) => item.key === "persistent-cache")?.status ?? "thiếu", icon: Database, tone: snapshot.integrations.find((item) => item.key === "persistent-cache")?.status === "configured" ? "good" as Tone : "warning" as Tone, href: "/redis" },
    { label: "Workers", value: `${snapshot.cronJobs.filter((job) => job.status === "configured").length}/${snapshot.cronJobs.length}`, icon: ListTree, tone: snapshot.cronJobs.every((job) => job.status === "configured") ? "good" as Tone : "warning" as Tone, href: "/queues" },
    { label: "Telegram", value: "Ops", icon: RadioTower, tone: "info" as Tone, href: "/telegram" },
    { label: "AI", value: `${snapshot.aiControl.runtimeConfig.configuredProviders}`, icon: Bot, tone: snapshot.aiControl.runtimeConfig.configuredProviders ? "good" as Tone : "warning" as Tone, href: "/ai" },
    { label: "Thanh toán", value: `${snapshot.metrics.pendingPayments}`, icon: CreditCard, tone: snapshot.metrics.pendingPayments ? "warning" as Tone : "good" as Tone, href: "/payments" },
    { label: "Realtime", value: "Live", icon: Wifi, tone: "good" as Tone, href: "/system-map" },
    { label: "Triển khai", value: snapshot.environment.vercelEnv, icon: GitBranch, tone: "info" as Tone, href: "/deployments" }
  ];

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Bảng điều khiển"
        action={
          <div className="flex flex-wrap gap-2">
            <form action={refreshPlatformAdminAction}><PrimaryButton tone="soft">Làm mới</PrimaryButton></form>
            <CronButton jobKey="ai-ops" label="Chạy AI" />
            <CronButton jobKey="subscriptions" label="Đối soát billing" />
          </div>
        }
      >
        <div className="grid gap-2 md:grid-cols-4">
          <Link href="/queues" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]">Hàng đợi</Link>
          <Link href="/logs" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]">Nhật ký</Link>
          <Link href="/ai" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]">Khoá API AI</Link>
          <Link href="/payments" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.07]">Thanh toán</Link>
        </div>
      </SectionCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard label="Tenant" value={formatNumber(snapshot.metrics.activeTenants)} detail={`${snapshot.metrics.tenants} tổng`} icon={Building2} tone="info" />
        <MetricCard label="Người dùng" value={formatNumber(snapshot.metrics.users)} detail="Tài khoản" icon={Activity} tone="neutral" />
        <MetricCard label="Yêu cầu AI" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% ổn`} icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Hàng đợi" value={snapshot.aiControl.failures + snapshot.metrics.pendingPayments ? "Cần xem" : "Ổn"} detail={`${snapshot.aiControl.failures} lỗi`} icon={ListTree} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Thanh toán" value={formatNumber(snapshot.metrics.pendingPayments)} detail="Chờ xác minh" icon={CreditCard} tone={snapshot.metrics.pendingPayments ? "warning" : "good"} />
        <MetricCard label="Triển khai" value={snapshot.environment.commit} detail={snapshot.environment.region} icon={GitBranch} tone="info" />
        <MetricCard label="SLA" value={alerts ? "Cần xem" : "Ổn"} detail={`${alerts} cảnh báo`} icon={AlertTriangle} tone={countTone(alerts)} />
        <MetricCard label="MRR" value={formatVnd(snapshot.metrics.mrr)} detail="SaaS" icon={Store} tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <SectionCard title="Dịch vụ">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Link key={service.label} href={service.href} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]">
                  <div className="flex items-center justify-between gap-3">
                    <Icon size={17} className="text-slate-300" />
                    <span className={badgeTone(service.tone)}>{service.value}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{service.label}</p>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Cần xử lý" action={<Link href="/alerts" className="text-xs font-semibold text-slate-300 hover:text-white">Mở cảnh báo</Link>}>
          <div className="grid gap-2">
            {snapshot.warnings.slice(0, 4).map((warning) => (
              <div key={warning} className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm font-semibold text-amber-100">{warning}</div>
            ))}
            {!snapshot.warnings.length && !pendingPayments.length ? <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-100">Không có việc gấp.</div> : null}
            {pendingPayments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <p className="text-sm font-semibold text-white">{payment.restaurantName}</p>
                  <p className="mt-1 font-mono text-xs text-slate-400">{formatVnd(payment.amount)}</p>
                </div>
                <form action={confirmSubscriptionPaymentAction}>
                  <input type="hidden" name="paymentId" value={payment.id} />
                  <PrimaryButton tone="soft">Xác minh</PrimaryButton>
                </form>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Tenant">
          <div className="grid gap-2">
            {snapshot.tenants.slice(0, 6).map((tenant) => (
              <Link key={tenant.id} href="/tenants" className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{tenant.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{tenant.planName}</p>
                </div>
                <span className={badgeTone(tenant.platformStatus === "active" ? "good" : "warning")}>{tenant.platformStatus}</span>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Vận hành AI">
          <div className="grid gap-2">
            {snapshot.aiControl.branchInsights.recent.slice(0, 5).map((insight) => (
              <Link key={insight.id} href="/ai" className="rounded-lg border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.07]">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-white">{insight.title}</p>
                  <span className={badgeTone(insight.severity === "critical" ? "danger" : insight.severity === "warning" ? "warning" : "info")}>{insight.severity === "critical" ? "nghiêm trọng" : insight.severity === "warning" ? "cảnh báo" : "tín hiệu"}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{insight.restaurantName}</p>
              </Link>
            ))}
            {!snapshot.aiControl.branchInsights.recent.length ? <p className="text-sm text-slate-500">Không có insight.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Triển khai">
          <div className="grid gap-2">
            {[
              ["Môi trường", snapshot.environment.vercelEnv],
              ["Vùng", snapshot.environment.region],
              ["Commit", snapshot.environment.commit],
              ["Snapshot", `${snapshot.queryLatencyMs}ms`]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-mono font-semibold text-slate-100">{value}</span>
              </div>
            ))}
            <Link href="/deployments" className="mt-1 inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-200 hover:bg-white/[0.08]">
              Chi tiết
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
