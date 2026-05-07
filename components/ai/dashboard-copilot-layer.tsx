"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { forwardRef, useMemo, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { ArrowUpRight, Bot, CheckCircle2, Loader2, Route, Sparkles } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
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
  readiness?: unknown;
};

const logibotLogo = "/brand/logivn/logibot-badge.png";

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

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!result || !result.ok) throw new Error(result?.error || "LogiBot chưa xử lý được yêu cầu.");
  return result.data;
}

function normalizeRoute(route: string) {
  return dashboardRoutes.find((item) => item === route) ?? "/dashboard";
}

function ToolResultCard({
  title,
  status,
  result
}: {
  title: string;
  status?: string;
  result?: OwnerAiResult | string;
}) {
  const isLoading = status === "executing" || status === "inProgress";
  const text = typeof result === "string" ? result : result?.reply || result?.text || "Đã xử lý xong.";
  const actions = typeof result === "string" ? [] : result?.actions ?? [];
  const provider = typeof result === "string" ? null : [result?.provider, result?.model].filter(Boolean).join(" · ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#E2E8F0] bg-white p-4 text-sm text-[#0F172A]"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#0F4D3A] text-white">
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          {provider ? <p className="text-xs text-[#64748B]">{provider}</p> : null}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-line leading-6 text-[#334155]">{isLoading ? "Đang đọc dữ liệu thật và chuẩn bị hành động..." : text}</p>
      {actions.length ? (
        <div className="mt-3 grid gap-2">
          {actions.slice(0, 4).map((action) => (
            <div key={action.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{action.label}</span>
                <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-semibold text-[#0F4D3A]">An toàn</span>
              </div>
              {action.description ? <p className="mt-1 text-xs leading-5 text-[#64748B]">{action.description}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

const LogibotSidebarToggle = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function LogibotSidebarToggle(
  { onClick, disabled, className: _className, ...buttonProps },
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
      className={`fixed bottom-5 right-5 z-[1190] flex h-14 items-center gap-3 rounded-full border border-[#D8E3DC] bg-white px-3 pr-4 text-sm font-semibold text-[#0F4D3A] shadow-[0_18px_50px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5 hover:border-[#F28C28] md:bottom-6 md:right-6 ${_className ?? ""}`}
      aria-label={isOpen ? "Đóng LogiBot" : "Mở LogiBot"}
      aria-pressed={isOpen}
      {...buttonProps}
    >
      <span className="relative h-10 w-10 overflow-hidden rounded-full border border-[#D8E3DC] bg-[#FFF7EB]">
        <Image src={logibotLogo} alt="LogiBot" fill sizes="40px" className="object-cover" />
      </span>
      <span className="hidden sm:inline">{isOpen ? "Đóng LogiBot" : "LogiBot OS"}</span>
    </button>
  );
});

function DashboardCopilotExperience({
  restaurantId,
  restaurantName
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const readableState = useMemo(
    () => ({
      surface: "dashboard",
      restaurantId,
      restaurantName,
      currentPath: pathname,
      allowedRoutes: dashboardRoutes,
      routeByIntent: intentRouteMap,
      criticalRule: "AI chỉ mở đúng màn hoặc gọi API phân tích; không tự xác nhận thanh toán, không tự xoá dữ liệu."
    }),
    [pathname, restaurantId, restaurantName]
  );

  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("dashboard") }, []);
  useCopilotReadable(
    {
      description: "State thật của dashboard LogiVN hiện tại, bao gồm quán, path đang mở và route được phép điều hướng.",
      value: readableState
    },
    [readableState]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
        { title: "Ca bán", message: "Tóm tắt ca bán hiện tại và 3 việc cần xử lý ngay." },
        { title: "Đơn hàng", message: "Đơn nào cần thao tác tiếp theo? Mở đúng màn đơn hàng." },
        { title: "Setup quán", message: "Tạo kế hoạch setup quán trong 30 phút, từng bước rõ ràng." },
        { title: "Thanh toán", message: "Kiểm tra giao dịch cần đối soát và mở màn thanh toán." }
      ]
    },
    []
  );

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
        return { reply: reason || `Đã mở ${safeRoute}.`, actions: [] };
      },
      render: ({ status, result }) => <ToolResultCard title="Mở đúng màn" status={status} result={result as OwnerAiResult} />
    },
    [router]
  );

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
      handler: async ({ intent, question }) =>
        postJson<OwnerAiResult>("/api/admin/ai/assistant", {
          intent,
          message: question,
          context: { currentPath: pathname, source: "copilotkit" }
        }),
      render: ({ status, result }) => <ToolResultCard title="Phân tích vận hành" status={status} result={result as OwnerAiResult} />
    },
    [pathname]
  );

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
      handler: async ({ mode, focus }) => postJson<OwnerAiResult>("/api/admin/ai/setup-plan", { mode, focus }),
      render: ({ status, result }) => <ToolResultCard title="Kế hoạch setup AI" status={status} result={result as OwnerAiResult} />
    },
    []
  );

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
        postJson<OwnerAiResult>("/api/admin/ai/branding", {
          tone,
          audience,
          restaurantName
        }),
      render: ({ status, result }) => <ToolResultCard title="Branding draft" status={status} result={result as OwnerAiResult} />
    },
    [restaurantName]
  );

  return (
    <CopilotSidebar
      defaultOpen={false}
      width="min(460px, 100vw)"
      toggleButton={LogibotSidebarToggle}
      labels={{
        modalHeaderTitle: "LogiBot OS",
        welcomeMessageText: "Mình có thể đọc dữ liệu vận hành, mở đúng màn và tạo action thật cho quán.",
        chatInputPlaceholder: "Hỏi LogiBot: đơn nào cần xử lý, mở thanh toán, tạo setup...",
        chatDisclaimerText: "LogiBot không tự xác nhận thanh toán hoặc xoá dữ liệu nếu chưa có thao tác của bạn.",
        chatToggleOpenLabel: "Mở LogiBot",
        chatToggleCloseLabel: "Đóng LogiBot"
      }}
    />
  );
}

export function DashboardCopilotLayer(props: { restaurantId: string; restaurantName: string }) {
  return (
    <LogiVNCopilotProvider>
      <DashboardCopilotExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
