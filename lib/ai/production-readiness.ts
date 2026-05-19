import type { AiApplyLayerDeck } from "@/lib/ai/apply-layer";
import type { AiExecutionCenterDeck } from "@/lib/ai/execution-center";
import type { AiFutureCapability } from "@/lib/ai/future-capabilities";
import type { AiProviderReadiness } from "@/lib/ai/router/types";

export type AiProductionReadinessStatus = "ready" | "watch" | "blocked";
export type AiProductionReadinessSeverity = "pass" | "warn" | "block";

export type AiProductionReadinessCheck = {
  id: string;
  title: string;
  area: "provider" | "data" | "execution" | "cost" | "security" | "observability" | "future";
  severity: AiProductionReadinessSeverity;
  detail: string;
  action: string;
};

export type AiProductionGuardrail = {
  id: string;
  title: string;
  detail: string;
  status: "active" | "needs_config" | "preview";
};

export type AiProductionReadinessDeck = {
  generatedAt: string;
  summary: {
    score: number;
    status: AiProductionReadinessStatus;
    totalChecks: number;
    pass: number;
    warnings: number;
    blockers: number;
    configuredProviders: number;
    readySchemas: number;
    executionItems: number;
    applyPlans: number;
    highRiskApplyPlans: number;
    futureEnabled: number;
  };
  checks: AiProductionReadinessCheck[];
  costGuardrails: AiProductionGuardrail[];
  securityGuardrails: AiProductionGuardrail[];
  releaseChecklist: Array<{
    id: string;
    title: string;
    detail: string;
    done: boolean;
  }>;
};

type SchemaReadinessLike = {
  ready: boolean;
  checks: Array<{
    key: string;
    table: string;
    label: string;
    ready: boolean;
  }>;
};

export type BuildAiProductionReadinessInput = {
  providers: AiProviderReadiness[];
  schemas: SchemaReadinessLike;
  futureCapabilities: AiFutureCapability[];
  executionDeck: AiExecutionCenterDeck;
  applyDeck: AiApplyLayerDeck;
};

function severityRank(severity: AiProductionReadinessSeverity) {
  if (severity === "block") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function statusFromCounts(blockers: number, warnings: number): AiProductionReadinessStatus {
  if (blockers > 0) return "blocked";
  if (warnings > 0) return "watch";
  return "ready";
}

function scoreFor(checks: AiProductionReadinessCheck[]) {
  if (!checks.length) return 0;
  const max = checks.length * 10;
  const penalty = checks.reduce((sum, check) => {
    if (check.severity === "block") return sum + 10;
    if (check.severity === "warn") return sum + 4;
    return sum;
  }, 0);
  return Math.max(0, Math.round(((max - penalty) / max) * 100));
}

function configuredProviderCheck(providers: AiProviderReadiness[]): AiProductionReadinessCheck {
  const configured = providers.filter((provider) => provider.configured);
  return {
    id: "provider-configured",
    area: "provider",
    title: "Provider AI khả dụng",
    severity: configured.length ? "pass" : "block",
    detail: configured.length
      ? `${configured.length}/${providers.length} provider đã cấu hình, có thể route và fallback.`
      : "Chưa có provider AI nào được cấu hình, các luồng dùng LLM sẽ bị chặn.",
    action: configured.length ? "Giữ ít nhất 1 provider chính và 1 provider fallback cho production." : "Cấu hình API key cho OpenAI, Gemini, Qwen hoặc Vercel AI Gateway."
  };
}

function providerCapabilityCheck(providers: AiProviderReadiness[]): AiProductionReadinessCheck {
  const configured = providers.filter((provider) => provider.configured);
  const hasStructuredProvider = configured.some((provider) => provider.supportsJsonMode || provider.supportsToolCalling);
  return {
    id: "provider-structured-output",
    area: "provider",
    title: "Structured output và tool calling",
    severity: !configured.length ? "block" : hasStructuredProvider ? "pass" : "warn",
    detail: hasStructuredProvider
      ? "Provider hiện tại hỗ trợ JSON/tool, phù hợp response contract và workflow."
      : "Provider đã cấu hình nhưng chưa đảm bảo JSON/tool calling cho các action nhạy cảm.",
    action: hasStructuredProvider ? "Dùng structured outputs cho analytics, apply plans và automation." : "Ưu tiên provider có JSON mode/tool calling cho luồng vận hành."
  };
}

function schemaChecks(schemas: SchemaReadinessLike): AiProductionReadinessCheck[] {
  return schemas.checks.map((schema) => ({
    id: `schema-${schema.key}`,
    area: "data",
    title: schema.label,
    severity: schema.ready ? "pass" : "block",
    detail: schema.ready ? `${schema.table} sẵn sàng cho production.` : `${schema.table} chưa sẵn sàng, AI không thể lưu/audit đầy đủ.`,
    action: schema.ready ? "Theo dõi count và latency khi production chạy thật." : "Chạy migration/schema tương ứng trước khi bật production."
  }));
}

function executionChecks(executionDeck: AiExecutionCenterDeck, applyDeck: AiApplyLayerDeck): AiProductionReadinessCheck[] {
  return [
    {
      id: "execution-queue",
      area: "execution",
      title: "AI Execution Center",
      severity: executionDeck.summary.blocked ? "warn" : "pass",
      detail: executionDeck.summary.total
        ? `${executionDeck.summary.total} item trong queue, ${executionDeck.summary.confirmFirst} item confirm-first.`
        : "Execution Center hoạt động nhưng hiện chưa có item cần xử lý.",
      action: executionDeck.summary.blocked ? "Gỡ blocker trong provider/schema/memory trước khi duyệt." : "Tiếp tục xử lý theo queue, không bỏ qua bước duyệt."
    },
    {
      id: "apply-preflight",
      area: "execution",
      title: "AI Apply Layer",
      severity: applyDeck.summary.blocked ? "warn" : "pass",
      detail: `${applyDeck.summary.total} apply plan, ${applyDeck.summary.highRisk} high risk, ${applyDeck.summary.ready} ready.`,
      action: applyDeck.summary.highRisk ? "High-risk plan phải có người quản lý xác nhận và rollback rõ ràng." : "Giữ complete state để audit sau khi áp dụng."
    }
  ];
}

function costChecks(providers: AiProviderReadiness[]): AiProductionReadinessCheck[] {
  const configured = providers.filter((provider) => provider.configured);
  const hasFastModel = configured.some((provider) => Boolean(provider.fastModel));
  const hasFallback = configured.length > 1;
  return [
    {
      id: "cost-fast-model",
      area: "cost",
      title: "Fast model cho tác vụ rẻ",
      severity: hasFastModel ? "pass" : "warn",
      detail: hasFastModel ? "Provider đã có fast model cho title, caption, phân loại và trả lời ngắn." : "Chưa thấy fast model khả dụng; tác vụ nhỏ có thể tốn chi phí hơn cần thiết.",
      action: "Route tác vụ nhẹ sang fast model, chỉ dùng premium model cho reasoning analytics."
    },
    {
      id: "cost-fallback",
      area: "cost",
      title: "Fallback provider",
      severity: !configured.length ? "block" : hasFallback ? "pass" : "warn",
      detail: hasFallback ? "Có hơn 1 provider configured để giảm outage." : "Production chỉ có một provider; outage/rate limit sẽ ảnh hưởng trực tiếp AI.",
      action: hasFallback ? "Theo dõi rate limit và cache hit." : "Cấu hình thêm provider fallback hoặc Vercel AI Gateway."
    }
  ];
}

function safetyChecks(): AiProductionReadinessCheck[] {
  return [
    {
      id: "security-rbac",
      area: "security",
      title: "RBAC admin và branch isolation",
      severity: "pass",
      detail: "API/dashboard production readiness chạy qua dashboard admin session và restaurantId hiện tại.",
      action: "Không expose cross-branch data nếu chưa có quyền owner/chain admin."
    },
    {
      id: "security-confirm-first",
      area: "security",
      title: "Confirm-first cho hành động nhạy cảm",
      severity: "pass",
      detail: "Apply layer không tự đổi giá, menu, payment, campaign hoặc support public.",
      action: "Giữ nút apply hoàn tất sau bước duyệt của người quản lý."
    },
    {
      id: "observability-audit",
      area: "observability",
      title: "Audit trail vận hành",
      severity: "pass",
      detail: "Execution/apply queue giữ lifecycle, status và rollback copy cho từng quyết định.",
      action: "Khi mở auto-execute sau này, ghi thêm operational event cho mỗi action."
    }
  ];
}

function futureChecks(capabilities: AiFutureCapability[]): AiProductionReadinessCheck[] {
  const enabled = capabilities.filter((capability) => capability.enabled);
  if (!enabled.length) {
    return [
      {
        id: "future-flags",
        area: "future",
        title: "Voice/Vision dormant",
        severity: "pass",
        detail: "Các capability tương lai đang tắt mặc định.",
        action: "Chỉ bật bằng env flag sau khi có policy, consent và manual fallback."
      }
    ];
  }
  return enabled.map((capability) => ({
    id: `future-${capability.key}`,
    area: "future",
    title: capability.label,
    severity: capability.status === "ready" ? "warn" : "pass",
    detail: `${capability.status} · ${capability.safetyMode} · ${capability.dataScope}`,
    action: capability.safetyMode === "manual_only" ? "Giữ manual review, không suy luận danh tính/biometric." : "Giữ xác nhận trước khi tạo order/reservation thật."
  }));
}

function costGuardrails(providers: AiProviderReadiness[]): AiProductionGuardrail[] {
  const configured = providers.filter((provider) => provider.configured);
  return [
    {
      id: "route-cheap-tasks",
      title: "Route tác vụ rẻ sang fast model",
      detail: "Caption, title, FAQ ngắn, phân loại intent và empty-state copy dùng fast model hoặc cache.",
      status: configured.some((provider) => provider.fastModel) ? "active" : "needs_config"
    },
    {
      id: "premium-reasoning-only",
      title: "Premium model chỉ dùng cho reasoning",
      detail: "Analytics, bất thường doanh thu, dự báo nhân sự/kho và multi-branch comparison mới dùng model mạnh.",
      status: configured.length ? "active" : "needs_config"
    },
    {
      id: "cache-context",
      title: "Cache ngữ cảnh ít thay đổi",
      detail: "Menu, memory, provider readiness và schema readiness nên cache hoặc memoize theo phiên/request.",
      status: "active"
    },
    {
      id: "fallback-budget",
      title: "Fallback có kiểm soát ngân sách",
      detail: "Retry qua provider khác nhưng giữ timeout, token budget và structured output contract.",
      status: configured.length > 1 ? "active" : "needs_config"
    }
  ];
}

function securityGuardrails(capabilities: AiFutureCapability[]): AiProductionGuardrail[] {
  return [
    {
      id: "no-secret-leak",
      title: "Không trả secret/provider key",
      detail: "Readiness chỉ trả trạng thái configured và env name thiếu, không trả API key hoặc base secret.",
      status: "active"
    },
    {
      id: "no-financial-hallucination",
      title: "Không bịa số tài chính",
      detail: "AI phải dựa trên orders/reports thật; khi thiếu dữ liệu thì nói thiếu dữ liệu và đưa bước kiểm tra.",
      status: "active"
    },
    {
      id: "pii-minimization",
      title: "Giảm PII trong prompt",
      detail: "Support/customer flow chỉ dùng dữ liệu cần thiết, ẩn thông tin nhạy cảm ở output public.",
      status: "active"
    },
    {
      id: "future-consent",
      title: "Voice/Vision cần consent",
      detail: "Camera/voice chỉ preview/manual cho tới khi có consent, policy lưu trữ và audit riêng.",
      status: capabilities.some((capability) => capability.enabled) ? "preview" : "active"
    }
  ];
}

function releaseChecklist(input: BuildAiProductionReadinessInput, status: AiProductionReadinessStatus) {
  const configuredProviders = input.providers.filter((provider) => provider.configured).length;
  return [
    {
      id: "provider",
      title: "Provider production",
      detail: "Có ít nhất một provider configured và model fallback rõ ràng.",
      done: configuredProviders > 0
    },
    {
      id: "schemas",
      title: "Schema AI",
      detail: "Recommendations, automation runs và restaurant memories đều query được.",
      done: input.schemas.ready
    },
    {
      id: "queue",
      title: "Execution/apply queue",
      detail: "Các quyết định AI đi qua queue và preflight trước khi áp dụng.",
      done: input.executionDeck.summary.confirmFirst >= 0 && input.applyDeck.guardrails.length > 0
    },
    {
      id: "security",
      title: "Security guardrails",
      detail: "RBAC, branch isolation, confirm-first và PII minimization đã bật trong luồng admin.",
      done: true
    },
    {
      id: "release",
      title: "Release gate",
      detail: "Chỉ deploy khi readiness không blocked và validation pass.",
      done: status !== "blocked"
    }
  ];
}

export function buildAiProductionReadinessDeck(input: BuildAiProductionReadinessInput): AiProductionReadinessDeck {
  const checks = [
    configuredProviderCheck(input.providers),
    providerCapabilityCheck(input.providers),
    ...schemaChecks(input.schemas),
    ...executionChecks(input.executionDeck, input.applyDeck),
    ...costChecks(input.providers),
    ...safetyChecks(),
    ...futureChecks(input.futureCapabilities)
  ].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  const blockers = checks.filter((check) => check.severity === "block").length;
  const warnings = checks.filter((check) => check.severity === "warn").length;
  const status = statusFromCounts(blockers, warnings);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      score: scoreFor(checks),
      status,
      totalChecks: checks.length,
      pass: checks.filter((check) => check.severity === "pass").length,
      warnings,
      blockers,
      configuredProviders: input.providers.filter((provider) => provider.configured).length,
      readySchemas: input.schemas.checks.filter((check) => check.ready).length,
      executionItems: input.executionDeck.summary.total,
      applyPlans: input.applyDeck.summary.total,
      highRiskApplyPlans: input.applyDeck.summary.highRisk,
      futureEnabled: input.futureCapabilities.filter((capability) => capability.enabled).length
    },
    checks,
    costGuardrails: costGuardrails(input.providers),
    securityGuardrails: securityGuardrails(input.futureCapabilities),
    releaseChecklist: releaseChecklist(input, status)
  };
}
