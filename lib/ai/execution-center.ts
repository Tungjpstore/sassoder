import type { AiAutomationRunStatus, PersistedAiAutomationWorkflow } from "@/services/ai-automation-run-service";
import type { AiRecommendation, AiRecommendationPriority, AiRecommendationStatus } from "@/lib/ai/recommendation-engine";

export type AiExecutionItemKind =
  | "recommendation"
  | "workflow"
  | "menu_opportunity"
  | "growth_campaign"
  | "support_scenario";

export type AiExecutionItemStatus = "pending" | "approved" | "manual" | "completed" | "blocked";
export type AiExecutionItemPriority = "critical" | "high" | "medium" | "low";
export type AiExecutionSafetyMode = "safe_open" | "confirm_first" | "manual_only";
export type AiExecutionDomain = "operations" | "menu" | "growth" | "support" | "inventory" | "staffing" | "payment" | "branch";

export type AiStudioExecutionSignal = {
  id: string;
  kind: Extract<AiExecutionItemKind, "menu_opportunity" | "growth_campaign" | "support_scenario">;
  title: string;
  detail: string;
  priority: Exclude<AiExecutionItemPriority, "low">;
  status: "ready" | "draft" | "blocked";
  actionHref: string;
  nextAction: string;
  safetyNote?: string | null;
  source?: string | null;
};

export type AiExecutionItem = {
  id: string;
  databaseId?: string | null;
  kind: AiExecutionItemKind;
  domain: AiExecutionDomain;
  title: string;
  detail: string;
  action: string;
  actionHref?: string | null;
  priority: AiExecutionItemPriority;
  status: AiExecutionItemStatus;
  safetyMode: AiExecutionSafetyMode;
  estimatedImpact: string;
  source: string;
  updatedAt?: string | null;
  blockers: string[];
};

export type AiExecutionCenterDeck = {
  generatedAt: string;
  summary: {
    total: number;
    pending: number;
    approved: number;
    manual: number;
    completed: number;
    blocked: number;
    critical: number;
    confirmFirst: number;
  };
  items: AiExecutionItem[];
  lanes: Array<{
    id: AiExecutionItemStatus;
    label: string;
    count: number;
  }>;
  runbook: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
};

export type BuildAiExecutionCenterInput = {
  recommendations?: AiRecommendation[];
  workflows?: PersistedAiAutomationWorkflow[];
  studioSignals?: AiStudioExecutionSignal[];
};

const priorityRank: Record<AiExecutionItemPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

function recommendationStatus(status?: AiRecommendationStatus): AiExecutionItemStatus {
  if (status === "accepted") return "approved";
  if (status === "resolved") return "completed";
  if (status === "dismissed" || status === "expired") return "completed";
  return "pending";
}

function workflowStatus(status?: AiAutomationRunStatus): AiExecutionItemStatus {
  if (status === "approved") return "approved";
  if (status === "completed" || status === "dismissed" || status === "expired") return "completed";
  if (status === "manual") return "manual";
  return "pending";
}

function studioStatus(status: AiStudioExecutionSignal["status"]): AiExecutionItemStatus {
  if (status === "blocked") return "blocked";
  if (status === "draft") return "manual";
  return "pending";
}

function priority(priority: AiRecommendationPriority | AiExecutionItemPriority): AiExecutionItemPriority {
  return priority;
}

function domainFromRecommendation(type: AiRecommendation["type"]): AiExecutionDomain {
  if (type === "inventory") return "inventory";
  if (type === "staffing") return "staffing";
  if (type === "payment") return "payment";
  if (type === "combo" || type === "upsell" || type === "menu" || type === "pricing") return "menu";
  return "growth";
}

function domainFromWorkflow(domain: PersistedAiAutomationWorkflow["domain"]): AiExecutionDomain {
  if (domain === "inventory") return "inventory";
  if (domain === "staffing") return "staffing";
  if (domain === "marketing") return "growth";
  if (domain === "customer" || domain === "support") return "support";
  if (domain === "branch") return "branch";
  return "operations";
}

function domainFromStudio(kind: AiStudioExecutionSignal["kind"]): AiExecutionDomain {
  if (kind === "menu_opportunity") return "menu";
  if (kind === "growth_campaign") return "growth";
  return "support";
}

function recommendationItem(recommendation: AiRecommendation): AiExecutionItem {
  return {
    id: `recommendation:${recommendation.id}`,
    databaseId: recommendation.lifecycle?.databaseId ?? null,
    kind: "recommendation",
    domain: domainFromRecommendation(recommendation.type),
    title: recommendation.title,
    detail: recommendation.detail,
    action: recommendation.action,
    actionHref: recommendation.actionHref,
    priority: priority(recommendation.priority),
    status: recommendationStatus(recommendation.lifecycle?.status ?? recommendation.status),
    safetyMode: "confirm_first",
    estimatedImpact: recommendation.estimatedImpact?.label ?? "Tác động vận hành",
    source: "AI Ops recommendation",
    updatedAt: recommendation.lifecycle?.lastSeenAt ?? null,
    blockers: recommendation.lifecycle?.schemaReady === false ? ["Recommendation schema chưa sẵn sàng để lưu lifecycle."] : []
  };
}

function workflowItem(workflow: PersistedAiAutomationWorkflow): AiExecutionItem {
  return {
    id: `workflow:${workflow.id}`,
    databaseId: workflow.lifecycle?.databaseId ?? null,
    kind: "workflow",
    domain: domainFromWorkflow(workflow.domain),
    title: workflow.title,
    detail: workflow.trigger,
    action: workflow.outcome,
    actionHref: workflow.actions.find((action) => action.type === "link" && action.href)?.href ?? null,
    priority: priority(workflow.priority),
    status: workflowStatus(workflow.lifecycle?.status),
    safetyMode: workflow.executionMode === "confirm_first" ? "confirm_first" : "manual_only",
    estimatedImpact: `${workflow.estimatedMinutes} phút xử lý`,
    source: "AI Automation workflow",
    updatedAt: workflow.lifecycle?.lastSeenAt ?? null,
    blockers: workflow.lifecycle?.schemaReady === false ? ["Automation schema chưa sẵn sàng để lưu workflow."] : []
  };
}

function studioItem(signal: AiStudioExecutionSignal): AiExecutionItem {
  return {
    id: `${signal.kind}:${signal.id}`,
    kind: signal.kind,
    domain: domainFromStudio(signal.kind),
    title: signal.title,
    detail: signal.detail,
    action: signal.nextAction,
    actionHref: signal.actionHref,
    priority: signal.priority,
    status: studioStatus(signal.status),
    safetyMode: signal.status === "ready" ? "confirm_first" : "manual_only",
    estimatedImpact: signal.source ?? "Studio opportunity",
    source: signal.kind === "menu_opportunity" ? "AI Menu Studio" : signal.kind === "growth_campaign" ? "AI Growth Studio" : "AI Support Studio",
    updatedAt: null,
    blockers: signal.status === "blocked" ? [signal.safetyNote || "Studio item đang bị chặn bởi cấu hình hoặc dữ liệu thiếu."] : []
  };
}

function sortItems(items: AiExecutionItem[]) {
  return items.sort((left, right) => {
    if (left.status !== right.status) {
      const statusRank: Record<AiExecutionItemStatus, number> = {
        pending: 5,
        approved: 4,
        manual: 3,
        blocked: 2,
        completed: 1
      };
      return statusRank[right.status] - statusRank[left.status];
    }
    return priorityRank[right.priority] - priorityRank[left.priority];
  });
}

function lanes(items: AiExecutionItem[]) {
  const labels: Record<AiExecutionItemStatus, string> = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    manual: "Manual",
    completed: "Hoàn tất",
    blocked: "Bị chặn"
  };
  return (["pending", "approved", "manual", "blocked", "completed"] as AiExecutionItemStatus[]).map((id) => ({
    id,
    label: labels[id],
    count: items.filter((item) => item.status === id).length
  }));
}

export function buildAiExecutionCenter(input: BuildAiExecutionCenterInput): AiExecutionCenterDeck {
  const items = sortItems([
    ...(input.recommendations ?? []).map(recommendationItem),
    ...(input.workflows ?? []).map(workflowItem),
    ...(input.studioSignals ?? []).map(studioItem)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      approved: items.filter((item) => item.status === "approved").length,
      manual: items.filter((item) => item.status === "manual").length,
      completed: items.filter((item) => item.status === "completed").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      critical: items.filter((item) => item.priority === "critical").length,
      confirmFirst: items.filter((item) => item.safetyMode === "confirm_first").length
    },
    items,
    lanes: lanes(items),
    runbook: [
      {
        id: "confirm-first",
        title: "Confirm-first mặc định",
        detail: "AI chỉ gom quyết định; thao tác ảnh hưởng menu, giá, campaign, thanh toán hoặc khách cần chủ quán duyệt."
      },
      {
        id: "resolve-after-action",
        title: "Hoàn tất sau khi xử lý",
        detail: "Recommendation/workflow đã xử lý nên chuyển sang resolved/completed để dashboard không nhắc lại."
      },
      {
        id: "blocked-means-config",
        title: "Blocked là thiếu nền",
        detail: "Provider, schema, memory hoặc policy thiếu sẽ giữ item ở trạng thái blocked thay vì giả vờ thông minh."
      }
    ]
  };
}
