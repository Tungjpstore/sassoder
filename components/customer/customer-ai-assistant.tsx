"use client";

import Image from "next/image";
import { forwardRef, useEffect, useMemo, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { Loader2, Play, ShieldCheck, Sparkles } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { useCopilotHistoryReplay } from "@/components/ai/use-copilot-history-replay";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
import type { AiAgentAction, AiAgentPlan } from "@/types/ai-agent";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type CustomerIntent =
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

function summarizeCustomerActions(actions: AiAgentAction[]) {
  let confirmCount = 0;
  let primaryCount = 0;

  for (const action of actions) {
    if (action.safety === "confirm" || action.safety === "manual_only") confirmCount += 1;
    if (action.priority === "primary") primaryCount += 1;
  }

  return {
    total: actions.length,
    confirmCount,
    primaryCount
  };
}

function buildCustomerWorkflowRuntimeResult({
  mode,
  cart,
  orderStatus
}: {
  mode: CustomerWorkflowRuntimeMode;
  cart?: unknown;
  orderStatus?: unknown;
}): CustomerWorkflowRuntimeResult {
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

  return {
    reply,
    intent: paymentPending ? "payment" : cartItemCount > 0 ? "cart" : hasOrderStatus ? "order_status" : "menu_discovery",
    intentLabel: "Luồng gọi món",
    actions: nextAction ? [nextAction, ...actions.filter((action) => action.id !== nextAction.id).slice(0, 3)] : actions.slice(0, 4),
    suggestions: actions.slice(0, 3).map((action) => action.label),
    workflowStatus,
    nextActionId: nextAction?.id ?? null,
    cartItemCount,
    hasOrderStatus
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
  const actionStats = useMemo(() => summarizeCustomerActions(actions), [actions]);
  const agentPlan = data?.agentPlan ?? null;
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
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {isLoading ? "Đang đọc menu thật..." : [data?.provider, data?.model].filter(Boolean).join(" · ") || "Gợi ý theo menu quán"}
          </p>
        </div>
      </div>
      <div className="relative z-[1] mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[rgba(15,77,58,0.1)] bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Nút</p>
          <p className="mt-1 text-lg font-black text-[var(--foreground)]">{actionStats.total}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(15,77,58,0.1)] bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Ưu tiên</p>
          <p className="mt-1 text-lg font-black text-[var(--primary)]">{actionStats.primaryCount}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(242,140,40,0.18)] bg-[#fff2df] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Xác nhận</p>
          <p className="mt-1 text-lg font-black text-[var(--accent-strong)]">{actionStats.confirmCount}</p>
        </div>
      </div>
      {isLoading ? (
        <div className="relative z-[1] mt-4 space-y-2">
          <div className="h-3 w-11/12 rounded-full bg-[rgba(15,77,58,0.12)] logibot-skeleton" />
          <div className="h-3 w-7/12 rounded-full bg-[rgba(15,77,58,0.1)] logibot-skeleton" />
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
            <span className="logibot-typing-bars" />
            Đang chọn món/nút phù hợp, không để khách chờ màn trống...
          </div>
        </div>
      ) : (
        <p className="relative z-[1] mt-3 whitespace-pre-line leading-6 text-[var(--text-secondary)]">{text}</p>
      )}
      {agentPlan ? (
        <div className="relative z-[1] mt-3 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/60 px-3 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--primary)]" />
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">{agentPlan.title}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--foreground)]">{agentPlan.summary}</p>
          {agentPlan.safetyNote ? <p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">{agentPlan.safetyNote}</p> : null}
        </div>
      ) : null}
      {visibleActions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {visibleActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleAction(action)}
              className={`rounded-2xl border px-3 py-3 text-left transition hover:-translate-y-0.5 active:scale-[0.99] ${customerActionClass(action)}`}
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
          {actionStats.total > visibleActions.length ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
              Còn {actionStats.total - visibleActions.length} nút phụ, LogiBot ẩn bớt để khách không bị rối.
            </p>
          ) : null}
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
      className={`fixed bottom-[92px] z-[60] flex h-14 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 pr-3 text-sm font-bold text-[var(--primary)] shadow-[0_16px_42px_rgba(15,77,58,0.2)] transition active:scale-95 ${customClassName ?? ""}`}
      style={{ right: "max(1rem, calc((100vw - 430px) / 2 + 1rem))", ...style }}
      aria-label={isOpen ? "Đóng LogiBot" : "Mở LogiBot"}
      aria-pressed={isOpen}
      {...buttonProps}
    >
      <span className="relative h-10 w-10 overflow-hidden rounded-full bg-[#FFF7EB]">
        <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover" priority />
      </span>
      <span className="hidden sm:inline">{isOpen ? "Đóng" : "Gợi ý món"}</span>
    </button>
  );
});

function CustomerAiAssistantExperience({
  restaurantSlug,
  customerSessionId,
  threadId,
  cart,
  orderStatus,
  onAgentAction
}: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  threadId: string;
  cart?: unknown;
  orderStatus?: unknown;
  onAgentAction?: (action: AiAgentAction) => void;
}) {
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
    () => buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus }),
    [cart, orderStatus]
  );

  function runAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }
    onAgentAction?.(action);
  }

  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("customer") }, []);
  useCopilotReadable(
    {
      description: "Context gọi món của khách: slug quán, phiên khách, giỏ hàng hiện tại và trạng thái đơn gần nhất.",
      value: {
        surface: "customer_ordering",
        restaurantSlug,
        customerSessionId,
        cart,
        orderStatus,
        workflowRuntime: {
          status: customerWorkflowRuntime.workflowStatus,
          nextActionId: customerWorkflowRuntime.nextActionId,
          cartItemCount: customerWorkflowRuntime.cartItemCount,
          hasOrderStatus: customerWorkflowRuntime.hasOrderStatus
        },
        rules: [
          "Gợi ý món phải dựa trên menu thật từ tool ask_customer_waiter.",
          "Khi gợi ý món, ưu tiên trả nút thêm giỏ hàng/chọn món khác/thanh toán/gọi nhân viên.",
          "Không tự xác nhận đã thanh toán."
        ]
      }
    },
    [restaurantSlug, customerSessionId, cart, orderStatus, customerWorkflowRuntime]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
        { title: "Tiếp tục", message: "Tiếp tục bước hợp lý nhất theo giỏ hàng hoặc trạng thái đơn hiện tại." },
        { title: "Gợi ý món", message: "Gợi ý món dễ gọi và có nút thêm vào giỏ." },
        { title: "Combo", message: "Tạo combo cho 3 người dưới 300k." },
        { title: "Ít ngọt", message: "Tôi muốn đồ uống ít ngọt, dễ uống." },
        { title: "Thanh toán", message: "Tôi muốn kiểm tra đơn và thanh toán." }
      ]
    },
    [restaurantSlug]
  );

  useCopilotAction(
    {
      name: "continue_customer_ordering",
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
          orderStatus
        }),
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerWorkflowRuntimeResult} onAction={runAction} />
    },
    [cart, orderStatus]
  );

  useCopilotAction(
    {
      name: "answer_customer_request",
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do của khách. Nhận nguyên câu hỏi, backend tự suy luận intent, đọc menu/giỏ/đơn thật khi cần và luôn trả card có CTA.",
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
            orderStatus
          });
        } catch {
          return {
            ...buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus }),
            reply: "Mình chưa nhận được phản hồi AI đầy đủ, nhưng đã chuẩn bị nút thao tác an toàn để bạn tiếp tục."
          };
        }
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerAiResponse} onAction={runAction} />
    },
    [restaurantSlug, customerSessionId, threadId, cart, orderStatus]
  );

  useCopilotAction(
    {
      name: "ask_customer_waiter",
      description: "Đọc menu thật, giỏ hàng và trạng thái đơn để gợi ý món, combo, khuyến mãi hoặc bước thanh toán tiếp theo.",
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
            orderStatus
          });
        } catch {
          return {
            ...buildCustomerWorkflowRuntimeResult({ mode: "resume", cart, orderStatus }),
            reply: "Mình chưa đọc được menu AI lúc này, nhưng đã chuẩn bị bước thao tác an toàn để bạn tiếp tục."
          };
        }
      },
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerAiResponse} onAction={runAction} />
    },
    [restaurantSlug, customerSessionId, threadId, cart, orderStatus]
  );

  useCopilotAction(
    {
      name: "open_customer_cart",
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
    <CopilotSidebar
      defaultOpen={false}
      width="min(420px, 100vw)"
      toggleButton={CustomerLogibotToggle}
      labels={{
        modalHeaderTitle: "LogiBot gọi món",
        welcomeMessageText: "Mình đọc menu thật của quán để gợi ý món, tạo combo, thêm vào giỏ, gọi nhân viên và mở thanh toán đúng bước.",
        chatInputPlaceholder: "VD: combo 3 người dưới 300k, món ít cay, mở giỏ...",
        chatDisclaimerText: "LogiBot không xác nhận thanh toán thay quán; giao dịch vẫn được nhân viên/hệ thống xác nhận.",
        chatToggleOpenLabel: "Mở LogiBot",
        chatToggleCloseLabel: "Đóng LogiBot"
      }}
    />
  );
}

export function CustomerAiAssistant(props: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  cart?: unknown;
  orderStatus?: unknown;
  onAgentAction?: (action: AiAgentAction) => void;
}) {
  const threadId = buildCopilotThreadId("logivn", "customer", props.restaurantSlug, props.customerSessionId || "guest");

  return (
    <LogiVNCopilotProvider threadId={threadId}>
      <CustomerAiAssistantExperience {...props} threadId={threadId} />
    </LogiVNCopilotProvider>
  );
}
