"use client";

import Image from "next/image";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";

export type PlatformCopilotSnapshot = {
  activeSection: string;
  environment: {
    appUrl: string;
    rootDomain: string;
    vercelEnv: string;
    supabaseHost: string;
  };
  metrics: {
    tenants: number;
    activeSubscriptions: number;
    pendingPayments: number;
    suspendedTenants: number;
    warnings: number;
  };
  modules: Array<{ key: string; name: string; status: string; owner: string }>;
  plans: Array<{ code: string; name: string; price: number; active: boolean }>;
  securityControls: Array<{ layer: string; status: string; note: string }>;
};

const logibotLogo = "/brand/logivn/logibot-badge.png";
const adminRoutes = ["/admin", "/admin/site", "/admin/plans", "/admin/billing", "/admin/tenants", "/admin/users", "/admin/security", "/admin/release"] as const;

function normalizeAdminRoute(route: string) {
  return adminRoutes.find((item) => item === route) ?? "/admin";
}

function PlatformToolCard({ status, result }: { status?: string; result?: string | { reply?: string; route?: string } }) {
  const loading = status === "executing" || status === "inProgress";
  const text = typeof result === "string" ? result : result?.reply || "Đã xử lý.";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-950">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        </span>
        <p className="font-semibold">Platform Copilot</p>
      </div>
      <p className="mt-3 leading-6 text-slate-600">{loading ? "Đang phân tích control plane..." : text}</p>
    </motion.div>
  );
}

const PlatformLogibotToggle = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function PlatformLogibotToggle(
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
      aria-label={isOpen ? "Đóng Platform Copilot" : "Mở Platform Copilot"}
      aria-pressed={isOpen}
      className={`fixed bottom-5 right-5 z-[1190] flex h-14 items-center gap-3 rounded-full border border-slate-200 bg-white px-2 pr-4 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 ${customClassName ?? ""}`}
      {...buttonProps}
    >
      <span className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-orange-50">
        <Image src={logibotLogo} alt="LogiBot" fill sizes="36px" className="object-cover" />
      </span>
      <span className="hidden sm:inline">{isOpen ? "Đóng" : "Platform AI"}</span>
    </button>
  );
});

function PlatformCopilotExperience({ snapshot }: { snapshot: PlatformCopilotSnapshot }) {
  const router = useRouter();
  const readable = useMemo(
    () => ({
      surface: "platform_admin",
      privacyBoundary: "Không đi sâu doanh thu/đơn riêng tư của tenant. Chỉ quản trị nền tảng, gói, landing, billing, bảo mật.",
      ...snapshot,
      allowedRoutes: adminRoutes
    }),
    [snapshot]
  );

  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("admin") }, []);
  useCopilotReadable(
    {
      description: "State control plane /admin của LogiVN: landing, plans, billing, tenant status, security và release readiness.",
      value: readable
    },
    [readable]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
        { title: "Bảo mật", message: "Tóm tắt 3 rủi ro bảo mật nền tảng cần xử lý trước." },
        { title: "Gói dịch vụ", message: "Mở khu vực gói dịch vụ và nhắc logic chống bug gói." },
        { title: "Landing", message: "Mở khu vực Website để chỉnh nội dung landing." },
        { title: "Thanh toán", message: "Mở xác minh thanh toán gói đang chờ." }
      ]
    },
    []
  );

  useCopilotAction(
    {
      name: "navigate_platform_admin",
      description: "Mở đúng vùng /admin để dev chỉnh website, gói, billing, tenant, user, bảo mật hoặc release.",
      parameters: [
        {
          name: "route",
          type: "string",
          required: true,
          enum: adminRoutes as unknown as string[],
          description: "Route /admin được phép mở."
        },
        {
          name: "reason",
          type: "string",
          required: false,
          description: "Lý do điều hướng ngắn gọn."
        }
      ],
      handler: async ({ route, reason }) => {
        const safeRoute = normalizeAdminRoute(String(route || ""));
        router.push(safeRoute);
        return { route: safeRoute, reply: reason || `Đã mở ${safeRoute}.` };
      },
      render: ({ status, result }) => <PlatformToolCard status={status} result={result as { reply?: string; route?: string }} />
    },
    [router]
  );

  useCopilotAction(
    {
      name: "summarize_platform_risk",
      description: "Tóm tắt nhanh rủi ro nền tảng dựa trên state /admin hiện tại, không truy cập dữ liệu riêng tư của quán.",
      handler: async () => {
        const failedEnv = snapshot.securityControls.filter((item) => item.status !== "OK").slice(0, 3);
        const reply = [
          `${snapshot.metrics.warnings} cảnh báo nền tảng, ${snapshot.metrics.pendingPayments} thanh toán gói chờ xác minh.`,
          failedEnv.length ? `Ưu tiên: ${failedEnv.map((item) => `${item.layer} (${item.status})`).join(", ")}.` : "Các lớp bảo mật chính đang ổn.",
          "AI chỉ hỗ trợ điều hướng và checklist, không tự kích hoạt gói hoặc xoá tenant."
        ].join(" ");
        return { reply };
      },
      render: ({ status, result }) => <PlatformToolCard status={status} result={result as { reply?: string }} />
    },
    [snapshot]
  );

  return (
    <CopilotSidebar
      defaultOpen={false}
      width="min(460px, 100vw)"
      toggleButton={PlatformLogibotToggle}
      labels={{
        modalHeaderTitle: "LogiBot Platform",
        welcomeMessageText: "Mình hỗ trợ dev quản trị landing, gói SaaS, billing, tenant status, security và release readiness.",
        chatInputPlaceholder: "Hỏi về bảo mật, gói, tenant, landing hoặc release...",
        chatDisclaimerText: "Platform AI không truy cập chi tiết doanh thu/đơn riêng tư của từng quán.",
        chatToggleOpenLabel: "Mở Platform AI",
        chatToggleCloseLabel: "Đóng Platform AI"
      }}
    />
  );
}

export function PlatformCopilotLayer(props: { snapshot: PlatformCopilotSnapshot }) {
  return (
    <LogiVNCopilotProvider>
      <PlatformCopilotExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
