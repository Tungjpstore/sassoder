"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useCallback, useMemo, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotChat, useCopilotReadable } from "@copilotkit/react-core";
import { MessageRole, TextMessage } from "@copilotkit/runtime-client-gql";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { ExternalLink, Loader2, Play, ShieldCheck, Sparkles } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { useCopilotHistoryReplay } from "@/components/ai/use-copilot-history-replay";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
import type { AiConversationReplayPayload, AiConversationWorkflowSnapshot, AiWorkflowCheckpoint, AiWorkflowCheckpointStatus } from "@/types/ai-history";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

/* ─── Types ─── */

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type OwnerIntent =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
  | "tables"
  | "payments"
  | "promotions"
  | "staff"
  | "online"
  | "reservations"
  | "reports"
  | "settings"
  | "security"
  | "growth";

type OwnerAiResult = {
  reply?: string;
  text?: string;
  intent?: OwnerIntent;
  intentLabel?: string;
  suggestions?: string[];
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan;
  provider?: string;
  model?: string;
  data?: unknown;
  config?: unknown;
  readiness?: unknown;
};

type OwnerWorkflowRuntimeMode = "resume" | "next" | "summary";

type OwnerWorkflowState = {
  status: "idle" | "recommended" | "awaiting_approval" | "executing" | "handoff";
  summary: string;
  focusArea: string | null;
  pendingActionIds: string[];
  pendingApprovalActionId: string | null;
  nextBestActionId: string | null;
  lastActionLabel: string | null;
  completedActionIds: string[];
  declinedActionIds: string[];
  latestCheckpoint: AiWorkflowCheckpoint | null;
  restoredFromMemory: boolean;
  updatedAt: string;
};

type OwnerWorkflowRuntimeResult = OwnerAiResult & {
  workflowStatus: OwnerWorkflowState["status"];
  nextActionId: string | null;
  completedActionIds: string[];
  declinedActionIds: string[];
  checkpointSummary?: string | null;
};

/* ─── Constants ─── */

const logibotLogo = "/brand/logivn/logibot-badge.png";
const emptyAgentActions: AiAgentAction[] = [];

const dashboardRoutes = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/online",
  "/dashboard/reservations",
  "/dashboard/menu",
  "/dashboard/tables",
  "/dashboard/payments",
  "/dashboard/staff",
  "/dashboard/promotions",
  "/dashboard/analytics",
  "/dashboard/settings"
] as const;

const intentRouteMap: Record<OwnerIntent, (typeof dashboardRoutes)[number]> = {
  setup: "/dashboard/settings",
  overview: "/dashboard",
  orders: "/dashboard/orders",
  kitchen: "/dashboard/orders",
  menu: "/dashboard/menu",
  tables: "/dashboard/tables",
  payments: "/dashboard/payments",
  promotions: "/dashboard/promotions",
  staff: "/dashboard/staff",
  online: "/dashboard/online",
  reservations: "/dashboard/reservations",
  reports: "/dashboard/analytics",
  settings: "/dashboard/settings",
  security: "/dashboard/settings",
  growth: "/dashboard/promotions"
};

const ownerIntentLabels: Record<OwnerIntent, string> = {
  setup: "setup quán",
  overview: "tổng quan",
  orders: "đơn hàng",
  kitchen: "bếp",
  menu: "menu",
  tables: "bàn",
  payments: "thanh toán",
  promotions: "khuyến mãi",
  staff: "nhân viên",
  online: "online ordering",
  reservations: "đặt bàn",
  reports: "báo cáo",
  settings: "cài đặt",
  security: "bảo mật",
  growth: "tăng trưởng"
};

const ownerIntentByRoute: Record<(typeof dashboardRoutes)[number], OwnerIntent> = {
  "/dashboard": "overview",
  "/dashboard/orders": "orders",
  "/dashboard/online": "online",
  "/dashboard/reservations": "reservations",
  "/dashboard/menu": "menu",
  "/dashboard/tables": "tables",
  "/dashboard/payments": "payments",
  "/dashboard/staff": "staff",
  "/dashboard/promotions": "promotions",
  "/dashboard/analytics": "reports",
  "/dashboard/settings": "settings"
};

const ownerIntentHints: Array<[OwnerIntent, string[]]> = [
  ["menu", ["menu", "thực đơn", "thuc don", "món", "mon", "tạo menu", "tao menu", "ocr"]],
  ["payments", ["thanh toán", "thanh toan", "vietqr", "chuyển khoản", "chuyen khoan", "đối soát", "doi soat"]],
  ["orders", ["đơn", "don", "order", "nhận đơn", "nhan don", "xử lý đơn", "xu ly don"]],
  ["tables", ["bàn", "ban", "qr", "khu vực", "khu vuc"]],
  ["reports", ["báo cáo", "bao cao", "doanh thu", "analytics", "thống kê", "thong ke"]],
  ["promotions", ["khuyến mãi", "khuyen mai", "mã giảm", "ma giam", "voucher"]],
  ["online", ["online", "ship", "giao hàng", "giao hang", "pickup", "đặt online", "dat online"]],
  ["reservations", ["đặt bàn", "dat ban", "booking", "cọc", "coc", "giữ bàn", "giu ban"]],
  ["staff", ["nhân viên", "nhan vien", "ca làm", "ca lam", "phân quyền", "phan quyen"]],
  ["setup", ["setup", "thiết lập", "thiet lap", "cấu hình", "cau hinh", "sẵn sàng", "san sang"]],
  ["growth", ["slogan", "logo", "thương hiệu", "thuong hieu", "marketing", "tăng trưởng", "tang truong"]],
  ["security", ["bảo mật", "bao mat", "audit", "spam", "quyền", "quyen"]]
];

function isOwnerIntent(value: unknown): value is OwnerIntent {
  return typeof value === "string" && value in intentRouteMap;
}

/* ─── Helpers ─── */

async function postJson<T>(url: string, body: unknown) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!result || !result.ok) throw new Error(result?.error || "LogiBot chưa xử lý được yêu cầu.");
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LogiBot mất quá lâu để phản hồi. Mình đã giữ workflow lại để bạn thử action an toàn hoặc phân tích lại.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postWorkflowCheckpoint(body: {
  threadId: string;
  status: AiWorkflowCheckpointStatus;
  action?: AiAgentAction;
  actionId?: string | null;
  actionLabel?: string | null;
  summary?: string | null;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch("/api/admin/ai/workflow-checkpoint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const result = (await response.json().catch(() => null)) as ApiResponse<AiConversationWorkflowSnapshot | null> | null;
    if (!result || !result.ok) throw new Error(result?.error || "Không ghi được workflow checkpoint.");
    return result.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeRoute(route: string) {
  return dashboardRoutes.find((item) => item === route) ?? "/dashboard";
}

function inferOwnerIntentFromPath(pathname: string): OwnerIntent {
  return ownerIntentByRoute[normalizeRoute(pathname)];
}

function foldOwnerIntentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferOwnerIntentFromMessage(message: string, fallback: OwnerIntent) {
  const folded = foldOwnerIntentText(message);
  const match = ownerIntentHints.find(([, hints]) => hints.some((hint) => folded.includes(foldOwnerIntentText(hint))));
  return match?.[0] ?? fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function actionSafetyLabel(action: AiAgentAction) {
  if (action.safety === "manual_only") return "Tự kiểm tra";
  if (action.safety === "confirm") return "Cần xác nhận";
  return "An toàn";
}

function requiresApproval(action: AiAgentAction) {
  return action.type !== "link" && (action.safety === "manual_only" || action.safety === "confirm");
}

function actionClass(action: AiAgentAction) {
  if (action.priority === "primary") {
    return "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB] hover:bg-[var(--primary-hover)]";
  }

  if (action.priority === "danger") {
    return "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)] hover:border-[var(--accent)]/40";
  }

  return "border-[var(--border)] bg-[var(--surface-container)] text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--soft-surface)]";
}

function structuredBrandingText(data: unknown) {
  const payload = data as {
    slogans?: string[];
    description?: string;
    brandVoice?: string;
    logoPrompt?: string;
    menuHeroPrompt?: string;
  } | null;

  if (!payload) return "";

  return [
    payload.slogans?.length ? `Slogan: ${payload.slogans.slice(0, 2).join(" · ")}` : "",
    payload.description ? `Mô tả: ${payload.description}` : "",
    payload.brandVoice ? `Giọng thương hiệu: ${payload.brandVoice}` : "",
    payload.logoPrompt ? "Đã tạo prompt logo dùng được ngay." : "",
    payload.menuHeroPrompt ? "Đã tạo prompt ảnh menu preview." : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function setupPlanText(data: unknown) {
  const plan = data as {
    summary?: string;
    ownerMessage?: string;
    launchBlockers?: string[];
    expressSetup?: Array<{ title?: string; estimatedMinutes?: number }>;
  } | null;

  if (!plan) return "";

  return [
    plan.summary || "",
    plan.ownerMessage || "",
    plan.launchBlockers?.length ? `Chặn bán thật: ${plan.launchBlockers.slice(0, 2).join(" · ")}` : "",
    plan.expressSetup?.length
      ? `Việc nên làm trước: ${plan.expressSetup
          .slice(0, 2)
          .map((item) => `${item.title}${item.estimatedMinutes ? ` (${item.estimatedMinutes} phút)` : ""}`)
          .join(" · ")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function setupDraftText(data: unknown) {
  const draft = data as {
    title?: string;
    ownerNote?: string;
    quickWins?: string[];
    draft?: {
      checklist?: string[];
    };
  } | null;

  if (!draft) return "";

  return [
    draft.title || "",
    draft.ownerNote || "",
    draft.quickWins?.length ? `Thắng nhanh: ${draft.quickWins.slice(0, 2).join(" · ")}` : "",
    draft.draft?.checklist?.length ? `Checklist: ${draft.draft.checklist.slice(0, 2).join(" · ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function isJsonLikeText(value?: string) {
  const trimmed = value?.trim();
  return Boolean(trimmed && (trimmed.startsWith("{") || trimmed.startsWith("[") || /^"[\w-]+"\s*:/.test(trimmed)));
}

function firstSafeText(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value && !isJsonLikeText(value)));
}

function generatedOwnerDataText(result: Pick<Partial<OwnerAiResult>, "data" | "reply" | "text">) {
  return (
    firstSafeText(result.reply, setupPlanText(result.data), setupDraftText(result.data), structuredBrandingText(result.data), result.text) ||
    "Mình đã tạo xong bản nháp. Hãy dùng nút bên dưới để mở đúng khu vực thao tác."
  );
}

function generatedOwnerActions(result: OwnerAiResult): AiAgentAction[] {
  if (result.actions?.length) return result.actions;

  const config = asRecord(result.config);
  const configRoute = typeof config?.route === "string" ? config.route : null;

  if (setupPlanText(result.data)) {
    return [
      {
        id: "generated-open-settings",
        type: "link",
        label: "Mở cài đặt quán",
        description: "Hoàn thiện hotline, địa chỉ, thông báo và ngân hàng.",
        href: "/dashboard/settings",
        intent: "settings",
        priority: "primary",
        safety: "safe"
      },
      {
        id: "generated-draft-menu-blueprint",
        type: "api",
        label: "Tạo khung menu",
        description: "Biến kế hoạch setup thành bản nháp menu có thể triển khai.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "menu_blueprint" },
        intent: "menu",
        priority: "secondary",
        safety: "safe"
      },
      {
        id: "generated-draft-brand-profile",
        type: "api",
        label: "Tạo hồ sơ thương hiệu",
        description: "Sinh slogan, mô tả quán và prompt ảnh an toàn.",
        endpoint: "/api/admin/ai/setup-draft",
        body: { kind: "brand_profile" },
        intent: "growth",
        priority: "secondary",
        safety: "safe"
      }
    ];
  }

  if (setupDraftText(result.data)) {
    return [
      {
        id: "generated-open-draft-route",
        type: "link",
        label: "Mở nơi áp dụng",
        description: "Đi tới màn phù hợp để kiểm tra và áp dụng bản nháp.",
        href: configRoute || "/dashboard/settings",
        intent: "setup",
        priority: "primary",
        safety: "safe"
      }
    ];
  }

  if (structuredBrandingText(result.data)) {
    return [
      {
        id: "generated-open-brand-settings",
        type: "link",
        label: "Mở hồ sơ thương hiệu",
        description: "Dán slogan, mô tả và giọng thương hiệu vào cài đặt quán.",
        href: "/dashboard/settings?section=brand",
        intent: "growth",
        priority: "primary",
        safety: "safe"
      }
    ];
  }

  return [];
}

function safeBulkOwnerActions(action: AiAgentAction): AiAgentAction[] {
  const body = asRecord(action.body);
  if (body?.kind !== "bulk_owner_actions" || !Array.isArray(body.actions)) return [];

  return body.actions
    .map((item): AiAgentAction | null => {
      const record = asRecord(item);
      if (!record) return null;

      const endpoint = typeof record.endpoint === "string" ? record.endpoint : "";
      const endpointAllowed = /^\/api\/admin\/orders\/[^/]+\/(accept|complete)$/.test(endpoint);
      if (!endpointAllowed) return null;

      const actionBody = asRecord(record.body) ?? {};
      return {
        id: typeof record.id === "string" && record.id ? record.id : endpoint,
        type: "api" as const,
        label: typeof record.label === "string" && record.label ? record.label : "Chạy bước đơn hàng",
        description: typeof record.description === "string" ? record.description : undefined,
        endpoint,
        body: actionBody,
        intent: typeof record.intent === "string" ? record.intent : "orders",
        priority: "secondary" as const,
        safety: "confirm" as const
      };
    })
    .filter((item): item is AiAgentAction => Boolean(item))
    .slice(0, 8);
}

function bulkOwnerActionCount(action: AiAgentAction) {
  return safeBulkOwnerActions(action).length;
}

function summarizeOwnerActionsForUi(actions: AiAgentAction[]) {
  let confirmCount = 0;
  let manualCount = 0;
  let batchCount = 0;

  for (const action of actions) {
    if (action.safety === "confirm") confirmCount += 1;
    if (action.safety === "manual_only") manualCount += 1;
    if (bulkOwnerActionCount(action) > 0) batchCount += 1;
  }

  return {
    total: actions.length,
    confirmCount,
    manualCount,
    batchCount,
    safeCount: Math.max(0, actions.length - confirmCount - manualCount)
  };
}

function normalizeOwnerResultForUi(result: OwnerAiResult): OwnerAiResult {
  const actions = generatedOwnerActions(result);
  const dataText = setupPlanText(result.data) || setupDraftText(result.data) || structuredBrandingText(result.data);

  if (!dataText && !isJsonLikeText(result.text) && !isJsonLikeText(result.reply)) {
    return result;
  }

  return {
    ...result,
    reply: generatedOwnerDataText(result),
    text: undefined,
    actions,
    agentPlan:
      result.agentPlan ??
      (actions.length
        ? {
            title: "AI setup workflow",
            summary: "Bản nháp đã được chuyển thành các bước thao tác an toàn.",
            focusArea: "setup",
            nextBestActionId: actions.find((action) => action.priority === "primary")?.id ?? actions[0]?.id ?? null,
            safetyNote: "AI chỉ tạo bản nháp và mở màn thao tác; chủ quán tự xác nhận trước khi lưu.",
            confidence: "medium"
          }
        : undefined)
  };
}

function summarizeOwnerActionResponse(action: AiAgentAction, payload: unknown) {
  const response = asRecord(payload);
  const endpoint = action.endpoint || "";
  const safeReply =
    endpoint.startsWith("/api/admin/ai/")
      ? [
          typeof response?.reply === "string" ? response.reply : "",
          typeof response?.text === "string" ? response.text : "",
          setupPlanText(response?.data),
          setupDraftText(response?.data),
          structuredBrandingText(response?.data)
        ].find((value) => typeof value === "string" && value.trim())
      : "";

  if (typeof safeReply === "string" && safeReply.trim()) {
    return safeReply.trim();
  }

  if (endpoint.includes("/confirm-payment")) {
    return "Đã gửi xác nhận thanh toán. Hãy đối chiếu nhanh trạng thái giao dịch và đơn hàng trên màn hình liên quan.";
  }

  if (endpoint.endsWith("/accept")) {
    return "Đơn đã được chuyển sang bước xử lý. Hãy kiểm tra thời gian hẹn và hàng chờ bếp.";
  }

  if (endpoint.endsWith("/complete")) {
    return "Đơn đã được đánh dấu hoàn tất/phục vụ. Bạn có thể kiểm tra thanh toán hoặc bàn tiếp theo.";
  }

  return `${action.label} đã được gửi. Dashboard sẽ cập nhật theo dữ liệu mới.`;
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function nextWorkflowStatus(actions: AiAgentAction[]) {
  if (actions.some(requiresApproval)) return "awaiting_approval" as const;
  if (actions.length > 0) return "recommended" as const;
  return "idle" as const;
}

function buildWorkflowSummary(result: Pick<OwnerAiResult, "reply" | "text" | "agentPlan">, actions: AiAgentAction[]) {
  return (
    result.agentPlan?.summary ||
    result.reply ||
    result.text ||
    (actions.length > 0 ? `${actions.length} action đã sẵn sàng để tiếp tục workflow.` : "Chưa có workflow vận hành nào đang mở.")
  );
}

function buildOwnerWorkflowState({
  result,
  actions,
  status,
  lastActionLabel = null,
  completedActionIds = [],
  declinedActionIds = [],
  latestCheckpoint = null,
  restoredFromMemory = false
}: {
  result: Pick<OwnerAiResult, "reply" | "text" | "intent" | "intentLabel" | "agentPlan">;
  actions: AiAgentAction[];
  status?: OwnerWorkflowState["status"];
  lastActionLabel?: string | null;
  completedActionIds?: string[];
  declinedActionIds?: string[];
  latestCheckpoint?: AiWorkflowCheckpoint | null;
  restoredFromMemory?: boolean;
}): OwnerWorkflowState {
  const activeActions = actions.filter((action) => !completedActionIds.includes(action.id) && !declinedActionIds.includes(action.id));

  return {
    status: status ?? nextWorkflowStatus(activeActions),
    summary: buildWorkflowSummary(result, actions),
    focusArea: result.agentPlan?.focusArea || result.intentLabel || result.intent || null,
    pendingActionIds: activeActions.map((action) => action.id),
    pendingApprovalActionId: activeActions.find((action) => requiresApproval(action))?.id ?? null,
    nextBestActionId: activeActions.find((action) => action.id === result.agentPlan?.nextBestActionId)?.id ?? activeActions[0]?.id ?? null,
    lastActionLabel,
    completedActionIds,
    declinedActionIds,
    latestCheckpoint,
    restoredFromMemory,
    updatedAt: nowIso()
  };
}

function emptyOwnerWorkflowState(): OwnerWorkflowState {
  return {
    status: "idle",
    summary: "Chưa có workflow vận hành nào đang mở.",
    focusArea: null,
    pendingActionIds: [],
    pendingApprovalActionId: null,
    nextBestActionId: null,
    lastActionLabel: null,
    completedActionIds: [],
    declinedActionIds: [],
    latestCheckpoint: null,
    restoredFromMemory: false,
    updatedAt: nowIso()
  };
}

function getActiveWorkflowActions(actions: AiAgentAction[], workflow: OwnerWorkflowState) {
  const blockedIds = new Set([...workflow.completedActionIds, ...workflow.declinedActionIds]);
  return actions.filter((action) => !blockedIds.has(action.id));
}

function selectNextOwnerWorkflowAction(actions: AiAgentAction[], agentPlan: AiAgentPlan | null, workflow: OwnerWorkflowState) {
  const activeActions = getActiveWorkflowActions(actions, workflow);
  if (!activeActions.length) return null;

  const plannedAction = activeActions.find((action) => action.id === agentPlan?.nextBestActionId);
  if (plannedAction) return plannedAction;

  return (
    activeActions.find((action) => action.priority === "primary" && !requiresApproval(action)) ??
    activeActions.find((action) => action.priority === "primary") ??
    activeActions.find((action) => !requiresApproval(action)) ??
    activeActions[0] ??
    null
  );
}

function buildOwnerWorkflowRuntimeResult({
  mode,
  actions,
  agentPlan,
  workflow
}: {
  mode: OwnerWorkflowRuntimeMode;
  actions: AiAgentAction[];
  agentPlan: AiAgentPlan | null;
  workflow: OwnerWorkflowState;
}): OwnerWorkflowRuntimeResult {
  const activeActions = getActiveWorkflowActions(actions, workflow);
  const nextAction = mode === "summary" ? null : selectNextOwnerWorkflowAction(actions, agentPlan, workflow);
  const checkpointSummary = workflow.latestCheckpoint
    ? `${workflow.latestCheckpoint.actionLabel || "Bước trước"}: ${workflow.latestCheckpoint.status}`
    : null;
  const nextNeedsApproval = nextAction ? requiresApproval(nextAction) : false;

  const reply =
    mode === "summary"
      ? activeActions.length
        ? `Workflow còn ${activeActions.length} action có thể tiếp tục.`
        : "Workflow hiện không còn action đang chờ."
      : nextAction
        ? nextNeedsApproval
          ? `${nextAction.label} là bước tiếp theo và cần xác nhận trước khi chạy.`
          : `${nextAction.label} là bước tiếp theo có thể chạy ngay.`
        : workflow.latestCheckpoint
          ? "Workflow này đã xử lý hết action hợp lệ. Có thể phân tích lại để tạo bước mới."
          : "Chưa có workflow đang mở. Hãy phân tích một khu vực vận hành trước.";

  return {
    reply,
    intent: nextAction?.intent && isOwnerIntent(nextAction.intent) ? nextAction.intent : undefined,
    actions: nextAction ? [nextAction] : activeActions.slice(0, 3),
    agentPlan: agentPlan ?? undefined,
    suggestions: activeActions.slice(0, 3).map((action) => action.label),
    workflowStatus: nextAction && nextNeedsApproval ? "awaiting_approval" : workflow.status,
    nextActionId: nextAction?.id ?? null,
    completedActionIds: workflow.completedActionIds,
    declinedActionIds: workflow.declinedActionIds,
    checkpointSummary
  };
}

function buildOwnerShortcutResult({
  focus,
  pathname,
  restaurantName,
  threadId
}: {
  focus: OwnerIntent;
  pathname: string;
  restaurantName: string;
  threadId: string;
}): OwnerAiResult {
  const label = ownerIntentLabels[focus];
  const route = intentRouteMap[focus];
  const normalizedPath = normalizeRoute(pathname);
  const actions: AiAgentAction[] = [
    {
      id: `owner-shortcut-analyze-${focus}`,
      type: "api",
      label: `Phân tích ${label}`,
      description: "Đọc dữ liệu vận hành thật và trả về việc nên làm tiếp theo.",
      endpoint: "/api/admin/ai/assistant",
      body: {
        intent: focus,
        threadId,
        message: `Phân tích nhanh ${label} cho ${restaurantName} và tạo action queue ngắn, ưu tiên việc có thể xử lý ngay.`,
        context: { currentPath: pathname, source: "owner_operational_shortcuts" }
      },
      intent: focus,
      priority: "primary",
      safety: "safe"
    },
    ...(route !== normalizedPath
      ? [
          {
            id: `owner-shortcut-open-${focus}`,
            type: "link" as const,
            label: `Mở màn ${label}`,
            description: "Đi tới đúng bề mặt thao tác trước khi xử lý.",
            href: route,
            intent: focus,
            priority: "secondary" as const,
            safety: "safe" as const
          }
        ]
      : []),
    {
      id: `owner-shortcut-plan-${focus}`,
      type: "prompt",
      label: "Lập workflow 3 bước",
      description: "Yêu cầu LogiBot tạo checklist hành động ngắn cho khu vực này.",
      prompt: `Lập workflow 3 bước để tối ưu ${label} cho ${restaurantName}. Mỗi bước phải có action rõ ràng và không chạm thao tác nhạy cảm nếu chưa xác nhận.`,
      intent: focus,
      priority: "secondary",
      safety: "safe"
    }
  ];

  return {
    reply: `Mình đã chuẩn bị shortcut cho ${label}. Nên bắt đầu bằng phân tích dữ liệu thật rồi mới mở màn hoặc lập workflow chi tiết.`,
    intent: focus,
    intentLabel: ownerIntentLabels[focus],
    actions,
    suggestions: actions.map((action) => action.label),
    agentPlan: {
      title: `Shortcut ${label}`,
      summary: `Tạo lối đi nhanh cho ${label} dựa trên màn hiện tại.`,
      focusArea: ownerIntentLabels[focus],
      nextBestActionId: actions[0]?.id ?? null,
      safetyNote: "Không chạy action nhạy cảm nếu chưa được chủ quán xác nhận.",
      confidence: "high"
    }
  };
}

/* ─── Tool Result Card (render prop for useCopilotAction) ─── */

function ToolResultCard({
  title,
  status,
  result,
  onAction
}: {
  title: string;
  status?: string;
  result?: OwnerAiResult | string;
  onAction?: (action: AiAgentAction) => Promise<string | void>;
}) {
  const isLoading = status === "executing" || status === "inProgress";
  const text = typeof result === "string" ? result : generatedOwnerDataText(result ?? {});
  const actions = typeof result === "string" ? emptyAgentActions : result?.actions ?? emptyAgentActions;
  const agentPlan = typeof result === "string" ? null : result?.agentPlan ?? null;
  const provider = typeof result === "string" ? null : [result?.provider, result?.model].filter(Boolean).join(" · ");
  const visibleActions = useMemo(() => actions.slice(0, 5), [actions]);
  const actionStats = useMemo(() => summarizeOwnerActionsForUi(actions), [actions]);
  const nextActionLabel = visibleActions.find((action) => action.id === agentPlan?.nextBestActionId)?.label ?? visibleActions[0]?.label ?? "Chờ yêu cầu";
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<string, { tone: "success" | "error"; text: string }>>({});

  async function executeAction(action: AiAgentAction) {
    if (!onAction) return;
    setPendingActionId(action.id);
    try {
      const feedback = await onAction(action);
      if (feedback) {
        setActionFeedback((current) => ({
          ...current,
          [action.id]: { tone: "success", text: feedback }
        }));
      }
    } catch (error) {
      setActionFeedback((current) => ({
        ...current,
        [action.id]: {
          tone: "error",
          text: error instanceof Error ? error.message : "Không chạy được action này."
        }
      }));
    } finally {
      setPendingActionId(null);
      setApprovalActionId(null);
    }
  }

  async function handleAction(action: AiAgentAction) {
    if (requiresApproval(action)) {
      setApprovalActionId(action.id);
      return;
    }

    await executeAction(action);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="logibot-agent-card rounded-[28px] border border-[var(--border)] p-4 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)]"
    >
      <div className="relative z-[1] flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgba(15,77,58,0.12)] bg-[#FFF7EB] text-[var(--primary)] shadow-[0_10px_24px_rgba(15,77,58,0.12)]">
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-semibold text-[var(--foreground)]">{title}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(15,77,58,0.12)] bg-white/55 px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
              <span className="logibot-live-dot" />
              {isLoading ? "Đang chạy" : "Sẵn sàng"}
            </span>
          </div>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{provider || `Bước tiếp: ${nextActionLabel}`}</p>
        </div>
      </div>
      <div className="relative z-[1] mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[rgba(15,77,58,0.1)] bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Action</p>
          <p className="mt-1 text-lg font-black text-[var(--foreground)]">{actionStats.total}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(242,140,40,0.2)] bg-[#fff2df] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Xác nhận</p>
          <p className="mt-1 text-lg font-black text-[var(--accent-strong)]">{actionStats.confirmCount + actionStats.manualCount}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(15,77,58,0.1)] bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Batch</p>
          <p className="mt-1 text-lg font-black text-[var(--primary)]">{actionStats.batchCount}</p>
        </div>
      </div>
      {isLoading ? (
        <div className="relative z-[1] mt-4 space-y-2">
          <div className="h-3 w-11/12 rounded-full bg-[rgba(15,77,58,0.12)] logibot-skeleton" />
          <div className="h-3 w-8/12 rounded-full bg-[rgba(15,77,58,0.1)] logibot-skeleton" />
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
            <span className="logibot-typing-bars" />
            Đang dựng action queue, không để hộp chat trống...
          </div>
        </div>
      ) : (
        <p className="relative z-[1] mt-3 whitespace-pre-line leading-6 text-[var(--muted-foreground)]">{text}</p>
      )}
      {agentPlan ? (
        <div className="relative z-[1] mt-3 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.74),rgba(247,239,226,0.7))] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">{agentPlan.title}</p>
            <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-bold text-[var(--muted-foreground)]">
              {agentPlan.confidence === "high" ? "Tự tin cao" : agentPlan.confidence === "medium" ? "Tự tin vừa" : "Cần dữ liệu"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--foreground)]">{agentPlan.summary}</p>
          {agentPlan.safetyNote ? <p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">{agentPlan.safetyNote}</p> : null}
        </div>
      ) : null}
      {visibleActions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {visibleActions.map((action, index) => {
            const bulkCount = bulkOwnerActionCount(action);
            return (
            <div key={action.id} className={`rounded-xl border px-3 py-3 transition ${actionClass(action)}`}>
              <button
                type="button"
                onClick={() => void handleAction(action)}
                disabled={pendingActionId !== null}
                className="w-full text-left disabled:cursor-wait disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgba(255,255,255,0.18)] text-[10px] font-black">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {pendingActionId === action.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : action.type === "link" ? (
                      <ExternalLink size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                    {action.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {agentPlan?.nextBestActionId === action.id ? (
                      <span className="rounded-full bg-[rgba(255,255,255,0.18)] px-2 py-1 text-[10px] font-bold">Ưu tiên</span>
                    ) : null}
                    {bulkCount > 0 ? <span className="rounded-full bg-[rgba(255,255,255,0.18)] px-2 py-1 text-[10px] font-bold">Batch {bulkCount}</span> : null}
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.14)] px-2 py-1 text-[10px] font-bold">
                      <ShieldCheck size={11} />
                      {actionSafetyLabel(action)}
                    </span>
                  </span>
                </div>
                {action.description ? (
                  <p className={`mt-2 text-xs leading-5 ${action.priority === "primary" ? "text-[#FFF7EB]/82" : "text-[var(--muted-foreground)]"}`}>
                    {action.description}
                  </p>
                ) : null}
              </button>
              {approvalActionId === action.id ? (
                <div className={`mt-3 rounded-xl border px-3 py-3 ${action.priority === "primary" ? "border-white/20 bg-[rgba(255,255,255,0.12)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                  <p className={`text-xs font-semibold ${action.priority === "primary" ? "text-[#FFF7EB]" : "text-[var(--foreground)]"}`}>
                    {action.safety === "manual_only" ? "Cần tự kiểm tra trước khi chạy" : "Xác nhận action trước khi chạy"}
                  </p>
                  <p className={`mt-1 text-xs leading-5 ${action.priority === "primary" ? "text-[#FFF7EB]/82" : "text-[var(--muted-foreground)]"}`}>
                    {action.safety === "manual_only"
                      ? "LogiBot sẽ không tự chốt thay bạn. Hãy đối chiếu dữ liệu thật rồi xác nhận."
                      : "Action này sẽ chạy ngay sau khi bạn chấp thuận."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void executeAction(action)}
                      disabled={pendingActionId !== null}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        action.priority === "primary"
                          ? "bg-[#FFF7EB] text-[var(--primary)] hover:bg-white"
                          : "bg-[var(--primary)] text-[#FFF7EB] hover:bg-[var(--primary-hover)]"
                      }`}
                    >
                      Chạy action
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalActionId(null)}
                      disabled={pendingActionId !== null}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        action.priority === "primary"
                          ? "border-white/20 text-[#FFF7EB] hover:bg-[rgba(255,255,255,0.08)]"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)]"
                      }`}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : null}
              {actionFeedback[action.id] ? (
                <p
                  className={`mt-2 text-xs leading-5 ${
                    actionFeedback[action.id]?.tone === "error"
                      ? "text-[var(--accent-strong)]"
                      : action.priority === "primary"
                        ? "text-[#FFF7EB]"
                        : "text-[var(--primary)]"
                  }`}
                >
                  {actionFeedback[action.id]?.text}
                </p>
              ) : null}
            </div>
            );
          })}
          {actionStats.total > visibleActions.length ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
              Còn {actionStats.total - visibleActions.length} action phụ đã được giữ trong workflow để tránh quá tải lựa chọn.
            </p>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}

/* ─── Toggle Button ─── */

/**
 * Custom toggle button for the CopilotSidebar.
 *
 * When rendered **inside** the CopilotSidebar tree, `useCopilotChatConfiguration`
 * provides the `isModalOpen` / `setModalOpen` pair automatically.
 *
 * When rendered **outside** (before the sidebar has ever mounted), the hook
 * returns `null` and we fall back to calling the `onClick` prop directly
 * (which triggers `setHasEverOpened(true)` from the parent).
 */
const LogibotSidebarToggle = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function LogibotSidebarToggle({ onClick, disabled, className: _className, ...buttonProps }, ref) {
    const configuration = useCopilotChatConfiguration();
    const isOpen = configuration?.isModalOpen ?? false;

    function handleClick(event: MouseEvent<HTMLButtonElement>) {
      if (disabled) return;
      onClick?.(event);
      if (event.defaultPrevented) return;
      configuration?.setModalOpen(!isOpen);
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`fixed bottom-5 right-5 z-[70] inline-flex h-14 items-center gap-3 rounded-full border px-3 pr-5 font-semibold transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:-translate-y-0.5 active:scale-95 ${
          isOpen
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-[var(--shadow-soft)]"
            : "border-[var(--primary)]/25 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] text-[#FFF7EB] shadow-[0_8px_32px_rgba(15,77,58,0.24)] hover:shadow-[0_12px_40px_rgba(15,77,58,0.3)]"
        }`}
        aria-label={isOpen ? "Đóng LogiBot" : "Mở LogiBot"}
        aria-pressed={isOpen}
        {...buttonProps}
      >
        <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[rgba(255,255,255,0.15)] bg-[#FFF7EB]">
          <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover" />
        </span>
        <span className="hidden text-sm sm:inline">{isOpen ? "Đóng LogiBot" : "LogiBot OS"}</span>
      </button>
    );
  }
);

/* ─── Experience (hooks + sidebar) ─── */

function DashboardCopilotExperience({
  restaurantId,
  restaurantName,
  threadId
}: {
  restaurantId: string;
  restaurantName: string;
  threadId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { appendMessage } = useCopilotChat();
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [queuedActions, setQueuedActions] = useState<AiAgentAction[]>([]);
  const [latestAgentPlan, setLatestAgentPlan] = useState<AiAgentPlan | null>(null);
  const [workflowState, setWorkflowState] = useState<OwnerWorkflowState>(() => emptyOwnerWorkflowState());
  const currentOwnerIntent = useMemo(() => inferOwnerIntentFromPath(pathname), [pathname]);

  const rememberOwnerResult = useCallback((
    result: OwnerAiResult,
    restoredFromMemory = false,
    checkpointState?: {
      completedActionIds?: string[];
      declinedActionIds?: string[];
      latestCheckpoint?: AiWorkflowCheckpoint | null;
    }
  ) => {
    const normalizedResult = normalizeOwnerResultForUi(result);
    const actions = normalizedResult.actions ?? [];
    setQueuedActions(actions);
    setLatestAgentPlan(normalizedResult.agentPlan ?? null);
    setWorkflowState(
      buildOwnerWorkflowState({
        result: normalizedResult,
        actions,
        completedActionIds: checkpointState?.completedActionIds ?? [],
        declinedActionIds: checkpointState?.declinedActionIds ?? [],
        latestCheckpoint: checkpointState?.latestCheckpoint ?? null,
        restoredFromMemory
      })
    );
    return normalizedResult;
  }, []);

  function findQueuedAction(actionId: string) {
    return queuedActions.find((action) => action.id === actionId) ?? null;
  }

  const historyUrl = useMemo(() => {
    const params = new URLSearchParams({ threadId, limit: "12" });
    return `/api/admin/ai/history?${params.toString()}`;
  }, [threadId]);

  const handleRecoveredHistory = useCallback(
    (history: AiConversationReplayPayload) => {
      if (!history.workflow) return;
      const lastMessage = history.messages[history.messages.length - 1];

      rememberOwnerResult(
        {
          reply: lastMessage?.role === "assistant" ? lastMessage.content : undefined,
          intent: isOwnerIntent(history.workflow.intent) ? history.workflow.intent : undefined,
          intentLabel: history.workflow.intentLabel ?? undefined,
          suggestions: history.workflow.suggestions,
          actions: history.workflow.actions,
          agentPlan: history.workflow.agentPlan ?? undefined
        },
        true,
        {
          completedActionIds: history.workflow.completedActionIds ?? [],
          declinedActionIds: history.workflow.declinedActionIds ?? [],
          latestCheckpoint: history.workflow.latestCheckpoint ?? null
        }
      );
    },
    [rememberOwnerResult]
  );

  const { hasRecoveredHistory } = useCopilotHistoryReplay({
    threadId,
    historyUrl,
    onRecovered: handleRecoveredHistory
  });

  const applyWorkflowCheckpoint = useCallback(
    (status: AiWorkflowCheckpointStatus, action: AiAgentAction, workflow?: AiConversationWorkflowSnapshot | null, summary?: string | null) => {
      setWorkflowState((current) => {
        const completedActionIds =
          workflow?.completedActionIds ??
          (status === "executed" || status === "handoff"
            ? uniqueStrings([...current.completedActionIds, action.id])
            : current.completedActionIds.filter((id) => id !== action.id));
        const declinedActionIds =
          workflow?.declinedActionIds ??
          (status === "declined"
            ? uniqueStrings([...current.declinedActionIds, action.id])
            : current.declinedActionIds.filter((id) => id !== action.id));
        const blockedIds = new Set([...completedActionIds, ...declinedActionIds]);
        const activeActions = queuedActions.filter((item) => !blockedIds.has(item.id));
        const pendingApprovalActionId =
          workflow?.pendingApprovalActionId ??
          (status === "approval_requested" ? action.id : activeActions.find((item) => requiresApproval(item))?.id ?? null);

        return {
          ...current,
          status: status === "approval_requested" ? "awaiting_approval" : status === "handoff" ? "handoff" : nextWorkflowStatus(activeActions),
          summary: summary || current.summary,
          pendingActionIds: activeActions.map((item) => item.id),
          pendingApprovalActionId,
          nextBestActionId:
            activeActions.find((item) => item.id === latestAgentPlan?.nextBestActionId)?.id ?? activeActions[0]?.id ?? null,
          lastActionLabel: action.label,
          completedActionIds,
          declinedActionIds,
          latestCheckpoint: workflow?.latestCheckpoint ?? current.latestCheckpoint,
          restoredFromMemory: false,
          updatedAt: nowIso()
        };
      });
    },
    [latestAgentPlan?.nextBestActionId, queuedActions]
  );

  const recordWorkflowCheckpoint = useCallback(
    async (status: AiWorkflowCheckpointStatus, action: AiAgentAction, summary?: string | null) => {
      applyWorkflowCheckpoint(status, action, null, summary);

      try {
        const workflow = await postWorkflowCheckpoint({
          threadId,
          status,
          action,
          actionId: action.id,
          actionLabel: action.label,
          summary
        });
        applyWorkflowCheckpoint(status, action, workflow, summary);
      } catch {
        // Keep the local workflow moving; checkpoint persistence is a continuity aid, not the action source of truth.
      }
    },
    [applyWorkflowCheckpoint, threadId]
  );

  const activeWorkflowActions = useMemo(() => getActiveWorkflowActions(queuedActions, workflowState), [queuedActions, workflowState]);
  const nextWorkflowAction = useMemo(
    () => selectNextOwnerWorkflowAction(queuedActions, latestAgentPlan, workflowState),
    [latestAgentPlan, queuedActions, workflowState]
  );

  const readableState = useMemo(
    () => ({
      surface: "dashboard",
      restaurantId,
      restaurantName,
      currentPath: pathname,
      allowedRoutes: dashboardRoutes,
      routeByIntent: intentRouteMap,
      currentIntent: currentOwnerIntent,
      currentIntentLabel: ownerIntentLabels[currentOwnerIntent],
      actionCatalog: queuedActions.map((action) => ({
        id: action.id,
        label: action.label,
        type: action.type,
        intent: action.intent ?? null,
        safety: action.safety ?? "safe",
        priority: action.priority ?? "secondary",
        description: action.description ?? null
      })),
      latestAgentPlan: latestAgentPlan
        ? {
            title: latestAgentPlan.title,
            summary: latestAgentPlan.summary,
            focusArea: latestAgentPlan.focusArea,
            confidence: latestAgentPlan.confidence
          }
        : null,
      activeWorkflow: workflowState,
      workflowRuntime: {
        activeActionCount: activeWorkflowActions.length,
        nextActionId: nextWorkflowAction?.id ?? null,
        nextActionLabel: nextWorkflowAction?.label ?? null,
        nextActionNeedsApproval: nextWorkflowAction ? requiresApproval(nextWorkflowAction) : false,
        completedActionCount: workflowState.completedActionIds.length,
        declinedActionCount: workflowState.declinedActionIds.length
      },
      operationalShortcut:
        activeWorkflowActions.length > 0 || hasRecoveredHistory
          ? {
              tool: "continue_owner_workflow",
              reason: "Có workflow/action đang mở, nên tiếp tục bằng runtime trước khi phân tích mới."
            }
          : {
              tool: "get_owner_operational_shortcuts",
              focus: currentOwnerIntent,
              reason: "Chưa có action queue; tạo shortcut dựa trên màn hiện tại để tránh trả lời chung chung."
            },
      hasRecoveredHistory,
      criticalRule:
        "AI chỉ mở đúng màn hoặc gọi API phân tích; không tự xác nhận thanh toán, không tự xoá dữ liệu. Action nhạy cảm luôn phải qua xác nhận của người dùng."
    }),
    [activeWorkflowActions.length, currentOwnerIntent, hasRecoveredHistory, latestAgentPlan, nextWorkflowAction, pathname, queuedActions, restaurantId, restaurantName, workflowState]
  );

  /* System prompt & readable context */
  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("dashboard") }, []);
  useCopilotReadable(
    {
      description: "State thật của dashboard LogiVN hiện tại, bao gồm quán, path đang mở và route được phép điều hướng.",
      value: readableState
    },
    [readableState]
  );

  /* Suggestion chips */
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
        { title: "Tiếp tục", message: "Tiếp tục workflow AI đang mở hoặc tạo shortcut vận hành phù hợp màn hiện tại." },
        { title: "Ca bán", message: "Tóm tắt ca bán hiện tại và 3 việc cần xử lý ngay." },
        { title: "Đơn hàng", message: "Đơn nào cần thao tác tiếp theo? Mở đúng màn đơn hàng." },
        { title: "Setup quán", message: "Tạo kế hoạch setup quán trong 30 phút, từng bước rõ ràng." },
        { title: "Thanh toán", message: "Kiểm tra giao dịch cần đối soát và mở màn thanh toán." }
      ]
    },
    []
  );

  function removeQueuedAction(actionId: string) {
    const remainingActions = queuedActions.filter((item) => item.id !== actionId);
    setQueuedActions(remainingActions);
    return remainingActions;
  }

  function syncWorkflowWithQueue(remainingActions: AiAgentAction[], options?: { status?: OwnerWorkflowState["status"]; lastActionLabel?: string | null; summary?: string | null }) {
    setWorkflowState((current) => ({
      status: options?.status ?? nextWorkflowStatus(remainingActions),
      summary: options?.summary || latestAgentPlan?.summary || current.summary,
      focusArea: latestAgentPlan?.focusArea || current.focusArea,
      pendingActionIds: remainingActions.map((action) => action.id),
      pendingApprovalActionId: remainingActions.find((action) => requiresApproval(action))?.id ?? null,
      nextBestActionId:
        remainingActions.find((action) => action.id === latestAgentPlan?.nextBestActionId)?.id ?? remainingActions[0]?.id ?? null,
      lastActionLabel: options?.lastActionLabel ?? current.lastActionLabel,
      completedActionIds: current.completedActionIds,
      declinedActionIds: current.declinedActionIds,
      latestCheckpoint: current.latestCheckpoint,
      restoredFromMemory: false,
      updatedAt: nowIso()
    }));
  }

  async function runOwnerAction(action: AiAgentAction) {
    const intentRoute = action.intent && action.intent in intentRouteMap ? normalizeRoute(intentRouteMap[action.intent as OwnerIntent]) : null;
    setWorkflowState((current) => ({
      ...current,
      status: action.type === "prompt" ? "handoff" : "executing",
      lastActionLabel: action.label,
      pendingApprovalActionId: current.pendingApprovalActionId === action.id ? null : current.pendingApprovalActionId,
      restoredFromMemory: false,
      updatedAt: nowIso()
    }));

    const bulkActions = safeBulkOwnerActions(action);
    if (action.type === "ui" && bulkActions.length > 0) {
      let successCount = 0;
      const successfulIds: string[] = [];
      const failedLabels: string[] = [];

      for (const item of bulkActions) {
        try {
          const payload = await postJson<unknown>(item.endpoint ?? "", item.body ?? {});
          successCount += 1;
          successfulIds.push(item.id);
          await recordWorkflowCheckpoint("executed", item, summarizeOwnerActionResponse(item, payload));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Action chưa chạy thành công.";
          failedLabels.push(`${item.label}: ${message}`);
          await recordWorkflowCheckpoint("failed", item, message);
        }
      }

      const summary =
        successCount > 0
          ? `Đã xử lý ${successCount}/${bulkActions.length} bước. ${failedLabels[0] ? `Còn lỗi: ${failedLabels[0]}` : "Dashboard đang cập nhật dữ liệu mới."}`
          : `Chưa xử lý được batch này. ${failedLabels[0] ?? "Hãy thử phân tích lại hoặc mở màn đơn hàng."}`;

      const completedIds = new Set(successCount > 0 ? [action.id, ...successfulIds] : successfulIds);
      const remainingActions = queuedActions.filter((item) => !completedIds.has(item.id));
      setQueuedActions(remainingActions);
      syncWorkflowWithQueue(remainingActions, {
        lastActionLabel: action.label,
        summary
      });
      await recordWorkflowCheckpoint(successCount > 0 ? "executed" : "failed", action, summary);

      if (successCount === 0) {
        throw new Error(summary);
      }

      if (intentRoute && pathname !== intentRoute) {
        router.push(intentRoute);
      } else {
        router.refresh();
      }
      return summary;
    }

    if (action.type === "link" && action.href) {
      const remainingActions = removeQueuedAction(action.id);
      syncWorkflowWithQueue(remainingActions, { lastActionLabel: action.label });
      await recordWorkflowCheckpoint("executed", action, `Đã mở ${action.label.toLowerCase()}.`);
      router.push(action.href);
      return `Đã mở ${action.label.toLowerCase()}.`;
    }

    if (action.type === "prompt" && action.prompt) {
      await appendMessage(
        new TextMessage({
          role: MessageRole.User,
          content: action.prompt
        })
      );
      const remainingActions = removeQueuedAction(action.id);
      syncWorkflowWithQueue(remainingActions, {
        status: "handoff",
        lastActionLabel: action.label,
        summary: `Đã chuyển sang bước tiếp theo: ${action.label.toLowerCase()}.`
      });
      await recordWorkflowCheckpoint("handoff", action, `Đã chuyển sang bước tiếp theo: ${action.label.toLowerCase()}.`);
      return "Đang yêu cầu LogiBot phân tích tiếp.";
    }

    if (action.type === "ui") {
      const remainingActions = removeQueuedAction(action.id);
      syncWorkflowWithQueue(remainingActions, { lastActionLabel: action.label });
      await recordWorkflowCheckpoint("executed", action, `Đã chạy ${action.label.toLowerCase()}.`);
      if (intentRoute) {
        router.push(intentRoute);
        return `Đã mở ${action.label.toLowerCase()}.`;
      }
      return "Action này đã sẵn sàng trong khu vực hiện tại.";
    }

    if (action.type === "api" && action.endpoint) {
      let payload: unknown;
      try {
        payload = await postJson<unknown>(action.endpoint, action.body ?? {});
      } catch (error) {
        await recordWorkflowCheckpoint(
          "failed",
          action,
          error instanceof Error ? error.message : "Action chưa chạy thành công."
        );
        throw error;
      }
      const payloadRecord = asRecord(payload);
      const hasOwnerResultShape =
        Array.isArray(payloadRecord?.actions) ||
        Boolean(asRecord(payloadRecord?.agentPlan)) ||
        typeof payloadRecord?.reply === "string" ||
        typeof payloadRecord?.text === "string";

      await recordWorkflowCheckpoint("executed", action, summarizeOwnerActionResponse(action, payload));
      if (hasOwnerResultShape) {
        rememberOwnerResult(payload as OwnerAiResult);
      } else {
        const remainingActions = removeQueuedAction(action.id);
        syncWorkflowWithQueue(remainingActions, { lastActionLabel: action.label });
      }

      if (intentRoute && pathname !== intentRoute) {
        router.push(intentRoute);
      } else {
        router.refresh();
      }
      return summarizeOwnerActionResponse(action, payload);
    }

    return "Action đã được chuẩn bị.";
  }

  /* Tool: navigate */
  useCopilotAction(
    {
      name: "navigate_dashboard",
      description: "Mở đúng màn hình dashboard khi chủ quán cần thao tác. Chỉ dùng route thuộc allowedRoutes.",
      parameters: [
        {
          name: "route",
          type: "string",
          required: true,
          enum: dashboardRoutes as unknown as string[],
          description: "Route dashboard cần mở."
        },
        {
          name: "reason",
          type: "string",
          required: false,
          description: "Lý do điều hướng ngắn gọn bằng tiếng Việt."
        }
      ],
      handler: async ({ route, reason }) => {
        const safeRoute = normalizeRoute(String(route || ""));
        router.push(safeRoute);
        setQueuedActions([]);
        setWorkflowState((current) => ({
          ...current,
          status: "idle",
          pendingActionIds: [],
          pendingApprovalActionId: null,
          nextBestActionId: null,
          lastActionLabel: safeRoute,
          restoredFromMemory: false,
          updatedAt: nowIso()
        }));
        return { reply: reason || `Đã mở ${safeRoute}.`, actions: [] };
      },
      render: ({ status, result }) => <ToolResultCard title="Mở đúng màn" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [router, runOwnerAction]
  );

  useCopilotAction(
    {
      name: "answer_owner_request",
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do của chủ quán. Nhận nguyên câu hỏi, tự suy luận intent/backend, đọc dữ liệu thật khi cần và luôn trả card có CTA an toàn.",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          description: "Nguyên văn câu hỏi/yêu cầu của chủ quán."
        },
        {
          name: "intent",
          type: "string",
          required: false,
          enum: Object.keys(intentRouteMap),
          description: "Intent nếu đã chắc chắn; nếu không chắc hãy bỏ trống để backend tự suy luận."
        }
      ],
      handler: async ({ message, intent }) => {
        const userMessage = String(message || "").trim() || "Tư vấn bước vận hành tiếp theo.";
        const fallbackIntent = isOwnerIntent(intent) ? intent : inferOwnerIntentFromMessage(userMessage, currentOwnerIntent);

        try {
          return rememberOwnerResult(
            await postJson<OwnerAiResult>("/api/admin/ai/assistant", {
              intent: isOwnerIntent(intent) ? intent : undefined,
              threadId,
              message: userMessage,
              context: {
                currentPath: pathname,
                currentIntent: currentOwnerIntent,
                activeWorkflow: workflowState,
                source: "copilotkit_catch_all"
              }
            })
          );
        } catch {
          return rememberOwnerResult({
            ...buildOwnerShortcutResult({
              focus: fallbackIntent,
              pathname,
              restaurantName,
              threadId
            }),
            reply: "Mình chưa nhận được phản hồi AI đầy đủ, nhưng đã dựng card hành động an toàn để bạn tiếp tục ngay."
          });
        }
      },
      render: ({ status, result }) => <ToolResultCard title="Trả lời vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [currentOwnerIntent, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId, workflowState]
  );

  /* Tool: analyze */
  useCopilotAction(
    {
      name: "analyze_dashboard_area",
      description:
        "Đọc dữ liệu thật theo nghiệp vụ và trả về insight ngắn, action queue rõ ràng. Dùng cho đơn, bếp, bàn, thanh toán, online, đặt bàn, báo cáo, setup.",
      parameters: [
        {
          name: "intent",
          type: "string",
          required: true,
          enum: Object.keys(intentRouteMap),
          description: "Nghiệp vụ cần phân tích."
        },
        {
          name: "question",
          type: "string",
          required: true,
          description: "Câu hỏi cụ thể của chủ quán."
        }
      ],
      handler: async ({ intent, question }) => {
        const focus = isOwnerIntent(intent) ? intent : inferOwnerIntentFromMessage(String(question || ""), currentOwnerIntent);

        try {
          return rememberOwnerResult(
            await postJson<OwnerAiResult>("/api/admin/ai/assistant", {
              intent: focus,
              threadId,
              message: question,
              context: { currentPath: pathname, source: "copilotkit" }
            })
          );
        } catch {
          return rememberOwnerResult({
            ...buildOwnerShortcutResult({
              focus,
              pathname,
              restaurantName,
              threadId
            }),
            reply: "Mình chưa đọc được dữ liệu AI lúc này, nhưng đã chuẩn bị shortcut an toàn để bạn tiếp tục thao tác thay vì để trống."
          });
        }
      },
      render: ({ status, result }) => <ToolResultCard title="Phân tích vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [currentOwnerIntent, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId]
  );

  useCopilotAction(
    {
      name: "continue_owner_workflow",
      description:
        "Tiếp tục workflow owner hiện tại bằng runtime deterministic. Dùng sau khi đã có activeWorkflow/actionCatalog, đặc biệt sau reload hoặc sau một checkpoint đã hoàn tất.",
      parameters: [
        {
          name: "mode",
          type: "string",
          required: false,
          enum: ["resume", "next", "summary"],
          description: "resume để khôi phục ngữ cảnh, next để lấy action tiếp theo, summary để tóm tắt workflow."
        }
      ],
      handler: async ({ mode }) =>
        buildOwnerWorkflowRuntimeResult({
          mode: mode === "summary" || mode === "next" ? mode : "resume",
          actions: queuedActions,
          agentPlan: latestAgentPlan,
          workflow: workflowState
        }),
      render: ({ status, result }) => <ToolResultCard title="Workflow runtime" status={status} result={result as OwnerWorkflowRuntimeResult} onAction={runOwnerAction} />
    },
    [latestAgentPlan, queuedActions, runOwnerAction, workflowState]
  );

  useCopilotAction(
    {
      name: "get_owner_operational_shortcuts",
      description:
        "Tạo card shortcut deterministic cho owner khi câu hỏi còn mơ hồ hoặc chưa có action queue. Không đọc dữ liệu thô ra UI; chỉ tạo action an toàn để phân tích, mở màn hoặc lập workflow.",
      parameters: [
        {
          name: "focus",
          type: "string",
          required: false,
          enum: Object.keys(intentRouteMap),
          description: "Khu vực vận hành cần tạo shortcut. Nếu bỏ trống sẽ suy ra từ màn hiện tại."
        }
      ],
      handler: async ({ focus }) =>
        rememberOwnerResult(
          buildOwnerShortcutResult({
            focus: isOwnerIntent(focus) ? focus : currentOwnerIntent,
            pathname,
            restaurantName,
            threadId
          })
        ),
      render: ({ status, result }) => <ToolResultCard title="Shortcut vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [currentOwnerIntent, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId]
  );

  useCopilotAction(
    {
      name: "run_owner_action",
      description:
        "Thực thi một action đã có trong actionCatalog hiện tại. Chỉ dùng actionId có thật. Nếu action có safety confirm/manual_only thì không được chạy trực tiếp trước khi được phê duyệt.",
      parameters: [
        {
          name: "actionId",
          type: "string",
          required: true,
          description: "ID của action trong actionCatalog."
        }
      ],
      handler: async ({ actionId }) => {
        const action = findQueuedAction(String(actionId || ""));
        if (!action) {
          return "Không tìm thấy action này trong actionCatalog hiện tại. Hãy phân tích lại trước.";
        }

        if (requiresApproval(action)) {
          return `${action.label} cần được người dùng phê duyệt trước. Hãy gọi request_owner_action_approval.`;
        }

        return await runOwnerAction(action);
      },
      render: ({ status, result }) => <ToolResultCard title="Thực thi action" status={status} result={String(result || "Đang chạy action...")} onAction={runOwnerAction} />
    },
    [queuedActions, runOwnerAction]
  );

  useCopilotAction(
    {
      name: "request_owner_action_approval",
      description: "Xin xác nhận của chủ quán trước khi chạy một action nhạy cảm trong actionCatalog.",
      followUp: true,
      parameters: [
        {
          name: "actionId",
          type: "string",
          required: true,
          description: "ID action nhạy cảm trong actionCatalog."
        },
        {
          name: "reason",
          type: "string",
          required: false,
          description: "Lý do ngắn gọn cần xin xác nhận."
        }
      ],
      renderAndWaitForResponse: ({ args, respond, status, result }) => {
        const action = findQueuedAction(String(args.actionId || ""));
        const decision = asRecord(result);

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                {status === "executing" ? <ShieldCheck size={15} /> : <Loader2 size={15} className="animate-spin" />}
              </span>
              <div>
                <p className="font-semibold text-[var(--foreground)]">Chờ xác nhận action</p>
                <p className="text-xs text-[var(--muted-foreground)]">{action?.label || "Action nhạy cảm"}</p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line leading-6 text-[var(--muted-foreground)]">
              {status === "complete"
                ? decision?.approved
                  ? "Đã ghi nhận chấp thuận. LogiBot có thể tiếp tục bước kế tiếp."
                  : "Đã từ chối action này. LogiBot sẽ cần chọn hướng khác."
                : action?.description || "Action này cần bạn phê duyệt trước khi chạy."}
            </p>
            {args.reason ? <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">Lý do: {String(args.reason)}</p> : null}
            {status === "executing" && respond ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowState((current) => ({
                      ...current,
                      status: "executing",
                      pendingApprovalActionId: null,
                      lastActionLabel: action?.label ?? current.lastActionLabel,
                      restoredFromMemory: false,
                      updatedAt: nowIso()
                    }));
                    if (action) void recordWorkflowCheckpoint("approved", action, `Đã chấp thuận ${action.label.toLowerCase()}.`);
                    void respond({ approved: true, actionId: args.actionId });
                  }}
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-[#FFF7EB] transition hover:bg-[var(--primary-hover)]"
                >
                  Chấp thuận
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowState((current) => ({
                      ...current,
                      status: queuedActions.length > 0 ? nextWorkflowStatus(queuedActions) : "idle",
                      pendingApprovalActionId: null,
                      lastActionLabel: action?.label ?? current.lastActionLabel,
                      restoredFromMemory: false,
                      updatedAt: nowIso()
                    }));
                    if (action) void recordWorkflowCheckpoint("declined", action, `Đã từ chối ${action.label.toLowerCase()}.`);
                    void respond({ approved: false, actionId: args.actionId });
                  }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] transition hover:bg-[var(--soft-surface)]"
                >
                  Từ chối
                </button>
              </div>
            ) : null}
          </motion.div>
        );
      }
    },
    [queuedActions, recordWorkflowCheckpoint]
  );

  /* Tool: setup plan */
  useCopilotAction(
    {
      name: "generate_store_setup_plan",
      description: "Tạo kế hoạch setup cửa hàng theo từng bước rõ ràng, có điểm chặn bán thật và nơi cần thao tác.",
      parameters: [
        {
          name: "mode",
          type: "string",
          required: true,
          enum: ["audit", "express", "growth"],
          description: "Kiểu kế hoạch cần tạo."
        },
        {
          name: "focus",
          type: "string",
          required: false,
          description: "Vấn đề chủ quán muốn ưu tiên."
        }
      ],
      handler: async ({ mode, focus }) => rememberOwnerResult(await postJson<OwnerAiResult>("/api/admin/ai/setup-plan", { mode, focus })),
      render: ({ status, result }) => <ToolResultCard title="Kế hoạch setup AI" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [rememberOwnerResult, runOwnerAction]
  );

  /* Tool: branding */
  useCopilotAction(
    {
      name: "generate_branding_draft",
      description: "Sinh slogan, mô tả quán, voice thương hiệu và prompt tạo logo/menu preview bằng dữ liệu quán thật.",
      parameters: [
        {
          name: "tone",
          type: "string",
          required: false,
          description: "Tone thương hiệu, ví dụ: hiện đại, ấm áp, cafe Việt, premium."
        },
        {
          name: "audience",
          type: "string",
          required: false,
          description: "Tệp khách hàng chính."
        }
      ],
      handler: async ({ tone, audience }) =>
        rememberOwnerResult(
          await postJson<OwnerAiResult>("/api/admin/ai/branding", {
            tone,
            audience,
            restaurantName
          })
        ),
      render: ({ status, result }) => <ToolResultCard title="Branding draft" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} />
    },
    [rememberOwnerResult, restaurantName, runOwnerAction]
  );

  /* ─── Render ─── */

  return (
    <>
      {hasEverOpened ? (
        <CopilotSidebar
          defaultOpen={true}
          width="min(460px, 100vw)"
          toggleButton={LogibotSidebarToggle}
          labels={{
            modalHeaderTitle: "LogiBot OS",
            welcomeMessageText: "Mình ưu tiên hành động: đọc dữ liệu ca, mở đúng màn, tạo checklist và đưa nút xử lý an toàn thay vì trả lời chung chung.",
            chatInputPlaceholder: "VD: xử lý đơn đang chờ, kiểm tra ca, tạo logo, quét menu...",
            chatDisclaimerText: "LogiBot không tự xác nhận thanh toán, huỷ/xoá dữ liệu hoặc đổi cấu hình nhạy cảm nếu chưa có thao tác của bạn.",
            chatToggleOpenLabel: "Mở LogiBot",
            chatToggleCloseLabel: "Đóng LogiBot"
          }}
        />
      ) : (
        <LogibotSidebarToggle
          onClick={() => setHasEverOpened(true)}
        />
      )}
    </>
  );
}

/* ─── Layer (wraps CopilotKit provider) ─── */

export function DashboardCopilotLayer(props: { restaurantId: string; restaurantName: string }) {
  const threadId = buildCopilotThreadId("logivn", "dashboard", props.restaurantId);

  return (
    <LogiVNCopilotProvider threadId={threadId}>
      <DashboardCopilotExperience {...props} threadId={threadId} />
    </LogiVNCopilotProvider>
  );
}
