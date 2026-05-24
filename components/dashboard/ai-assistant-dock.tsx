"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Maximize2,
  Play,
  Send,
  ShieldCheck,
  X
} from "lucide-react";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

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

type AiReply = {
  reply?: string;
  text?: string;
  intent?: OwnerIntent;
  intentLabel?: string;
  suggestions?: string[];
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan;
  data?: {
    slogans?: string[];
    description?: string;
    brandVoice?: string;
    logoPrompt?: string;
    menuHeroPrompt?: string;
  } | null;
  provider?: string;
  model?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "tool";
  title?: string;
  content: string;
  meta?: string;
  actions?: AiAgentAction[];
  plan?: AiAgentPlan | null;
};

const ownerIntentOptions: Array<{ intent: OwnerIntent; label: string; routeHint: string }> = [
  { intent: "setup", label: "Thiết lập", routeHint: "/dashboard/settings" },
  { intent: "overview", label: "Tổng quan", routeHint: "/dashboard" },
  { intent: "orders", label: "Đơn", routeHint: "/dashboard/orders" },
  { intent: "kitchen", label: "Bếp", routeHint: "/dashboard/orders" },
  { intent: "menu", label: "Menu", routeHint: "/dashboard/menu" },
  { intent: "inventory", label: "Kho hàng", routeHint: "/dashboard/inventory" },
  { intent: "tables", label: "Bàn", routeHint: "/dashboard/tables" },
  { intent: "payments", label: "Thanh toán", routeHint: "/dashboard/payments" },
  { intent: "online", label: "Online", routeHint: "/dashboard/online" },
  { intent: "reservations", label: "Đặt bàn", routeHint: "/dashboard/reservations" },
  { intent: "promotions", label: "Mã giảm", routeHint: "/dashboard/promotions" },
  { intent: "reports", label: "Báo cáo", routeHint: "/dashboard/analytics" },
  { intent: "settings", label: "Cài đặt", routeHint: "/dashboard/settings" },
  { intent: "security", label: "Bảo mật", routeHint: "/dashboard/settings" },
  { intent: "growth", label: "Tăng trưởng", routeHint: "/dashboard/promotions" }
];

const quickPrompts: Record<OwnerIntent, string[]> = {
  setup: ["Kiểm tra mức sẵn sàng và việc còn thiếu", "Tạo kế hoạch thiết lập trong 30 phút", "Tạo bản nháp thương hiệu và menu đầu tiên"],
  overview: ["Tóm tắt ca bán hiện tại và 3 việc cần làm ngay", "Điểm nghẽn lớn nhất trong 15 phút tới là gì?"],
  orders: ["Đơn nào cần xử lý trước và thao tác tiếp theo là gì?", "Kiểm tra đơn có nguy cơ trễ hoặc sai trạng thái"],
  kitchen: ["Sắp xếp thứ tự ra món cho bếp theo mức độ ưu tiên", "Có món/bàn nào quá giờ ra món không?"],
  menu: ["Món nào nên đẩy lên đầu menu khách?", "Đề xuất chỉnh danh mục để khách gọi nhanh hơn"],
  inventory: ["Kho đang thiếu gì trước giờ cao điểm?", "Món nào thiếu định mức nguyên liệu?", "Gợi ý nhập hàng theo cảnh báo kho"],
  tables: ["Bàn nào cần chú ý ngay?", "Tóm tắt bàn trống, bàn đang phục vụ và bàn chờ thanh toán"],
  payments: ["Giao dịch nào đang cần đối soát?", "Kiểm tra rủi ro thanh toán VietQR/tiền mặt"],
  promotions: ["Tạo một mã khuyến mãi an toàn cho cuối tuần", "Mã nào nên bật hiển thị ở menu khách?"],
  staff: ["Gợi ý phân công nhân viên trong ca đông", "Quyền STAFF nên giới hạn những thao tác nào?"],
  online: ["Tối ưu cấu hình ship/pickup để giảm lỗi nhận đơn", "Nên bật trả sau hay bắt chuyển khoản trước?"],
  reservations: ["Cấu hình đặt bàn tránh trùng lịch và quá hạn giữ chỗ", "Nên nhận cọc bao nhiêu cho quán này?"],
  reports: ["Tóm tắt insight doanh thu và món bán chạy", "Gợi ý báo cáo tuần nên gửi qua email"],
  settings: ["Quán còn thiếu cấu hình gì trước khi thương mại hóa?", "Kiểm tra hồ sơ quán, VietQR, logo và địa chỉ"],
  security: ["Audit nhanh rủi ro bị spam, bug gói hoặc sai quyền", "Các điểm cần khóa trước khi mở rộng quán"],
  growth: ["Viết slogan và ý tưởng chiến dịch giữ chân khách", "Gợi ý ảnh menu rõ món, không lỗi chữ"]
};

const logibotLogo = "/brand/logivn/logibot-badge.png";
const maxStoredMessages = 12;
const aiRequestTimeoutMs = 16_000;
const operationalActionTimeoutMs = 12_000;

function ownerStorageKey(restaurantName: string) {
  return `logivn:owner-ai:${restaurantName || "store"}:v2`;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function defaultOwnerMessages(): ChatMessage[] {
  return [
    {
      id: "intro",
      role: "assistant",
      title: "LogiBot hỗ trợ vận hành",
      content: "Mình sẽ đọc dữ liệu thật của quán và đề xuất việc cần làm ngay. Chọn một nghiệp vụ hoặc hỏi trực tiếp."
    }
  ];
}

function readStoredOwnerMessages(key: string) {
  if (typeof window === "undefined") return defaultOwnerMessages();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as ChatMessage[] | null;
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-maxStoredMessages) : defaultOwnerMessages();
  } catch {
    return defaultOwnerMessages();
  }
}

function structuredBrandingText(data: AiReply["data"]) {
  if (!data) return "";
  return [
    data.slogans?.length ? `Slogan:\n${data.slogans.map((item) => `- ${item}`).join("\n")}` : "",
    data.description ? `\nMô tả:\n${data.description}` : "",
    data.logoPrompt ? `\nGợi ý logo:\n${data.logoPrompt}` : "",
    data.menuHeroPrompt ? `\nGợi ý ảnh menu:\n${data.menuHeroPrompt}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function setupPlanText(data: unknown) {
  const plan = data as {
    summary?: string;
    ownerMessage?: string;
    launchBlockers?: string[];
    expressSetup?: Array<{ title?: string; why?: string; where?: string; estimatedMinutes?: number }>;
    aiAutopilot?: Array<{ feature?: string; value?: string; plan?: string }>;
  } | null;
  if (!plan) return "";
  return [
    plan.summary ? `Tổng quan:\n${plan.summary}` : "",
    plan.ownerMessage ? `\nGhi chú:\n${plan.ownerMessage}` : "",
    plan.launchBlockers?.length ? `\nChặn bán thật:\n${plan.launchBlockers.map((item) => `- ${item}`).join("\n")}` : "",
    plan.expressSetup?.length
      ? `\nViệc nên làm:\n${plan.expressSetup
          .slice(0, 5)
          .map((item) => `- ${item.title}${item.estimatedMinutes ? ` (${item.estimatedMinutes} phút)` : ""}: ${item.why || item.where || ""}`)
          .join("\n")}`
      : "",
    plan.aiAutopilot?.length
      ? `\nTính năng nên bật:\n${plan.aiAutopilot.map((item) => `- ${item.feature} (${item.plan}): ${item.value}`).join("\n")}`
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
      fields?: Array<{ label?: string; value?: string }>;
      settings?: Array<{ key?: string; value?: string | number | boolean; reason?: string }>;
      checklist?: string[];
    };
  } | null;
  if (!draft) return "";
  return [
    draft.title ? `${draft.title}` : "",
    draft.ownerNote ? `\n${draft.ownerNote}` : "",
    draft.quickWins?.length ? `\nThắng nhanh:\n${draft.quickWins.map((item) => `- ${item}`).join("\n")}` : "",
    draft.draft?.fields?.length
      ? `\nNội dung nháp:\n${draft.draft.fields
          .slice(0, 6)
          .map((item) => `- ${item.label}: ${item.value}`)
          .join("\n")}`
      : "",
    draft.draft?.settings?.length
      ? `\nCấu hình gợi ý:\n${draft.draft.settings
          .slice(0, 5)
          .map((item) => `- ${item.key}: ${String(item.value)} (${item.reason || "nên kiểm tra"})`)
          .join("\n")}`
      : "",
    draft.draft?.checklist?.length ? `\nChecklist:\n${draft.draft.checklist.slice(0, 5).map((item) => `- ${item}`).join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function agentEndpointText(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown> | null | undefined;
  return (
    (payload.reply as string | undefined) ||
    setupPlanText(data) ||
    setupDraftText(data) ||
    structuredBrandingText(data as AiReply["data"]) ||
    (payload.text as string | undefined) ||
    "Đã chạy tác vụ. Bảng quản lý sẽ cập nhật theo dữ liệu mới."
  );
}

function inferIntentFromPath(pathname: string): OwnerIntent {
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/menu")) return "menu";
  if (pathname.includes("/inventory")) return "inventory";
  if (pathname.includes("/tables")) return "tables";
  if (pathname.includes("/payments")) return "payments";
  if (pathname.includes("/promotions")) return "promotions";
  if (pathname.includes("/staff")) return "staff";
  if (pathname.includes("/online")) return "online";
  if (pathname.includes("/reservations")) return "reservations";
  if (pathname.includes("/analytics") || pathname.includes("/reports")) return "reports";
  if (pathname.includes("/settings")) return "settings";
  if (pathname.includes("/onboarding")) return "setup";
  return "overview";
}

function priorityClass(action: AiAgentAction) {
  if (action.priority === "primary") return "border-[var(--primary)] bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]";
  if (action.priority === "danger") return "border-[var(--accent)]/24 bg-[var(--accent-soft)] text-[var(--accent-strong)] hover:border-[var(--accent)]/36";
  return "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--soft-surface)]";
}

function safetyLabel(action: AiAgentAction) {
  if (action.safety === "manual_only") return "Cần tự xác nhận";
  if (action.safety === "confirm") return "Cần xác nhận";
  return "An toàn";
}

function planConfidenceLabel(plan: AiAgentPlan | null) {
  if (plan?.confidence === "high") return "Tự tin cao";
  if (plan?.confidence === "medium") return "Đủ dữ liệu";
  if (plan?.confidence === "low") return "Cần thêm dữ liệu";
  return "Đang chờ";
}

function actionConfirmMessage(action: AiAgentAction, count = 1) {
  if (action.safety === "manual_only") {
    return `Chỉ tiếp tục nếu bạn đã kiểm tra dữ liệu thật.\n\n${action.label}${count > 1 ? ` (${count} thao tác)` : ""}`;
  }
  if (action.safety === "confirm") {
    return `LogiBot sẽ chạy thao tác này trong dashboard.\n\n${action.label}${count > 1 ? ` (${count} thao tác)` : ""}`;
  }
  return "";
}

function actionNeedsConfirmation(action: AiAgentAction) {
  return action.safety === "confirm" || action.safety === "manual_only";
}

function isApiEnvelope(value: unknown): value is { ok: boolean; error?: string } {
  return Boolean(value && typeof value === "object" && "ok" in value);
}

function getApiErrorMessage(value: unknown, fallback: string) {
  if (isApiEnvelope(value) && value.ok === false && value.error) return value.error;
  return fallback;
}

function getBulkOwnerActions(action: AiAgentAction) {
  const body = action.body as { kind?: unknown; actions?: unknown } | undefined;
  if (body?.kind !== "bulk_owner_actions" || !Array.isArray(body.actions)) return [];
  return body.actions.filter((item): item is AiAgentAction => {
    return Boolean(item && typeof item === "object" && (item as AiAgentAction).type === "api" && (item as AiAgentAction).endpoint);
  });
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl border px-4 py-3 ${
          isUser
            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
            : message.role === "tool"
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
        }`}
      >
        {message.title ? (
          <p className={`mb-1 text-xs font-semibold uppercase tracking-[0.08em] ${isUser ? "text-white/70" : "text-[var(--muted-foreground)]"}`}>
            {message.title}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-6">{stripMarkdown(message.content)}</p>
      </div>
    </article>
  );
}

function ActionCard({
  action,
  running,
  disabled,
  onRun
}: {
  action: AiAgentAction;
  running?: boolean;
  disabled?: boolean;
  onRun: (action: AiAgentAction) => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {running ? <Loader2 size={15} className="animate-spin" /> : action.type === "link" ? <ExternalLink size={15} /> : <Play size={15} />}
          {running ? "Đang chạy..." : action.label}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${action.priority === "primary" ? "bg-[var(--surface)]/14 text-current" : "bg-[var(--soft-surface)] text-[var(--muted-foreground)]"}`}>
          {safetyLabel(action)}
        </span>
      </div>
      {action.description ? <p className="mt-2 text-xs leading-5 opacity-80">{action.description}</p> : null}
    </>
  );

  if (action.type === "link" && action.href) {
    return (
      <Link href={action.href} className={`rounded-xl border p-3 text-left transition ${priorityClass(action)}`}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || running}
      onClick={() => onRun(action)}
      className={`rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${priorityClass(action)}`}
    >
      {content}
    </button>
  );
}

export function AiAssistantDock({ restaurantName }: { restaurantName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const initialIntent = useMemo(() => inferIntentFromPath(pathname), [pathname]);
  const storageKey = useMemo(() => ownerStorageKey(restaurantName), [restaurantName]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<OwnerIntent>(initialIntent);
  const [suggestions, setSuggestions] = useState<string[]>(quickPrompts[initialIntent]);
  const [actions, setActions] = useState<AiAgentAction[]>([]);
  const [agentPlan, setAgentPlan] = useState<AiAgentPlan | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredOwnerMessages(storageKey));
  const [loading, setLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);

  useEffect(() => {
    setMessages(readStoredOwnerMessages(storageKey));
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-maxStoredMessages)));
    } catch {
      // Keep the operator usable when localStorage is unavailable.
    }
  }, [messages, storageKey]);

  async function callAi(endpoint: string, body: Record<string, unknown>, nextIntent = intent) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), aiRequestTimeoutMs);
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<AiReply> | null;
      if (!result || !result.ok) throw new Error(result?.error || "LogiBot chưa phản hồi được.");

      const data = result.data;
      const content = agentEndpointText(data as Record<string, unknown>);
      const nextActions = data.actions ?? [];
      setSuggestions(data.suggestions?.length ? data.suggestions : quickPrompts[nextIntent]);
      setActions(nextActions);
      setAgentPlan(data.agentPlan ?? null);
      setMessages((current) => [
        ...current.slice(-(maxStoredMessages - 1)),
        {
          id: makeId(),
          role: endpoint.includes("setup-") || endpoint.includes("branding") ? "tool" : "assistant",
          title: data.agentPlan?.title ?? data.intentLabel ?? "LogiBot phản hồi",
          content,
          meta: [data.intentLabel].filter(Boolean).join(" · "),
          actions: nextActions,
          plan: data.agentPlan ?? null
        }
      ]);
    } catch (error) {
      setActions([]);
      setMessages((current) => [
        ...current.slice(-(maxStoredMessages - 1)),
        {
          id: makeId(),
          role: "assistant",
          title: "Chưa xử lý được yêu cầu",
          content:
            error instanceof Error && error.name === "AbortError"
              ? "LogiBot phản hồi quá lâu. Mình đã dừng lượt này để UI không bị treo; bạn có thể bấm gợi ý nhanh hoặc hỏi lại ngắn hơn."
              : error instanceof Error
                ? error.message
                : "Không gọi được LogiBot."
        }
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function pushMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current.slice(-(maxStoredMessages - 1)), { id: makeId(), ...message }]);
  }

  async function postOperationalAction(action: AiAgentAction) {
    if (!action.endpoint) throw new Error("Tác vụ chưa sẵn sàng để thực thi.");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), operationalActionTimeoutMs);
    try {
      const response = await fetch(action.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action.body ?? {}),
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || (isApiEnvelope(result) && !result.ok)) {
        throw new Error(getApiErrorMessage(result, "Không chạy được action. Vui lòng thử lại hoặc mở đúng màn để xử lý thủ công."));
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Action mất quá lâu nên đã dừng để tránh UI bị đứng. Vui lòng mở đúng màn và thử lại.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function runSingleApiAction(action: AiAgentAction) {
    if (actionNeedsConfirmation(action) && !globalThis.confirm(actionConfirmMessage(action))) return;

    setRunningActionId(action.id);
    pushMessage({ role: "user", title: "Chạy action", content: action.label });
    try {
      await postOperationalAction(action);
      router.refresh();
      pushMessage({
        role: "assistant",
        title: "Action đã hoàn tất",
        content: `${action.label} đã chạy xong. Mình đã làm mới dashboard để dữ liệu hiện tại được cập nhật.`
      });
    } catch (error) {
      pushMessage({
        role: "assistant",
        title: "Action chưa hoàn tất",
        content: error instanceof Error ? error.message : "Không chạy được action."
      });
    } finally {
      setRunningActionId(null);
    }
  }

  async function runBulkOwnerAction(action: AiAgentAction) {
    const bulkActions = getBulkOwnerActions(action);
    if (!bulkActions.length) {
      pushMessage({
        role: "assistant",
        title: "Action chưa sẵn sàng",
        content: "LogiBot chưa có danh sách thao tác hợp lệ để chạy hàng loạt."
      });
      return;
    }

    if (!globalThis.confirm(actionConfirmMessage(action, bulkActions.length) || `Chạy ${bulkActions.length} thao tác?`)) return;

    setRunningActionId(action.id);
    pushMessage({ role: "user", title: "Chạy hàng loạt", content: action.label });

    let successCount = 0;
    const failedLabels: string[] = [];

    for (const item of bulkActions) {
      try {
        await postOperationalAction(item);
        successCount += 1;
      } catch {
        failedLabels.push(item.label);
      }
    }

    router.refresh();
    setRunningActionId(null);
    pushMessage({
      role: "assistant",
      title: failedLabels.length ? "Action chạy một phần" : "Đã xử lý hàng loạt",
      content: failedLabels.length
        ? `Đã chạy ${successCount}/${bulkActions.length} thao tác. Các mục chưa xong: ${failedLabels.slice(0, 3).join(", ")}.`
        : `Đã chạy xong ${successCount} thao tác. Bảng quản lý đã được làm mới để phản ánh trạng thái mới.`
    });
  }

  async function submitAssistant(value = message, nextIntent = intent) {
    const text = value.trim();
    if (!text || loading) return;
    setMessage("");
    setIntent(nextIntent);
    setMessages((current) => [
      ...current.slice(-(maxStoredMessages - 1)),
      { id: makeId(), role: "user", content: text, title: ownerIntentOptions.find((item) => item.intent === nextIntent)?.label }
    ]);
    await callAi(
      "/api/admin/ai/assistant",
      {
        message: text,
        intent: nextIntent,
        context: {
          route: pathname,
          restaurantName
        }
      },
      nextIntent
    );
  }

  async function runAgentAction(action: AiAgentAction) {
    if (action.type === "prompt" && action.prompt) {
      await submitAssistant(action.prompt, (action.intent as OwnerIntent) || intent);
      return;
    }

    if (action.type === "ui" && (action.body as { kind?: unknown } | undefined)?.kind === "bulk_owner_actions") {
      await runBulkOwnerAction(action);
      return;
    }

    if (action.type === "api" && action.endpoint) {
      if (action.endpoint.startsWith("/api/admin/ai/")) {
        if (actionNeedsConfirmation(action) && !globalThis.confirm(actionConfirmMessage(action))) return;
        await callAi(action.endpoint, action.body ?? {}, (action.intent as OwnerIntent) || intent);
        router.refresh();
        return;
      }

      await runSingleApiAction(action);
    }
  }

  const activeIntent = ownerIntentOptions.find((item) => item.intent === intent);
  const nextAction = actions.find((item) => item.id === agentPlan?.nextBestActionId) ?? actions.find((item) => item.priority === "primary") ?? actions[0] ?? null;
  const contextStatus = runningActionId ? "Đang chạy action" : loading ? "Đang đọc dữ liệu" : actions.length ? "Sẵn sàng thao tác" : "Chờ yêu cầu";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[var(--dashboard-mobile-floating-bottom)] right-4 z-[var(--z-dashboard-panel)] inline-flex h-14 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-4 text-sm font-semibold text-[var(--primary)] shadow-[0_14px_34px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5 md:bottom-5 md:right-5"
      >
        <span className="grid h-12 w-12 overflow-hidden rounded-full">
          <Image src={logibotLogo} alt="LogiBot" width={48} height={48} className="h-full w-full object-cover" priority />
        </span>
        LogiBot
      </button>

      {open ? (
        <section className="fixed inset-x-3 bottom-[calc(var(--dashboard-mobile-floating-bottom)_+_4.5rem)] z-[var(--z-dashboard-panel)] flex h-[min(720px,calc(100dvh_-_var(--dashboard-mobile-nav-height)_-_11rem))] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lift)] md:inset-x-auto md:bottom-20 md:right-5 md:w-[min(820px,calc(100vw-32px))]">
          <header className="flex items-center justify-between bg-[var(--primary)] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/20 bg-[var(--surface)] p-0.5">
                <Image src={logibotLogo} alt="LogiBot" width={48} height={48} className="h-full w-full rounded-full object-cover" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">LogiBot vận hành</p>
                  <span className="rounded-full bg-[var(--surface)]/12 px-2 py-0.5 text-[10px] font-bold text-white/80">Tác vụ tức thời</span>
                </div>
                <p className="truncate text-xs text-white/72">{restaurantName} · {activeIntent?.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href={activeIntent?.routeHint ?? "/dashboard"} className="inline-grid h-11 w-11 place-items-center rounded-full text-white/78 hover:bg-[var(--surface)]/10" title="Mở màn hiện tại">
                <Maximize2 size={17} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full text-white/78 hover:bg-[var(--surface)]/10">
                <X size={17} />
              </button>
            </div>
          </header>

          <div className="border-b border-[var(--border)] bg-[linear-gradient(90deg,rgba(15,77,58,0.06),rgba(242,140,40,0.06),rgba(255,247,235,0.72))] px-4 py-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="min-w-0 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/70 px-3 py-2">
                <p className="font-semibold uppercase text-[var(--muted-foreground)]">Ngữ cảnh</p>
                <p className="mt-1 truncate font-semibold text-[var(--foreground)]">{activeIntent?.label ?? "Tổng quan"}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/70 px-3 py-2">
                <p className="font-semibold uppercase text-[var(--muted-foreground)]">Trạng thái</p>
                <p className="mt-1 truncate font-semibold text-[var(--foreground)]">{contextStatus}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/70 px-3 py-2">
                <p className="font-semibold uppercase text-[var(--muted-foreground)]">Bước tiếp</p>
                <p className="mt-1 truncate font-semibold text-[var(--foreground)]">{nextAction?.label ?? "Hỏi hoặc chọn gợi ý"}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/70 px-3 py-2">
                <p className="font-semibold uppercase text-[var(--muted-foreground)]">Độ chắc</p>
                <p className="mt-1 truncate font-semibold text-[var(--foreground)]">{planConfidenceLabel(agentPlan)}</p>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_292px]">
            <div className="flex min-h-0 flex-col border-r border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <div className="flex gap-2 overflow-x-auto">
                  {ownerIntentOptions.map((option) => (
                    <button
                      key={option.intent}
                      type="button"
                      onClick={() => {
                        setIntent(option.intent);
                        setSuggestions(quickPrompts[option.intent]);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        intent === option.intent
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)]"
                      }`}
                      title={option.routeHint}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--soft-surface)] p-4">
                {messages.slice(-maxStoredMessages).map((item) => (
                  <MessageBubble key={item.id} message={item} />
                ))}
                {loading ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
                      <Loader2 size={16} className="animate-spin" />
                      LogiBot đang đọc dữ liệu và đề xuất việc cần làm...
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
                {actions.length ? (
                  <div className="mb-3 grid gap-2 lg:hidden">
                    <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Việc cần làm</p>
                    <div className="grid gap-2">
                      {actions.slice(0, 3).map((item) => (
                        <ActionCard key={item.id} action={item} running={runningActionId === item.id} disabled={loading || Boolean(runningActionId)} onRun={runAgentAction} />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mb-2 flex gap-2 overflow-x-auto">
                  {suggestions.slice(0, 4).map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => void submitAssistant(sample)}
                      disabled={loading}
                      className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitAssistant();
                    }}
                    placeholder={`Yêu cầu LogiBot xử lý ${activeIntent?.label.toLowerCase() || "vận hành"}...`}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => void submitAssistant()}
                    disabled={loading || !message.trim()}
                    className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>

            <aside className="hidden min-h-0 overflow-y-auto bg-[var(--surface)] p-4 lg:block">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Kế hoạch xử lý</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{agentPlan?.title ?? "Chưa có kế hoạch"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {agentPlan?.summary ?? "Hỏi LogiBot hoặc chọn gợi ý nhanh để tạo kế hoạch hành động theo dữ liệu thật của quán."}
                </p>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-2">
                    <ArrowRight size={14} />
                    {agentPlan?.focusArea ?? activeIntent?.routeHint}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={14} />
                    {agentPlan?.safetyNote ?? "Việc quan trọng cần chủ quán tự xác nhận trước khi áp dụng."}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Việc cần làm</p>
                  {actions.length ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
                      <CheckCircle2 size={12} />
                      {actions.length} tác vụ
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {actions.length ? (
                    actions.map((item) => <ActionCard key={item.id} action={item} running={runningActionId === item.id} disabled={loading || Boolean(runningActionId)} onRun={runAgentAction} />)
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">
                      Việc cần làm sẽ xuất hiện sau khi LogiBot hiểu nghiệp vụ và dữ liệu cần xử lý.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </>
  );
}
