import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  DatabaseZap,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  MonitorCheck,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import type {
  AiProductionGuardrail,
  AiProductionReadinessCheck,
  AiProductionReadinessSeverity,
  AiProductionReadinessStatus
} from "@/lib/ai/production-readiness";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import type { AiSecurityEventFeed, AiSecurityEventSeverity } from "@/services/ai-security-event-service";
import { listRecentAiSecurityEvents } from "@/services/ai-security-event-service";
import { getAiProductionReadinessDeck } from "@/services/ai-production-readiness-service";

export const dynamic = "force-dynamic";

function statusTone(status: AiProductionReadinessStatus) {
  if (status === "ready") return "green";
  if (status === "watch") return "yellow";
  return "red";
}

function statusLabel(status: AiProductionReadinessStatus) {
  if (status === "ready") return "Ready";
  if (status === "watch") return "Theo dõi";
  return "Blocked";
}

function severityTone(severity: AiProductionReadinessSeverity) {
  if (severity === "pass") return "green";
  if (severity === "warn") return "yellow";
  return "red";
}

function severityLabel(severity: AiProductionReadinessSeverity) {
  if (severity === "pass") return "Pass";
  if (severity === "warn") return "Warn";
  return "Block";
}

function securitySeverityTone(severity: AiSecurityEventSeverity) {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "yellow";
  return "green";
}

function guardrailTone(status: AiProductionGuardrail["status"]) {
  if (status === "active") return "green";
  if (status === "preview") return "blue";
  return "yellow";
}

const areaIcons: Record<AiProductionReadinessCheck["area"], LucideIcon> = {
  provider: KeyRound,
  data: DatabaseZap,
  execution: ClipboardCheck,
  cost: Coins,
  security: ShieldCheck,
  observability: MonitorCheck,
  future: Sparkles
};

function CheckRow({ check }: { check: AiProductionReadinessCheck }) {
  const Icon = areaIcons[check.area];
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap gap-1.5">
              <Badge tone={severityTone(check.severity)}>{severityLabel(check.severity)}</Badge>
              <Badge>{check.area}</Badge>
            </span>
            <span className="mt-2 block text-sm font-bold text-[var(--foreground)]">{check.title}</span>
            <span className="mt-1 block text-xs font-medium leading-5 text-[var(--muted-foreground)]">{check.detail}</span>
          </span>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-[var(--soft-surface)] px-3 py-2">
        <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Next action</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{check.action}</p>
      </div>
    </article>
  );
}

function GuardrailPanel({
  title,
  icon: Icon,
  guardrails
}: {
  title: string;
  icon: LucideIcon;
  guardrails: AiProductionGuardrail[];
}) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <Icon size={15} />
            Production guardrails
          </p>
          <h2 className="dashboard-section-title mt-1">{title}</h2>
        </div>
        <Badge>{guardrails.length} rules</Badge>
      </div>
      <div className="mt-3 grid gap-2">
        {guardrails.map((guardrail) => (
          <div key={guardrail.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-bold text-[var(--foreground)]">{guardrail.title}</p>
              <Badge tone={guardrailTone(guardrail.status)}>{guardrail.status}</Badge>
            </div>
            <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{guardrail.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SecurityEventPanel({ feed }: { feed: AiSecurityEventFeed }) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <ShieldCheck size={15} />
            AI security stream
          </p>
          <h2 className="dashboard-section-title mt-1">Blocked actions và audit events</h2>
        </div>
        <Badge tone={feed.schemaReady ? (feed.highRiskCount ? "red" : "green") : "yellow"}>
          {feed.schemaReady ? `${feed.highRiskCount} high risk` : "schema pending"}
        </Badge>
      </div>

      {!feed.schemaReady ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
          <p className="text-sm font-bold text-[var(--foreground)]">Security event stream chưa migrate</p>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
            Bảng ai_security_events chưa sẵn sàng ở database hiện tại; guardrail vẫn chặn tại runtime và sẽ ghi audit sau khi migrate.
          </p>
        </div>
      ) : feed.events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
          <p className="text-sm font-bold text-[var(--foreground)]">Không có sự kiện bảo mật mới</p>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">Tool isolation, approval token và OCR guardrail đang sạch trong cửa sổ gần nhất.</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {feed.events.map((event) => (
            <div key={event.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-[var(--foreground)]">{event.eventType}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                    {event.surface} · {new Date(event.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </p>
                </div>
                <Badge tone={securitySeverityTone(event.severity)}>{event.severity}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function AiProductionPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [deck, securityEventFeed] = await Promise.all([
    getAiProductionReadinessDeck(session.restaurantId),
    listRecentAiSecurityEvents({ restaurantId: session.restaurantId, limit: 8 })
  ]);
  const metricCards = [
    { label: "Score", value: `${deck.summary.score}%`, detail: statusLabel(deck.summary.status), icon: Rocket, tone: statusTone(deck.summary.status) },
    { label: "Blockers", value: deck.summary.blockers, detail: "Điểm chặn deploy AI", icon: LockKeyhole, tone: deck.summary.blockers ? "red" : "green" },
    { label: "Warnings", value: deck.summary.warnings, detail: "Cần theo dõi sau release", icon: AlertTriangle, tone: deck.summary.warnings ? "yellow" : "green" },
    { label: "Providers", value: deck.summary.configuredProviders, detail: "Provider configured", icon: KeyRound, tone: deck.summary.configuredProviders ? "green" : "yellow" },
    { label: "Schemas", value: `${deck.summary.readySchemas}/3`, detail: "AI data contracts", icon: DatabaseZap, tone: deck.summary.readySchemas === 3 ? "green" : "red" },
    { label: "Apply", value: deck.summary.applyPlans, detail: `${deck.summary.highRiskApplyPlans} high-risk`, icon: FileCheck2, tone: deck.summary.highRiskApplyPlans ? "yellow" : "green" }
  ] as const;

  return (
    <AdminShell
      title="AI Production Readiness"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Release gate cho provider, schema, chi phí, audit, security và apply guardrails của toàn bộ AI"
      showLiveActionCenter={false}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              Cấu hình AI
            </Link>
            <Link href="/dashboard/ai-execution" className="dashboard-secondary-action">
              <ClipboardCheck size={16} />
              Duyệt đề xuất
            </Link>
            <Link href="/dashboard/ai-apply" className="dashboard-secondary-action">
              <FileCheck2 size={16} />
              Áp dụng AI
            </Link>
          </div>
          <Link href="/dashboard/ai-ops" className="dashboard-secondary-action">
            Trợ lý vận hành
            <ArrowRight size={15} />
          </Link>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="admin-stat-tile p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="dashboard-stat-icon">
                    <Icon size={18} />
                  </span>
                  <Badge tone={card.tone}>{card.label}</Badge>
                </div>
                <p className="metric-number mt-4 text-2xl font-semibold tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{card.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <MonitorCheck size={15} />
                Release gate
              </p>
              <h2 className="dashboard-section-title mt-1">Production checks</h2>
            </div>
            <Badge tone={statusTone(deck.summary.status)}>{statusLabel(deck.summary.status)}</Badge>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {deck.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-2">
          <GuardrailPanel title="Cost routing và fallback" icon={Coins} guardrails={deck.costGuardrails} />
          <GuardrailPanel title="Security và privacy" icon={ShieldCheck} guardrails={deck.securityGuardrails} />
        </div>

        <SecurityEventPanel feed={securityEventFeed} />

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <CheckCircle2 size={15} />
                Release checklist
              </p>
              <h2 className="dashboard-section-title mt-1">Các bước còn lại trước deploy tổng</h2>
            </div>
            <Badge tone={deck.releaseChecklist.every((item) => item.done) ? "green" : "yellow"}>
              {deck.releaseChecklist.filter((item) => item.done).length}/{deck.releaseChecklist.length} done
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {deck.releaseChecklist.map((item) => (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.done ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}>
                  {item.done ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--foreground)]">{item.title}</span>
                  <span className="block text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
