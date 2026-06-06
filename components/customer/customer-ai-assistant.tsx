"use client";

import Image from "next/image";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageCircle, Play, ShieldCheck } from "lucide-react";
import { AiCommandDeckPanel } from "@/components/ai/ai-command-deck-panel";
import { CopilotThinkingIndicator } from "@/components/ai/copilot-thinking-indicator";
import {
  compactLogibotAttachments,
  logibotAttachmentLabel,
  type LogibotAttachmentDraft
} from "@/components/ai/logibot-composer";
import { LogibotChatSurface, type LogibotChatMessage, type LogibotChatQuickAction } from "@/components/ai/logibot-chat-surface";
import { useCopilotResponseWatchdog } from "@/components/ai/use-copilot-response-watchdog";
import { useCopilotHistoryReplay } from "@/components/ai/use-copilot-history-replay";
import { buildAgentMission } from "@/lib/ai/agent-mission";
import { buildCommandDeck } from "@/lib/ai/command-deck";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildOperationalPassport, type AiOperationalPassport } from "@/lib/ai/operational-passport";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
import type { AiAgentAction, AiAgentMission, AiAgentPlan, AiCommandDeck } from "@/types/ai-agent";
import type { AiConversationReplayPayload } from "@/types/ai-history";
import { cn } from "@/lib/utils";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type CustomerIntent =
  | "guest_faq"
  | "menu_discovery"
  | "cart"
  | "order_status"
  | "payment"
  | "staff_call"
  | "delivery"
  | "reservation"
  | "promotion"
  | "allergy";

const customerIntentValues = [
  "guest_faq",
  "menu_discovery",
  "cart",
  "order_status",
  "payment",
  "staff_call",
  "delivery",
  "reservation",
  "promotion",
  "allergy"
] as const satisfies CustomerIntent[];

type CustomerAiResponse = {
  reply: string;
  intent?: CustomerIntent;
  intentLabel?: string;
  suggestions?: string[];
  actions?: AiAgentAction[];
  agentPlan?: AiAgentPlan;
  mission?: AiAgentMission;
  commandDeck?: AiCommandDeck | null;
  passport?: AiOperationalPassport | null;
  provider?: string;
  model?: string;
};

type CustomerWorkflowRuntimeMode = "resume" | "next" | "summary";

type CustomerWorkflowRuntimeStatus = "needs_menu" | "cart_ready" | "order_active" | "payment_pending";

type CustomerWorkflowRuntimeResult = CustomerAiResponse & {
  workflowStatus: CustomerWorkflowRuntimeStatus;
  nextActionId: string | null;
  cartItemCount: number;
  hasOrderStatus: boolean;
};

const logibotLogo = "/brand/logivn/logibot-badge.png";
const emptyAgentActions: AiAgentAction[] = [];

const subscribeToHydration = () => () => {};

function useIsHydrated() {
  return useSyncExternalStore(subscribeToHydration, () => true, () => false);
}

function isCustomerIntent(value: unknown): value is CustomerIntent {
  return typeof value === "string" && customerIntentValues.includes(value as CustomerIntent);
}

async function askCustomerAssistant(body: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  threadId?: string | null;
  message: string;
  intent?: CustomerIntent;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  context?: Record<string, unknown>;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch("/api/ai/customer-assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const result = (await response.json().catch(() => null)) as ApiResponse<CustomerAiResponse> | null;
    if (!result || !result.ok) throw new Error(result?.error || "LogiBot chưa gợi ý được món.");
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LogiBot mất hơi lâu. Bạn vẫn có thể dùng nút menu/giỏ/thanh toán trên màn hình để tiếp tục ngay.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function quantityFromLine(value: unknown) {
  const record = toRecord(value);
  const quantity = record?.quantity;
  return typeof quantity === "number" && Number.isFinite(quantity) ? Math.max(0, quantity) : 1;
}

function countCartItems(cart: unknown) {
  if (!cart) return 0;
  if (Array.isArray(cart)) return cart.reduce<number>((sum, line) => sum + quantityFromLine(line), 0);

  const record = toRecord(cart);
  if (!record) return 0;

  for (const key of ["items", "lines", "cartLines"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.reduce<number>((sum, line) => sum + quantityFromLine(line), 0);
  }

  return Object.values(record).reduce<number>((sum, line) => sum + quantityFromLine(line), 0);
}

function getOrderStatusText(orderStatus: unknown) {
  if (typeof orderStatus === "string") return orderStatus.toLowerCase();

  const order = toRecord(orderStatus);
  if (!order) return "";

  const bill = toRecord(order.bill);
  return [order.status, order.paymentStatus, order.payment_status, order.paymentMethod, order.payment_method, bill?.status]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function hasMeaningfulOrderStatus(orderStatus: unknown) {
  if (!orderStatus) return false;
  if (typeof orderStatus === "string") return orderStatus.trim().length > 0;
  const record = toRecord(orderStatus);
  return Boolean(record && Object.keys(record).length > 0);
}

function isPaymentPending(orderStatus: unknown) {
  const statusText = getOrderStatusText(orderStatus);
  if (!statusText) return false;
  if (statusText.includes("paid") && !statusText.includes("unpaid")) return false;
  return /waiting_payment|payment|checkout|unpaid|qr|cash|pending/.test(statusText);
}

function customerActionClass(action: AiAgentAction) {
  if (action.priority === "primary") {
    return "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB] shadow-[0_14px_30px_rgba(15,77,58,0.18)]";
  }

  return "border-[var(--border)] bg-white/60 text-[var(--foreground)] hover:border-[var(--primary)]/35 hover:bg-[#FFF7EB]";
}

function customerSafetyLabel(action: AiAgentAction) {
  if (action.safety === "manual_only") return "Nhờ nhân viên";
  if (action.safety === "confirm") return "Nhấn xác nhận";
  return "Một chạm";
}

function buildCustomerWorkflowRuntimeResult({
  mode,
  cart,
  orderStatus,
  reservationStatus,
  surface = "ordering"
}: {
  mode: CustomerWorkflowRuntimeMode;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  surface?: "ordering" | "reservation";
}): CustomerWorkflowRuntimeResult {
  if (surface === "reservation") {
    const reservation = toRecord(reservationStatus);
    const status = typeof reservation?.status === "string" ? reservation.status : "";
    const depositStatus = typeof reservation?.depositStatus === "string" ? reservation.depositStatus : "";
    const hasReservation = Boolean(status);
    const canCancel =
      status === "holding" ||
      (status === "confirmed" && !["paid", "waiting_confirm"].includes(depositStatus) && Number(reservation?.depositPaidAmount ?? 0) <= 0);
    const actions: AiAgentAction[] = hasReservation
      ? [
          {
            id: "customer-reservation-refresh",
            type: "ui",
            label: "Cập nhật lịch đặt",
            description: "Tải lại trạng thái cọc, xác nhận và giữ bàn.",
            uiTarget: "reservation",
            body: { action: "refresh" },
            priority: "primary",
            safety: "safe"
          },
          {
            id: "customer-reservation-new",
            type: "ui",
            label: "Đặt thêm lịch khác",
            description: "Bắt đầu một lượt đặt bàn mới.",
            uiTarget: "reservation",
            body: { action: "new" },
            priority: "secondary",
            safety: "safe"
          }
        ]
      : [
          {
            id: "customer-reservation-start",
            type: "ui",
            label: "Tiếp tục đặt bàn",
            description: "Quay về bước chọn ngày, số khách và khung giờ.",
            uiTarget: "reservation",
            body: { action: "start" },
            priority: "primary",
            safety: "safe"
          }
        ];

    if (canCancel) {
      actions.splice(1, 0, {
        id: "customer-reservation-cancel",
        type: "ui",
        label: "Huỷ lịch đặt",
        description: "Mở xác nhận huỷ. LogiBot không tự huỷ nếu bạn chưa xác nhận.",
        uiTarget: "reservation",
        body: { action: "cancel" },
        priority: "secondary",
        safety: "confirm"
      });
    }

    actions.push({
      id: "customer-reservation-call",
      type: "ui",
      label: "Gọi quán",
      description: "Dùng khi đã có cọc hoặc cần đổi giờ.",
      uiTarget: "staff_call",
      priority: "secondary",
      safety: "safe"
    });

    const nextAction = mode === "summary" ? null : actions[0] ?? null;
    const visibleActions = nextAction ? [nextAction, ...actions.filter((action) => action.id !== nextAction.id).slice(0, 3)] : actions.slice(0, 4);
    const passport = buildOperationalPassport({
      surface: "customer",
      title: "Khách · Đặt bàn",
      status: "reservation",
      goal: hasReservation ? "Theo dõi lịch đặt hiện tại." : "Tiếp tục luồng đặt bàn.",
      route: null,
      nextActionId: nextAction?.id ?? null,
      nextActionLabel: nextAction?.label ?? null,
      checkpoint: hasReservation ? `Status: ${status}${depositStatus ? `/${depositStatus}` : ""}` : "Chưa có booking",
      handoffRoute: null,
      handoffLabel: "Đặt bàn",
      confidence: hasReservation ? "high" : "medium"
    });
    const mission = buildAgentMission({
      surface: "customer",
      title: "Reservation Mission",
      outcome: hasReservation ? "Giữ khách trong đúng luồng đặt bàn hiện tại." : "Dẫn khách bắt đầu đặt bàn.",
      actions: visibleActions,
      urgency: hasReservation ? "now" : "soon",
      estimatedMinutes: hasReservation ? 2 : 4,
      operatorNote: "LogiBot không tự huỷ, cọc hoặc giữ bàn nếu khách chưa xác nhận."
    });
    return {
      reply: hasReservation
        ? nextAction
          ? `${nextAction.label} là bước an toàn nhất lúc này.`
          : "Lịch đặt đã có trạng thái rõ ràng."
        : "Bạn có thể tiếp tục chọn giờ và để lại số điện thoại để quán giữ bàn.",
      intent: "reservation",
      intentLabel: "Đặt bàn",
      actions: visibleActions,
      suggestions: actions.slice(0, 3).map((action) => action.label),
      workflowStatus: hasReservation ? "order_active" : "needs_menu",
      nextActionId: nextAction?.id ?? null,
      cartItemCount: 0,
      hasOrderStatus: hasReservation,
      mission,
      passport
    };
  }

  const cartItemCount = countCartItems(cart);
  const hasOrderStatus = hasMeaningfulOrderStatus(orderStatus);
  const paymentPending = isPaymentPending(orderStatus);
  const actions: AiAgentAction[] = [];

  if (paymentPending) {
    actions.push({
      id: "customer-runtime-mark-paid",
      type: "ui",
      label: "Tôi đã thanh toán",
      description: "Gửi trạng thái chờ quán xác nhận, không tự chốt thanh toán.",
      uiTarget: "payment",
      body: { action: "mark_paid" },
      priority: "primary",
      safety: "confirm"
    });
  }

  if (cartItemCount > 0) {
    actions.push({
      id: "customer-runtime-cart",
      type: "ui",
      label: `Mở giỏ hàng (${cartItemCount} món)`,
      description: "Kiểm tra món đã chọn, ghi chú và bước thanh toán.",
      uiTarget: "cart",
      priority: paymentPending ? "secondary" : "primary",
      safety: "safe"
    });
  }

  if (hasOrderStatus) {
    actions.push({
      id: "customer-runtime-orders",
      type: "ui",
      label: "Kiểm tra đơn",
      description: "Xem trạng thái đơn gần nhất và hướng dẫn tiếp theo.",
      uiTarget: "orders",
      priority: cartItemCount > 0 || paymentPending ? "secondary" : "primary",
      safety: "safe"
    });
  }

  actions.push(
    {
      id: "customer-runtime-menu",
      type: "ui",
      label: cartItemCount > 0 ? "Chọn thêm món" : "Xem menu",
      description: "Quay lại menu để chọn món hoặc combo phù hợp.",
      uiTarget: "menu",
      priority: cartItemCount > 0 || hasOrderStatus ? "secondary" : "primary",
      safety: "safe"
    },
    {
      id: "customer-runtime-staff",
      type: "ui",
      label: "Gọi nhân viên",
      description: "Dùng khi cần hỗ trợ trực tiếp tại bàn hoặc qua hotline.",
      uiTarget: "staff_call",
      priority: "secondary",
      safety: "safe"
    }
  );

  const workflowStatus: CustomerWorkflowRuntimeStatus = paymentPending
    ? "payment_pending"
    : cartItemCount > 0
      ? "cart_ready"
      : hasOrderStatus
        ? "order_active"
        : "needs_menu";
  const nextAction = mode === "summary" ? null : actions[0] ?? null;
  const reply =
    mode === "summary"
      ? cartItemCount > 0
        ? `Giỏ hàng hiện có ${cartItemCount} món.`
        : hasOrderStatus
          ? "Khách đang có đơn cần theo dõi."
          : "Khách chưa có món trong giỏ, nên bắt đầu từ menu."
      : nextAction
        ? `${nextAction.label} là bước tiếp theo hợp lý.`
        : "Mình chưa thấy bước nào cần thao tác ngay.";
  const passport = buildOperationalPassport({
    surface: "customer",
    title: "Khách · Gọi món",
    status: workflowStatus,
    goal:
      workflowStatus === "payment_pending"
        ? "Đang chờ thanh toán hoặc xác nhận."
        : workflowStatus === "cart_ready"
          ? `Giỏ đang có ${cartItemCount} món.`
          : hasOrderStatus
            ? "Đang theo dõi đơn gần nhất."
            : "Đang khám phá menu thật.",
    route: null,
    nextActionId: nextAction?.id ?? null,
    nextActionLabel: nextAction?.label ?? null,
    checkpoint: mode === "summary" ? reply : null,
    handoffRoute: null,
    handoffLabel: nextAction?.label ?? "Mở menu",
    confidence: paymentPending || cartItemCount > 0 ? "high" : "medium"
  });
  const visibleActions = nextAction ? [nextAction, ...actions.filter((action) => action.id !== nextAction.id).slice(0, 3)] : actions.slice(0, 4);
  const mission = buildAgentMission({
    surface: "customer",
    title: "Ordering Mission",
    outcome: reply,
    actions: visibleActions,
    urgency: paymentPending || cartItemCount > 0 ? "now" : "soon",
    estimatedMinutes: paymentPending ? 2 : cartItemCount > 0 ? 3 : 5,
    operatorNote: "LogiBot chỉ mở đúng thao tác; khách tự thêm món, gửi đơn và xác nhận thanh toán."
  });

  return {
    reply,
    intent: paymentPending ? "payment" : cartItemCount > 0 ? "cart" : hasOrderStatus ? "order_status" : "menu_discovery",
    intentLabel: "Luồng gọi món",
    actions: visibleActions,
    suggestions: actions.slice(0, 3).map((action) => action.label),
    workflowStatus,
    nextActionId: nextAction?.id ?? null,
    cartItemCount,
    hasOrderStatus,
    mission,
    passport
  };
}

function CustomerToolResult({
  status,
  result,
  onAction
}: {
  status?: string;
  result?: CustomerAiResponse | string;
  onAction?: (action: AiAgentAction) => void;
}) {
  const isLoading = status === "executing" || status === "inProgress";
  const data = typeof result === "string" ? null : result;
  const text = typeof result === "string" ? result : data?.reply || "Mình đã chuẩn bị gợi ý phù hợp.";
  const actions = data?.actions ?? emptyAgentActions;
  const visibleActions = useMemo(() => actions.slice(0, 4), [actions]);
  const agentPlan = data?.agentPlan ?? null;
  const mission = data?.mission ?? null;
  const commandDeck =
    data?.commandDeck ??
    (mission
      ? buildCommandDeck({
          surface: "customer",
          title: mission.title,
          headline: text,
          actions,
          mission,
          passport: data?.passport ?? null,
          confidence: agentPlan?.confidence ?? data?.passport?.confidence ?? "medium"
        })
      : null);
  const shouldShowAnswerBrief = !isLoading && Boolean(text.trim());
  const contextLabel = data?.intent === "reservation" ? "Theo trạng thái lịch đặt" : "Gợi ý theo dữ liệu quán";
  const [confirmationActionId, setConfirmationActionId] = useState<string | null>(null);

  function handleAction(action: AiAgentAction) {
    if ((action.safety === "confirm" || action.safety === "manual_only") && confirmationActionId !== action.id) {
      setConfirmationActionId(action.id);
      return;
    }

    setConfirmationActionId(null);
    onAction?.(action);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="logibot-agent-card rounded-[28px] border border-[var(--border)] p-4 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)]"
    >
      <div className="relative z-[1] flex items-center gap-3">
        <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[#D8E3DC] bg-[#FFF7EB]">
          <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-semibold">{data?.intentLabel || "LogiBot phục vụ"}</p>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(15,77,58,0.12)] bg-white/55 px-2 py-1 text-[10px] font-bold text-[var(--primary)]">
              <span className="logibot-live-dot" />
              {isLoading ? "Đang chọn" : "Sẵn sàng"}
            </span>
          </div>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{isLoading ? "Đang đọc dữ liệu thật..." : contextLabel}</p>
        </div>
      </div>
      {isLoading ? (
        <div className="relative z-[1] mt-4 space-y-2">
          <div className="h-3 w-11/12 rounded-full bg-[rgba(15,77,58,0.12)] logibot-skeleton" />
          <div className="h-3 w-7/12 rounded-full bg-[rgba(15,77,58,0.1)] logibot-skeleton" />
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
            <span className="logibot-typing-bars" />
            Đang đọc menu, giỏ hàng và chuẩn bị câu trả lời chính...
          </div>
        </div>
      ) : shouldShowAnswerBrief ? (
        <div className="logibot-answer-brief relative z-[1] mt-3">
          <span>Trả lời chính</span>
          <p className="logibot-card-brief whitespace-pre-line leading-6 text-[var(--text-secondary)]">{text}</p>
        </div>
      ) : null}
      {!isLoading && visibleActions.length ? (
        <div className="relative z-[1] mt-3">
          <AiCommandDeckPanel deck={commandDeck} compact />
        </div>
      ) : null}
      {visibleActions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {visibleActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleAction(action)}
              className={`logibot-action-tile rounded-2xl border px-3 py-3 text-left transition hover:-translate-y-0.5 active:scale-[0.99] ${customerActionClass(action)}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgba(255,255,255,0.18)] text-[10px] font-black">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Play size={14} />
                  {action.label}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(255,255,255,0.16)] px-2 py-1 text-[10px] font-bold">
                  <ShieldCheck size={11} />
                  {customerSafetyLabel(action)}
                </span>
              </span>
              {action.description ? <span className={`mt-1 block text-xs leading-5 ${action.priority === "primary" ? "text-[#FFF7EB]/80" : "text-[var(--muted-foreground)]"}`}>{action.description}</span> : null}
              {confirmationActionId === action.id ? (
                <span className={`mt-2 block rounded-xl px-3 py-2 text-xs font-semibold ${action.priority === "primary" ? "bg-white/15 text-[#FFF7EB]" : "bg-[var(--soft-surface)] text-[var(--foreground)]"}`}>
                  Nhấn lại để xác nhận action này.
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

const CustomerLogibotToggle = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function CustomerLogibotToggle(
  { onClick, disabled, className: customClassName, style, ...buttonProps },
  ref
) {
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
      className={`customer-logibot-toggle fixed bottom-[calc(6.9rem+env(safe-area-inset-bottom))] z-[var(--z-customer-ai)] flex h-12 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 pr-2.5 text-xs font-bold text-[var(--primary)] shadow-[0_14px_34px_rgba(15,77,58,0.18)] transition active:scale-95 ${customClassName ?? ""}`}
      style={{ right: "max(0.875rem, calc((100vw - 430px) / 2 + 0.875rem))", ...style }}
      aria-label={isOpen ? "Đóng LogiBot" : "Mở LogiBot"}
      aria-pressed={isOpen}
      {...buttonProps}
    >
      <span className="relative h-9 w-9 overflow-hidden rounded-full bg-[#FFF7EB]">
        <Image src={logibotLogo} alt="LogiBot" fill sizes="36px" className="object-cover" priority />
      </span>
      <span className="customer-logibot-label">{isOpen ? "Đóng" : "LogiBot"}</span>
    </button>
  );
});

function CustomerAiAssistantExperience({
  restaurantSlug,
  customerSessionId,
  threadId,
  cart,
  orderStatus,
  reservationStatus,
  surface = "ordering",
  onAgentAction
}: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  threadId: string;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  surface?: "ordering" | "reservation";
  onAgentAction?: (action: AiAgentAction) => void;
}) {
  const pathname = usePathname();
  const historyUrl = useMemo(() => {
    if (!customerSessionId) return null;
    const params = new URLSearchParams({
      restaurantSlug,
      customerSessionId,
      threadId,
      limit: "10"
    });
    return `/api/ai/customer-history?${params.toString()}`;
  }, [customerSessionId, restaurantSlug, threadId]);

  useEffect(() => {
    document.body.classList.add("customer-logibot-surface");
    return () => document.body.classList.remove("customer-logibot-surface");
  }, []);

  useCopilotHistoryReplay({
    threadId,
    historyUrl,
    enabled: Boolean(customerSessionId)
  });

  const customerWorkflowRuntime = useMemo(
    () => buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus, reservationStatus, surface }),
    [cart, orderStatus, reservationStatus, surface]
  );
  const customerPassport = useMemo(
    () =>
      buildOperationalPassport({
        surface: "customer",
        title: surface === "reservation" ? "Khách · Đặt bàn" : "Khách · Gọi món",
        status: customerWorkflowRuntime.workflowStatus,
        goal:
          surface === "reservation"
            ? customerWorkflowRuntime.hasOrderStatus
              ? "Đang theo dõi lịch đặt hiện tại."
              : "Đang hoàn tất luồng đặt bàn."
            : customerWorkflowRuntime.cartItemCount > 0
              ? `Giỏ đang có ${customerWorkflowRuntime.cartItemCount} món.`
              : customerWorkflowRuntime.hasOrderStatus
                ? "Đang theo dõi đơn gần nhất."
                : "Đang khám phá menu thật.",
        route: pathname,
        nextActionId: customerWorkflowRuntime.nextActionId,
        nextActionLabel:
          customerWorkflowRuntime.actions?.find((action) => action.id === customerWorkflowRuntime.nextActionId)?.label ??
          customerWorkflowRuntime.actions?.[0]?.label ??
          null,
        checkpoint: customerWorkflowRuntime.reply,
        handoffRoute: pathname,
        handoffLabel: surface === "reservation" ? "Tiếp tục đặt bàn" : "Tiếp tục gọi món",
        confidence: customerWorkflowRuntime.workflowStatus === "payment_pending" ? "high" : customerWorkflowRuntime.cartItemCount > 0 ? "high" : "medium"
      }),
    [customerWorkflowRuntime.actions, customerWorkflowRuntime.cartItemCount, customerWorkflowRuntime.hasOrderStatus, customerWorkflowRuntime.nextActionId, customerWorkflowRuntime.reply, customerWorkflowRuntime.workflowStatus, pathname, surface]
  );

  function runAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }
    onAgentAction?.(action);
  }

  const handleCopilotFallback = useCallback(
    async (lastUserMessage: string) => {
      try {
        const result = await askCustomerAssistant({
          restaurantSlug,
          customerSessionId,
          threadId,
          message: lastUserMessage,
          cart,
          orderStatus,
          reservationStatus,
          context: {
            currentPath: pathname,
            operationalPassport: customerPassport,
            surface: surface === "reservation" ? "customer_reservation" : "customer_ordering",
            source: "copilotkit_watchdog_followup"
          }
        });
        return result.reply;
      } catch {
        return surface === "reservation"
          ? "Mình vẫn ở đây. Nếu bạn hỏi tiếp về đặt bàn, mình có thể hướng dẫn đổi giờ, cọc, giữ bàn hoặc gọi quán ngay."
          : "Mình vẫn ở đây. Nếu bạn hỏi tiếp về món, giỏ hàng hoặc thanh toán, mình sẽ dựa trên menu và trạng thái hiện tại để hướng dẫn bước tiếp theo.";
      }
    },
    [cart, customerPassport, customerSessionId, orderStatus, pathname, reservationStatus, restaurantSlug, surface, threadId]
  );

  useCopilotResponseWatchdog({
    timeoutMs: 9_500,
    fallbackText:
      surface === "reservation"
        ? "LogiBot chưa nhận được phản hồi đầy đủ, nhưng bạn vẫn có thể tiếp tục bằng các nút đặt bàn an toàn trên màn hình."
        : "LogiBot chưa nhận được phản hồi đầy đủ, nhưng bạn vẫn có thể tiếp tục ngay bằng các nút an toàn trên màn hình: xem menu, mở giỏ, kiểm tra đơn hoặc gọi nhân viên.",
    onFallback: handleCopilotFallback
  });

  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("customer") }, []);
  useCopilotReadable(
    {
      description: surface === "reservation" ? "Context đặt bàn của khách: slug quán, phiên khách và trạng thái lịch đặt nếu có." : "Context gọi món của khách: slug quán, phiên khách, giỏ hàng hiện tại và trạng thái đơn gần nhất.",
      value: {
        surface: surface === "reservation" ? "customer_reservation" : "customer_ordering",
        restaurantSlug,
        customerSessionId,
        cart,
        orderStatus,
        reservationStatus,
        operationalPassport: customerPassport,
        workflowRuntime: {
          status: customerWorkflowRuntime.workflowStatus,
          nextActionId: customerWorkflowRuntime.nextActionId,
          cartItemCount: customerWorkflowRuntime.cartItemCount,
          hasOrderStatus: customerWorkflowRuntime.hasOrderStatus
        },
        rules:
          surface === "reservation"
            ? [
                "Trả lời về đặt bàn, giữ chỗ, cọc, đến muộn, đổi/hủy lịch.",
                "Không tự xác nhận cọc hoặc tự huỷ lịch nếu khách chưa bấm xác nhận.",
                "Nếu lịch có cọc hoặc đang chờ xác nhận cọc, hướng khách gọi quán."
              ]
            : [
                "Trả lời câu hỏi thường ngày của khách như giờ mở cửa, địa chỉ, hotline, wifi, gửi xe bằng giọng tự nhiên trước.",
                "Không ép nút thêm món/thanh toán khi khách chỉ hỏi thông tin chung.",
                "Gợi ý món phải dựa trên menu thật từ tool ask_customer_waiter.",
                "Khi gợi ý món, ưu tiên trả nút thêm giỏ hàng/chọn món khác/thanh toán/gọi nhân viên.",
                "Không tự xác nhận đã thanh toán."
              ]
      }
    },
    [customerPassport, restaurantSlug, customerSessionId, cart, orderStatus, reservationStatus, customerWorkflowRuntime, surface]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions:
        surface === "reservation"
          ? [
              { title: "01 Tiếp tục", message: "Hướng dẫn bước tiếp theo trong đặt bàn và đưa nút thao tác phù hợp." },
              { title: "02 Cọc", message: "Lịch đặt này có cần cọc không và tôi cần làm gì ngay?" },
              { title: "03 Đến muộn", message: "Nếu tôi đến muộn thì bàn được giữ bao lâu và nên gọi quán khi nào?" },
              { title: "04 Đổi giờ", message: "Tôi muốn đổi giờ hoặc hủy lịch thì làm thế nào an toàn?" },
              { title: "05 Gọi quán", message: "Mở cách liên hệ quán nếu cần hỗ trợ đặt bàn." }
            ]
          : [
              { title: "01 Giờ mở cửa", message: "Quán hôm nay mấy giờ mở cửa và còn mở không?" },
              { title: "02 Địa chỉ", message: "Địa chỉ quán ở đâu và có hotline không?" },
              { title: "03 Wifi/gửi xe", message: "Quán có wifi hoặc chỗ gửi xe không?" },
              { title: "04 Gợi ý món", message: "Gợi ý món dễ gọi từ menu thật và đưa nút thêm vào giỏ." },
              { title: "05 Thanh toán", message: "Kiểm tra đơn hiện tại và mở bước thanh toán phù hợp." }
            ]
    },
    [restaurantSlug, surface]
  );

  useCopilotAction(
    {
      name: "continue_customer_ordering",
      followUp: false,
      description:
        "Tiếp tục luồng khách hàng bằng runtime deterministic dựa trên giỏ hàng và trạng thái đơn. Dùng khi khách hỏi tiếp theo làm gì, mở giỏ, xem đơn hoặc thanh toán.",
      parameters: [
        {
          name: "mode",
          type: "string",
          required: false,
          enum: ["resume", "next", "summary"],
          description: "resume để khôi phục ngữ cảnh, next để lấy bước tiếp theo, summary để tóm tắt."
        }
      ],
      handler: async ({ mode }) =>
        buildCustomerWorkflowRuntimeResult({
          mode: mode === "summary" || mode === "next" ? mode : "resume",
          cart,
          orderStatus,
          reservationStatus,
          surface
        }),
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerWorkflowRuntimeResult} onAction={runAction} />
    },
    [cart, orderStatus, reservationStatus, surface]
  );

  useCopilotAction(
    {
      name: "answer_customer_request",
      followUp: false,
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do của khách. Nhận nguyên câu hỏi, backend tự suy luận intent, trả lời tự nhiên các FAQ thường ngày, đọc menu/giỏ/đơn thật khi cần và chỉ trả CTA khi hữu ích.",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          description: "Nguyên văn câu hỏi/yêu cầu của khách."
        },
        {
          name: "intent",
          type: "string",
          required: false,
          enum: [...customerIntentValues],
          description: "Intent nếu đã chắc chắn; nếu không chắc hãy bỏ trống để backend tự suy luận."
        }
      ],
      handler: async ({ message, intent }) => {
        try {
          return await askCustomerAssistant({
            restaurantSlug,
            customerSessionId,
            threadId,
            message: String(message || "Hướng dẫn tôi bước tiếp theo."),
            intent: isCustomerIntent(intent) ? intent : undefined,
            cart,
            orderStatus,
            reservationStatus,
            context: {
              currentPath: pathname,
              operationalPassport: customerPassport,
              surface: surface === "reservation" ? "customer_reservation" : "customer_ordering"
            }
          });
        } catch {
          return {
            ...buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus, reservationStatus, surface }),
            reply: "Mình chưa nhận được phản hồi đầy đủ, nhưng đã chuẩn bị nút thao tác an toàn để bạn tiếp tục."
          };
        }
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerAiResponse} onAction={runAction} />
    },
    [restaurantSlug, customerSessionId, threadId, cart, orderStatus, reservationStatus, surface, pathname, customerPassport]
  );

  useCopilotAction(
    {
      name: "ask_customer_waiter",
      followUp: false,
      description: "Đọc menu thật, giỏ hàng và trạng thái đơn để gợi ý món, combo, khuyến mãi hoặc bước thanh toán tiếp theo. Không dùng cho câu hỏi FAQ đời thường nếu answer_customer_request phù hợp hơn.",
      parameters: [
        {
          name: "intent",
          type: "string",
          required: true,
          enum: [...customerIntentValues],
          description: "Nghiệp vụ khách đang cần."
        },
        {
          name: "question",
          type: "string",
          required: true,
          description: "Câu hỏi ngắn của khách."
        }
      ],
      handler: async ({ intent, question }) => {
        try {
          return await askCustomerAssistant({
            restaurantSlug,
            customerSessionId,
            threadId,
            message: String(question || "Gợi ý món phù hợp."),
            intent: intent as CustomerIntent,
            cart,
            orderStatus,
            reservationStatus,
            context: {
              currentPath: pathname,
              operationalPassport: customerPassport,
              surface: surface === "reservation" ? "customer_reservation" : "customer_ordering"
            }
          });
        } catch {
          return {
            ...buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus, reservationStatus, surface }),
            reply: "Mình chưa đọc được menu lúc này, nhưng đã chuẩn bị bước thao tác an toàn để bạn tiếp tục."
          };
        }
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerAiResponse} onAction={runAction} />
    },
    [restaurantSlug, customerSessionId, threadId, cart, orderStatus, reservationStatus, surface, pathname, customerPassport]
  );

  useCopilotAction(
    {
      name: "open_customer_cart",
      followUp: false,
      description: "Mở giỏ hàng của khách để kiểm tra món hoặc thanh toán.",
      handler: async () => {
        const action: AiAgentAction = {
          id: "open-customer-cart",
          type: "ui",
          label: "Mở giỏ hàng",
          uiTarget: "cart",
          priority: "primary",
          safety: "safe"
        };
        onAgentAction?.(action);
        return "Đã mở giỏ hàng.";
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={String(result || "Đã mở giỏ hàng.")} />
    },
    [onAgentAction]
  );

  useCopilotAction(
    {
      name: "call_staff_from_table",
      followUp: false,
      description: "Gọi nhân viên hỗ trợ tại bàn. Chỉ dùng khi khách yêu cầu.",
      handler: async () => {
        const action: AiAgentAction = {
          id: "customer-call-staff",
          type: "ui",
          label: "Gọi nhân viên",
          uiTarget: "staff_call",
          priority: "primary",
          safety: "safe"
        };
        onAgentAction?.(action);
        return "Đã gửi yêu cầu gọi nhân viên.";
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={String(result || "Đã gọi nhân viên.")} />
    },
    [onAgentAction]
  );

  useCopilotAction(
    {
      name: "mark_customer_paid",
      followUp: false,
      description: "Khi khách nói đã chuyển khoản, chuyển màn hình sang trạng thái đã thanh toán để hệ thống chờ quán xác nhận.",
      handler: async () => {
        const action: AiAgentAction = {
          id: "customer-mark-paid",
          type: "ui",
          label: "Tôi đã thanh toán",
          uiTarget: "payment",
          body: { action: "mark_paid" },
          priority: "primary",
          safety: "confirm"
        };
        onAgentAction?.(action);
        return "Đã chuyển sang chờ quán xác nhận thanh toán.";
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={String(result || "Đã gửi xác nhận thanh toán.")} />
    },
    [onAgentAction]
  );

  return (
    <>
      <CopilotSidebar
        defaultOpen={false}
        width="min(420px, 100vw)"
        toggleButton={CustomerLogibotToggle}
        labels={{
          modalHeaderTitle: surface === "reservation" ? "LogiBot đặt bàn" : "LogiBot gọi món",
          welcomeMessageText:
            surface === "reservation"
              ? "Mình có thể giải thích cọc, giữ bàn, đến muộn, đổi/hủy lịch và mở đúng nút an toàn cho bạn."
              : "Mình đọc menu thật của quán để gợi ý món, tạo combo, thêm vào giỏ, gọi nhân viên và mở thanh toán đúng bước.",
          chatInputPlaceholder: surface === "reservation" ? "VD: tôi đến muộn, đổi giờ, có cần cọc không..." : "VD: combo 3 người dưới 300k, món ít cay, mở giỏ...",
          chatDisclaimerText:
            surface === "reservation"
              ? "LogiBot không tự xác nhận cọc hoặc tự hủy lịch nếu bạn chưa bấm xác nhận."
              : "LogiBot không xác nhận thanh toán thay quán; giao dịch vẫn được nhân viên/hệ thống xác nhận.",
          chatToggleOpenLabel: "Mở LogiBot",
          chatToggleCloseLabel: "Đóng LogiBot"
        }}
      />
      <CopilotThinkingIndicator surface="customer" />
    </>
  );
}

function makeCustomerChatId(role: "assistant" | "user") {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function compactCustomerAttachmentContext(attachments: LogibotAttachmentDraft[]) {
  return compactLogibotAttachments(attachments).map((attachment) => ({
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    textPreview: attachment.textPreview?.slice(0, 1200)
  }));
}

function buildCustomerAttachmentPrompt(attachments: LogibotAttachmentDraft[]) {
  if (!attachments.length) return "";
  const attachmentContext = compactCustomerAttachmentContext(attachments);
  const textPreview = attachmentContext
    .map((attachment) => attachment.textPreview?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .slice(0, 900);
  const names = attachmentContext.map((attachment) => attachment.name).join(", ");
  return textPreview ? `\n\nFile khách gửi: ${names}\nTrích nội dung: ${textPreview}` : `\n\nFile khách gửi: ${names}`;
}

function mapCustomerHistory(history: AiConversationReplayPayload): LogibotChatMessage[] {
  return history.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message, index) => ({
      id: `history-${message.createdAt}-${index}`,
      role: message.role,
      content: message.content
    }));
}

function resultFromHistory(history: AiConversationReplayPayload): CustomerAiResponse | null {
  const workflow = history.workflow;
  if (!workflow) return null;
  const lastAssistant = [...history.messages].reverse().find((message) => message.role === "assistant");

  return {
    reply: lastAssistant?.content ?? "",
    intent: isCustomerIntent(workflow.intent) ? workflow.intent : undefined,
    intentLabel: workflow.intentLabel ?? undefined,
    suggestions: workflow.suggestions,
    actions: workflow.actions,
    agentPlan: workflow.agentPlan ?? undefined,
    mission: workflow.mission ?? undefined,
    commandDeck: workflow.commandDeck ?? undefined,
    passport: workflow.passport ?? undefined
  };
}

function customerQuickActions(surface: "ordering" | "reservation"): LogibotChatQuickAction[] {
  if (surface === "reservation") {
    return [
      { label: "Đổi giờ", prompt: "Tôi muốn đổi giờ đặt bàn, hướng dẫn bước an toàn nhất." },
      { label: "Cần cọc không?", prompt: "Lịch đặt này có cần cọc không và tôi cần làm gì?" },
      { label: "Đến muộn", prompt: "Nếu tôi đến muộn thì bàn được giữ bao lâu?" },
      { label: "Gọi quán", prompt: "Mở cách liên hệ quán để hỗ trợ đặt bàn." }
    ];
  }

  return [
    { label: "Gợi ý món", prompt: "Gợi ý món dễ gọi từ menu thật của quán." },
    { label: "Mở giỏ", prompt: "Kiểm tra giỏ hàng hiện tại và mở bước phù hợp." },
    { label: "Gọi nhân viên", prompt: "Tôi cần gọi nhân viên hỗ trợ." },
    { label: "Thanh toán", prompt: "Kiểm tra đơn hiện tại và hướng dẫn thanh toán." }
  ];
}

function CustomerLogibotLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="customer-logibot-launcher fixed bottom-[calc(5.85rem+env(safe-area-inset-bottom))] z-[var(--z-customer-ai)] inline-flex h-[52px] min-h-[52px] items-center gap-2 rounded-full border border-[#111827]/[0.07] bg-[#FFFEFA]/92 px-2.5 pr-4 text-[13px] font-bold text-[#111827] shadow-[0_18px_44px_rgba(17,24,39,0.14)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-[#0F5132]/25 hover:bg-white active:scale-[0.98]"
      style={{ right: "max(0.875rem, calc((100vw - 430px) / 2 + 0.875rem))" }}
      aria-label="Mở LogiBot"
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#0F5132]/10 bg-[#F8F7F4]">
        <Image src={logibotLogo} alt="" fill sizes="36px" className="object-cover" priority />
      </span>
      <span className="customer-logibot-label">Hỏi LogiBot</span>
      <MessageCircle size={16} className="customer-logibot-mobile-icon" aria-hidden="true" />
    </button>
  );
}

function CustomerLogibotChatbox({
  restaurantSlug,
  customerSessionId,
  threadId,
  cart,
  orderStatus,
  reservationStatus,
  surface = "ordering",
  onAgentAction
}: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  threadId: string;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  surface?: "ordering" | "reservation";
  onAgentAction?: (action: AiAgentAction) => void;
}) {
  const pathname = usePathname();
  const historyLoadedRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<LogibotChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [latestResult, setLatestResult] = useState<CustomerAiResponse | null>(null);

  const historyUrl = useMemo(() => {
    if (!customerSessionId) return null;
    const params = new URLSearchParams({
      restaurantSlug,
      customerSessionId,
      threadId,
      limit: "10"
    });
    return `/api/ai/customer-history?${params.toString()}`;
  }, [customerSessionId, restaurantSlug, threadId]);

  useEffect(() => {
    document.body.classList.add("customer-logibot-surface");
    return () => {
      document.body.classList.remove("customer-logibot-surface");
      document.body.classList.remove("customer-logibot-open");
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("customer-logibot-open", isOpen);
    return () => document.body.classList.remove("customer-logibot-open");
  }, [isOpen]);

  useEffect(() => {
    if (!historyUrl || historyLoadedRef.current === threadId) return;
    const resolvedHistoryUrl = historyUrl;
    let cancelled = false;

    async function loadHistory() {
      try {
        const response = await fetch(resolvedHistoryUrl, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<AiConversationReplayPayload> | null;
        if (!payload?.ok || cancelled) return;
        const recoveredMessages = mapCustomerHistory(payload.data);
        if (recoveredMessages.length > 0) setMessages((current) => (current.length > 0 ? current : recoveredMessages));
        const recoveredResult = resultFromHistory(payload.data);
        if (recoveredResult) setLatestResult(recoveredResult);
        historyLoadedRef.current = threadId;
      } catch {
        historyLoadedRef.current = threadId;
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyUrl, threadId]);

  const customerWorkflowRuntime = useMemo(
    () => buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus, reservationStatus, surface }),
    [cart, orderStatus, reservationStatus, surface]
  );
  const customerPassport = useMemo(
    () =>
      buildOperationalPassport({
        surface: "customer",
        title: surface === "reservation" ? "Khách · Đặt bàn" : "Khách · Gọi món",
        status: customerWorkflowRuntime.workflowStatus,
        goal:
          surface === "reservation"
            ? customerWorkflowRuntime.hasOrderStatus
              ? "Đang theo dõi lịch đặt hiện tại."
              : "Đang hoàn tất luồng đặt bàn."
            : customerWorkflowRuntime.cartItemCount > 0
              ? `Giỏ đang có ${customerWorkflowRuntime.cartItemCount} món.`
              : customerWorkflowRuntime.hasOrderStatus
                ? "Đang theo dõi đơn gần nhất."
                : "Đang khám phá menu thật.",
        route: pathname,
        nextActionId: customerWorkflowRuntime.nextActionId,
        nextActionLabel:
          customerWorkflowRuntime.actions?.find((action) => action.id === customerWorkflowRuntime.nextActionId)?.label ??
          customerWorkflowRuntime.actions?.[0]?.label ??
          null,
        checkpoint: customerWorkflowRuntime.reply,
        handoffRoute: pathname,
        handoffLabel: surface === "reservation" ? "Tiếp tục đặt bàn" : "Tiếp tục gọi món",
        confidence: customerWorkflowRuntime.workflowStatus === "payment_pending" ? "high" : customerWorkflowRuntime.cartItemCount > 0 ? "high" : "medium"
      }),
    [customerWorkflowRuntime.actions, customerWorkflowRuntime.cartItemCount, customerWorkflowRuntime.hasOrderStatus, customerWorkflowRuntime.nextActionId, customerWorkflowRuntime.reply, customerWorkflowRuntime.workflowStatus, pathname, surface]
  );

  async function sendMessage(message: string, attachments: LogibotAttachmentDraft[] = []) {
    if (isSending) return;

    const trimmed = message.trim();
    const attachmentLabel = logibotAttachmentLabel(attachments);
    const prompt = `${trimmed || "Hỗ trợ tôi bước tiếp theo."}${buildCustomerAttachmentPrompt(attachments)}`.slice(0, 1500);

    setMessages((current) => [
      ...current,
      {
        id: makeCustomerChatId("user"),
        role: "user",
        content: trimmed || "Đọc file đính kèm và hỗ trợ tôi bước tiếp theo.",
        attachmentLabel: attachmentLabel || undefined
      }
    ]);
    setDraft("");
    setIsSending(true);

    try {
      const result = await askCustomerAssistant({
        restaurantSlug,
        customerSessionId,
        threadId,
        message: prompt,
        cart,
        orderStatus,
        reservationStatus,
        context: {
          currentPath: pathname,
          operationalPassport: customerPassport,
          surface: surface === "reservation" ? "customer_reservation" : "customer_ordering",
          attachments: compactCustomerAttachmentContext(attachments)
        }
      });
      setLatestResult(result);
      setMessages((current) => [
        ...current,
        {
          id: makeCustomerChatId("assistant"),
          role: "assistant",
          content: result.reply,
          result
        }
      ]);
    } catch (error) {
      const fallback = buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus, reservationStatus, surface });
      const content = error instanceof Error ? error.message : fallback.reply;
      setLatestResult(fallback);
      setMessages((current) => [
        ...current,
        {
          id: makeCustomerChatId("assistant"),
          role: "assistant",
          content,
          result: fallback
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function runAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return "Đang mở liên kết.";
    }

    onAgentAction?.(action);
    setIsOpen(false);

    if (action.uiTarget === "cart") return "Đã mở giỏ hàng.";
    if (action.uiTarget === "menu") return "Đã quay về menu.";
    if (action.uiTarget === "payment") return "Đã mở bước thanh toán.";
    if (action.uiTarget === "staff_call") return "Đã gửi yêu cầu hỗ trợ.";
    if (action.uiTarget === "reservation") return "Đã mở bước đặt bàn phù hợp.";
    return "Đã mở thao tác phù hợp.";
  }

  const quickActions = useMemo(() => customerQuickActions(surface), [surface]);
  const activeActionCount = latestResult?.actions?.length ?? customerWorkflowRuntime.actions?.length ?? 0;

  return (
    <>
      {!isOpen ? <CustomerLogibotLauncher onOpen={() => setIsOpen(true)} /> : null}
      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Đóng LogiBot"
              className="fixed inset-0 z-[1324] bg-[#111827]/10 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="LogiBot"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "fixed z-[1325] overflow-hidden rounded-[28px] border border-[#111827]/[0.08] bg-white/64 p-1.5 shadow-[0_28px_90px_rgba(17,24,39,0.22)] backdrop-blur-2xl",
                "inset-x-2 bottom-2 mx-auto max-w-[430px]",
                isExpanded
                  ? "top-2 h-auto"
                  : "h-[min(82dvh,calc(var(--logibot-visual-height,100dvh)-1rem))] sm:h-[min(720px,calc(100dvh-2rem))]",
                "sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[min(430px,calc(100vw-2rem))]",
                isExpanded ? "sm:top-4" : "sm:top-auto"
              )}
            >
              <LogibotChatSurface
                title="LogiBot"
                subtitle={surface === "reservation" ? "Trợ lý đặt bàn" : "Trợ lý gọi món"}
                eyebrow="AI phục vụ"
                statusText={isSending ? "Đang trả lời" : "Sẵn sàng"}
                emptyTitle={surface === "reservation" ? "Bạn cần hỗ trợ đặt bàn?" : "Bạn muốn hỏi gì về quán?"}
                emptyDescription={
                  surface === "reservation"
                    ? "Hỏi về giờ giữ bàn, cọc, đổi lịch hoặc gọi quán. LogiBot chỉ dùng dữ liệu thật khi bạn gửi yêu cầu."
                    : "Hỏi món, giỏ hàng, thanh toán hoặc gọi nhân viên. LogiBot không hiển thị dữ liệu thừa trước khi bạn hỏi."
                }
                composerPlaceholder={surface === "reservation" ? "Hỏi về đặt bàn, cọc, đổi giờ..." : "Hỏi món, giỏ hàng, thanh toán..."}
                composerDisclaimer={null}
                variant="drawer"
                className="h-full rounded-[24px]"
                messages={messages}
                draft={draft}
                isSending={isSending}
                quickActions={quickActions}
                workflowStatus={latestResult?.intentLabel ?? (surface === "reservation" ? "Đặt bàn" : "Gọi món")}
                workflowSummary={latestResult?.agentPlan?.summary ?? null}
                activeActionCount={Math.min(activeActionCount, 3)}
                isExpanded={isExpanded}
                canExpand
                canClose
                onDraftChange={setDraft}
                onSend={sendMessage}
                onAction={runAction}
                onNewChat={() => {
                  setMessages([]);
                  setLatestResult(null);
                  setDraft("");
                }}
                onClose={() => setIsOpen(false)}
                onToggleExpand={() => setIsExpanded((current) => !current)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function CustomerAiAssistant(props: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  surface?: "ordering" | "reservation";
  onAgentAction?: (action: AiAgentAction) => void;
}) {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;

  const threadId = buildCopilotThreadId("logivn", props.surface === "reservation" ? "reservation" : "customer", props.restaurantSlug, props.customerSessionId || "guest");

  return (
    <CustomerLogibotChatbox {...props} threadId={threadId} />
  );
}
