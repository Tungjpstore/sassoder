"use client";

import Image from "next/image";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
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

const logibotLogo = "/brand/logivn/logibot-badge.png";

async function askCustomerAssistant(body: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  message: string;
  intent?: CustomerIntent;
  cart?: unknown;
  orderStatus?: unknown;
}) {
  const response = await fetch("/api/ai/customer-assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => null)) as ApiResponse<CustomerAiResponse> | null;
  if (!result || !result.ok) throw new Error(result?.error || "LogiBot chưa gợi ý được món.");
  return result.data;
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-[rgba(15,77,58,0.12)] bg-white p-4 text-sm text-[#0F172A]"
    >
      <div className="flex items-center gap-3">
        <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[#D8E3DC] bg-[#FFF7EB]">
          <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{data?.intentLabel || "LogiBot phục vụ"}</p>
          <p className="truncate text-xs text-[#64748B]">{isLoading ? "Đang đọc menu thật..." : [data?.provider, data?.model].filter(Boolean).join(" · ") || "Gợi ý theo menu quán"}</p>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-line leading-6 text-[#334155]">{isLoading ? "Mình đang kiểm tra menu, giỏ hàng và trạng thái đơn để đưa nút thao tác đúng." : text}</p>
      {data?.actions?.length ? (
        <div className="mt-3 grid gap-2">
          {data.actions.slice(0, 5).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction?.(action)}
              className={`rounded-2xl border px-3 py-2 text-left transition active:scale-[0.99] ${
                action.priority === "primary"
                  ? "border-[#0F4D3A] bg-[#0F4D3A] text-white"
                  : "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Play size={14} />
                {action.label}
              </span>
              {action.description ? <span className={`mt-1 block text-xs leading-5 ${action.priority === "primary" ? "text-white/75" : "text-[#64748B]"}`}>{action.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

const CustomerLogibotToggle = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function CustomerLogibotToggle(
  { onClick, disabled, className: customClassName, ...buttonProps },
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
      className={`fixed bottom-[152px] right-4 z-50 flex h-14 items-center gap-2 rounded-full border border-[rgba(15,77,58,0.14)] bg-white px-2 pr-3 text-sm font-bold text-[#0F4D3A] shadow-[0_16px_42px_rgba(15,77,58,0.2)] transition active:scale-95 ${customClassName ?? ""}`}
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
  cart,
  orderStatus,
  onAgentAction
}: {
  restaurantSlug: string;
  customerSessionId?: string | null;
  cart?: unknown;
  orderStatus?: unknown;
  onAgentAction?: (action: AiAgentAction) => void;
}) {
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
        rules: [
          "Gợi ý món phải dựa trên menu thật từ tool ask_customer_waiter.",
          "Khi gợi ý món, ưu tiên trả nút thêm giỏ hàng/chọn món khác/thanh toán/gọi nhân viên.",
          "Không tự xác nhận đã thanh toán."
        ]
      }
    },
    [restaurantSlug, customerSessionId, cart, orderStatus]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
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
      name: "ask_customer_waiter",
      description: "Đọc menu thật, giỏ hàng và trạng thái đơn để gợi ý món, combo, khuyến mãi hoặc bước thanh toán tiếp theo.",
      parameters: [
        {
          name: "intent",
          type: "string",
          required: true,
          enum: ["menu_discovery", "cart", "order_status", "payment", "staff_call", "delivery", "reservation", "promotion", "allergy"],
          description: "Nghiệp vụ khách đang cần."
        },
        {
          name: "question",
          type: "string",
          required: true,
          description: "Câu hỏi ngắn của khách."
        }
      ],
      handler: async ({ intent, question }) =>
        askCustomerAssistant({
          restaurantSlug,
          customerSessionId,
          message: String(question || "Gợi ý món phù hợp."),
          intent: intent as CustomerIntent,
          cart,
          orderStatus
        }),
      render: ({ status, result }) => <CustomerToolResult status={status} result={result as CustomerAiResponse} onAction={runAction} />
    },
    [restaurantSlug, customerSessionId, cart, orderStatus]
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
        welcomeMessageText: "Mình có thể gợi ý món từ menu thật, tạo combo, mở giỏ hàng, gọi nhân viên và hướng dẫn thanh toán.",
        chatInputPlaceholder: "Ví dụ: tạo combo cho 3 người dưới 300k...",
        chatDisclaimerText: "Thông tin món và thanh toán sẽ được quán xác nhận trên hệ thống.",
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
  return (
    <LogiVNCopilotProvider>
      <CustomerAiAssistantExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
