"use client";

import Image from "next/image";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CopilotSidebar, useCopilotChatConfiguration } from "@copilotkit/react-core/v2";
import { useCopilotAction, useCopilotAdditionalInstructions, useCopilotReadable } from "@copilotkit/react-core";
import { useCopilotChatSuggestions } from "@copilotkit/react-ui";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { CopilotThinkingIndicator } from "@/components/ai/copilot-thinking-indicator";
import { LogiVNCopilotProvider } from "@/components/ai/logivn-copilot-provider";
import { useCopilotResponseWatchdog } from "@/components/ai/use-copilot-response-watchdog";
import { buildCopilotThreadId } from "@/lib/ai/copilot-thread";
import { buildOperationalPassport, type AiOperationalPassport } from "@/lib/ai/operational-passport";
import { buildCopilotSystemInstructions } from "@/lib/ai/prompts/copilot-system";
import type { AiAgentPlan } from "@/types/ai-agent";

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
const adminRoutes = [
  "/admin",
  "/admin/site",
  "/admin/content",
  "/admin/plans",
  "/admin/billing",
  "/admin/tenants",
  "/admin/users",
  "/admin/ai",
  "/admin/maps",
  "/admin/atlas",
  "/admin/ops",
  "/admin/governance",
  "/admin/security",
  "/admin/release"
] as const;

type AdminRoute = (typeof adminRoutes)[number];

type PlatformAgentAction = {
  id: string;
  label: string;
  description?: string;
  route: AdminRoute;
  priority?: "primary" | "secondary";
  safety?: "safe" | "manual_only";
};

type PlatformAiResult = {
  reply: string;
  actions?: PlatformAgentAction[];
  agentPlan?: AiAgentPlan;
};

function normalizeAdminRoute(route: string) {
  return adminRoutes.find((item) => item === route) ?? "/admin";
}

function foldPlatformText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function adminRouteLabel(route: AdminRoute) {
  const labels: Record<AdminRoute, string> = {
    "/admin": "Tổng quan platform",
    "/admin/site": "Website/Landing",
    "/admin/content": "Content surfaces",
    "/admin/plans": "Gói dịch vụ",
    "/admin/billing": "Billing",
    "/admin/tenants": "Tenant",
    "/admin/users": "User",
    "/admin/ai": "AI Control Center",
    "/admin/maps": "Maps/Delivery",
    "/admin/atlas": "Project Atlas",
    "/admin/ops": "Ops/Infra",
    "/admin/governance": "Governance",
    "/admin/security": "Bảo mật",
    "/admin/release": "Release"
  };
  return labels[route];
}

function inferPlatformRoute(message: string, activeSection: string): AdminRoute {
  const text = foldPlatformText(`${message} ${activeSection}`);
  if (/bao mat|security|rls|tenant scope|audit|spam/.test(text)) return "/admin/security";
  if (/billing|thanh toan|payment|hoa don|goi dang cho|subscription/.test(text)) return "/admin/billing";
  if (/goi|plan|pricing|premium|pro|trial|entitlement/.test(text)) return "/admin/plans";
  if (/tenant|quan|restaurant|suspended|kich hoat|tam dung/.test(text)) return "/admin/tenants";
  if (/user|nguoi dung|admin|staff|role|quyen/.test(text)) return "/admin/users";
  if (/ai|qwen|xai|model|token|prompt|ocr|image/.test(text)) return "/admin/ai";
  if (/api map|atlas|project|du an|frontend|backend|surface|coverage|bao quat|fullstack/.test(text)) return "/admin/atlas";
  if (/map|maps|goong|vietmap|mapbox|route|geocode|delivery|ship/.test(text)) return "/admin/maps";
  if (/cron|r2|cloudflare|env|secret|cache|storage|ops|infra/.test(text)) return "/admin/ops";
  if (/governance|approval|rbac|role|permission|change control|mutation|rollback/.test(text)) return "/admin/governance";
  if (/blog|content|sitemap|feed|llms|seo/.test(text)) return "/admin/content";
  if (/landing|website|home|pricing page/.test(text)) return "/admin/site";
  if (/release|deploy|rollback|prod|production|ci/.test(text)) return "/admin/release";
  return normalizeAdminRoute(activeSection);
}

function platformAction(input: PlatformAgentAction): PlatformAgentAction {
  return {
    priority: "secondary",
    safety: "safe",
    ...input
  };
}

function buildPlatformAgentResult(message: string, snapshot: PlatformCopilotSnapshot): PlatformAiResult {
  const route = inferPlatformRoute(message, snapshot.activeSection);
  const failedControls = snapshot.securityControls.filter((item) => item.status !== "OK");
  const degradedModules = snapshot.modules.filter((item) => item.status !== "OK");
  const actions: PlatformAgentAction[] = [
    platformAction({
      id: `open-${route}`,
      label: `Mở ${adminRouteLabel(route)}`,
      description: "Đi thẳng tới vùng admin liên quan.",
      route,
      priority: "primary"
    })
  ];

  if (failedControls.length && route !== "/admin/security") {
    actions.push(
      platformAction({
        id: "open-security-audit",
        label: "Mở bảo mật",
        description: `${failedControls.length} lớp cần kiểm tra.`,
        route: "/admin/security",
        safety: "manual_only"
      })
    );
  }

  if (snapshot.metrics.pendingPayments > 0 && route !== "/admin/billing") {
    actions.push(
      platformAction({
        id: "open-pending-billing",
        label: "Xác minh billing",
        description: `${snapshot.metrics.pendingPayments} thanh toán gói đang chờ.`,
        route: "/admin/billing",
        safety: "manual_only"
      })
    );
  }

  if (degradedModules.length && route !== "/admin/release") {
    actions.push(
      platformAction({
        id: "open-release-checklist",
        label: "Kiểm release",
        description: `${degradedModules.length} module không OK.`,
        route: "/admin/release"
      })
    );
  }

  const lead = `${snapshot.metrics.warnings} cảnh báo platform, ${snapshot.metrics.suspendedTenants} tenant tạm dừng, ${snapshot.metrics.pendingPayments} billing chờ xử lý.`;
  const focus = `Ưu tiên mở ${adminRouteLabel(route)} để xử lý đúng vùng thay vì trả lời chung chung.`;
  const safety = failedControls.length ? `Cần kiểm ${failedControls.slice(0, 2).map((item) => item.layer).join(", ")} trước khi release.` : "Các lớp bảo mật chính chưa báo lỗi nghiêm trọng.";
  const reply = [lead, focus, safety].join(" ");
  const agentPlan: AiAgentPlan = {
    title: "Platform Ops Agent",
    summary: `Điều hướng theo rủi ro hiện tại: ${adminRouteLabel(route)} là vùng cần mở trước.`,
    focusArea: route,
    nextBestActionId: actions[0]?.id ?? null,
    safetyNote: "AI chỉ điều hướng và tạo checklist, không tự kích hoạt gói, không xoá tenant.",
    confidence: snapshot.metrics.warnings > 0 || failedControls.length > 0 ? "high" : "medium"
  };
  return {
    reply,
    actions: actions.slice(0, 4),
    agentPlan
  };
}

function PlatformToolCard({
  status,
  result,
  onAction
}: {
  status?: string;
  result?: string | PlatformAiResult;
  onAction?: (action: PlatformAgentAction) => void;
  passport?: AiOperationalPassport | null;
}) {
  const loading = status === "executing" || status === "inProgress";
  const text = typeof result === "string" ? result : result?.reply || "Đã chuẩn bị bước vận hành platform.";
  const actions = typeof result === "string" ? [] : result?.actions ?? [];
  const agentPlan = typeof result === "string" ? null : result?.agentPlan ?? null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="logibot-agent-card rounded-[28px] border border-[var(--border)] p-4 text-sm text-[var(--foreground)] shadow-[var(--shadow-soft)]">
      <div className="relative z-[1] flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary)] text-[#FFF7EB]">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Platform Copilot</p>
          <p className="truncate text-xs text-[var(--muted-foreground)]">{agentPlan?.summary || "Trả lời rủi ro trước, thao tác sau"}</p>
        </div>
      </div>
      <div className="logibot-answer-brief relative z-[1] mt-3">
        <span>Trả lời chính</span>
        <p className="logibot-card-brief leading-6 text-[var(--muted-foreground)]">{loading ? "Đang đọc rủi ro vận hành và chuẩn bị kết luận chính..." : text}</p>
      </div>
      {agentPlan?.safetyNote ? (
        <p className="relative z-[1] mt-3 rounded-2xl border border-[rgba(15,77,58,0.12)] bg-white/60 px-3 py-2 text-xs leading-5 text-[var(--foreground)]">
          {agentPlan.safetyNote}
        </p>
      ) : null}
      {actions.length ? (
        <div className="relative z-[1] mt-3 grid gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction?.(action)}
              className={`logibot-action-tile rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                action.priority === "primary"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB]"
                  : "border-[var(--border)] bg-white/60 text-[var(--foreground)] hover:border-[var(--primary)]/35"
              }`}
            >
              <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                {action.label}
                <span className="rounded-full bg-[rgba(255,255,255,0.16)] px-2 py-1 text-[10px] font-bold">
                  {action.safety === "manual_only" ? "Tự kiểm" : "An toàn"}
                </span>
              </span>
              {action.description ? <span className={`mt-1 block text-xs leading-5 ${action.priority === "primary" ? "text-[#FFF7EB]/82" : "text-[var(--muted-foreground)]"}`}>{action.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
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
      className={`fixed bottom-5 right-5 z-[70] flex h-14 items-center gap-3 rounded-full border border-slate-200 bg-white px-2 pr-4 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 ${customClassName ?? ""}`}
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
  const runPlatformAction = useCallback((action: PlatformAgentAction) => {
    router.push(action.route);
  }, [router]);

  useCopilotResponseWatchdog({
    timeoutMs: 10_000,
    fallbackText:
      "Platform AI chưa nhận được phản hồi đầy đủ, nhưng bạn vẫn có thể tiếp tục bằng shortcut an toàn: mở khu vực admin liên quan, kiểm tra billing/tenant/security hoặc chạy lại yêu cầu ngắn hơn."
  });

  const targetRoute = inferPlatformRoute(snapshot.activeSection, snapshot.activeSection);
  const operationalPassport = useMemo(
    () =>
      buildOperationalPassport({
        surface: "admin",
        title: "Platform Ops Passport",
        status: snapshot.activeSection,
        goal: `Quản trị ${snapshot.activeSection} · ${snapshot.metrics.warnings} cảnh báo`,
        route: targetRoute,
        nextActionId: `open-${targetRoute}`,
        nextActionLabel: `Mở ${adminRouteLabel(targetRoute)}`,
        checkpoint: snapshot.securityControls.find((item) => item.status !== "OK")?.layer ?? "Không có checkpoint mới",
        handoffRoute: targetRoute,
        handoffLabel: adminRouteLabel(targetRoute),
        confidence: snapshot.metrics.warnings > 0 ? "high" : "medium"
      }),
    [snapshot, targetRoute]
  );

  const readable = useMemo(
    () => ({
      surface: "platform_admin",
      privacyBoundary: "Không đi sâu doanh thu/đơn riêng tư của tenant. Chỉ quản trị nền tảng, gói, landing, billing, bảo mật.",
      ...snapshot,
      allowedRoutes: adminRoutes,
      operationalPassport
    }),
    [operationalPassport, snapshot]
  );

  useCopilotAdditionalInstructions({ instructions: buildCopilotSystemInstructions("admin") }, []);
  useCopilotReadable(
    {
      description: "State control plane /admin của LogiVN: landing, plans, billing, tenant status, security và release readiness.",
      value: readable
    },
    [operationalPassport, readable]
  );
  useCopilotChatSuggestions(
    {
      available: "before-first-message",
      suggestions: [
        { title: "01 Bảo mật", message: "Tóm tắt rủi ro bảo mật quan trọng nhất và đưa action mở đúng khu vực." },
        { title: "02 Gói dịch vụ", message: "Mở khu vực gói dịch vụ và kiểm tra logic chống bug gói." },
        { title: "03 Landing", message: "Mở khu vực Website để chỉnh nội dung landing cần ưu tiên." },
        { title: "04 Thanh toán", message: "Mở xác minh thanh toán gói đang chờ và nêu bước an toàn." }
      ]
    },
    []
  );

  useCopilotAction(
    {
      name: "navigate_platform_admin",
      followUp: false,
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
        return buildPlatformAgentResult(reason || `Mở ${safeRoute}`, { ...snapshot, activeSection: safeRoute });
      },
      render: ({ status, result }) => <PlatformToolCard status={status} result={result as PlatformAiResult} onAction={runPlatformAction} passport={operationalPassport} />
    },
    [operationalPassport, router, runPlatformAction, snapshot]
  );

  useCopilotAction(
    {
      name: "answer_platform_admin_request",
      followUp: false,
      description:
        "Catch-all bắt buộc cho mọi câu hỏi tự do của platform admin. Luôn trả action card, route an toàn và checklist ngắn; không truy cập dữ liệu riêng tư tenant.",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          description: "Nguyên văn câu hỏi/yêu cầu của platform admin."
        }
      ],
      handler: async ({ message }) => buildPlatformAgentResult(String(message || "Kiểm tra platform"), snapshot),
      render: ({ status, result }) => <PlatformToolCard status={status} result={result as PlatformAiResult} onAction={runPlatformAction} passport={operationalPassport} />
    },
    [operationalPassport, runPlatformAction, snapshot]
  );

  useCopilotAction(
    {
      name: "summarize_platform_risk",
      followUp: false,
      description: "Tóm tắt nhanh rủi ro nền tảng dựa trên state /admin hiện tại, không truy cập dữ liệu riêng tư của quán.",
      handler: async () => {
        const result = buildPlatformAgentResult("Tóm tắt rủi ro bảo mật billing release", snapshot);
        return {
          ...result,
          reply: [
          `${snapshot.metrics.warnings} cảnh báo nền tảng, ${snapshot.metrics.pendingPayments} thanh toán gói chờ xác minh.`,
          result.reply,
          "AI chỉ hỗ trợ điều hướng và checklist, không tự kích hoạt gói hoặc xoá tenant."
          ].join(" ")
        };
      },
      render: ({ status, result }) => <PlatformToolCard status={status} result={result as PlatformAiResult} onAction={runPlatformAction} passport={operationalPassport} />
    },
    [operationalPassport, runPlatformAction, snapshot]
  );

  return (
    <>
      <CopilotSidebar
        defaultOpen={false}
        width="min(460px, 100vw)"
        toggleButton={PlatformLogibotToggle}
        labels={{
          modalHeaderTitle: "LogiBot Platform",
          welcomeMessageText: "Mình trả lời bằng card vận hành: mở đúng khu vực admin, tóm tắt rủi ro, kiểm tra billing/tenant/release và đưa shortcut an toàn.",
          chatInputPlaceholder: "VD: tenant nào rủi ro, kiểm tra billing, mở AI config...",
          chatDisclaimerText: "Platform AI không truy cập chi tiết doanh thu/đơn riêng tư của từng quán.",
          chatToggleOpenLabel: "Mở Platform AI",
          chatToggleCloseLabel: "Đóng Platform AI"
        }}
      />
      <CopilotThinkingIndicator surface="platform" />
    </>
  );
}

export function PlatformCopilotLayer(props: { snapshot: PlatformCopilotSnapshot }) {
  const threadId = buildCopilotThreadId("logivn", "platform-admin");

  return (
    <LogiVNCopilotProvider threadId={threadId}>
      <PlatformCopilotExperience {...props} />
    </LogiVNCopilotProvider>
  );
}
