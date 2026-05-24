import Link from "next/link";
import {
  ArrowRight,
  Archive,
  BrainCircuit,
  ChefHat,
  CheckCircle2,
  ClipboardCheck,
  CircleDashed,
  DatabaseZap,
  EyeOff,
  FileCheck2,
  GitBranch,
  Headphones,
  History,
  KeyRound,
  Mic,
  MonitorCheck,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Video,
  WandSparkles
} from "lucide-react";
import {
  updateAiAutomationRunStatusAction,
  updateRestaurantAiMemoryStatusAction
} from "@/app/dashboard/actions";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AiRecommendationCards } from "@/components/dashboard/ai-recommendation-cards";
import { Badge } from "@/components/ui/badge";
import { getAiFutureCapabilities, type AiFutureCapability } from "@/lib/ai/future-capabilities";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness, type AiSchemaKey } from "@/lib/ai/schema-readiness";
import type { AiProviderReadiness } from "@/lib/ai/router/types";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import {
  listRecentAiAutomationRuns,
  type AiAutomationRunStatus,
  type PersistedAiAutomationWorkflow
} from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";

export const dynamic = "force-dynamic";

type MemoryRow = Awaited<ReturnType<typeof listRestaurantAiMemories>>["memories"][number];

const schemaOrder: AiSchemaKey[] = ["recommendations", "automationRuns", "restaurantMemories"];

function providerLabel(provider: AiProviderReadiness["provider"]) {
  if (provider === "vercel_gateway") return "Vercel Gateway";
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  if (provider === "claude") return "Claude";
  if (provider === "nvidia") return "NVIDIA DSX Air";
  if (provider === "qwen") return "Qwen";
  return "xAI";
}

function memoryCategoryLabel(category: MemoryRow["category"]) {
  if (category === "brand") return "Brand";
  if (category === "menu") return "Menu";
  if (category === "customer") return "Khách";
  if (category === "staff") return "Nhân sự";
  if (category === "inventory") return "Kho";
  if (category === "marketing") return "Marketing";
  if (category === "policy") return "Quy định";
  if (category === "branch") return "Chi nhánh";
  return "Vận hành";
}

function sensitivityTone(sensitivity: MemoryRow["sensitivity"]) {
  if (sensitivity === "sensitive") return "red";
  if (sensitivity === "public") return "green";
  return "blue";
}

function sensitivityLabel(sensitivity: MemoryRow["sensitivity"]) {
  if (sensitivity === "sensitive") return "Nhạy cảm";
  if (sensitivity === "public") return "Public";
  return "Nội bộ";
}

function capabilityTone(status: AiFutureCapability["status"]) {
  if (status === "ready") return "green";
  if (status === "preview") return "yellow";
  return "neutral";
}

function capabilityStatusLabel(status: AiFutureCapability["status"]) {
  if (status === "ready") return "Sẵn sàng";
  if (status === "preview") return "Preview";
  return "Tắt";
}

function workflowTone(priority: PersistedAiAutomationWorkflow["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function workflowDomainLabel(domain: PersistedAiAutomationWorkflow["domain"]) {
  if (domain === "inventory") return "Kho";
  if (domain === "marketing") return "Marketing";
  return "Nhân sự";
}

function workflowStatusLabel(status?: AiAutomationRunStatus) {
  if (status === "approved") return "Đã duyệt";
  if (status === "completed") return "Hoàn tất";
  if (status === "dismissed") return "Đã ẩn";
  if (status === "manual") return "Manual";
  return "Chờ xác nhận";
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

function readinessScore({
  configuredProviders,
  schemaReady,
  recommendationReady,
  workflowReady,
  memoryReady
}: {
  configuredProviders: number;
  schemaReady: boolean;
  recommendationReady: boolean;
  workflowReady: boolean;
  memoryReady: boolean;
}) {
  return [
    configuredProviders > 0,
    schemaReady,
    recommendationReady,
    workflowReady,
    memoryReady
  ].filter(Boolean).length;
}

function ProviderMatrix({ providers }: { providers: AiProviderReadiness[] }) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <KeyRound size={15} />
            Provider gateway
          </p>
          <h2 className="dashboard-section-title mt-1">Routing AI và fallback</h2>
        </div>
        <Badge tone={providers.some((provider) => provider.configured) ? "green" : "yellow"}>
          {providers.filter((provider) => provider.configured).length}/{providers.length} configured
        </Badge>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="grid grid-cols-[1.1fr_0.9fr_1fr_1.2fr] gap-3 border-b border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">
          <span>Provider</span>
          <span>Trạng thái</span>
          <span>Protocol</span>
          <span>Capabilities</span>
        </div>
        {providers.map((provider) => (
          <div
            key={provider.provider}
            className="grid grid-cols-1 gap-2 border-b border-[var(--border)] px-3 py-3 text-sm last:border-b-0 md:grid-cols-[1.1fr_0.9fr_1fr_1.2fr] md:gap-3"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-[var(--foreground)]">{providerLabel(provider.provider)}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[var(--muted-foreground)]">{provider.chatModel}</p>
            </div>
            <div>
              <Badge tone={provider.configured ? "green" : "yellow"}>{provider.configured ? "Ready" : "Thiếu key"}</Badge>
              {!provider.configured ? (
                <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[var(--muted-foreground)]">
                  {provider.missingEnvNames.join(" hoặc ")}
                </p>
              ) : null}
            </div>
            <p className="text-xs font-semibold text-[var(--muted-foreground)]">{provider.protocol}</p>
            <div className="flex flex-wrap gap-1.5">
              {provider.supportsJsonMode ? <Badge>JSON</Badge> : null}
              {provider.supportsToolCalling ? <Badge>Tools</Badge> : null}
              {provider.supportsOcr ? <Badge>OCR</Badge> : null}
              {provider.supportsImageGeneration ? <Badge>Image</Badge> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SchemaReadinessPanel({
  schemas
}: {
  schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>;
}) {
  const checksByKey = new Map(schemas.checks.map((check) => [check.key, check]));

  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <DatabaseZap size={15} />
            Data contracts
          </p>
          <h2 className="dashboard-section-title mt-1">Schema AI production</h2>
        </div>
        <Badge tone={schemas.ready ? "green" : "yellow"}>{schemas.ready ? "Ready" : "Cần migration"}</Badge>
      </div>

      <div className="mt-3 grid gap-2">
        {schemaOrder.map((key) => {
          const check = checksByKey.get(key);
          if (!check) return null;
          return (
            <div key={check.key} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${check.ready ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}>
                {check.ready ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[var(--foreground)]">{check.label}</span>
                <span className="block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                  {check.table} · {check.ready ? "đang hoạt động" : check.errorCode ?? "chưa có trong database"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemoryLibrary({
  memories,
  schemaReady
}: {
  memories: MemoryRow[];
  schemaReady: boolean;
}) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <History size={15} />
            Restaurant memory
          </p>
          <h2 className="dashboard-section-title mt-1">Bộ nhớ ngữ cảnh cho AI chủ quán</h2>
        </div>
        <Badge tone={schemaReady ? (memories.length ? "green" : "blue") : "yellow"}>
          {schemaReady ? `${memories.length} memory` : "Cần schema"}
        </Badge>
      </div>

      {!schemaReady ? (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Cần migration `ai_restaurant_memories` để bật bộ nhớ nhà hàng và retrieval có kiểm soát.
        </div>
      ) : memories.length ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {memories.slice(0, 10).map((memory) => (
            <article key={memory.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{memoryCategoryLabel(memory.category)}</Badge>
                    <Badge tone={sensitivityTone(memory.sensitivity)}>{sensitivityLabel(memory.sensitivity)}</Badge>
                    <Badge tone={memory.status === "active" ? "green" : "yellow"}>{memory.status}</Badge>
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-[var(--foreground)]">{memory.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
                    {memory.summary ?? memory.content}
                  </p>
                </div>
              </div>
              {memory.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {memory.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--soft-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                  Cập nhật {formatDateTime(memory.updatedAt)} · dùng gần nhất {formatDateTime(memory.lastUsedAt)}
                </span>
                <div className="flex items-center gap-1.5">
                  {memory.status !== "archived" ? (
                    <form action={updateRestaurantAiMemoryStatusAction}>
                      <input type="hidden" name="memoryId" value={memory.id} />
                      <input type="hidden" name="status" value="archived" />
                      <button
                        type="submit"
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        aria-label={`Lưu trữ memory ${memory.title}`}
                        title="Lưu trữ"
                      >
                        <Archive size={15} />
                      </button>
                    </form>
                  ) : (
                    <form action={updateRestaurantAiMemoryStatusAction}>
                      <input type="hidden" name="memoryId" value={memory.id} />
                      <input type="hidden" name="status" value="active" />
                      <button
                        type="submit"
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                        aria-label={`Kích hoạt memory ${memory.title}`}
                        title="Kích hoạt lại"
                      >
                        <RefreshCw size={15} />
                      </button>
                    </form>
                  )}
                  <form action={updateRestaurantAiMemoryStatusAction}>
                    <input type="hidden" name="memoryId" value={memory.id} />
                    <input type="hidden" name="status" value="deleted" />
                    <button
                      type="submit"
                      className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--tertiary)] hover:text-[var(--tertiary)]"
                      aria-label={`Xóa memory ${memory.title}`}
                      title="Xóa khỏi AI"
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
          Chưa có memory nào. Khi thêm brand voice, quy định vận hành, ghi chú menu hoặc chính sách chi nhánh, AI sẽ trả lời sát bối cảnh hơn.
        </div>
      )}
    </section>
  );
}

function WorkflowQueue({
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
            Automation queue
          </p>
          <h2 className="dashboard-section-title mt-1">Workflow đang chờ chủ quán quyết định</h2>
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
          {workflows.slice(0, 8).map((workflow) => {
            const runId = workflow.lifecycle?.databaseId;
            const primaryLink = workflow.actions.find((action) => action.type === "link" && action.href);
            return (
              <article key={runId ?? workflow.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={workflowTone(workflow.priority)}>{workflow.priority}</Badge>
                      <Badge>{workflowDomainLabel(workflow.domain)}</Badge>
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
                <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{workflow.outcome}</p>
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
          Chưa có workflow đang chờ duyệt. Khi AI phát hiện việc có thể tự động hóa, queue sẽ xuất hiện ở đây.
        </div>
      )}
    </section>
  );
}

function FutureCapabilitiesPanel({ capabilities }: { capabilities: AiFutureCapability[] }) {
  return (
    <section className="dashboard-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <WandSparkles size={15} />
            Future AI
          </p>
          <h2 className="dashboard-section-title mt-1">Voice/Vision readiness hooks</h2>
        </div>
        <Badge tone={capabilities.some((capability) => capability.enabled) ? "green" : "neutral"}>
          {capabilities.filter((capability) => capability.enabled).length} enabled
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {capabilities.map((capability) => {
          const Icon = capability.key.startsWith("voice") || capability.key.includes("phone") ? Mic : Video;
          return (
            <article key={capability.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-bold text-[var(--foreground)]">{capability.label}</p>
                    <Badge tone={capabilityTone(capability.status)}>{capabilityStatusLabel(capability.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{capability.dataScope}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{capability.safetyMode === "confirm_first" ? "Confirm first" : "Manual only"}</Badge>
                    <Badge>{capability.envName}</Badge>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function AiControlPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const [providers, schemas, futureCapabilities, memoriesResult, recommendationsResult, workflowRunsResult] = await Promise.all([
    Promise.resolve(getAiProviderReadiness()),
    getAiSchemaReadiness(),
    Promise.resolve(getAiFutureCapabilities()),
    listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: true, limit: 20 }),
    listRecentAiRecommendations(session.restaurantId, 12),
    listRecentAiAutomationRuns(session.restaurantId, 12)
  ]);

  const configuredProviders = providers.filter((provider) => provider.configured).length;
  const score = readinessScore({
    configuredProviders,
    schemaReady: schemas.ready,
    recommendationReady: recommendationsResult.schemaReady,
    workflowReady: workflowRunsResult.schemaReady,
    memoryReady: memoriesResult.schemaReady
  });
  const recommendationDeck = {
    generatedAt: new Date().toISOString(),
    summary: recommendationsResult.recommendations.length
      ? `${recommendationsResult.recommendations.length} gợi ý AI đang mở.`
      : "AI chưa có gợi ý đang mở.",
    recommendations: recommendationsResult.recommendations
  };

  const metricCards = [
    {
      label: "Readiness",
      value: `${score}/5`,
      detail: score >= 4 ? "Cấu hình AI sẵn sàng vận hành" : "Cần hoàn tất cấu hình hoặc schema",
      icon: MonitorCheck,
      tone: score >= 4 ? "green" : "yellow"
    },
    {
      label: "Providers",
      value: configuredProviders,
      detail: `${providers.length} provider trong gateway`,
      icon: KeyRound,
      tone: configuredProviders ? "green" : "yellow"
    },
    {
      label: "Recommendations",
      value: recommendationsResult.schemaReady ? recommendationsResult.recommendations.length : "--",
      detail: recommendationsResult.schemaReady ? "Gợi ý đang mở" : "Cần schema recommendation",
      icon: Sparkles,
      tone: recommendationsResult.schemaReady ? "green" : "yellow"
    },
    {
      label: "Workflows",
      value: workflowRunsResult.schemaReady ? workflowRunsResult.workflows.length : "--",
      detail: workflowRunsResult.schemaReady ? "Workflow cần xử lý" : "Cần schema automation",
      icon: GitBranch,
      tone: workflowRunsResult.schemaReady ? "green" : "yellow"
    },
    {
      label: "Memory",
      value: memoriesResult.schemaReady ? memoriesResult.memories.length : "--",
      detail: memoriesResult.schemaReady ? "Ngữ cảnh đang lưu" : "Cần schema memory",
      icon: History,
      tone: memoriesResult.schemaReady ? "green" : "yellow"
    },
    {
      label: "Future AI",
      value: futureCapabilities.filter((capability) => capability.enabled).length,
      detail: "Voice/Vision flags",
      icon: ShieldCheck,
      tone: futureCapabilities.some((capability) => capability.enabled) ? "green" : "blue"
    }
  ] as const;

  return (
    <AdminShell
      title="Cấu hình AI"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Trung tâm kiểm soát provider, memory, đề xuất và automation AI"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <div className="dashboard-ai-toolbar flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard/ai-ops" className="dashboard-secondary-action">
            <BrainCircuit size={16} />
            Trợ lý vận hành
          </Link>
          <Link href="/dashboard/ai-automation" className="dashboard-secondary-action">
            <GitBranch size={16} />
            Tự động hóa
          </Link>
          <Link href="/dashboard/ai-execution" className="dashboard-secondary-action">
            <ClipboardCheck size={16} />
            Duyệt đề xuất
          </Link>
          <Link href="/dashboard/ai-apply" className="dashboard-secondary-action">
            <FileCheck2 size={16} />
            Áp dụng AI
          </Link>
          <Link href="/dashboard/ai-production" className="dashboard-secondary-action">
            <Rocket size={16} />
            Kiểm tra AI
          </Link>
          <Link href="/dashboard/ai-growth" className="dashboard-secondary-action">
            <TrendingUp size={16} />
            Marketing AI
          </Link>
          <Link href="/dashboard/ai-support" className="dashboard-secondary-action">
            <Headphones size={16} />
            Chăm sóc khách
          </Link>
          <Link href="/dashboard/ai-menu" className="dashboard-secondary-action">
            <ChefHat size={16} />
            Menu & combo
          </Link>
          <Link href="/dashboard/settings?section=ai" className="dashboard-secondary-action">
            Cài đặt AI
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

        <div className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <ProviderMatrix providers={providers} />
          <SchemaReadinessPanel schemas={schemas} />
        </div>

        <AiRecommendationCards deck={recommendationDeck} schemaReady={recommendationsResult.schemaReady} />

        <WorkflowQueue workflows={workflowRunsResult.workflows} schemaReady={workflowRunsResult.schemaReady} />

        <MemoryLibrary memories={memoriesResult.memories} schemaReady={memoriesResult.schemaReady} />

        <FutureCapabilitiesPanel capabilities={futureCapabilities} />
      </div>
    </AdminShell>
  );
}
