import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  FileCheck2,
  GitBranch,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";
import {
  applyAiRecommendationDraftAction,
  updateAiAutomationRunStatusAction,
  updateAiRecommendationStatusAction
} from "@/app/dashboard/actions";
import { AiOwnerActionLauncher } from "@/components/dashboard/ai-owner-action-launcher";
import { AiOperatingLoop } from "@/components/dashboard/ai-operating-loop";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import type { AiApplyPlan, AiApplyPlanRisk, AiApplyPlanStatus } from "@/lib/ai/apply-layer";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { getAiApplyLayerDeck } from "@/services/ai-apply-layer-service";

export const dynamic = "force-dynamic";

function statusTone(status: AiApplyPlanStatus) {
  if (status === "ready") return "green";
  if (status === "needs_approval") return "yellow";
  if (status === "blocked") return "red";
  if (status === "manual_only") return "blue";
  return "neutral";
}

function statusLabel(status: AiApplyPlanStatus) {
  if (status === "ready") return "Sẵn sàng apply";
  if (status === "needs_approval") return "Cần duyệt";
  if (status === "manual_only") return "Manual";
  if (status === "blocked") return "Bị chặn";
  return "Hoàn tất";
}

function riskTone(risk: AiApplyPlanRisk) {
  if (risk === "high") return "red";
  if (risk === "medium") return "yellow";
  return "green";
}

const statusIcons: Record<AiApplyPlanStatus, LucideIcon> = {
  ready: PlayCircle,
  needs_approval: ClipboardCheck,
  manual_only: ListChecks,
  blocked: LockKeyhole,
  completed: CheckCircle2
};

function AgentApplyButton({ plan }: { plan: AiApplyPlan }) {
  if (plan.status !== "ready" || !plan.databaseId) return null;
  if (plan.kind !== "recommendation" || !plan.agentAction) return null;

  return (
    <form action={applyAiRecommendationDraftAction}>
      <input type="hidden" name="recommendationId" value={plan.databaseId} />
      <button
        type="submit"
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-3 text-xs font-bold text-[var(--background)] transition hover:bg-[var(--primary)]"
      >
        <PlayCircle size={15} />
        {plan.agentAction.label}
      </button>
    </form>
  );
}

function CompleteButton({ plan }: { plan: AiApplyPlan }) {
  if (plan.status !== "ready" || !plan.databaseId) return null;
  if (plan.itemId.startsWith("recommendation:")) {
    return (
      <form action={updateAiRecommendationStatusAction}>
        <input type="hidden" name="recommendationId" value={plan.databaseId} />
        <input type="hidden" name="status" value="resolved" />
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--primary)] transition hover:border-[var(--primary)]"
        >
          <CheckCircle2 size={15} />
          Hoàn tất
        </button>
      </form>
    );
  }
  if (plan.itemId.startsWith("workflow:")) {
    return (
      <form action={updateAiAutomationRunStatusAction}>
        <input type="hidden" name="runId" value={plan.databaseId} />
        <input type="hidden" name="status" value="completed" />
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--primary)] transition hover:border-[var(--primary)]"
        >
          <CheckCircle2 size={15} />
          Hoàn tất
        </button>
      </form>
    );
  }
  return null;
}

function PlanCard({ plan }: { plan: AiApplyPlan }) {
  const Icon = statusIcons[plan.status];
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={statusTone(plan.status)}>{statusLabel(plan.status)}</Badge>
              <Badge tone={riskTone(plan.risk)}>{plan.risk} risk</Badge>
              <Badge>{plan.actionType}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{plan.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{plan.ownerCopy}</p>
          </div>
        </div>
        {plan.confirmationRequired ? (
          <span className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--muted-foreground)]">
            Xác nhận trước
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {plan.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2 rounded-lg bg-[var(--soft-surface)] px-3 py-2">
            <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full ${step.done ? "bg-[var(--primary)] text-white" : "border border-[var(--border)]"}`}>
              {step.done ? <CheckCircle2 size={11} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[var(--foreground)]">{step.label}</span>
              <span className="block text-[11px] font-medium leading-5 text-[var(--muted-foreground)]">{step.detail}</span>
            </span>
          </div>
        ))}
      </div>

      {plan.blockers.length ? (
        <div className="mt-3 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blocker</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{plan.blockers[0]}</p>
        </div>
      ) : null}

      {plan.agentAction ? (
        <div className="mt-3 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--primary)]">AI có thể thao tác</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{plan.agentAction.description}</p>
        </div>
      ) : null}

      <div className="mt-3 rounded-lg bg-[var(--soft-surface)] px-3 py-2">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
          <RotateCcw size={13} />
          Rollback
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{plan.rollback}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {plan.payloadContract.slice(0, 3).map((field) => (
            <Badge key={field.field}>{field.field}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AgentApplyButton plan={plan} />
          <CompleteButton plan={plan} />
          {plan.targetHref ? (
            <Link
              href={plan.targetHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--primary)] transition hover:border-[var(--primary)]"
            >
              Mở
              <ArrowRight size={15} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function AiApplyPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const deck = await getAiApplyLayerDeck(session.restaurantId);
  const metricCards = [
    { label: "Plans", value: deck.summary.total, detail: "Apply plan từ execution queue", icon: FileCheck2, tone: deck.summary.total ? "green" : "blue" },
    { label: "Ready", value: deck.summary.ready, detail: "Đã duyệt, có thể xử lý", icon: PlayCircle, tone: deck.summary.ready ? "green" : "blue" },
    { label: "Need approval", value: deck.summary.needsApproval, detail: "Cần duyệt trước", icon: ClipboardCheck, tone: deck.summary.needsApproval ? "yellow" : "green" },
    { label: "Manual", value: deck.summary.manualOnly, detail: "Cần thao tác thủ công", icon: ListChecks, tone: deck.summary.manualOnly ? "blue" : "green" },
    { label: "High risk", value: deck.summary.highRisk, detail: "Payment/critical", icon: AlertTriangle, tone: deck.summary.highRisk ? "red" : "green" },
    { label: "Blocked", value: deck.summary.blocked, detail: "Thiếu nền apply", icon: LockKeyhole, tone: deck.summary.blocked ? "yellow" : "green" }
  ] as const;

  return (
    <AdminShell
      title="Áp dụng việc đã duyệt"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Biến đề xuất AI đã duyệt thành checklist thao tác có xác nhận, rollback và màn hình đích"
      showLiveActionCenter={false}
    >
      <div className="grid gap-3">
        <AiOwnerActionLauncher variant="apply" planCode={entitlement.planCode} />
        <AiOperatingLoop
          title="Luồng áp dụng an toàn"
          subtitle="Đây là nơi AI có thể tạo bản nháp thật: promotion chưa public, món/combo tạm ẩn, PO nháp hoặc checklist xử lý có rollback."
          primaryAction={{ href: "/dashboard/ai-execution", label: "Duyệt thêm việc" }}
          secondaryAction={{ href: "/dashboard/ai-ops", label: "Về vận hành" }}
          stages={[
            { id: "detect", value: deck.summary.total, detail: "Apply plan sinh từ execution queue", href: "/dashboard/ai-execution", tone: deck.summary.total ? "green" : "blue" },
            { id: "approve", value: deck.summary.needsApproval, detail: "Cần duyệt trước khi AI tạo nháp", href: "/dashboard/ai-execution", tone: deck.summary.needsApproval ? "yellow" : "green" },
            { id: "act", value: deck.summary.ready, detail: "Có thể tạo nháp/thao tác ngay", href: "/dashboard/ai-apply", tone: deck.summary.ready ? "green" : "blue", active: true },
            { id: "verify", value: deck.summary.manualOnly + deck.summary.blocked, detail: "Cần người kiểm tra hoặc gỡ blocker", href: "/dashboard/ai-apply", tone: deck.summary.blocked ? "red" : "blue" },
            { id: "audit", value: deck.summary.completed, detail: "Đã đánh dấu hoàn tất", href: "/dashboard/ai-apply", tone: "neutral" }
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/ai-execution" className="dashboard-secondary-action">
              <ClipboardCheck size={16} />
              Duyệt đề xuất
            </Link>
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              Cấu hình AI
            </Link>
          </div>
          <Link href="/dashboard/promotions" className="dashboard-secondary-action">
            Khuyến mãi
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
                <FileCheck2 size={15} />
                Apply plans
              </p>
              <h2 className="dashboard-section-title mt-1">Kế hoạch áp dụng có preflight</h2>
            </div>
            <Badge tone={deck.summary.ready ? "green" : "yellow"}>{deck.summary.ready} ready</Badge>
          </div>
          {deck.plans.length ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {deck.plans.slice(0, 24).map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          ) : (
            <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Chưa có việc để áp dụng. Hãy duyệt đề xuất AI trước, hệ thống sẽ tạo checklist thao tác rõ ràng.
            </div>
          )}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <ShieldCheck size={15} />
                Luật áp dụng
              </p>
              <h2 className="dashboard-section-title mt-1">Luật chống apply sai</h2>
            </div>
            <Badge>{deck.guardrails.length} luật</Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {deck.guardrails.map((guardrail) => (
              <div key={guardrail.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                <p className="text-sm font-bold text-[var(--foreground)]">{guardrail.title}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{guardrail.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
