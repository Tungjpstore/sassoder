"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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
  { intent: "setup", label: "Setup", routeHint: "/dashboard/settings" },
  { intent: "overview", label: "Tổng quan", routeHint: "/dashboard" },
  { intent: "orders", label: "Đơn", routeHint: "/dashboard/orders" },
  { intent: "kitchen", label: "Bếp", routeHint: "/dashboard/orders" },
  { intent: "menu", label: "Menu", routeHint: "/dashboard/menu" },
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
  setup: ["Quét readiness và chỉ ra việc chặn bán thật", "Tạo kế hoạch setup trong 30 phút", "Sinh bản nháp thương hiệu và menu đầu tiên"],
  overview: ["Tóm tắt ca bán hiện tại và 3 việc cần làm ngay", "Điểm nghẽn lớn nhất trong 15 phút tới là gì?"],
  orders: ["Đơn nào cần xử lý trước và thao tác tiếp theo là gì?", "Kiểm tra đơn có nguy cơ trễ hoặc sai trạng thái"],
  kitchen: ["Sắp xếp thứ tự ra món cho bếp theo mức độ ưu tiên", "Có món/bàn nào quá giờ ra món không?"],
  menu: ["Món nào nên đẩy lên đầu menu khách?", "Đề xuất chỉnh danh mục để khách gọi nhanh hơn"],
  tables: ["Bàn nào cần chú ý ngay?", "Tóm tắt bàn trống, bàn đang phục vụ và bàn chờ thanh toán"],
  payments: ["Giao dịch nào đang cần đối soát?", "Kiểm tra rủi ro thanh toán VietQR/tiền mặt"],
  promotions: ["Tạo một mã khuyến mãi an toàn cho cuối tuần", "Mã nào nên bật hiển thị ở menu khách?"],
  staff: ["Gợi ý phân công nhân viên trong ca đông", "Quyền STAFF nên giới hạn những thao tác nào?"],
  online: ["Tối ưu cấu hình ship/pickup để giảm lỗi nhận đơn", "Nên bật trả sau hay bắt chuyển khoản trước?"],
  reservations: ["Cấu hình đặt bàn tránh trùng lịch và quá hạn giữ chỗ", "Nên nhận cọc bao nhiêu cho quán này?"],
  reports: ["Tóm tắt insight doanh thu và món bán chạy", "Gợi ý báo cáo tuần nên gửi qua email"],
  settings: ["Quán còn thiếu cấu hình gì trước khi thương mại hóa?", "Kiểm tra hồ sơ quán, VietQR, logo và địa chỉ"],
  security: ["Audit nhanh rủi ro bị spam, bug gói hoặc sai quyền", "Các điểm cần khóa trước khi mở rộng quán"],
  growth: ["Viết slogan và ý tưởng chiến dịch giữ chân khách", "Gợi ý prompt ảnh menu preview không bị lỗi chữ"]
};

const logibotLogo = "/brand/logivn/logibot-badge.png";
const maxStoredMessages = 12;

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
      title: "LogiBot Operator",
      content: "Mình sẽ đọc dữ liệu thật của quán và đưa action xử lý ngay. Chọn một nghiệp vụ hoặc hỏi trực tiếp."
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
    data.logoPrompt ? `\nPrompt logo:\n${data.logoPrompt}` : "",
    data.menuHeroPrompt ? `\nPrompt ảnh menu:\n${data.menuHeroPrompt}` : ""
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
      ? `\nAI đáng bật:\n${plan.aiAutopilot.map((item) => `- ${item.feature} (${item.plan}): ${item.value}`).join("\n")}`
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
    "Đã chạy action. Dashboard sẽ cập nhật theo dữ liệu mới."
  );
}

function inferIntentFromPath(pathname: string): OwnerIntent {
  if (pathname.includes("/orders")) return "orders";
  if (pathname.includes("/menu")) return "menu";
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
  if (action.priority === "danger") return "border-red-200 bg-red-50 text-red-700 hover:border-red-300";
  return "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--soft-surface)]";
}

function safetyLabel(action: AiAgentAction) {
  if (action.safety === "manual_only") return "Cần tự xác nhận";
  if (action.safety === "confirm") return "Cần xác nhận";
  return "An toàn";
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
              : "border-[var(--border)] bg-white text-[var(--foreground)]"
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
  disabled,
  onRun
}: {
  action: AiAgentAction;
  disabled?: boolean;
  onRun: (action: AiAgentAction) => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {action.type === "link" ? <ExternalLink size={15} /> : <Play size={15} />}
          {action.label}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${action.priority === "primary" ? "bg-white/14 text-current" : "bg-[var(--soft-surface)] text-[var(--muted-foreground)]"}`}>
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
      disabled={disabled}
      onClick={() => onRun(action)}
      className={`rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${priorityClass(action)}`}
    >
      {content}
    </button>
  );
}

export function AiAssistantDock({ restaurantName }: { restaurantName: string }) {
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
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<AiReply> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa phản hồi được.");

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
          title: data.agentPlan?.title ?? data.intentLabel ?? "AI phản hồi",
          content,
          meta: [data.intentLabel, data.provider, data.model].filter(Boolean).join(" · "),
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
          title: "Không chạy được agent",
          content: error instanceof Error ? error.message : "Không gọi được AI."
        }
      ]);
    } finally {
      setLoading(false);
    }
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

    if (action.type === "api" && action.endpoint) {
      setMessages((current) => [
        ...current.slice(-(maxStoredMessages - 1)),
        {
          id: makeId(),
          role: "user",
          title: "Chạy action",
          content: action.label
        }
      ]);
      await callAi(action.endpoint, action.body ?? {}, (action.intent as OwnerIntent) || intent);
    }
  }

  const activeIntent = ownerIntentOptions.find((item) => item.intent === intent);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 items-center gap-2 rounded-full border border-[var(--border)] bg-white py-1 pl-1 pr-4 text-sm font-black text-[var(--primary)] shadow-[0_14px_34px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5"
      >
        <span className="grid h-12 w-12 overflow-hidden rounded-full">
          <Image src={logibotLogo} alt="LogiBot" width={48} height={48} className="h-full w-full object-cover" priority />
        </span>
        LogiBot
      </button>

      {open ? (
        <section className="fixed bottom-20 right-5 z-50 flex h-[min(720px,calc(100vh-112px))] w-[min(820px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <header className="flex items-center justify-between bg-[var(--primary)] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white p-0.5">
                <Image src={logibotLogo} alt="LogiBot" width={48} height={48} className="h-full w-full rounded-full object-cover" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black">LogiBot Operator</p>
                  <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold text-white/80">Realtime actions</span>
                </div>
                <p className="truncate text-xs text-white/72">{restaurantName} · {activeIntent?.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href={activeIntent?.routeHint ?? "/dashboard"} className="rounded-full p-2 text-white/78 hover:bg-white/10" title="Mở màn hiện tại">
                <Maximize2 size={17} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-white/78 hover:bg-white/10">
                <X size={17} />
              </button>
            </div>
          </header>

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
                          : "border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)]"
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
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
                      <Loader2 size={16} className="animate-spin" />
                      Agent đang đọc dữ liệu và chọn action...
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[var(--border)] bg-white p-3">
                {actions.length ? (
                  <div className="mb-3 grid gap-2 lg:hidden">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Action queue</p>
                    <div className="grid gap-2">
                      {actions.slice(0, 3).map((item) => (
                        <ActionCard key={item.id} action={item} disabled={loading} onRun={runAgentAction} />
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
                    placeholder={`Yêu cầu AI xử lý ${activeIntent?.label.toLowerCase() || "vận hành"}...`}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => void submitAssistant()}
                    disabled={loading || !message.trim()}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>

            <aside className="hidden min-h-0 overflow-y-auto bg-white p-4 lg:block">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Agent plan</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{agentPlan?.title ?? "Chưa có kế hoạch"}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {agentPlan?.summary ?? "Hỏi AI hoặc chọn quick prompt để tạo kế hoạch hành động theo dữ liệu thật của quán."}
                </p>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                  <span className="inline-flex items-center gap-2">
                    <ArrowRight size={14} />
                    {agentPlan?.focusArea ?? activeIntent?.routeHint}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={14} />
                    {agentPlan?.safetyNote ?? "Action nhạy cảm cần người dùng tự xác nhận."}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">Action queue</p>
                  {actions.length ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
                      <CheckCircle2 size={12} />
                      {actions.length} action
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2">
                  {actions.length ? (
                    actions.map((item) => <ActionCard key={item.id} action={item} disabled={loading} onRun={runAgentAction} />)
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">
                      Action sẽ xuất hiện sau khi AI xác định intent và dữ liệu cần xử lý.
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
