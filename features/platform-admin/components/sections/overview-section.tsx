import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  CreditCard,
  Database,
  GitBranch,
  KeyRound,
  ListChecks,
  ListRestart,
  ListTree,
  PlayCircle,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
  Store,
  TerminalSquare,
  Wifi,
  Wrench,
  XCircle
} from "lucide-react";
import {
  confirmSubscriptionPaymentAction,
  refreshPlatformAdminAction,
  rejectSubscriptionPaymentAction,
  requestPlatformOperationAction,
  resolveBillingAnomalyAction,
  runPlatformCronJobAction
} from "@/features/platform-admin/actions";
import { PrimaryButton, SectionCard, badgeTone, formatDateTime, formatNumber, statusTone } from "@/features/platform-admin/components/primitives";
import { billingAnomalyActionLabel, canResolveBillingAnomaly } from "@/features/platform-admin/lib/billing";
import type { BillingAnomaly, Snapshot } from "@/features/platform-admin/types";
import { cn } from "@/lib/utils";
import { formatVnd } from "@/lib/money";

type Tone = Parameters<typeof badgeTone>[0];

type PlatformOperation =
  | "ack_alert"
  | "clear_cache"
  | "create_ai_summary"
  | "create_feature_flag_draft"
  | "pause_queue"
  | "replay_queue"
  | "request_rollback"
  | "resolve_incident"
  | "restart_workers"
  | "run_smoke_check";

type PlatformCronJob = "reports" | "ai-ops" | "reservations-expire" | "subscriptions";

type WorkItem = {
  key: string;
  title: string;
  target: string;
  meta: string;
  tone: Tone;
  primary: ReactNode;
  secondary?: ReactNode;
};

function countTone(value: number): Tone {
  if (value > 5) return "danger";
  if (value > 0) return "warning";
  return "good";
}

function cronJobKey(value: string): PlatformCronJob | null {
  if (value === "reports" || value === "ai-ops" || value === "reservations-expire" || value === "subscriptions") return value;
  return null;
}

function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon?: typeof Activity }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/40 hover:bg-sky-300/10"
    >
      {Icon ? <Icon size={15} /> : null}
      {label}
    </Link>
  );
}

function CronButton({ jobKey, label, icon: Icon = PlayCircle, tone = "soft" }: { jobKey: PlatformCronJob; label: string; icon?: typeof Activity; tone?: "soft" | "orange" | "dark" }) {
  return (
    <form action={runPlatformCronJobAction} className="contents">
      <input type="hidden" name="jobKey" value={jobKey} />
      <PrimaryButton tone={tone}><Icon size={15} />{label}</PrimaryButton>
    </form>
  );
}

function OperationButton({
  operation,
  targetType,
  targetId,
  label,
  icon: Icon = Wrench,
  reason,
  danger = false
}: {
  operation: PlatformOperation;
  targetType: string;
  targetId?: string | null;
  label: string;
  icon?: typeof Activity;
  reason?: string;
  danger?: boolean;
}) {
  return (
    <form action={requestPlatformOperationAction} className="contents">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="targetType" value={targetType} />
      {targetId ? <input type="hidden" name="targetId" value={targetId} /> : null}
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      <PrimaryButton tone={danger ? "danger" : "soft"}><Icon size={15} />{label}</PrimaryButton>
    </form>
  );
}

function ConfirmPaymentButton({ paymentId, label = "Xác minh" }: { paymentId: string; label?: string }) {
  return (
    <form action={confirmSubscriptionPaymentAction} className="contents">
      <input type="hidden" name="paymentId" value={paymentId} />
      <PrimaryButton tone="orange"><CheckCircle2 size={15} />{label}</PrimaryButton>
    </form>
  );
}

function RejectPaymentButton({ paymentId }: { paymentId: string }) {
  return (
    <form action={rejectSubscriptionPaymentAction} className="contents">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="reason" value="Không khớp giao dịch ngân hàng" />
      <PrimaryButton tone="soft"><XCircle size={15} />Từ chối</PrimaryButton>
    </form>
  );
}

function ResolveBillingAnomalyButton({ anomaly }: { anomaly: BillingAnomaly }) {
  return (
    <form action={resolveBillingAnomalyAction} className="contents">
      <input type="hidden" name="key" value={anomaly.key} />
      {anomaly.subscriptionId ? <input type="hidden" name="subscriptionId" value={anomaly.subscriptionId} /> : null}
      {anomaly.paymentId ? <input type="hidden" name="paymentId" value={anomaly.paymentId} /> : null}
      <PrimaryButton tone={anomaly.severity === "danger" ? "orange" : "soft"}>
        <Wrench size={15} />{billingAnomalyActionLabel(anomaly)}
      </PrimaryButton>
    </form>
  );
}

function QuickActionTile({ title, value, tone, action }: { title: string; value: string; tone: Tone; action: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-[#0B1224] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <span className={badgeTone(tone)}>{value}</span>
      </div>
      {action}
    </div>
  );
}

function MetricControl({ label, value, detail, href, icon: Icon, tone }: { label: string; value: string; detail: string; href: string; icon: typeof Activity; tone: Tone }) {
  return (
    <Link href={href} className="group rounded-lg border border-white/10 bg-[#0F1629] p-4 shadow-[0_14px_42px_rgba(0,0,0,0.2)] transition hover:border-white/20 hover:bg-[#121B31]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">{label}</p>
          <p className="metric-number mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-lg border",
            tone === "good" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
            tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-100",
            tone === "danger" && "border-red-400/25 bg-red-400/10 text-red-100",
            tone === "info" && "border-sky-400/25 bg-sky-400/10 text-sky-100",
            tone === "neutral" && "border-white/10 bg-white/[0.04] text-slate-200"
          )}
        >
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-300">{detail}</p>
        <span className="text-xs font-semibold text-sky-100 opacity-80 group-hover:opacity-100">Mở</span>
      </div>
    </Link>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B1224] p-3 transition hover:border-white/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeTone(item.tone)}>{item.target}</span>
            <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{item.meta}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {item.primary}
          {item.secondary}
        </div>
      </div>
    </div>
  );
}

function ServiceActionCard({ title, value, icon: Icon, tone, children }: { title: string; value: string; icon: typeof Activity; tone: Tone; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0B1224] p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-100"><Icon size={18} /></span>
        <span className={badgeTone(tone)}>{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function buildWorkItems(snapshot: Snapshot): WorkItem[] {
  const items: WorkItem[] = [];
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === "waiting_confirm").slice(0, 3);
  const cronIssues = snapshot.cronJobs.filter((job) => (job.failureStreak ?? 0) > 0 || (job.attentionStreak ?? 0) > 0 || (job.lastRunAgeHours ?? 0) > 36).slice(0, 3);
  const riskyTenants = snapshot.tenants.filter((tenant) => tenant.riskFlags.length > 0).slice(0, 3);

  pendingPayments.forEach((payment) => {
    items.push({
      key: `payment-${payment.id}`,
      title: payment.restaurantName,
      target: "Thanh toán",
      meta: `${formatVnd(payment.amount)} · ${payment.transferContent || payment.planName}`,
      tone: "warning",
      primary: <ConfirmPaymentButton paymentId={payment.id} />,
      secondary: <RejectPaymentButton paymentId={payment.id} />
    });
  });

  snapshot.billingCutover.anomalies.slice(0, 3).forEach((anomaly) => {
    items.push({
      key: `billing-${anomaly.key}-${anomaly.subscriptionId ?? anomaly.paymentId ?? anomaly.restaurantId}`,
      title: anomaly.restaurantName,
      target: anomaly.severity === "danger" ? "Billing gấp" : "Billing",
      meta: anomaly.detail,
      tone: anomaly.severity === "danger" ? "danger" : "warning",
      primary: canResolveBillingAnomaly(anomaly) ? <ResolveBillingAnomalyButton anomaly={anomaly} /> : <CronButton jobKey="subscriptions" label="Đối soát" icon={ListRestart} />,
      secondary: <ActionLink href="/payments" label="Mở" icon={CreditCard} />
    });
  });

  if (snapshot.aiControl.runtimeConfig.configuredProviders === 0) {
    items.push({
      key: "ai-provider-key",
      title: "Chưa có provider AI hoạt động",
      target: "AI",
      meta: "Cập nhật key trong admin để runtime dùng key mới ngay sau khi lưu.",
      tone: "warning",
      primary: <ActionLink href="/ai" label="Đổi key" icon={KeyRound} />,
      secondary: <OperationButton operation="run_smoke_check" targetType="ai" targetId="/ai" label="Kiểm tra" icon={CheckCircle2} />
    });
  }

  if (snapshot.aiControl.failures > 0 || snapshot.aiControl.branchInsights.critical > 0) {
    items.push({
      key: "ai-failures",
      title: `${snapshot.aiControl.failures} lỗi AI · ${snapshot.aiControl.branchInsights.critical} insight nghiêm trọng`,
      target: "AI ops",
      meta: `${snapshot.aiControl.requests} request trong 24h · ${snapshot.aiControl.successRate}% thành công`,
      tone: snapshot.aiControl.branchInsights.critical ? "danger" : "warning",
      primary: <CronButton jobKey="ai-ops" label="Chạy AI ops" icon={Bot} tone="orange" />,
      secondary: <OperationButton operation="create_ai_summary" targetType="ai_ops" targetId="branch-insights" label="Tóm tắt" icon={ListChecks} />
    });
  }

  cronIssues.forEach((job) => {
    const key = cronJobKey(job.key);
    items.push({
      key: `cron-${job.key}`,
      title: job.name,
      target: "Cron",
      meta: job.lastError || `Lần chạy gần nhất: ${formatDateTime(job.lastRunAt ?? null)}`,
      tone: job.lastRunStatus === "error" ? "danger" : "warning",
      primary: key ? <CronButton jobKey={key} label="Chạy lại" icon={RefreshCw} tone="orange" /> : <OperationButton operation="run_smoke_check" targetType="cron" targetId={job.path} label="Kiểm tra" icon={CheckCircle2} />,
      secondary: <ActionLink href="/queues" label="Mở" icon={ListTree} />
    });
  });

  snapshot.warnings.slice(0, 3).forEach((warning, index) => {
    items.push({
      key: `warning-${index}-${warning}`,
      title: warning,
      target: warning.includes("migration") || warning.includes("bảng") ? "Schema" : "Hệ thống",
      meta: "Ghi nhận audit hoặc chạy smoke check ngay trên admin.",
      tone: "warning",
      primary: <OperationButton operation="run_smoke_check" targetType="platform_warning" targetId="/" label="Kiểm tra" icon={CheckCircle2} />,
      secondary: <OperationButton operation="ack_alert" targetType="platform_warning" targetId={warning.slice(0, 120)} reason={warning} label="Ghi nhận" icon={CheckCircle2} />
    });
  });

  riskyTenants.forEach((tenant) => {
    items.push({
      key: `tenant-${tenant.id}`,
      title: tenant.name,
      target: "Tenant",
      meta: tenant.riskFlags.slice(0, 2).join(" · "),
      tone: tenant.platformStatus === "active" ? "warning" : "danger",
      primary: <ActionLink href="/tenants" label="Xử lý" icon={Store} />,
      secondary: <ActionLink href={tenant.dashboardUrl} label="Dashboard" icon={Activity} />
    });
  });

  if (!items.length) {
    items.push({
      key: "all-clear",
      title: "Không có việc gấp",
      target: "Ổn định",
      meta: "Snapshot sạch. Có thể chạy smoke check hoặc làm mới dữ liệu.",
      tone: "good",
      primary: <OperationButton operation="run_smoke_check" targetType="admin" targetId="/" label="Smoke check" icon={CheckCircle2} />,
      secondary: (
        <form action={refreshPlatformAdminAction} className="contents">
          <PrimaryButton tone="soft"><RefreshCw size={15} />Làm mới</PrimaryButton>
        </form>
      )
    });
  }

  return items.slice(0, 10);
}

export function Overview({ snapshot }: { snapshot: Snapshot }) {
  const alerts = snapshot.warnings.length + snapshot.billingCutover.anomalies.length + snapshot.aiControl.failures;
  const workItems = buildWorkItems(snapshot);
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === "waiting_confirm").length;
  const cronAttention = snapshot.cronJobs.filter((job) => (job.failureStreak ?? 0) > 0 || (job.attentionStreak ?? 0) > 0 || (job.lastRunAgeHours ?? 0) > 36).length;
  const redis = snapshot.integrations.find((item) => item.key === "persistent-cache");

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Bàn điều phối"
        action={
          <form action={refreshPlatformAdminAction} className="contents">
            <PrimaryButton tone="soft"><RefreshCw size={15} />Làm mới</PrimaryButton>
          </form>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_430px]">
          <div className="grid gap-2">
            {workItems.map((item) => <WorkItemRow key={item.key} item={item} />)}
          </div>

          <div className="grid content-start gap-3">
            <QuickActionTile title="AI ops" value={`${snapshot.aiControl.requests} req`} tone={snapshot.aiControl.failures ? "warning" : "good"} action={<CronButton jobKey="ai-ops" label="Chạy ngay" icon={Bot} />} />
            <QuickActionTile title="Billing" value={`${pendingPayments} chờ`} tone={pendingPayments ? "warning" : "good"} action={<CronButton jobKey="subscriptions" label="Đối soát" icon={CreditCard} />} />
            <QuickActionTile title="Cache" value={redis?.status ?? "n/a"} tone={statusTone(redis?.status ?? "needs_review")} action={<OperationButton operation="clear_cache" targetType="redis" targetId="platform:snapshot" label="Dọn cache" icon={RotateCcw} />} />
            <QuickActionTile title="Admin host" value={snapshot.environment.vercelEnv} tone="info" action={<OperationButton operation="run_smoke_check" targetType="admin" targetId="/" label="Smoke check" icon={CheckCircle2} />} />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricControl label="Tenant" value={formatNumber(snapshot.metrics.activeTenants)} detail={`${snapshot.metrics.tenants} tổng`} href="/tenants" icon={Building2} tone="info" />
        <MetricControl label="Người dùng" value={formatNumber(snapshot.metrics.users)} detail="Tài khoản" href="/settings" icon={Activity} tone="neutral" />
        <MetricControl label="AI" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% thành công`} href="/ai" icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricControl label="Hàng đợi" value={cronAttention ? `${cronAttention} cần xử lý` : "Ổn"} detail={`${snapshot.aiControl.failures} lỗi AI`} href="/queues" icon={ListTree} tone={cronAttention || snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricControl label="Thanh toán" value={formatNumber(pendingPayments)} detail="Chờ xác minh" href="/payments" icon={CreditCard} tone={pendingPayments ? "warning" : "good"} />
        <MetricControl label="Triển khai" value={snapshot.environment.commit} detail={snapshot.environment.region} href="/deployments" icon={GitBranch} tone="info" />
        <MetricControl label="SLA" value={alerts ? "Cần xử lý" : "Ổn"} detail={`${alerts} cảnh báo`} href="/alerts" icon={AlertTriangle} tone={countTone(alerts)} />
        <MetricControl label="MRR" value={formatVnd(snapshot.metrics.mrr)} detail="SaaS" href="/payments" icon={Store} tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard title="Điều khiển dịch vụ">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <ServiceActionCard title="API" value={`${snapshot.projectAtlas.summary.backend}`} icon={ServerCog} tone="good">
              <OperationButton operation="run_smoke_check" targetType="api" targetId="/" label="Kiểm tra" icon={CheckCircle2} />
              <ActionLink href="/logs" label="Log" icon={TerminalSquare} />
            </ServiceActionCard>
            <ServiceActionCard title="Redis" value={redis?.status ?? "thiếu"} icon={Database} tone={statusTone(redis?.status ?? "needs_review")}>
              <OperationButton operation="clear_cache" targetType="redis" targetId="platform:snapshot" label="Dọn" icon={RotateCcw} />
              <ActionLink href="/redis" label="Mở" icon={Database} />
            </ServiceActionCard>
            <ServiceActionCard title="Workers" value={`${snapshot.cronJobs.filter((job) => job.status === "configured").length}/${snapshot.cronJobs.length}`} icon={ListTree} tone={snapshot.cronJobs.every((job) => job.status === "configured") ? "good" : "warning"}>
              <CronButton jobKey="ai-ops" label="Chạy" icon={PlayCircle} />
              <OperationButton operation="restart_workers" targetType="workers" targetId="bullmq" label="Yêu cầu restart" icon={ListRestart} />
            </ServiceActionCard>
            <ServiceActionCard title="Telegram" value="Ops" icon={RadioTower} tone="info">
              <ActionLink href="/telegram" label="Mở" icon={RadioTower} />
              <OperationButton operation="replay_queue" targetType="telegram_queue" targetId="telegram" label="Replay" icon={RefreshCw} />
            </ServiceActionCard>
            <ServiceActionCard title="AI" value={`${snapshot.aiControl.runtimeConfig.configuredProviders} key`} icon={Bot} tone={snapshot.aiControl.runtimeConfig.configuredProviders ? "good" : "warning"}>
              <CronButton jobKey="ai-ops" label="Chạy" icon={Bot} />
              <ActionLink href="/ai" label="Đổi key" icon={KeyRound} />
            </ServiceActionCard>
            <ServiceActionCard title="Thanh toán" value={`${pendingPayments} chờ`} icon={CreditCard} tone={pendingPayments ? "warning" : "good"}>
              <CronButton jobKey="subscriptions" label="Đối soát" icon={CreditCard} />
              <ActionLink href="/payments" label="Xử lý" icon={CreditCard} />
            </ServiceActionCard>
            <ServiceActionCard title="Realtime" value="Live" icon={Wifi} tone="good">
              <OperationButton operation="run_smoke_check" targetType="realtime" targetId="/system-map" label="Kiểm tra" icon={Wifi} />
              <ActionLink href="/system-map" label="Map" icon={Activity} />
            </ServiceActionCard>
            <ServiceActionCard title="Triển khai" value={snapshot.environment.vercelEnv} icon={GitBranch} tone="info">
              <ActionLink href="/deployments" label="Mở" icon={GitBranch} />
              <OperationButton operation="request_rollback" targetType="deployment" targetId={snapshot.environment.commit} label="Yêu cầu rollback" icon={ShieldAlert} danger />
            </ServiceActionCard>
          </div>
        </SectionCard>

        <SectionCard title="Tenant cần xử lý">
          <div className="grid gap-2">
            {snapshot.tenants.filter((tenant) => tenant.riskFlags.length || tenant.platformStatus !== "active").slice(0, 8).map((tenant) => (
              <div key={tenant.id} className="rounded-lg border border-white/10 bg-[#0B1224] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{tenant.name}</p>
                    <p className="mt-1 text-xs text-slate-300">{tenant.planName} · {tenant.userCount} user</p>
                  </div>
                  <span className={badgeTone(statusTone(tenant.platformStatus))}>{tenant.platformStatus}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tenant.riskFlags.slice(0, 3).map((flag) => <span key={flag} className={badgeTone("warning")}>{flag}</span>)}
                  {!tenant.riskFlags.length ? <span className={badgeTone("good")}>Ổn</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionLink href="/tenants" label="Xử lý" icon={Store} />
                  <ActionLink href={tenant.dashboardUrl} label="Dashboard" icon={Activity} />
                </div>
              </div>
            ))}
            {!snapshot.tenants.some((tenant) => tenant.riskFlags.length || tenant.platformStatus !== "active") ? (
              <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-100">Tenant đang ổn định.</div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
