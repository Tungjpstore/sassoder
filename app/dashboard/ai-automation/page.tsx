import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  EyeOff,
  GitBranch,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  WandSparkles
} from "lucide-react";
import { updateAiAutomationRunStatusAction } from "@/app/dashboard/actions";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  buildAiAutomationPlaybooks,
  type AiAutomationPlaybook,
  type AiAutomationPlaybookDomain,
  type AiAutomationPlaybookPriority,
  type AiAutomationPlaybookStatus
} from "@/lib/ai/automation-playbooks";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import {
  listRecentAiAutomationRuns,
  type AiAutomationRunStatus,
  type PersistedAiAutomationWorkflow
} from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";

export const dynamic = "force-dynamic";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false,
    automationRuns: schemas.checks.find((check) => check.key === "automationRuns")?.ready ?? false,
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false
  };
}

function priorityTone(priority: AiAutomationPlaybookPriority) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function statusTone(status: AiAutomationPlaybookStatus) {
  if (status === "ready") return "green";
  if (status === "blocked") return "red";
  return "yellow";
}

function statusLabel(status: AiAutomationPlaybookStatus) {
  if (status === "ready") return "Sẵn sàng";
  if (status === "blocked") return "Bị chặn";
  return "Theo dõi";
}

function domainLabel(domain: AiAutomationPlaybookDomain) {
  if (domain === "inventory") return "Kho";
  if (domain === "marketing") return "Marketing";
  if (domain === "staffing") return "Nhân sự";
  if (domain === "operations") return "Vận hành";
  if (domain === "customer") return "Khách hàng";
  if (domain === "branch") return "Chi nhánh";
  return "Support";
}

function workflowStatusLabel(status?: AiAutomationRunStatus) {
  if (status === "approved") return "Đã duyệt";
  if (status === "completed") return "Hoàn tất";
  if (status === "manual") return "Manual";
  return "Chờ duyệt";
}

function workflowTone(priority: PersistedAiAutomationWorkflow["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function PlaybookCard({ playbook }: { playbook: AiAutomationPlaybook }) {
  const primaryAction = playbook.actions[0];
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(playbook.status)}>{statusLabel(playbook.status)}</Badge>
            <Badge tone={priorityTone(playbook.priority)}>{playbook.priority}</Badge>
            <Badge>{domainLabel(playbook.domain)}</Badge>
          </div>
          <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{playbook.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{playbook.trigger}</p>
        </div>
        <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
          <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Ready</span>
          <strong className="metric-number text-sm text-[var(--foreground)]">{playbook.readinessScore}%</strong>
        </span>
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{playbook.outcome}</p>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Bước tiếp theo</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{playbook.nextAction}</p>
        </div>
        {playbook.blockers.length ? (
          <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
            <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blockers</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{playbook.blockers.slice(0, 2).join(" ")}</p>
          </div>
        ) : playbook.liveSignals.length ? (
          <div className="flex flex-wrap gap-1.5">
            {playbook.liveSignals.slice(0, 3).map((signal) => (
              <Badge key={signal} tone="green">{signal}</Badge>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Badge>{playbook.cadence}</Badge>
            <Badge>{playbook.safetyMode === "confirm_first" ? "Confirm first" : "Manual only"}</Badge>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
          {playbook.channels.slice(0, 3).join(" · ")}
        </span>
        {primaryAction ? (
          <Link
            href={primaryAction.href}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
            aria-label={primaryAction.label}
            title={primaryAction.label}
          >
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function LiveWorkflowQueue({
  workflows,
  schemaReady
}: {
  workflows: PersistedAiAutomationWorkflow[];
  schemaReady: boolean;
}) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <GitBranch size={15} />
            Live execution
          </p>
          <h2 className="dashboard-section-title mt-1">Workflow đang chờ quyết định</h2>
        </div>
        <Badge tone={schemaReady ? (workflows.length ? "green" : "blue") : "yellow"}>
          {schemaReady ? `${workflows.length} workflow` : "Cần schema"}
        </Badge>
      </div>

      {!schemaReady ? (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Cần schema automation runs để lưu trạng thái duyệt, ẩn và hoàn tất workflow AI.
        </div>
      ) : workflows.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {workflows.slice(0, 10).map((workflow) => {
            const runId = workflow.lifecycle?.databaseId;
            const primaryLink = workflow.actions.find((action) => action.type === "link" && action.href);
            return (
              <article key={runId ?? workflow.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={workflowTone(workflow.priority)}>{workflow.priority}</Badge>
                      <Badge>{domainLabel(workflow.domain)}</Badge>
                      <Badge>{workflowStatusLabel(workflow.lifecycle?.status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{workflow.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{workflow.trigger}</p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
                    <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">ETA</span>
                    <strong className="metric-number text-sm text-[var(--foreground)]">{workflow.estimatedMinutes} phút</strong>
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {workflow.steps.slice(0, 3).map((step) => (
                    <div key={step.id} className="flex items-start gap-2 rounded-lg bg-[var(--soft-surface)] px-3 py-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-[var(--foreground)]">{step.label}</span>
                        {step.description ? (
                          <span className="block text-[11px] font-medium leading-5 text-[var(--muted-foreground)]">{step.description}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                    Cập nhật {formatDateTime(workflow.lifecycle?.lastSeenAt)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {runId && workflow.executionMode === "confirm_first" && workflow.lifecycle?.status !== "approved" ? (
                      <form action={updateAiAutomationRunStatusAction}>
                        <input type="hidden" name="runId" value={runId} />
                        <input type="hidden" name="status" value="approved" />
                        <button
                          type="submit"
                          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                          aria-label={`Duyệt workflow ${workflow.title}`}
                          title="Duyệt workflow"
                        >
                          <CheckCircle2 size={15} />
                        </button>
                      </form>
                    ) : null}
                    {runId ? (
                      <form action={updateAiAutomationRunStatusAction}>
                        <input type="hidden" name="runId" value={runId} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button
                          type="submit"
                          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                          aria-label={`Ẩn workflow ${workflow.title}`}
                          title="Ẩn"
                        >
                          <EyeOff size={15} />
                        </button>
                      </form>
                    ) : null}
                    {primaryLink?.href ? (
                      <Link
                        href={primaryLink.href}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                        aria-label={`Mở khu vực xử lý ${workflow.title}`}
                        title="Mở khu vực xử lý"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Chưa có workflow đang chờ duyệt. Khi AI Ops phát hiện tồn thấp, giờ thấp điểm, thiếu nhân sự hoặc thanh toán treo, workflow sẽ vào đây.
        </div>
      )}
    </section>
  );
}

export default async function AiAutomationPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [providers, schemas, memoriesResult, recommendationsResult, workflowRunsResult] = await Promise.all([
    Promise.resolve(getAiProviderReadiness()),
    getAiSchemaReadiness(),
    listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 20 }),
    listRecentAiRecommendations(session.restaurantId, 30),
    listRecentAiAutomationRuns(session.restaurantId, 30)
  ]);
  const playbookDeck = buildAiAutomationPlaybooks({
    providerConfigured: providers.some((provider) => provider.configured),
    schemas: schemaFlags(schemas),
    memoryCount: memoriesResult.memories.length,
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title
    })),
    workflows: workflowRunsResult.workflows.map((workflow) => ({
      id: workflow.id,
      domain: workflow.domain,
      priority: workflow.priority,
      title: workflow.title
    }))
  });

  const metricCards = [
    {
      label: "Playbooks",
      value: playbookDeck.summary.total,
      detail: `${playbookDeck.summary.ready} ready · ${playbookDeck.summary.watch} watch`,
      icon: ListChecks,
      tone: playbookDeck.summary.blocked ? "yellow" : "green"
    },
    {
      label: "Critical",
      value: playbookDeck.summary.criticalOpen,
      detail: "Playbook critical đang có tín hiệu",
      icon: TriangleAlert,
      tone: playbookDeck.summary.criticalOpen ? "red" : "green"
    },
    {
      label: "Confirm-first",
      value: playbookDeck.summary.confirmFirst,
      detail: "Luồng cần chủ quán duyệt",
      icon: ShieldCheck,
      tone: "blue"
    },
    {
      label: "Automation",
      value: playbookDeck.summary.readyToAutomate,
      detail: "Luồng có thể tự động theo dõi",
      icon: Bot,
      tone: "green"
    },
    {
      label: "Live queue",
      value: workflowRunsResult.schemaReady ? workflowRunsResult.workflows.length : "--",
      detail: workflowRunsResult.schemaReady ? "Workflow đang mở" : "Cần schema",
      icon: PlayCircle,
      tone: workflowRunsResult.schemaReady ? "green" : "yellow"
    },
    {
      label: "Blocked",
      value: playbookDeck.summary.blocked,
      detail: "Thiếu provider, schema hoặc memory",
      icon: LockKeyhole,
      tone: playbookDeck.summary.blocked ? "yellow" : "green"
    }
  ] as const;

  return (
    <AdminShell
      title="AI Automation Studio"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Playbook, rule readiness và workflow duyệt trước khi AI tự động hóa vận hành"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <div className="dashboard-ai-toolbar flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              AI Control
            </Link>
            <Link href="/dashboard/ai-ops" className="dashboard-secondary-action">
              <BrainCircuit size={16} />
              AI Ops
            </Link>
            <Link href="/dashboard/ai-growth" className="dashboard-secondary-action">
              <TrendingUp size={16} />
              AI Growth
            </Link>
          </div>
          <Link href="/api/admin/ai/playbooks" className="dashboard-secondary-action">
            API playbooks
            <ArrowRight size={15} />
          </Link>
        </div>

        <section className="dashboard-ai-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
                <WandSparkles size={15} />
                Automation playbooks
              </p>
              <h2 className="dashboard-section-title mt-1">Bản đồ tự động hóa theo luồng vận hành</h2>
            </div>
            <Badge tone={playbookDeck.summary.blocked ? "yellow" : "green"}>
              {playbookDeck.summary.ready} ready
            </Badge>
          </div>
          <div className="dashboard-ai-card-grid mt-3 grid gap-3 xl:grid-cols-2">
            {playbookDeck.playbooks.map((playbook) => (
              <PlaybookCard key={playbook.id} playbook={playbook} />
            ))}
          </div>
        </section>

        <section className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <aside className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <Route size={15} />
                  Safety model
                </p>
                <h2 className="dashboard-section-title mt-1">Nguyên tắc triển khai</h2>
              </div>
              <Badge>Production</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {[
                ["Không tự trừ tiền hoặc sửa đơn", "AI chỉ mở checklist và yêu cầu xác nhận ở các hành động có rủi ro."],
                ["Branch isolation", "Tất cả queue và playbook lấy dữ liệu theo restaurant session hiện tại."],
                ["Explainable first", "Mỗi playbook phải có trigger, outcome, blocker và next action rõ ràng."],
                ["Fallback human", "Luồng support, staffing và payment giữ manual/confirm-first cho tới khi có audit đủ dày."]
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                  <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{detail}</p>
                </div>
              ))}
            </div>
          </aside>
          <LiveWorkflowQueue workflows={workflowRunsResult.workflows} schemaReady={workflowRunsResult.schemaReady} />
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <Clock3 size={15} />
                Rollout map
              </p>
              <h2 className="dashboard-section-title mt-1">Đợt nâng cấp tiếp theo của Automation Studio</h2>
            </div>
            <Badge tone="blue">Next wave</Badge>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              ["Rule builder", "Cho admin bật/tắt playbook, chỉnh ngưỡng giờ thấp điểm, tồn kho, SLA phục vụ."],
              ["Approval inbox", "Gom recommendation, workflow và action checkpoint thành một hàng đợi duyệt duy nhất."],
              ["Execution audit", "Lưu lịch sử AI đề xuất, ai duyệt, thay đổi nào đã được áp dụng và rollback note."]
            ].map(([title, detail]) => (
              <article key={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="text-sm font-bold text-[var(--foreground)]">{title}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
