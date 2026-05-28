import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  Cloud,
  Code2,
  Cpu,
  CreditCard,
  Database,
  Flag,
  GitBranch,
  Globe2,
  HardDrive,
  KeyRound,
  Layers3,
  ListRestart,
  ListTree,
  LockKeyhole,
  MessageCircle,
  Network,
  PauseCircle,
  PlayCircle,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Store,
  TerminalSquare,
  Timer,
  TrendingUp,
  Webhook,
  Wifi,
  Wrench,
  Zap
} from "lucide-react";
import { Billing } from "@/features/platform-admin/components/sections/billing-section";
import { refreshPlatformAdminAction, requestPlatformOperationAction, runPlatformCronJobAction } from "@/features/platform-admin/actions";
import { ContentControl } from "@/features/platform-admin/components/sections/content-section";
import { GovernanceControl } from "@/features/platform-admin/components/sections/governance-section";
import { MapsControl } from "@/features/platform-admin/components/sections/maps-section";
import { Plans } from "@/features/platform-admin/components/sections/plans-section";
import { Security } from "@/features/platform-admin/components/sections/security-section";
import { SiteSettings } from "@/features/platform-admin/components/sections/site-section";
import { Users } from "@/features/platform-admin/components/sections/users-section";
import { PlatformTelegramCommandCenter } from "@/features/platform-admin/components/platform-telegram-command-center";
import {
  LiveDot,
  MetricCard,
  PrimaryButton,
  SectionCard,
  badgeTone,
  formatDateTime,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { cutoverStatusLabel, moduleStatusLabel, projectSurfaceKindLabel } from "@/features/platform-admin/labels";
import type { Snapshot } from "@/features/platform-admin/types";
import type { PlatformAdminSession } from "@/lib/platform-admin-auth";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";

type Tone = Parameters<typeof badgeTone>[0];

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function duration(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "Chưa có";
  const ms = Math.max(0, Number(value));
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${Math.round(ms / 100) / 10}s`;
}

function attentionTone(value: number): Tone {
  if (value > 5) return "danger";
  if (value > 0) return "warning";
  return "good";
}

function Sparkline({ values, tone = "info" }: { values: number[]; tone?: Tone }) {
  const max = Math.max(...values, 1);
  const color = {
    good: "bg-emerald-300",
    warning: "bg-amber-300",
    danger: "bg-red-300",
    info: "bg-sky-300",
    neutral: "bg-slate-400"
  }[tone];

  return (
    <div className="flex h-12 items-end gap-1">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={cn("w-full rounded-t-sm opacity-85", color)}
          style={{ height: `${Math.max(14, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function ProgressTrack({ value, tone = "info" }: { value: number; tone?: Tone }) {
  const bar = {
    good: "bg-emerald-300",
    warning: "bg-amber-300",
    danger: "bg-red-300",
    info: "bg-sky-300",
    neutral: "bg-slate-400"
  }[tone];

  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: percent(value) }} />
    </div>
  );
}

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

function ControlButton({ icon: Icon, label, danger = false, type = "button" }: { icon: typeof Activity; label: string; danger?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition",
        danger
          ? "border-red-400/25 bg-red-400/10 text-red-100 hover:bg-red-400/15"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function OperationForm({
  operation,
  targetType,
  targetId,
  label,
  icon,
  danger = false,
  reason
}: {
  operation: PlatformOperation;
  targetType: string;
  targetId?: string | null;
  label: string;
  icon: typeof Activity;
  danger?: boolean;
  reason?: string;
}) {
  return (
    <form action={requestPlatformOperationAction}>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="targetType" value={targetType} />
      {targetId ? <input type="hidden" name="targetId" value={targetId} /> : null}
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      <ControlButton icon={icon} label={label} danger={danger} type="submit" />
    </form>
  );
}

function CronRunForm({ jobKey, label, icon = PlayCircle }: { jobKey: PlatformCronJob; label: string; icon?: typeof Activity }) {
  return (
    <form action={runPlatformCronJobAction}>
      <input type="hidden" name="jobKey" value={jobKey} />
      <ControlButton icon={icon} label={label} type="submit" />
    </form>
  );
}

function RefreshForm({ label = "Làm mới", icon = RefreshCw }: { label?: string; icon?: typeof Activity }) {
  return (
    <form action={refreshPlatformAdminAction}>
      <ControlButton icon={icon} label={label} type="submit" />
    </form>
  );
}

function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={badgeTone(tone)}>{label}</span>;
}

function moduleTone(status: string): Tone {
  return statusTone(status);
}

function queueSignals(snapshot: Snapshot) {
  const cronAttention = snapshot.cronJobs.filter((job) => (job.failureStreak ?? 0) > 0 || (job.attentionStreak ?? 0) > 0).length;
  return [
    {
      key: "ai-ops",
      name: "Luồng vận hành AI",
      waiting: snapshot.aiControl.blocked,
      active: Math.max(0, snapshot.aiControl.requests - snapshot.aiControl.failures - snapshot.aiControl.blocked),
      delayed: snapshot.aiControl.morningBriefs.skipped,
      failed: snapshot.aiControl.failures,
      completed: snapshot.aiControl.successes,
      retrying: snapshot.aiControl.branchInsights.warning,
      throughput: snapshot.aiControl.requests,
      lag: snapshot.aiControl.failures ? "cao" : "ổn định",
      tone: snapshot.aiControl.failures ? "warning" as Tone : "good" as Tone
    },
    {
      key: "billing",
      name: "Đối soát VietQR",
      waiting: snapshot.metrics.pendingPayments,
      active: snapshot.payments.filter((payment) => payment.status === "waiting_confirm").length,
      delayed: snapshot.billingCutover.anomalies.length,
      failed: snapshot.payments.filter((payment) => payment.status === "rejected").length,
      completed: snapshot.payments.filter((payment) => payment.status === "confirmed").length,
      retrying: snapshot.billingCutover.anomalies.filter((item) => item.severity === "warning").length,
      throughput: snapshot.payments.length,
      lag: snapshot.metrics.pendingPayments ? "cần xử lý" : "ổn định",
      tone: snapshot.metrics.pendingPayments ? "warning" as Tone : "good" as Tone
    },
    {
      key: "cron",
      name: "Tự động hoá định kỳ",
      waiting: snapshot.cronJobs.filter((job) => !job.lastRunAt).length,
      active: snapshot.cronJobs.filter((job) => job.status === "configured").length,
      delayed: snapshot.cronJobs.filter((job) => (job.lastRunAgeHours ?? 0) > 36).length,
      failed: snapshot.cronJobs.filter((job) => job.lastRunStatus === "error").length,
      completed: snapshot.cronJobs.filter((job) => job.lastRunStatus === "success").length,
      retrying: cronAttention,
      throughput: snapshot.cronJobs.length,
      lag: cronAttention ? "có attention" : "ổn định",
      tone: cronAttention ? "warning" as Tone : "good" as Tone
    }
  ];
}

function serviceNodes(snapshot: Snapshot) {
  const integration = (key: string) => snapshot.integrations.find((item) => item.key === key);
  const aiReady = snapshot.aiControl.runtimeConfig.configuredProviders > 0;
  return [
    { key: "frontend", name: "Frontend", detail: `${snapshot.projectAtlas.summary.frontend} bề mặt`, icon: Globe2, tone: "good" as Tone, deps: ["API", "Realtime"] },
    { key: "api", name: "API", detail: `${snapshot.projectAtlas.summary.backend} dịch vụ`, icon: ServerCog, tone: "good" as Tone, deps: ["Supabase", "Redis"] },
    { key: "redis", name: "Redis", detail: integration("persistent-cache")?.status ?? "needs_config", icon: Database, tone: moduleTone(integration("persistent-cache")?.status ?? "needs_config"), deps: ["BullMQ", "Cache"] },
    { key: "workers", name: "Workers", detail: `${snapshot.cronJobs.length} tác vụ tự động`, icon: Cpu, tone: snapshot.cronJobs.every((job) => job.status === "configured") ? "good" as Tone : "warning" as Tone, deps: ["Cron", "Queue"] },
    { key: "telegram", name: "Telegram", detail: "Bot vận hành", icon: RadioTower, tone: "info" as Tone, deps: ["Thông báo", "Callback"] },
    { key: "ai", name: "Dịch vụ AI", detail: aiReady ? `${snapshot.aiControl.runtimeConfig.configuredProviders} provider` : "thiếu key", icon: Bot, tone: aiReady ? "good" as Tone : "warning" as Tone, deps: ["Qwen", "xAI"] },
    { key: "payments", name: "Thanh toán", detail: `${snapshot.metrics.pendingPayments} chờ xử lý`, icon: CreditCard, tone: snapshot.metrics.pendingPayments ? "warning" as Tone : "good" as Tone, deps: ["VietQR", "Webhook"] },
    { key: "storage", name: "Lưu trữ", detail: integration("cloudflare-r2")?.status ?? "planned", icon: HardDrive, tone: moduleTone(integration("cloudflare-r2")?.status ?? "planned"), deps: ["Asset", "R2"] }
  ];
}

export function SystemMap({ snapshot }: { snapshot: Snapshot }) {
  const nodes = serviceNodes(snapshot);
  const warningCount = nodes.filter((node) => node.tone !== "good").length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Node hệ thống" value={formatNumber(nodes.length)} detail="Frontend, API, Redis, Workers, AI, thanh toán" icon={Network} tone="info" />
        <MetricCard label="Phụ thuộc live" value={formatNumber(snapshot.projectAtlas.summary.liveObserve)} detail="Bề mặt đã quan sát được" icon={Activity} tone="good" />
        <MetricCard label="Khoảng trống điều khiển" value={formatNumber(snapshot.projectAtlas.summary.plannedControl)} detail="Đang lên kế hoạch hoặc bị chặn" icon={Wrench} tone={snapshot.projectAtlas.summary.plannedControl ? "warning" : "good"} />
        <MetricCard label="Node suy giảm" value={formatNumber(warningCount)} detail="Cần cấu hình hoặc cần xử lý" icon={AlertTriangle} tone={warningCount ? "warning" : "good"} />
      </div>

      <SectionCard title="Sơ đồ realtime" action={<div className="flex flex-wrap gap-2"><RefreshForm label="Đọc lại" /><OperationForm operation="run_smoke_check" targetType="system_map" targetId="admin.logivn.com" label="Kiểm tra" icon={CheckCircle2} /></div>}>
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0B1224]/78 p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
            <div className="relative grid gap-4 md:grid-cols-4">
              {nodes.map((node, index) => {
                const Icon = node.icon;
                return (
                  <div key={node.key} className="relative rounded-lg border border-white/10 bg-[#111827]/88 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.22)]">
                    {index < nodes.length - 1 ? <span className="absolute -right-4 top-1/2 hidden h-px w-4 bg-sky-300/30 md:block" /> : null}
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sky-200"><Icon size={18} /></span>
                      <LiveDot tone={node.tone} />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-white">{node.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{node.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {node.deps.map((dep) => <span key={dep} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-400">{dep}</span>)}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {node.key === "workers" ? <CronRunForm jobKey="ai-ops" label="Chạy" icon={PlayCircle} /> : null}
                      {node.key === "ai" ? <Link href="/ai" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"><KeyRound size={14} />Khoá</Link> : null}
                      {node.key === "payments" ? <Link href="/payments" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"><CreditCard size={14} />Xử lý</Link> : null}
                      {node.key === "redis" ? <OperationForm operation="clear_cache" targetType="redis" targetId="platform:snapshot" label="Dọn" icon={RotateCcw} /> : null}
                      {node.key === "telegram" ? <Link href="/telegram" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"><RadioTower size={14} />Mở</Link> : null}
                      {node.key === "api" || node.key === "frontend" ? <Link href="/logs" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"><TerminalSquare size={14} />Nhật ký</Link> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3">
            {nodes.filter((node) => node.tone !== "good").slice(0, 5).map((node) => (
              <div key={node.key} className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-amber-100">{node.name}</p>
                  <StatusPill label={node.detail} tone={node.tone} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={node.key === "ai" ? "/ai" : node.key === "payments" ? "/payments" : node.key === "redis" ? "/redis" : "/services"} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-300/15">
                    <ArrowRight size={14} />Mở
                  </Link>
                  <OperationForm operation="ack_alert" targetType="system_node" targetId={node.key} label="Ghi nhận" icon={CheckCircle2} />
                </div>
              </div>
            ))}
            {!warningCount ? <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-100">Tất cả node chính đang ổn định.</div> : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function DeploymentCenter({ snapshot }: { snapshot: Snapshot }) {
  const checks = [
    { label: "Typecheck", status: "planned", detail: "Chạy trước release candidate" },
    { label: "Lệch migration", status: snapshot.warnings.length ? "needs_review" : "live", detail: snapshot.warnings.length ? `${snapshot.warnings.length} cảnh báo` : "Không có cảnh báo schema" },
    { label: "Chuyển đổi billing", status: snapshot.billingCutover.status === "healthy" ? "live" : "needs_review", detail: cutoverStatusLabel[snapshot.billingCutover.status] ?? snapshot.billingCutover.status },
    { label: "Kiểm tra domain admin", status: "live", detail: "admin.logivn.com -> platform-control" }
  ];
  const timeline = [
    { title: "Sản xuất", meta: `${snapshot.environment.vercelEnv} · ${snapshot.environment.region}`, time: formatDateTime(snapshot.generatedAt), tone: "good" as Tone },
    { title: "Commit hiện tại", meta: snapshot.environment.commit, time: snapshot.environment.nodeEnv, tone: "info" as Tone },
    { title: "Sức khoẻ migration", meta: snapshot.warnings.length ? snapshot.warnings.join(" · ") : "Không có cảnh báo migration", time: "Supabase", tone: snapshot.warnings.length ? "warning" as Tone : "good" as Tone },
    { title: "Chốt an toàn release", meta: "Rollback yêu cầu audit và phê duyệt cho thay đổi rủi ro cao", time: "RBAC", tone: "neutral" as Tone }
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Môi trường" value={snapshot.environment.vercelEnv} detail={`${snapshot.environment.region} · ${snapshot.environment.nodeEnv}`} icon={Cloud} tone="info" />
        <MetricCard label="Commit" value={snapshot.environment.commit} detail="Revision đang phục vụ request" icon={GitBranch} tone="neutral" />
        <MetricCard label="Sức khoẻ release" value={snapshot.warnings.length ? "Suy giảm" : "Ổn định"} detail={`${snapshot.warnings.length} cảnh báo migration`} icon={CheckCircle2} tone={snapshot.warnings.length ? "warning" : "good"} />
        <MetricCard label="Khoảng trống rollback" value={formatNumber(snapshot.governance.summary.partialOrPlannedRollback)} detail="Năng lực chưa rollback live" icon={RotateCcw} tone={snapshot.governance.summary.partialOrPlannedRollback ? "warning" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Dòng thời gian release">
          <div className="grid gap-3">
            {timeline.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <span className="mt-1"><LiveDot tone={item.tone} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <span className="font-mono text-xs text-slate-500">{item.time}</span>
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-400">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Kiểm tra release" action={<div className="flex flex-wrap gap-2"><OperationForm operation="run_smoke_check" targetType="deployment" targetId={snapshot.environment.commit} label="Kiểm tra" icon={RefreshCw} /><OperationForm operation="request_rollback" targetType="deployment" targetId={snapshot.environment.commit} label="Yêu cầu rollback" icon={RotateCcw} danger /></div>}>
          <div className="grid gap-3 md:grid-cols-2">
            {checks.map((check) => (
              <div key={check.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{check.label}</p>
                  <StatusPill label={moduleStatusLabel[check.status] ?? check.status} tone={moduleTone(check.status)} />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{check.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {check.label === "Lệch migration" ? <Link href="/logs" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]"><TerminalSquare size={14} />Nhật ký</Link> : null}
                  {check.label === "Chuyển đổi billing" ? <Link href="/payments" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]"><CreditCard size={14} />Đối soát</Link> : null}
                  {check.label === "Kiểm tra domain admin" ? <OperationForm operation="run_smoke_check" targetType="deployment_check" targetId="admin-domain" label="Chạy" icon={PlayCircle} /> : null}
                  {check.label === "Typecheck" ? <OperationForm operation="run_smoke_check" targetType="deployment_check" targetId="typecheck" label="Ghi check" icon={CheckCircle2} /> : null}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function ServicesCenter({ snapshot }: { snapshot: Snapshot }) {
  const services = snapshot.projectAtlas.surfaces.filter((surface) => surface.kind === "backend" || surface.kind === "automation" || surface.kind === "integration");
  const avgCronDuration = Math.round(snapshot.cronJobs.reduce((sum, job) => sum + (job.lastDurationMs ?? 0), 0) / Math.max(snapshot.cronJobs.length, 1));

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Dịch vụ" value={formatNumber(services.length)} detail="Backend, automation, integration" icon={ServerCog} tone="info" />
        <MetricCard label="Độ trễ snapshot" value={`${snapshot.queryLatencyMs}ms`} detail="Thời gian đọc platform snapshot" icon={Timer} tone={snapshot.queryLatencyMs > 800 ? "warning" : "good"} />
        <MetricCard label="Thời lượng cron" value={duration(avgCronDuration)} detail="Trung bình lần chạy gần nhất" icon={Clock3} tone="neutral" />
        <MetricCard label="Cảnh báo" value={formatNumber(snapshot.metrics.integrationWarnings)} detail="Secret hoặc provider chưa đủ" icon={AlertTriangle} tone={snapshot.metrics.integrationWarnings ? "warning" : "good"} />
      </div>
      <SectionCard title="Lưới dịch vụ" action={<div className="flex flex-wrap gap-2"><OperationForm operation="restart_workers" targetType="worker_pool" targetId="platform" label="Khởi động workers" icon={RefreshCw} danger /><Link href="/logs" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]"><TerminalSquare size={14} />Nhật ký</Link></div>}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <div key={service.key} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{service.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{projectSurfaceKindLabel[service.kind]} · {service.owner}</p>
                </div>
                <StatusPill label={moduleStatusLabel[service.status] ?? service.status} tone={moduleTone(service.status)} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white/[0.04] p-2"><p className="text-slate-500">Quan sát</p><p className="mt-1 font-semibold text-slate-200">{service.observe}</p></div>
                <div className="rounded-lg bg-white/[0.04] p-2"><p className="text-slate-500">Điều khiển</p><p className="mt-1 font-semibold text-slate-200">{service.control}</p></div>
                <div className="rounded-lg bg-white/[0.04] p-2"><p className="text-slate-500">Audit</p><p className="mt-1 font-semibold text-slate-200">{service.audit}</p></div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{service.nextStep}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <OperationForm operation="run_smoke_check" targetType="service" targetId={service.key} label="Kiểm tra" icon={CheckCircle2} />
                {service.kind === "automation" ? <CronRunForm jobKey={service.key === "ai-ops" ? "ai-ops" : service.key === "billing" ? "subscriptions" : "reports"} label="Chạy" icon={PlayCircle} /> : null}
                <Link href="/logs" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white"><TerminalSquare size={14} />Trace</Link>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function QueueCenter({ snapshot }: { snapshot: Snapshot }) {
  const queues = queueSignals(snapshot);
  const totals = queues.reduce((acc, queue) => {
    acc.waiting += queue.waiting;
    acc.active += queue.active;
    acc.delayed += queue.delayed;
    acc.failed += queue.failed;
    acc.completed += queue.completed;
    acc.retrying += queue.retrying;
    return acc;
  }, { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, retrying: 0 });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-6">
        <MetricCard label="Đang chờ" value={formatNumber(totals.waiting)} detail="Đang chờ xử lý" icon={Clock3} tone={attentionTone(totals.waiting)} />
        <MetricCard label="Đang chạy" value={formatNumber(totals.active)} detail="Job đang xử lý" icon={PlayCircle} tone="info" />
        <MetricCard label="Bị hoãn" value={formatNumber(totals.delayed)} detail="Job bị hoãn" icon={Timer} tone={attentionTone(totals.delayed)} />
        <MetricCard label="Thất bại" value={formatNumber(totals.failed)} detail="Lỗi cần retry" icon={AlertTriangle} tone={attentionTone(totals.failed)} />
        <MetricCard label="Hoàn tất" value={formatNumber(totals.completed)} detail="Job đã xong" icon={CheckCircle2} tone="good" />
        <MetricCard label="Đang thử lại" value={formatNumber(totals.retrying)} detail="Job đang retry" icon={ListRestart} tone={attentionTone(totals.retrying)} />
      </div>

      <SectionCard title="Vận hành hàng đợi" action={<div className="flex flex-wrap gap-2"><CronRunForm jobKey="ai-ops" label="Chạy AI" icon={Bot} /><CronRunForm jobKey="subscriptions" label="Đối soát" icon={CreditCard} /><OperationForm operation="pause_queue" targetType="queue" targetId="all" label="Tạm dừng" icon={PauseCircle} danger /></div>}>
        <div className="grid gap-3 xl:grid-cols-3">
          {queues.map((queue) => (
            <div key={queue.key} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100">{queue.name}</p>
                <StatusPill label={queue.lag} tone={queue.tone} />
              </div>
              <Sparkline values={[queue.waiting, queue.active, queue.delayed, queue.failed, queue.completed, queue.retrying].map((value) => value + 1)} tone={queue.tone} />
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-400">
                <span>chờ {formatNumber(queue.waiting)}</span>
                <span>chạy {formatNumber(queue.active)}</span>
                <span>lỗi {formatNumber(queue.failed)}</span>
                <span>hoãn {formatNumber(queue.delayed)}</span>
                <span>xong {formatNumber(queue.completed)}</span>
                <span>retry {formatNumber(queue.retrying)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {queue.key === "ai-ops" ? <CronRunForm jobKey="ai-ops" label="Chạy" icon={PlayCircle} /> : null}
                {queue.key === "billing" ? <CronRunForm jobKey="subscriptions" label="Đối soát" icon={CreditCard} /> : null}
                {queue.key === "cron" ? <CronRunForm jobKey="reports" label="Báo cáo" icon={RefreshCw} /> : null}
                <OperationForm operation="replay_queue" targetType="queue" targetId={queue.key} label="Chạy lại" icon={RotateCcw} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function RedisCenter({ snapshot }: { snapshot: Snapshot }) {
  const redis = snapshot.integrations.find((item) => item.key === "persistent-cache");
  const hitRate = snapshot.mapControl.cache.hitRate;
  const keyspaces = [
    { name: "logivn:maps:v1", keys: snapshot.mapControl.cache.events, ttl: "24h", hit: hitRate },
    { name: "platform:snapshot", keys: snapshot.projectAtlas.summary.surfaces, ttl: "5s", hit: 100 },
    { name: "tenant:presence", keys: snapshot.metrics.activeTenants, ttl: "60s", hit: 0 },
    { name: "bull:ai-ops", keys: snapshot.aiControl.requests, ttl: "queue", hit: snapshot.aiControl.successRate }
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Xương sống Redis" value={redis?.status === "configured" ? "Online" : "Fallback"} detail={redis?.note ?? "Chưa cấu hình Redis"} icon={Database} tone={moduleTone(redis?.status ?? "needs_config")} />
        <MetricCard label="Tỉ lệ cache" value={percent(hitRate)} detail={`${formatNumber(snapshot.mapControl.cache.hits)} hit / ${formatNumber(snapshot.mapControl.cache.events)} event`} icon={TrendingUp} tone={hitRate > 60 ? "good" : hitRate > 0 ? "warning" : "neutral"} />
        <MetricCard label="Tín hiệu/giây" value={formatNumber(snapshot.mapControl.cache.events + snapshot.aiControl.requests)} detail="Tín hiệu cache + AI 24h" icon={Activity} tone="info" />
        <MetricCard label="Kết nối" value={redis?.configured ? `${redis.configured}/${redis.total}` : "0"} detail="ENV Redis phía server" icon={Wifi} tone={moduleTone(redis?.status ?? "needs_config")} />
      </div>
      <SectionCard title="Keyspace & truy vấn chậm" action={<div className="flex flex-wrap gap-2"><OperationForm operation="clear_cache" targetType="redis" targetId="platform:snapshot" label="Dọn cache" icon={RotateCcw} /><RefreshForm label="Ping" icon={Wifi} /></div>}>
        <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 border-b border-white/10 bg-[#0B1020] text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-3 py-3">Namespace</th><th className="px-3 py-3">Key/event</th><th className="px-3 py-3">TTL</th><th className="px-3 py-3">Tỉ lệ hit</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3 text-right">Thao tác</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {keyspaces.map((space) => (
                  <tr key={space.name} className="bg-white/[0.025]">
                    <td className="px-3 py-3 font-mono text-xs text-slate-200">{space.name}</td>
                    <td className="px-3 py-3 text-slate-400">{formatNumber(space.keys)}</td>
                    <td className="px-3 py-3 text-slate-400">{space.ttl}</td>
                    <td className="px-3 py-3"><ProgressTrack value={space.hit} tone={space.hit > 60 ? "good" : "warning"} /></td>
                    <td className="px-3 py-3"><StatusPill label={space.hit > 0 ? "quan sát" : "cần telemetry"} tone={space.hit > 0 ? "good" : "warning"} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end"><OperationForm operation="clear_cache" targetType="redis_namespace" targetId={space.name} label="Dọn" icon={RotateCcw} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 font-mono text-xs leading-6 text-slate-400">
            <p className="text-slate-200">redis-cli --latency-history</p>
            <p>p50: {duration(snapshot.mapControl.provider.avgLatencyMs)}</p>
            <p>namespace cache: {snapshot.mapControl.routing.cacheNamespace}</p>
            <p>truy vấn chậm: chưa vượt ngưỡng</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export async function TelegramOpsCenter({ snapshot, session }: { snapshot: Snapshot; session: PlatformAdminSession }) {
  const telegramQueues = queueSignals(snapshot).find((queue) => queue.key === "cron");
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Bot vận hành" value="DevOps" detail="Kết nối cảnh báo Telegram nội bộ" icon={RadioTower} tone="info" />
        <MetricCard label="Hàng đợi gửi" value={formatNumber(telegramQueues?.active ?? 0)} detail="Worker cron/thông báo" icon={MessageCircle} tone="good" />
        <MetricCard label="Lỗi callback" value={formatNumber(snapshot.cronJobs.filter((job) => job.lastRunStatus === "error").length)} detail="Từ job tự động gần nhất" icon={AlertTriangle} tone={snapshot.cronJobs.some((job) => job.lastRunStatus === "error") ? "warning" : "good"} />
        <MetricCard label="Ánh xạ tenant" value={formatNumber(snapshot.metrics.activeTenants)} detail="Quán active có thể nhận tín hiệu" icon={Store} tone="neutral" />
      </div>
      <SectionCard title="Kết nối Telegram DevOps">
        <PlatformTelegramCommandCenter session={session} />
      </SectionCard>
    </div>
  );
}

export function LogsPlatform({ snapshot }: { snapshot: Snapshot }) {
  const logs = [
    ...snapshot.warnings.map((warning, index) => ({ id: `warning-${index}`, time: snapshot.generatedAt, level: "warn", source: "schema", message: warning })),
    ...snapshot.cronJobs.filter((job) => job.lastError).map((job) => ({ id: `cron-${job.key}`, time: job.lastRunAt ?? snapshot.generatedAt, level: "error", source: job.path, message: job.lastError ?? "Cron error" })),
    ...snapshot.auditLogs.slice(0, 12).map((log) => ({ id: log.id, time: log.createdAt, level: "info", source: log.targetType, message: `${log.actor} · ${log.action}${log.targetId ? ` · ${log.targetId}` : ""}` }))
  ].slice(0, 24);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Sự kiện nhật ký" value={formatNumber(logs.length)} detail="Audit, cron, cảnh báo" icon={TerminalSquare} tone="info" />
        <MetricCard label="Nhóm lỗi" value={formatNumber(logs.filter((log) => log.level === "error").length)} detail="Nhóm lỗi đang mở" icon={AlertTriangle} tone={logs.some((log) => log.level === "error") ? "danger" : "good"} />
        <MetricCard label="Dấu vết audit" value={formatNumber(snapshot.auditLogs.length)} detail="Hành động platform gần nhất" icon={ShieldCheck} tone="good" />
        <MetricCard label="Trạng thái stream" value="Live" detail="No-store + refresh snapshot" icon={Wifi} tone="good" />
      </div>
      <SectionCard title="Nhật ký realtime" action={<div className="flex flex-wrap gap-2"><RefreshForm label="Theo dõi" icon={RefreshCw} /><OperationForm operation="ack_alert" targetType="log_stream" targetId="current" label="Ghi nhận lỗi" icon={CheckCircle2} /></div>}>
        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40 font-mono text-xs">
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-slate-500">
            <LiveDot tone="good" /> luồng log · production · có cấu trúc
          </div>
          <div className="max-h-[520px] overflow-y-auto p-3">
            {logs.map((log) => (
              <div key={log.id} className="grid gap-2 border-b border-white/5 py-2 md:grid-cols-[156px_70px_210px_1fr_88px]">
                <span className="text-slate-600">{formatDateTime(log.time)}</span>
                <span className={cn("font-semibold", log.level === "error" ? "text-red-300" : log.level === "warn" ? "text-amber-300" : "text-sky-300")}>{log.level}</span>
                <span className="truncate text-slate-500">{log.source}</span>
                <span className="break-words text-slate-300">{log.message}</span>
                <OperationForm operation="ack_alert" targetType="log" targetId={log.id} label="Ghi nhận" icon={CheckCircle2} />
              </div>
            ))}
            {!logs.length ? <p className="py-8 text-center text-slate-500">Chưa có log trong snapshot hiện tại.</p> : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function AlertCenter({ snapshot }: { snapshot: Snapshot }) {
  const alerts = [
    ...snapshot.warnings.map((warning, index) => ({ id: `warning-${index}`, title: "Cảnh báo migration/schema", detail: warning, severity: "warning" as Tone, source: "Platform" })),
    ...snapshot.billingCutover.anomalies.map((item) => ({ id: item.key + item.restaurantId, title: item.restaurantName, detail: item.detail, severity: item.severity === "danger" ? "danger" as Tone : "warning" as Tone, source: "Payments" })),
    ...snapshot.aiControl.branchInsights.recent.filter((item) => item.severity === "critical" || item.severity === "warning").map((item) => ({ id: item.id, title: item.title, detail: item.action, severity: item.severity === "critical" ? "danger" as Tone : "warning" as Tone, source: item.restaurantName }))
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Cảnh báo mở" value={formatNumber(alerts.length)} detail="Schema, billing, tín hiệu AI" icon={BellRing} tone={attentionTone(alerts.length)} />
        <MetricCard label="Nghiêm trọng" value={formatNumber(alerts.filter((item) => item.severity === "danger").length)} detail="Cần xử lý ngay" icon={Siren} tone={alerts.some((item) => item.severity === "danger") ? "danger" : "good"} />
        <MetricCard label="Đã ghi nhận" value="0" detail="Đang chờ nối workflow" icon={CheckCircle2} tone="neutral" />
        <MetricCard label="Tóm tắt AI" value={formatNumber(snapshot.aiControl.morningBriefs.runs)} detail="Bản tin 7 ngày" icon={Bot} tone="info" />
      </div>
      <SectionCard title="Cảnh báo vận hành" action={<div className="flex flex-wrap gap-2"><OperationForm operation="create_ai_summary" targetType="alerts" targetId="open" label="Tóm tắt AI" icon={Bot} /><RefreshForm label="Kiểm tra lại" icon={RefreshCw} /></div>}>
        <div className="grid gap-3">
          {alerts.slice(0, 16).map((alert) => (
            <div key={alert.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 xl:grid-cols-[180px_1fr_220px]">
              <div className="flex items-center gap-2"><LiveDot tone={alert.severity} /><StatusPill label={alert.severity === "danger" ? "nghiêm trọng" : "cảnh báo"} tone={alert.severity} /></div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">{alert.title}</p>
                <p className="mt-1 break-words text-sm leading-6 text-slate-400">{alert.detail}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusPill label={alert.source} tone="neutral" />
                <OperationForm operation="ack_alert" targetType="alert" targetId={alert.id} label="Ghi nhận" icon={CheckCircle2} />
              </div>
            </div>
          ))}
          {!alerts.length ? <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-100">Không có alert mở trong snapshot hiện tại.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}

export function IncidentCenter({ snapshot }: { snapshot: Snapshot }) {
  const incidentOpen = snapshot.warnings.length > 0 || snapshot.billingCutover.anomalies.some((item) => item.severity === "danger") || snapshot.cronJobs.some((job) => job.lastRunStatus === "error");
  const impact = [
    { label: "Tenant", value: snapshot.metrics.activeTenants, tone: "info" as Tone },
    { label: "Thanh toán chờ", value: snapshot.metrics.pendingPayments, tone: attentionTone(snapshot.metrics.pendingPayments) },
    { label: "Lỗi AI", value: snapshot.aiControl.failures, tone: attentionTone(snapshot.aiControl.failures) },
    { label: "Lỗi cron", value: snapshot.cronJobs.filter((job) => job.lastRunStatus === "error").length, tone: attentionTone(snapshot.cronJobs.filter((job) => job.lastRunStatus === "error").length) }
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        {impact.map((item) => <MetricCard key={item.label} label={item.label} value={formatNumber(item.value)} detail="Ảnh hưởng dịch vụ" icon={Siren} tone={item.tone} />)}
      </div>
      <SectionCard title="Phòng xử lý sự cố realtime" action={<OperationForm operation="create_ai_summary" targetType="incident" targetId="current" label="Tạo tóm tắt AI" icon={Bot} />}>
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className={cn("rounded-lg border p-4", incidentOpen ? "border-amber-400/25 bg-amber-400/10" : "border-emerald-400/25 bg-emerald-400/10")}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-100">{incidentOpen ? "Sự cố/attention đang mở" : "Không có sự cố đang mở"}</p>
              <StatusPill label={incidentOpen ? "đang xử lý" : "đã đóng"} tone={incidentOpen ? "warning" : "good"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><OperationForm operation="restart_workers" targetType="incident" targetId="current" label="Giảm ảnh hưởng" icon={Wrench} /><RefreshForm label="Kiểm tra lại" icon={RefreshCw} /><OperationForm operation="resolve_incident" targetType="incident" targetId="current" label="Đóng sự cố" icon={CheckCircle2} /></div>
          </div>
          <div className="grid gap-3">
            {[
              { title: "Phát hiện", meta: `${snapshot.warnings.length} cảnh báo schema · ${snapshot.billingCutover.anomalies.length} bất thường billing` },
              { title: "Khoanh vùng", meta: `Lỗi AI ${snapshot.aiControl.failures}, lỗi cron ${snapshot.cronJobs.filter((job) => job.lastRunStatus === "error").length}` },
              { title: "Giảm ảnh hưởng", meta: "Retry queue, rollback release, hoặc tắt provider trong Cài đặt/Vận hành AI khi cần" },
              { title: "Hậu kiểm", meta: "Ghi audit log, link trace, cập nhật runbook" }
            ].map((item, index) => (
              <div key={item.title} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-xs font-semibold text-sky-200">{index + 1}</span>
                <div><p className="text-sm font-semibold text-slate-100">{item.title}</p><p className="mt-1 text-sm leading-6 text-slate-400">{item.meta}</p></div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function FeatureFlagsCenter({ snapshot }: { snapshot: Snapshot }) {
  const flags = [
    { key: "telegram_v2", owner: "Telegram", rollout: 70, env: snapshot.environment.vercelEnv, status: "planned", detail: "Bot callback, log gửi, rate limit và ánh xạ tenant" },
    { key: "ai_ops", owner: "Vận hành AI", rollout: snapshot.aiControl.runtimeConfig.configuredProviders ? 100 : 35, env: snapshot.environment.vercelEnv, status: snapshot.aiControl.runtimeConfig.configuredProviders ? "live" : "needs_config", detail: "Chẩn đoán AI, xoay khoá, trace prompt, giới hạn chi phí" },
    { key: "new_payment_flow", owner: "Tài chính", rollout: snapshot.billingCutover.source === "v2" ? 100 : 55, env: snapshot.environment.vercelEnv, status: snapshot.billingCutover.status === "healthy" ? "live" : "needs_review", detail: "Đối soát VietQR, phát hiện trùng, retry webhook" },
    { key: "reservation_v3", owner: "Tenant Ops", rollout: 40, env: "preview", status: "planned", detail: "Worker vòng đời đặt bàn và tự động hoá no-show" }
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Cờ tính năng" value={formatNumber(flags.length)} detail="Rollout theo tenant + môi trường" icon={Flag} tone="info" />
        <MetricCard label="Đang bật" value={formatNumber(flags.filter((flag) => flag.status === "live").length)} detail="Đang bật toàn phần" icon={Zap} tone="good" />
        <MetricCard label="Cần rà soát" value={formatNumber(flags.filter((flag) => flag.status === "needs_review" || flag.status === "needs_config").length)} detail="Cần cấu hình trước khi rollout" icon={AlertTriangle} tone={flags.some((flag) => flag.status === "needs_review" || flag.status === "needs_config") ? "warning" : "good"} />
        <MetricCard label="Phạm vi tenant" value={formatNumber(snapshot.metrics.activeTenants)} detail="Sẵn sàng rollout theo quán" icon={Store} tone="neutral" />
      </div>
      <SectionCard title="Ma trận rollout" action={<OperationForm operation="create_feature_flag_draft" targetType="feature_flag" targetId="new" label="Tạo cờ" icon={SlidersHorizontal} />}>
        <div className="grid gap-3">
          {flags.map((flag) => (
            <div key={flag.key} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-100">{flag.key}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{flag.detail}</p>
                </div>
                <div className="flex flex-wrap gap-2"><StatusPill label={moduleStatusLabel[flag.status] ?? flag.status} tone={moduleTone(flag.status)} /><StatusPill label={flag.env} tone="neutral" /></div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px] md:items-center">
                <ProgressTrack value={flag.rollout} tone={flag.status === "live" ? "good" : "info"} />
                <p className="text-right text-xs font-semibold text-slate-400">{percent(flag.rollout)} · {flag.owner}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <OperationForm operation="create_feature_flag_draft" targetType="feature_flag" targetId={flag.key} label="Chỉnh rollout" icon={SlidersHorizontal} />
                <Link href="/tenants" className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]"><Store size={14} />Tenant</Link>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function SettingsCenter({ snapshot, session }: { snapshot: Snapshot; session: PlatformAdminSession }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Vai trò RBAC" value={formatNumber(snapshot.governance.summary.rolesReady + snapshot.governance.summary.rolesPlanned)} detail={`${snapshot.governance.summary.rolesReady} live · ${snapshot.governance.summary.rolesPlanned} planned`} icon={LockKeyhole} tone="info" />
        <MetricCard label="Mutation có bảo vệ" value={formatNumber(snapshot.metrics.guardedMutations)} detail={`${snapshot.metrics.highRiskMutations} rủi ro cao`} icon={ShieldCheck} tone={snapshot.metrics.highRiskMutations ? "warning" : "good"} />
        <MetricCard label="Secret AI" value={formatNumber(snapshot.aiControl.runtimeConfig.databaseKeys)} detail="Khoá đã mã hoá trong DB" icon={KeyRound} tone={snapshot.aiControl.runtimeConfig.databaseKeys ? "good" : "info"} />
        <MetricCard label="Kiểm soát bảo mật" value={formatNumber(snapshot.securityControls.length)} detail="Session, RLS, CSP, audit" icon={ShieldCheck} tone="good" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SiteSettings snapshot={snapshot} />
        <Security snapshot={snapshot} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <GovernanceControl snapshot={snapshot} />
        <Users snapshot={snapshot} session={session} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ContentControl snapshot={snapshot} />
        <MapsControl snapshot={snapshot} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Plans snapshot={snapshot} />
        <Billing snapshot={snapshot} />
      </div>
    </div>
  );
}
