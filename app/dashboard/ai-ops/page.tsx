import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  EyeOff,
  GitBranch,
  Mail,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  TriangleAlert,
  Truck,
  Utensils
} from "lucide-react";
import {
  retryAiMorningBriefEmailAction,
  updateAiAutomationRunStatusAction,
  updateAiMorningBriefPreferencesAction,
  updateAiOperationInsightStatusAction
} from "@/app/dashboard/actions";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AiRecommendationCards } from "@/components/dashboard/ai-recommendation-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildAiAutomationWorkflows, type AiAutomationWorkflow } from "@/lib/ai/automation-workflows";
import type { BranchPerformanceComparisonRow } from "@/lib/ai/branch-performance-comparison";
import type { BranchAttributionQualityRow } from "@/lib/ai/branch-attribution-quality";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import {
  getAiMorningBriefPreferences,
  getLatestAiMorningBriefRun,
  listRecentAiMorningBriefRuns,
  type AiMorningBriefRun
} from "@/services/ai-morning-brief-service";
import {
  listRecentAiBranchOperationInsights,
  type RecentAiBranchOperationInsight
} from "@/services/ai-operation-insights-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { persistAiAutomationRuns } from "@/services/ai-automation-run-service";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import { getBranchAttributionQualityReport } from "@/services/branch-attribution-quality-service";
import { getBranchPerformanceComparisonReport } from "@/services/branch-performance-comparison-service";

export const dynamic = "force-dynamic";

function statusLabel(status: AiMorningBriefRun["status"]) {
  if (status === "sent") return "Đã gửi";
  if (status === "failed") return "Lỗi gửi";
  if (status === "skipped") return "Bỏ qua";
  return "Đã tạo";
}

function statusBadgeTone(status: AiMorningBriefRun["status"]) {
  if (status === "sent" || status === "generated") return "green";
  if (status === "failed") return "red";
  if (status === "skipped") return "yellow";
  return "neutral";
}

function channelLabel(channel: AiMorningBriefRun["channel"]) {
  return channel === "email" ? "Email" : "Dashboard";
}

function formatBriefDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatDateTime(value: string | null) {
  if (!value) return "Chưa gửi";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(value));
}

function feedbackMessage(searchParams: { settings?: string | string[]; retry?: string | string[] }) {
  const settings = Array.isArray(searchParams.settings) ? searchParams.settings[0] : searchParams.settings;
  const retry = Array.isArray(searchParams.retry) ? searchParams.retry[0] : searchParams.retry;

  if (settings === "saved") return { tone: "green" as const, text: "Đã lưu cài đặt Morning Brief." };
  if (settings === "schema") return { tone: "yellow" as const, text: "Cần chạy migration Morning Brief trước khi lưu cài đặt." };
  if (retry === "sent") return { tone: "green" as const, text: "Đã gửi lại email Morning Brief." };
  if (retry === "failed") return { tone: "red" as const, text: "Email Morning Brief gửi lại chưa thành công. Kiểm tra Resend/env." };
  if (retry === "skipped") return { tone: "yellow" as const, text: "Email Morning Brief bị bỏ qua do thiếu người nhận hoặc đang tắt." };
  if (retry === "schema") return { tone: "yellow" as const, text: "Cần chạy migration Morning Brief trước khi retry." };
  return null;
}

function canSendFromRun(run: AiMorningBriefRun, emailReady: boolean) {
  if (!emailReady) return false;
  if (run.channel === "dashboard") return true;
  return run.channel === "email" && run.status !== "sent";
}

function branchInsightTone(severity: RecentAiBranchOperationInsight["severity"]) {
  if (severity === "critical") return "red";
  if (severity === "warning") return "yellow";
  if (severity === "opportunity") return "green";
  return "blue";
}

function insightStatusLabel(status: RecentAiBranchOperationInsight["status"]) {
  if (status === "seen") return "Đã xem";
  if (status === "dismissed") return "Đã ẩn";
  if (status === "resolved") return "Đã xử lý";
  if (status === "expired") return "Hết hạn";
  return "Đang mở";
}

function attributionTone(score: number) {
  if (score < 70) return "red";
  if (score < 88) return "yellow";
  return "green";
}

function attributionRiskTone(riskLevel: BranchAttributionQualityRow["riskLevel"]) {
  if (riskLevel === "risk") return "red";
  if (riskLevel === "watch") return "yellow";
  return "green";
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatVnd(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("vi-VN")}đ`;
}

function workflowTone(priority: AiAutomationWorkflow["priority"]) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  return "blue";
}

function workflowDomainLabel(domain: AiAutomationWorkflow["domain"]) {
  if (domain === "inventory") return "Kho";
  if (domain === "marketing") return "Marketing";
  return "Nhân sự";
}

function branchPerformanceTone(riskLevel: BranchPerformanceComparisonRow["riskLevel"]) {
  if (riskLevel === "risk") return "red";
  if (riskLevel === "watch") return "yellow";
  return "green";
}

export default async function AiOpsPage({
  searchParams
}: {
  searchParams?: Promise<{ settings?: string | string[]; retry?: string | string[] }>;
}) {
  const { session, entitlement } = await requireDashboardAdminAccess("core_dashboard");
  const params = (await searchParams) ?? {};
  const [
    latestMorningBrief,
    recentRuns,
    preferencesResult,
    branchInsightsResult,
    recommendationsResult,
    branchAttributionReport,
    branchPerformanceReport,
    automationSnapshot
  ] = await Promise.all([
    getLatestAiMorningBriefRun(session.restaurantId),
    listRecentAiMorningBriefRuns(session.restaurantId, 20),
    getAiMorningBriefPreferences(session.restaurantId, session.email),
    listRecentAiBranchOperationInsights(session.restaurantId, 12),
    listRecentAiRecommendations(session.restaurantId, 9),
    getBranchAttributionQualityReport(session.restaurantId, { windowDays: 7 }),
    getBranchPerformanceComparisonReport(session.restaurantId, { windowDays: 7 }),
    getOwnerOperationalSnapshot(session.restaurantId, "overview", {
      id: session.restaurantId,
      name: session.restaurant.name,
      slug: session.restaurant.slug,
      business_type: session.restaurant.businessType ?? null,
      address: null,
      hotline: null,
      description: null
    }).catch(() => null)
  ]);
  const latest = latestMorningBrief ?? recentRuns[0] ?? null;
  const preferences = preferencesResult.preferences;
  const emailGloballyEnabled = process.env.AI_OPS_MORNING_BRIEF_EMAIL_ENABLED === "true";
  const emailReady = preferencesResult.schemaReady && preferences.emailEnabled && preferences.recipients.length > 0;
  const feedback = feedbackMessage(params);
  const automationWorkflows = buildAiAutomationWorkflows({ snapshot: automationSnapshot, limit: 4 });
  const persistedAutomation = await persistAiAutomationRuns({
    restaurantId: session.restaurantId,
    workflows: automationWorkflows
  });
  const recommendationDeck = {
    generatedAt: new Date().toISOString(),
    summary: recommendationsResult.recommendations.length
      ? `${recommendationsResult.recommendations.length} gợi ý AI đang mở.`
      : "Chưa có gợi ý AI đang mở.",
    recommendations: recommendationsResult.recommendations
  };

  const metricCards = [
    {
      label: "Brief gần nhất",
      value: latest ? formatBriefDate(latest.briefDate) : "Chưa có",
      detail: latest ? statusLabel(latest.status) : "Đợi cron AI Ops chạy",
      icon: BrainCircuit,
      tone: latest?.status === "failed" ? "red" : "green"
    },
    {
      label: "Health score",
      value: latest ? `${latest.healthScore}/100` : "--",
      detail: latest ? `${latest.insightCount} insights` : "Chưa có dữ liệu",
      icon: ShieldCheck,
      tone: latest && latest.healthScore < 70 ? "yellow" : "green"
    },
    {
      label: "Cảnh báo",
      value: latest ? latest.criticalCount + latest.warningCount : 0,
      detail: latest ? `${latest.criticalCount} critical · ${latest.warningCount} warning` : "Không có brief",
      icon: TriangleAlert,
      tone: latest && latest.criticalCount > 0 ? "red" : latest && latest.warningCount > 0 ? "yellow" : "green"
    },
    {
      label: "Email",
      value: preferences.emailEnabled ? "Bật" : "Tắt",
      detail: emailGloballyEnabled ? `${preferences.recipients.length} người nhận` : "Env email đang tắt",
      icon: Mail,
      tone: emailReady && emailGloballyEnabled ? "green" : "yellow"
    },
    {
      label: "Chi nhánh",
      value: branchInsightsResult.schemaReady ? branchInsightsResult.insights.length : "--",
      detail: branchInsightsResult.schemaReady ? "Branch AI đang theo dõi" : "Cần schema AI Ops",
      icon: Store,
      tone: branchInsightsResult.insights.some((insight) => insight.severity === "critical")
        ? "red"
        : branchInsightsResult.insights.some((insight) => insight.severity === "warning")
          ? "yellow"
          : "green"
    },
    {
      label: "Attribution",
      value: branchAttributionReport.schemaReady ? `${branchAttributionReport.qualityScore}/100` : "--",
      detail: branchAttributionReport.schemaReady
        ? `${formatPercent(branchAttributionReport.attributionRate)} đơn có chi nhánh`
        : "Cần branch schema",
      icon: GitBranch,
      tone: branchAttributionReport.schemaReady ? attributionTone(branchAttributionReport.qualityScore) : "yellow"
    }
  ] as const;

  return (
    <AdminShell
      title="AI Ops Morning Brief"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Inbox vận hành mỗi sáng cho chủ quán"
      showLiveActionCenter={false}
    >
      <div className="dashboard-ai-workspace grid gap-3">
        <div className="dashboard-ai-toolbar flex flex-wrap items-center justify-between gap-2">
          <Link href="/dashboard" className="dashboard-secondary-action">
            <ArrowLeft size={16} />
            Tổng quan
          </Link>
          <Link href="/dashboard/analytics" className="dashboard-secondary-action">
            Báo cáo
          </Link>
        </div>

        {feedback ? (
          <div className="dashboard-panel flex items-center gap-2 px-4 py-3">
            <Badge tone={feedback.tone}>{feedback.tone === "green" ? "OK" : "Cần chú ý"}</Badge>
            <p className="text-sm font-semibold text-[var(--foreground)]">{feedback.text}</p>
          </div>
        ) : null}

        {!preferencesResult.schemaReady ? (
          <section className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">
            Cần chạy migration `ai_morning_brief_runs` để bật preference, inbox và retry email.
          </section>
        ) : null}

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

        <AiRecommendationCards deck={recommendationDeck} schemaReady={recommendationsResult.schemaReady} />

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <BrainCircuit size={15} />
                AI workflows
              </p>
              <h2 className="dashboard-section-title mt-1">Workflow gợi ý cần xác nhận</h2>
            </div>
            <Badge tone={persistedAutomation.schemaReady ? (persistedAutomation.workflows.length ? "green" : "blue") : "yellow"}>
              {persistedAutomation.schemaReady ? `${persistedAutomation.workflows.length} workflow` : "Cần schema"}
            </Badge>
          </div>

          {!persistedAutomation.schemaReady ? (
            <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Cần migration `ai_automation_runs`, `ai_automation_steps` và `ai_automation_approvals` để lưu workflow AI.
            </div>
          ) : persistedAutomation.workflows.length ? (
            <div className="dashboard-ai-card-grid mt-3 grid gap-3 xl:grid-cols-2">
              {persistedAutomation.workflows.map((workflow) => {
                const primaryLink = workflow.actions.find((action) => action.type === "link" && action.href);
                const runId = workflow.lifecycle?.databaseId;
                return (
                  <article key={workflow.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={workflowTone(workflow.priority)}>{workflow.priority}</Badge>
                          <Badge>{workflowDomainLabel(workflow.domain)}</Badge>
                          <Badge>
                            {workflow.lifecycle?.status === "approved"
                              ? "Đã duyệt"
                              : workflow.executionMode === "confirm_first"
                                ? "Cần xác nhận"
                                : "Manual"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{workflow.title}</p>
                        <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{workflow.trigger}</p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
                        <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">ETA</span>
                        <strong className="metric-number text-sm text-[var(--foreground)]">{workflow.estimatedMinutes} phút</strong>
                      </span>
                    </div>

                    <p className="mt-3 text-xs font-semibold leading-5 text-[var(--foreground)]">{workflow.outcome}</p>
                    <div className="mt-3 grid gap-2">
                      {workflow.steps.slice(0, 3).map((step) => (
                        <div key={step.id} className="flex items-start gap-2 rounded-lg bg-[var(--soft-surface)] px-3 py-2">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-[var(--foreground)]">{step.label}</span>
                            <span className="block text-[11px] font-medium leading-5 text-[var(--muted-foreground)]">{step.description}</span>
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                        {workflow.confidence === "high" ? "Độ tin cậy cao" : "Cần kiểm dữ liệu"}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
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
                              title="Ẩn workflow"
                            >
                              <EyeOff size={15} />
                            </button>
                          </form>
                        ) : null}
                        {primaryLink?.href ? (
                        <Link href={primaryLink.href} className="dashboard-secondary-action">
                          {primaryLink.label}
                          <ArrowRight size={15} />
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
              Chưa có workflow đủ rõ để đề xuất. Khi có tồn thấp, doanh thu yếu hoặc thiếu nhân sự, AI sẽ đưa checklist có xác nhận tại đây.
            </div>
          )}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <Store size={15} />
                Branch AI
              </p>
              <h2 className="dashboard-section-title mt-1">Tín hiệu vận hành theo chi nhánh</h2>
            </div>
            <Badge tone={branchInsightsResult.schemaReady ? "green" : "yellow"}>
              {branchInsightsResult.schemaReady ? `${branchInsightsResult.insights.length} insights` : "Cần schema"}
            </Badge>
          </div>

          <div className="dashboard-ai-card-grid mt-3 grid gap-2 md:grid-cols-2">
            {!branchInsightsResult.schemaReady ? (
              <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)] md:col-span-2">
                Cần bảng `ai_operation_insights` và `store_branches` để hiển thị cảnh báo theo chi nhánh.
              </div>
            ) : branchInsightsResult.insights.length ? (
              branchInsightsResult.insights.map((insight) => (
                <article key={insight.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={branchInsightTone(insight.severity)}>{insight.severity}</Badge>
                        <Badge>{insight.branchName}</Badge>
                        <Badge>{insightStatusLabel(insight.status)}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-1 text-sm font-bold text-[var(--foreground)]">{insight.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{insight.detail}</p>
                    </div>
                    {insight.metric ? (
                      <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
                        <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">{insight.metric.label}</span>
                        <strong className="metric-number text-sm text-[var(--foreground)]">{insight.metric.value}</strong>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[var(--foreground)]">{insight.action}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
                      Cập nhật {formatDateTime(insight.lastSeenAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <form action={updateAiOperationInsightStatusAction}>
                        <input type="hidden" name="insightId" value={insight.id} />
                        <input type="hidden" name="status" value="resolved" />
                        <button
                          type="submit"
                          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                          aria-label={`Đánh dấu đã xử lý ${insight.title}`}
                          title="Đã xử lý"
                        >
                          <CheckCircle2 size={15} />
                        </button>
                      </form>
                      <form action={updateAiOperationInsightStatusAction}>
                        <input type="hidden" name="insightId" value={insight.id} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button
                          type="submit"
                          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                          aria-label={`Ẩn insight ${insight.title}`}
                          title="Ẩn thẻ"
                        >
                          <EyeOff size={15} />
                        </button>
                      </form>
                      <Link
                        href={insight.actionHref ?? "/dashboard"}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                        aria-label={`Mở khu vực xử lý ${insight.title}`}
                        title="Mở khu vực xử lý"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)] md:col-span-2">
                Chưa có cảnh báo chi nhánh đang mở. Cron AI Ops sẽ tự đưa tín hiệu lên khi có kho thiếu, thanh toán treo, giao xa hoặc thiếu nhân sự theo chi nhánh.
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <GitBranch size={15} />
                Branch attribution
              </p>
              <h2 className="dashboard-section-title mt-1">So sánh chất lượng gắn chi nhánh</h2>
            </div>
            <Badge tone={branchAttributionReport.schemaReady ? attributionTone(branchAttributionReport.qualityScore) : "yellow"}>
              {branchAttributionReport.schemaReady ? `${branchAttributionReport.qualityScore}/100` : "Cần schema"}
            </Badge>
          </div>

          {!branchAttributionReport.schemaReady ? (
            <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Cần migration `orders.branch_id`, `branch_assignment_source` và bảng `store_branches` để so sánh attribution pickup, dine-in và delivery.
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Đơn trong {branchAttributionReport.windowDays} ngày</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{branchAttributionReport.orderCount}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Đã gắn chi nhánh</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{formatPercent(branchAttributionReport.attributionRate)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Fallback</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{branchAttributionReport.fallbackOrderCount}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Delivery thiếu quote</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{branchAttributionReport.deliveryWithoutQuoteCount}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--foreground)]">{branchAttributionReport.topIssue}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{branchAttributionReport.recommendedAction}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>Pickup {branchAttributionReport.pickupOrderCount}</Badge>
                    <Badge>Dine-in {branchAttributionReport.dineInOrderCount}</Badge>
                    <Badge>Delivery {branchAttributionReport.deliveryOrderCount}</Badge>
                  </div>
                </div>
              </div>

              {branchAttributionReport.rows.length && branchAttributionReport.orderCount > 0 ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {branchAttributionReport.rows.slice(0, 8).map((row) => (
                    <article key={row.branchId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={attributionRiskTone(row.riskLevel)}>{row.qualityScore}/100</Badge>
                            {row.isPrimary ? <Badge>Chi nhánh chính</Badge> : null}
                            {!row.isActive ? <Badge tone="yellow">Đã ẩn</Badge> : null}
                          </div>
                          <p className="mt-2 truncate text-sm font-bold text-[var(--foreground)]">{row.branchName}</p>
                          <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
                            {row.orderCount} đơn · {formatVnd(row.paidRevenue)} đã thanh toán
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
                          <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Explicit</span>
                          <strong className="metric-number text-sm text-[var(--foreground)]">{row.explicitOrderCount}</strong>
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                        <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-2">
                          <ShoppingBag size={13} className="mb-1" />
                          {row.pickupOrders} pickup
                        </span>
                        <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-2">
                          <Utensils size={13} className="mb-1" />
                          {row.dineInOrders} dine-in
                        </span>
                        <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-2">
                          <Truck size={13} className="mb-1" />
                          {row.deliveryOrders} delivery
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={row.fallbackOrderCount > 0 ? "yellow" : "green"}>Fallback {row.fallbackOrderCount}</Badge>
                        <Badge tone={row.deliveryWithoutQuoteCount > 0 ? "red" : "green"}>No quote {row.deliveryWithoutQuoteCount}</Badge>
                        <Badge tone={row.unknownSourceOrderCount > 0 ? "yellow" : "green"}>Unknown {row.unknownSourceOrderCount}</Badge>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-[var(--foreground)]">{row.action}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có đơn trong cửa sổ {branchAttributionReport.windowDays} ngày để so sánh attribution theo chi nhánh.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <Store size={15} />
                Branch performance
              </p>
              <h2 className="dashboard-section-title mt-1">So sánh hiệu quả vận hành chi nhánh</h2>
            </div>
            <Badge tone={branchPerformanceReport.weakBranchCount > 0 ? "yellow" : "green"}>
              {branchPerformanceReport.schemaReady ? `${branchPerformanceReport.branchCount} chi nhánh` : "Cần schema"}
            </Badge>
          </div>

          {!branchPerformanceReport.schemaReady ? (
            <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Cần dữ liệu chi nhánh, đơn hàng, kho và nhân sự để so sánh hiệu quả vận hành.
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Doanh thu</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{formatVnd(branchPerformanceReport.paidRevenue)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Thời gian phục vụ</p>
                  <p className="metric-number mt-1 text-xl font-semibold">
                    {branchPerformanceReport.averageServiceMinutes !== null ? `${branchPerformanceReport.averageServiceMinutes} phút` : "--"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Kho thiếu</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{branchPerformanceReport.lowStockCount}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Chi nhánh yếu</p>
                  <p className="metric-number mt-1 text-xl font-semibold">{branchPerformanceReport.weakBranchCount}</p>
                </div>
              </div>

              {branchPerformanceReport.strongestBranch || branchPerformanceReport.weakestBranch ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {branchPerformanceReport.strongestBranch ? (
                    <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3">
                      <p className="text-xs font-semibold uppercase text-[var(--primary)]">Benchmark tốt nhất</p>
                      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{branchPerformanceReport.strongestBranch.branchName}</p>
                      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                        Score {branchPerformanceReport.strongestBranch.performanceScore}/100 · {formatVnd(branchPerformanceReport.strongestBranch.paidRevenue)}
                      </p>
                    </div>
                  ) : null}
                  {branchPerformanceReport.weakestBranch ? (
                    <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-3">
                      <p className="text-xs font-semibold uppercase text-[var(--accent-strong)]">Cần ưu tiên</p>
                      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{branchPerformanceReport.weakestBranch.branchName}</p>
                      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{branchPerformanceReport.weakestBranch.action}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {branchPerformanceReport.rows.length ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {branchPerformanceReport.rows.slice(0, 8).map((row) => (
                    <article key={row.branchId} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={branchPerformanceTone(row.riskLevel)}>{row.performanceScore}/100</Badge>
                            {row.isPrimary ? <Badge>Chi nhánh chính</Badge> : null}
                          </div>
                          <p className="mt-2 truncate text-sm font-bold text-[var(--foreground)]">{row.branchName}</p>
                          <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
                            {row.orderCount} đơn · {formatVnd(row.paidRevenue)} · service {row.averageServiceMinutes !== null ? `${row.averageServiceMinutes} phút` : "--"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
                          <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Coverage</span>
                          <strong className="metric-number text-sm text-[var(--foreground)]">{row.coverageScore !== null ? `${row.coverageScore}%` : "--"}</strong>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={row.outOfStockCount > 0 ? "red" : row.lowStockCount > 0 ? "yellow" : "green"}>Kho thiếu {row.lowStockCount}</Badge>
                        <Badge tone={row.overdueOrderCount > 0 ? "red" : "green"}>Quá giờ {row.overdueOrderCount}</Badge>
                        <Badge>{row.activeStaff}/{row.assignedStaff} online</Badge>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-[var(--foreground)]">{row.action}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có chi nhánh để so sánh hiệu quả vận hành.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="dashboard-ai-split-grid grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="dashboard-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <BrainCircuit size={15} />
                  Latest brief
                </p>
                <h2 className="dashboard-section-title mt-1">{latest?.summary ?? "Chưa có Morning Brief"}</h2>
              </div>
              {latest ? (
                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusBadgeTone(latest.status)}>{statusLabel(latest.status)}</Badge>
                  <Badge>{channelLabel(latest.channel)}</Badge>
                </div>
              ) : null}
            </div>

            {latest ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Ngày brief</p>
                    <p className="mt-1 text-sm font-bold">{formatBriefDate(latest.briefDate)}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Tạo lúc</p>
                    <p className="mt-1 text-sm font-bold">{formatDateTime(latest.createdAt)}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Gửi lúc</p>
                    <p className="mt-1 text-sm font-bold">{formatDateTime(latest.sentAt)}</p>
                  </div>
                </div>

                <div className="grid gap-2">
                  {latest.actionItems.length ? (
                    latest.actionItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                          <Badge tone={item.severity === "critical" ? "red" : item.severity === "warning" ? "yellow" : "green"}>{item.severity}</Badge>
                        </div>
                        <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.action}</p>
                      </div>
                    ))
                  ) : (
                    <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                      Brief này chưa có action item cần xử lý.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid min-h-36 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                Khi cron AI Ops tạo brief đầu tiên, inbox sẽ hiển thị tóm tắt, health score và việc cần xử lý tại đây.
              </div>
            )}
          </div>

          <form action={updateAiMorningBriefPreferencesAction} className="dashboard-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow inline-flex items-center gap-2">
                  <Settings2 size={15} />
                  Preference
                </p>
                <h2 className="dashboard-section-title mt-1">Gửi brief qua email</h2>
              </div>
              <Badge tone={emailGloballyEnabled ? "green" : "yellow"}>{emailGloballyEnabled ? "Email env OK" : "Env off"}</Badge>
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3 text-sm font-bold">
              <span>Bật email Morning Brief</span>
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full">
                <input name="emailEnabled" type="checkbox" defaultChecked={preferences.emailEnabled} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                <span className="pointer-events-none h-6 w-10 rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-inner transition peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]" />
                <span className="pointer-events-none absolute left-[6px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--muted-foreground)] transition peer-checked:translate-x-4 peer-checked:bg-white" />
              </span>
            </label>

            <label className="mt-3 grid gap-2 text-sm font-bold">
              Người nhận
              <textarea
                name="recipientEmails"
                defaultValue={preferences.recipients.join("\n")}
                placeholder="owner@quan.vn"
                className="min-h-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm font-medium outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                Giờ gửi
                <input
                  name="sendHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={preferences.sendHour}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Timezone
                <input
                  name="timezone"
                  defaultValue={preferences.timezone}
                  className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <Button disabled={!preferencesResult.schemaReady}>
                <CheckCircle2 size={16} />
                Lưu cài đặt
              </Button>
            </div>
          </form>
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <Clock3 size={15} />
                History
              </p>
              <h2 className="dashboard-section-title mt-1">Brief gần đây</h2>
            </div>
            <Badge>{recentRuns.length} bản ghi</Badge>
          </div>

          <div className="mt-3 grid gap-2">
            {recentRuns.length ? (
              recentRuns.map((run) => (
                <article key={run.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusBadgeTone(run.status)}>{statusLabel(run.status)}</Badge>
                        <Badge>{channelLabel(run.channel)}</Badge>
                        <Badge>{formatBriefDate(run.briefDate)}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--foreground)]">{run.summary}</p>
                      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                        Health {run.healthScore}/100 · {run.insightCount} insights · {formatDateTime(run.createdAt)}
                      </p>
                      {run.errorMessage ? (
                        <p className="mt-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </div>

                    {canSendFromRun(run, emailReady) ? (
                      <form action={retryAiMorningBriefEmailAction} className="shrink-0">
                        <input type="hidden" name="runId" value={run.id} />
                        <Button variant="secondary" size="sm">
                          <RefreshCw size={15} />
                          {run.channel === "email" ? "Gửi lại" : "Gửi email"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                Chưa có lịch sử Morning Brief cho quán này.
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
