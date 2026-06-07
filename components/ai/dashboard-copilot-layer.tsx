"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useCallback, useMemo, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { AiCommandDeckPanel } from "@/components/ai/ai-command-deck-panel";
import { CopilotThinkingIndicator } from "@/components/ai/copilot-thinking-indicator";
import { LogibotChatSurface, type LogibotChatQuickAction } from "@/components/ai/logibot-chat-surface";
import { logibotAttachmentLabel, type LogibotAttachmentDraft } from "@/components/ai/logibot-composer";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { requestLogibot } from "@/components/ai/logibot-client";
import { useCopilotHistoryReplay } from "@/components/ai/use-copilot-history-replay";
import { buildAgentMission } from "@/lib/ai/agent-mission";
import { buildCommandDeck } from "@/lib/ai/command-deck";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildOperationalPassport, type AiOperationalPassport } from "@/lib/ai/operational-passport";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
import { cn } from "@/lib/utils";
import type { AiConversationReplayPayload, AiConversationWorkflowSnapshot, AiWorkflowCheckpoint, AiWorkflowCheckpointStatus } from "@/types/ai-history";
import type { AiAgentAction, AiAgentMission, AiAgentPlan, AiCommandDeck } from "@/types/ai-agent";

/* ─── Types ─── */

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type OwnerIntent =
  | "setup"
  | "overview"
  | "orders"
  | "kitchen"
  | "menu"
  | "inventory"
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
  mission?: AiAgentMission;
  commandDeck?: AiCommandDeck | null;
  passport?: AiOperationalPassport | null;
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

type OperatingDrawerMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachmentLabel?: string;
  result?: OwnerAiResult | null;
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
  "/dashboard/inventory",
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
  inventory: "/dashboard/inventory",
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
  inventory: "kho hàng",
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
  "/dashboard/inventory": "inventory",
  "/dashboard/tables": "tables",
  "/dashboard/payments": "payments",
  "/dashboard/staff": "staff",
  "/dashboard/promotions": "promotions",
  "/dashboard/analytics": "reports",
  "/dashboard/settings": "settings"
};

const ownerIntentHints: Array<[OwnerIntent, string[]]> = [
  ["menu", ["menu", "thực đơn", "thuc don", "món", "mon", "tạo menu", "tao menu", "ocr"]],
  ["inventory", ["kho", "ton kho", "tồn kho", "nguyên liệu", "nguyen lieu", "định mức", "dinh muc", "food cost", "nhập kho", "nhap kho"]],
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
    "Mình đã nhận phản hồi từ hệ thống, nhưng chưa có nội dung đủ rõ để hiển thị an toàn. Hãy hỏi cụ thể hơn hoặc mở màn liên quan để kiểm tra dữ liệu."
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

function makeOperatingMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
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
  const passport = buildOperationalPassport({
    surface: "dashboard",
    title: "Workflow runtime",
    status: workflow.status,
    goal: workflow.summary,
    route: null,
    nextActionId: nextAction?.id ?? null,
    nextActionLabel: nextAction?.label ?? null,
    checkpoint: checkpointSummary,
    handoffRoute: null,
    handoffLabel: nextAction?.label ?? "Tiếp tục workflow",
    confidence: activeActions.length > 0 ? "high" : "medium"
  });
  const mission = buildAgentMission({
    surface: "dashboard",
    title: agentPlan?.title ?? "Workflow runtime",
    outcome: workflow.summary,
    actions: nextAction ? [nextAction] : activeActions.slice(0, 3),
    urgency: nextNeedsApproval ? "now" : activeActions.length > 0 ? "soon" : "watch",
    estimatedMinutes: Math.max(2, Math.min(10, activeActions.length * 2)),
    operatorNote: agentPlan?.safetyNote
  });

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
    checkpointSummary,
    mission,
    passport
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
        message: `Phân tích nhanh ${label} cho ${restaurantName}. Trả lời tình hình chính trước, sau đó đưa các bước xử lý ngắn có thể làm ngay.`,
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
  const passport = buildOperationalPassport({
    surface: "dashboard",
    title: `Chủ quán · ${label}`,
    status: focus,
    goal: `Tạo lối đi nhanh cho ${label} dựa trên màn hiện tại.`,
    route: normalizedPath,
    nextActionId: actions[0]?.id ?? null,
    nextActionLabel: actions[0]?.label ?? null,
    checkpoint: `Shortcut ${label}`,
    handoffRoute: route,
    handoffLabel: `Mở ${label}`,
    confidence: "high"
  });
  const mission = buildAgentMission({
    surface: "dashboard",
    title: `Mission ${label}`,
    outcome: `Tạo lối đi nhanh cho ${label} dựa trên màn hiện tại.`,
    route,
    actions,
    urgency: "now",
    estimatedMinutes: 5,
    operatorNote: "Bắt đầu bằng phân tích dữ liệu thật; action nhạy cảm vẫn cần chủ quán xác nhận."
  });

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
    },
    mission,
    passport
  };
}

/* ─── Tool Result Card (render prop for useCopilotAction) ─── */

function ToolResultCard({
  title,
  status,
  result,
  onAction,
  passport
}: {
  title: string;
  status?: string;
  result?: OwnerAiResult | string;
  onAction?: (action: AiAgentAction) => Promise<string | void>;
  passport?: AiOperationalPassport | null;
}) {
  const isLoading = status === "executing" || status === "inProgress";
  const text = typeof result === "string" ? result : generatedOwnerDataText(result ?? {});
  const actions = typeof result === "string" ? emptyAgentActions : result?.actions ?? emptyAgentActions;
  const agentPlan = typeof result === "string" ? null : result?.agentPlan ?? null;
  const mission = typeof result === "string" ? null : result?.mission ?? null;
  const visiblePassport = typeof result === "string" ? passport ?? null : result?.passport ?? passport ?? null;
  const commandDeck =
    typeof result === "string"
      ? null
      : result?.commandDeck ??
        (mission
          ? buildCommandDeck({
              surface: mission.surface,
              title: mission.title,
              headline: text,
              actions,
              mission,
              passport: visiblePassport,
              confidence: agentPlan?.confidence ?? visiblePassport?.confidence ?? "medium"
            })
          : null);
  const visibleActions = useMemo(() => actions.slice(0, 5), [actions]);
  const shouldShowAnswerBrief = !isLoading && Boolean(text.trim());
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
          <p className="truncate text-xs text-[var(--muted-foreground)]">{shouldShowAnswerBrief ? `Trả lời trước · Bước tiếp: ${nextActionLabel}` : `Bước tiếp: ${nextActionLabel}`}</p>
        </div>
      </div>
      {isLoading ? (
        <div className="relative z-[1] mt-4 space-y-2">
          <div className="h-3 w-11/12 rounded-full bg-[rgba(15,77,58,0.12)] logibot-skeleton" />
          <div className="h-3 w-8/12 rounded-full bg-[rgba(15,77,58,0.1)] logibot-skeleton" />
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
            <span className="logibot-typing-bars" />
            Đang đọc dữ liệu ca và chuẩn bị câu trả lời chính...
          </div>
        </div>
      ) : shouldShowAnswerBrief ? (
        <div className="logibot-answer-brief relative z-[1] mt-3">
          <span>Trả lời chính</span>
          <p className="logibot-card-brief whitespace-pre-line leading-6 text-[var(--muted-foreground)]">{text}</p>
        </div>
      ) : null}
      {!isLoading && visibleActions.length ? (
        <div className="relative z-[1] mt-3">
          <AiCommandDeckPanel deck={commandDeck} compact />
        </div>
      ) : null}
      {visibleActions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {visibleActions.map((action, index) => {
            const bulkCount = bulkOwnerActionCount(action);
            return (
            <div key={action.id} className={`logibot-action-tile rounded-xl border px-3 py-3 transition ${actionClass(action)}`}>
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
                <div className={`logibot-action-tile mt-3 rounded-xl border px-3 py-3 ${action.priority === "primary" ? "border-white/20 bg-[rgba(255,255,255,0.12)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
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
        </div>
      ) : null}
    </motion.div>
  );
}

function DrawerActionButton({
  action,
  onAction
}: {
  action: AiAgentAction;
  onAction: (action: AiAgentAction) => Promise<string | void>;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function execute() {
    if (requiresApproval(action) && !confirming) {
      setConfirming(true);
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const summary = await onAction(action);
      setFeedback(summary || "Đã chạy action. Dashboard đang cập nhật.");
      setConfirming(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Action chưa chạy được.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white/72 p-3">
      <button
        type="button"
        onClick={() => void execute()}
        disabled={pending}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-black transition disabled:opacity-60 ${actionClass(action)}`}
      >
        <span className="min-w-0">
          <span className="block truncate">{action.label}</span>
          <span className="mt-0.5 block text-[11px] font-bold opacity-75">{actionSafetyLabel(action)}</span>
        </span>
        {pending ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <ArrowRight size={16} className="shrink-0" />}
      </button>
      {confirming ? (
        <div className="mt-2 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/[0.08] p-2 text-xs font-semibold leading-5 text-[#7C4A03]">
          Action này cần bạn xác nhận. Bấm lại để chạy, hoặc chọn action khác nếu muốn giữ an toàn.
        </div>
      ) : null}
      {feedback ? <p className="mt-2 text-xs font-semibold leading-5 text-[#0F5132]">{feedback}</p> : null}
    </div>
  );
}

function DrawerMessage({
  message,
  onAction
}: {
  message: OperatingDrawerMessage;
  onAction: (action: AiAgentAction) => Promise<string | void>;
}) {
  const actions = message.result?.actions?.slice(0, 3) ?? [];

  if (message.role === "user") {
    return (
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="ml-auto max-w-[88%] rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold leading-6 text-white"
      >
        {message.content}
      </motion.article>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-[32px_minmax(0,1fr)] gap-3"
    >
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#0F5132] text-[#FFF9EF] shadow-[0_12px_24px_rgba(15,81,50,0.18)]">
        <Bot size={15} />
      </span>
      <div className="min-w-0">
        <div className="rounded-2xl border border-black/[0.06] bg-white/78 p-3 shadow-[0_14px_40px_rgba(17,24,39,0.045)]">
          <p className="text-sm font-semibold leading-6 text-[#111827]">{message.content}</p>
        </div>
        {actions.length ? (
          <div className="mt-2 grid gap-2">
            {actions.map((action) => (
              <DrawerActionButton key={action.id} action={action} onAction={onAction} />
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

function WorkflowTimeline({
  workflow,
  actions
}: {
  workflow: OwnerWorkflowState;
  actions: AiAgentAction[];
}) {
  const visibleActions = actions.slice(0, 4);
  const steps = visibleActions.length
    ? visibleActions.map((action, index) => ({
        label: action.label,
        detail: action.description || actionSafetyLabel(action),
        status:
          workflow.completedActionIds.includes(action.id)
            ? "done"
            : workflow.nextBestActionId === action.id || index === 0
              ? "running"
              : "pending"
      }))
    : [
        {
          label: "Đọc context màn hiện tại",
          detail: "LogiBot dùng path, intent và dữ liệu dashboard đã expose.",
          status: "done"
        },
        {
          label: "Chọn hành động an toàn",
          detail: "Action nhạy cảm luôn cần xác nhận trước khi chạy.",
          status: workflow.status === "idle" ? "pending" : "running"
        },
        {
          label: "Ghi checkpoint",
          detail: workflow.latestCheckpoint?.summary || "Khi chạy action, LogiBot lưu lại trạng thái để tiếp tục workflow.",
          status: workflow.latestCheckpoint ? "done" : "pending"
        }
      ];

  return (
    <section className="rounded-2xl border border-[#0F5132]/12 bg-[#FFFEFA]/70 p-4.5 shadow-[0_8px_30px_rgba(15,81,50,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#0F5132]">
            <Activity size={13} className="animate-pulse text-[#10B981]" />
            Agent đang vận hành
          </p>
          <h3 className="mt-1 text-base font-black text-[#111827]">
            {workflow.summary || "Workflow điều hành ca bán"}
          </h3>
        </div>
        <span className="rounded-full border border-[#0F5132]/15 bg-[#0F5132]/[0.07] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0F5132]">
          {workflow.status}
        </span>
      </div>
      <div className="mt-4.5 grid gap-3.5">
        {steps.map((step, index) => (
          <div key={`${step.label}-${index}`} className="grid grid-cols-[30px_minmax(0,1fr)] gap-3">
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg border text-xs font-black shadow-sm transition-all duration-300",
                step.status === "done"
                  ? "border-[#0F5132]/20 bg-gradient-to-br from-[#0F5132] to-[#147A4D] text-white"
                  : step.status === "running"
                    ? "border-[#F59E0B]/30 bg-[#F59E0B]/12 text-[#7A4A05] animate-pulse"
                    : "border-black/[0.06] bg-white/50 text-[#6B7280]"
              )}
            >
              {step.status === "done" ? <Check size={14} /> : step.status === "running" ? <Loader2 size={13} className="animate-spin" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#111827]">{step.label}</span>
              <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#6B7280]">{step.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LogibotOperatingDrawer({
  restaurantName,
  workflowState,
  queuedActions,
  latestAgentPlan,
  messages,
  draft,
  isSending,
  isExpanded,
  onDraftChange,
  onClose,
  onToggleExpand,
  onSend,
  onAction
}: {
  restaurantName: string;
  workflowState: OwnerWorkflowState;
  queuedActions: AiAgentAction[];
  latestAgentPlan: AiAgentPlan | null;
  messages: OperatingDrawerMessage[];
  draft: string;
  isSending: boolean;
  isExpanded: boolean;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onToggleExpand: () => void;
  onSend: (message: string, attachments?: LogibotAttachmentDraft[]) => Promise<void>;
  onAction: (action: AiAgentAction) => Promise<string | void>;
}) {
  const activeActions = getActiveWorkflowActions(queuedActions, workflowState);
  const quickActions: LogibotChatQuickAction[] = [
    { label: "01 Ca bán", prompt: "Phân tích doanh thu hôm nay từ dữ liệu thật và chỉ ra việc cần làm ngay." },
    { label: "02 Đơn gấp", prompt: "Đơn nào cần xử lý trước? Trả lời ngắn và đưa action an toàn." },
    { label: "Tồn kho thấp", prompt: "Kiểm tra tồn kho thấp và tạo kế hoạch nhập hàng nháp nếu cần." },
    { label: "Tạo khuyến mãi", prompt: "Tạo chiến dịch khuyến mãi an toàn dựa trên món bán chạy và tồn kho hiện tại." }
  ];

  return (
    <motion.aside
      initial={{ x: 520, opacity: 0, scale: 0.98 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 520, opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed z-[var(--z-dashboard-modal)] overflow-hidden p-0 text-[#111827]",
        "inset-0 bg-[#F8F7F4]/98 backdrop-blur-3xl",
        isExpanded
          ? "lg:inset-6 lg:rounded-[36px] lg:border lg:border-white/20 lg:bg-[#FFFEFA]/45 lg:p-2 lg:shadow-[0_32px_120px_rgba(15,81,50,0.15)]"
          : "md:inset-y-6 md:right-6 md:left-auto md:w-[min(620px,calc(100vw-3rem))] md:rounded-[36px] md:border md:border-white/20 md:bg-[#FFFEFA]/45 md:p-2 md:shadow-[0_32px_120px_rgba(15,81,50,0.15)]"
      )}
    >
      <LogibotChatSurface
        title="LogiBot"
        subtitle={`Điều hành ${restaurantName}`}
        eyebrow="AI vận hành"
        statusText={workflowState.status === "idle" ? "Sẵn sàng" : workflowState.status}
        variant="drawer"
        className="h-full rounded-none lg:rounded-[28px]"
        messages={messages}
        draft={draft}
        isSending={isSending}
        quickActions={quickActions}
        workflowStatus={workflowState.status === "idle" ? undefined : workflowState.status}
        workflowSummary={latestAgentPlan?.summary || workflowState.summary || null}
        activeActionCount={activeActions.length}
        isExpanded={isExpanded}
        canExpand
        canClose
        onDraftChange={onDraftChange}
        onSend={onSend}
        onAction={onAction}
        onClose={onClose}
        onToggleExpand={onToggleExpand}
      />
    </motion.aside>
  );
}

/* ─── Toggle Button ─── */

/**
 * Custom floating button for the LogiBot operating drawer.
 */
type LogibotSidebarToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  open?: boolean;
  hasActions?: boolean;
};

const LogibotSidebarToggle = forwardRef<HTMLButtonElement, LogibotSidebarToggleProps>(
  function LogibotSidebarToggle({ onClick, disabled, className: _className, open = false, hasActions = false, ...buttonProps }, ref) {
    function handleClick(event: MouseEvent<HTMLButtonElement>) {
      if (disabled) return;
      onClick?.(event);
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          "fixed bottom-[var(--dashboard-mobile-floating-bottom)] right-4 z-[var(--z-dashboard-panel)] inline-flex h-14 items-center gap-3 rounded-full border px-3 pr-5 font-bold transition-all duration-300 hover:-translate-y-1 active:scale-95 md:bottom-5 md:right-5",
          open
            ? "border-[#0F5132]/20 bg-white/80 backdrop-blur-md text-[#0F5132] shadow-[0_8px_32px_rgba(15,81,50,0.08)]"
            : "border-[#0F5132]/25 bg-gradient-to-br from-[#0F5132] to-[#0A3822] text-[#FFF7EB] shadow-[0_12px_36px_rgba(15,81,50,0.3)] hover:shadow-[0_16px_44px_rgba(15,81,50,0.4)]"
        )}
        aria-label={open ? "Đóng LogiBot" : "Mở LogiBot"}
        aria-pressed={open}
        {...buttonProps}
      >
        <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[rgba(255,255,255,0.15)] bg-[#FFF7EB] flex items-center justify-center">
          {hasActions && (
            <span className="absolute inset-0 rounded-full border-2 border-[#F59E0B] animate-ping opacity-75" />
          )}
          <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover rounded-full" />
        </span>
        <span className="hidden text-sm sm:inline">{open ? "Đóng LogiBot" : "LogiBot AI"}</span>
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
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [queuedActions, setQueuedActions] = useState<AiAgentAction[]>([]);
  const [latestAgentPlan, setLatestAgentPlan] = useState<AiAgentPlan | null>(null);
  const [workflowState, setWorkflowState] = useState<OwnerWorkflowState>(() => emptyOwnerWorkflowState());
  const [drawerMessages, setDrawerMessages] = useState<OperatingDrawerMessage[]>([]);
  const [drawerDraft, setDrawerDraft] = useState("");
  const [isDrawerSending, setIsDrawerSending] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
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
          agentPlan: history.workflow.agentPlan ?? undefined,
          mission: history.workflow.mission ?? undefined,
          passport: history.workflow.passport ?? undefined
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
  const operationalPassport = useMemo(
    () =>
      buildOperationalPassport({
        surface: "dashboard",
        title: `Chủ quán · ${ownerIntentLabels[currentOwnerIntent]}`,
        status: workflowState.status,
        goal: latestAgentPlan?.summary || workflowState.summary,
        route: pathname,
        nextActionId: nextWorkflowAction?.id ?? null,
        nextActionLabel: nextWorkflowAction?.label ?? null,
        checkpoint: workflowState.latestCheckpoint
          ? `${workflowState.latestCheckpoint.actionLabel || "Bước trước"}: ${workflowState.latestCheckpoint.status}`
          : null,
        handoffRoute: nextWorkflowAction?.href ?? intentRouteMap[currentOwnerIntent],
        handoffLabel: nextWorkflowAction?.label ?? ownerIntentLabels[currentOwnerIntent],
        confidence: latestAgentPlan?.confidence ?? (workflowState.pendingApprovalActionId ? "high" : activeWorkflowActions.length > 0 ? "medium" : "low")
      }),
    [activeWorkflowActions.length, currentOwnerIntent, latestAgentPlan, nextWorkflowAction, pathname, workflowState]
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
      operationalPassport,
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
      conversationalRouter: {
        primaryTool: "answer_owner_request",
        dataTool: "analyze_dashboard_area",
        workflowTool: "continue_owner_workflow",
        rule:
          "Mỗi câu hỏi mới phải được trả lời theo nguyên văn câu hỏi trước. Chỉ dùng continue_owner_workflow khi user nói rõ muốn tiếp tục workflow cũ.",
        focus: currentOwnerIntent,
        activeWorkflowActionCount: activeWorkflowActions.length,
        hasRecoveredHistory
      },
      hasRecoveredHistory,
      criticalRule:
        "AI chỉ mở đúng màn hoặc gọi API phân tích; không tự xác nhận thanh toán, không tự xoá dữ liệu. Action nhạy cảm luôn phải qua xác nhận của người dùng."
    }),
    [activeWorkflowActions.length, currentOwnerIntent, hasRecoveredHistory, latestAgentPlan, nextWorkflowAction, operationalPassport, pathname, queuedActions, restaurantId, restaurantName, workflowState]
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
      await sendDrawerMessage(action.prompt);
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

  async function sendDrawerMessage(message: string, attachments: LogibotAttachmentDraft[] = []) {
    const userMessage = message.trim();
    if ((!userMessage && !attachments.length) || isDrawerSending) return;

    const finalMessage = userMessage || "Đọc file đính kèm và cho biết bước xử lý tiếp theo.";
    const attachmentLabel = logibotAttachmentLabel(attachments);
    const focus = inferOwnerIntentFromMessage(finalMessage, currentOwnerIntent);
    setDrawerDraft("");
    setDrawerMessages((current) => [
      ...current,
      {
        id: makeOperatingMessageId(),
        role: "user",
        content: finalMessage,
        attachmentLabel: attachmentLabel || undefined
      }
    ]);
    setIsDrawerSending(true);

    try {
      const result = rememberOwnerResult(
        (await requestLogibot({
          message: finalMessage,
          attachments,
          assistantBody: {
            intent: focus,
            threadId,
            message: finalMessage,
            context: {
              currentPath: pathname,
              currentIntent: currentOwnerIntent,
              activeWorkflow: workflowState,
              operationalPassport,
              source: "logibot_operating_drawer_v2"
            }
          }
        })) as OwnerAiResult
      );

      setDrawerMessages((current) => [
        ...current,
        {
          id: makeOperatingMessageId(),
          role: "assistant",
          content: generatedOwnerDataText(result),
          result
        }
      ]);
    } catch (error) {
      setDrawerMessages((current) => [
        ...current,
        {
          id: makeOperatingMessageId(),
          role: "assistant",
          content: error instanceof Error ? error.message : "LogiBot chưa xử lý được yêu cầu này. Hãy thử lại với câu hỏi ngắn hơn.",
          result: null
        }
      ]);
    } finally {
      setIsDrawerSending(false);
    }
  }

  /* Tool: navigate */
  useCopilotAction(
    {
      name: "navigate_dashboard",
      followUp: false,
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
      render: ({ status, result }) => <ToolResultCard title="Mở đúng màn" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [operationalPassport, router, runOwnerAction]
  );

  useCopilotAction(
    {
      name: "answer_owner_request",
      followUp: false,
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do của chủ quán. Với chào hỏi/cảm ơn/test bot, backend trả lời xã giao và không phân tích ca; với nội dung vận hành, backend tự suy luận intent, đọc dữ liệu thật khi cần và trả card có CTA an toàn.",
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
                operationalPassport,
                source: "copilotkit_catch_all"
              }
            })
          );
        } catch (error) {
          return rememberOwnerResult({
            reply: error instanceof Error ? error.message : "LogiBot chưa đọc được dữ liệu cho yêu cầu này. Hãy thử lại bằng câu hỏi ngắn hơn.",
            intent: fallbackIntent,
            intentLabel: ownerIntentLabels[fallbackIntent],
            actions: []
          });
        }
      },
      render: ({ status, result }) => <ToolResultCard title="Trả lời vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [currentOwnerIntent, operationalPassport, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId, workflowState]
  );

  /* Tool: analyze */
  useCopilotAction(
    {
      name: "analyze_dashboard_area",
      followUp: false,
      description:
        "Đọc dữ liệu thật theo nghiệp vụ, trả lời tình hình chính trước rồi mới đưa bước xử lý rõ ràng. Dùng cho đơn, bếp, bàn, thanh toán, online, đặt bàn, báo cáo, setup.",
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
              context: { currentPath: pathname, source: "copilotkit", operationalPassport }
            })
          );
        } catch (error) {
          return rememberOwnerResult({
            reply: error instanceof Error ? error.message : "LogiBot chưa đọc được dữ liệu cho khu vực này. Hãy thử lại bằng câu hỏi ngắn hơn.",
            intent: focus,
            intentLabel: ownerIntentLabels[focus],
            actions: []
          });
        }
      },
      render: ({ status, result }) => <ToolResultCard title="Phân tích vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [currentOwnerIntent, operationalPassport, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId]
  );

  useCopilotAction(
    {
      name: "continue_owner_workflow",
      followUp: false,
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
      render: ({ status, result }) => <ToolResultCard title="Workflow runtime" status={status} result={result as OwnerWorkflowRuntimeResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [latestAgentPlan, operationalPassport, queuedActions, runOwnerAction, workflowState]
  );

  useCopilotAction(
    {
      name: "get_owner_operational_shortcuts",
      followUp: false,
      description:
        "Tạo card shortcut an toàn cho owner khi câu hỏi còn mơ hồ. Không đọc dữ liệu thô ra UI; chỉ tạo bước tiếp theo để phân tích, mở màn hoặc lập workflow.",
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
      render: ({ status, result }) => <ToolResultCard title="Shortcut vận hành" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [currentOwnerIntent, operationalPassport, pathname, rememberOwnerResult, restaurantName, runOwnerAction, threadId]
  );

  useCopilotAction(
    {
      name: "run_owner_action",
      followUp: false,
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
      render: ({ status, result }) => <ToolResultCard title="Thực thi action" status={status} result={String(result || "Đang chạy action...")} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [operationalPassport, queuedActions, runOwnerAction]
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
      followUp: false,
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
      render: ({ status, result }) => <ToolResultCard title="Kế hoạch setup AI" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [operationalPassport, rememberOwnerResult, runOwnerAction]
  );

  /* Tool: branding */
  useCopilotAction(
    {
      name: "generate_branding_draft",
      followUp: false,
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
      render: ({ status, result }) => <ToolResultCard title="Branding draft" status={status} result={result as OwnerAiResult} onAction={runOwnerAction} passport={operationalPassport} />
    },
    [operationalPassport, rememberOwnerResult, restaurantName, runOwnerAction]
  );

  /* ─── Render ─── */

  return (
    <>
      <CopilotThinkingIndicator enabled={hasEverOpened} surface="dashboard" />
      {hasEverOpened ? (
        <LogibotOperatingDrawer
          restaurantName={restaurantName}
          workflowState={workflowState}
          queuedActions={queuedActions}
          latestAgentPlan={latestAgentPlan}
          messages={drawerMessages}
          draft={drawerDraft}
          isSending={isDrawerSending}
          isExpanded={isDrawerExpanded}
          onDraftChange={setDrawerDraft}
          onClose={() => {
            setHasEverOpened(false);
            setIsDrawerExpanded(false);
          }}
          onToggleExpand={() => setIsDrawerExpanded((current) => !current)}
          onSend={sendDrawerMessage}
          onAction={runOwnerAction}
        />
      ) : (
        <LogibotSidebarToggle
          onClick={() => setHasEverOpened(true)}
          hasActions={queuedActions.length > 0}
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
