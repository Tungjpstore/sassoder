import "server-only";

import { runAiCompletion } from "@/lib/ai/router/model-router";
import { persistAiConversationMessage } from "@/lib/ai/memory/restaurant-memory";
import type { AiCompletionOptions, AiCompletionResult, AiProvider, AiProviderConfig, AiTaskType } from "@/lib/ai/router/types";
import { AppError } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { executeAiToolCall, allAiTools, type AiToolCall, type AiToolResult } from "@/lib/ai/tools/executor";
import { buildCustomerAgentActions, buildCustomerAgentPlan, buildOwnerAgentActions, buildOwnerAgentPlan } from "@/services/ai-agent-actions";
import {
  buildBrandingMessages,
  buildCustomerAssistantMessages,
  buildImageGenerationPrompt,
  buildMenuOcrPrompt,
  buildOwnerAssistantMessages,
  buildStoreSetupDraftMessages,
  buildStoreSetupPlanMessages,
  customerAiIntentConfig,
  normalizeStoreSetupDraftKind,
  normalizeCustomerAiIntent,
  normalizeOwnerAiIntent,
  ownerAiIntentConfig,
  storeSetupDraftConfig,
  type AiPromptMessage,
  type AiRestaurantContext,
  type CustomerAiIntent,
  type OwnerAiIntent,
  type StoreSetupDraftKind
} from "@/services/ai-prompt-router";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import {
  assertFeatureEntitlement,
  assertRestaurantEntitlement,
  getResolvedBillingEntitlementSnapshotForRestaurant,
  planFeatureLabels,
  recordBillingUsageEvent,
  type PlanFeatureKey
} from "@/services/subscription-service";
import type { BillingFeatureKey } from "@/lib/billing/types";
import type { AiAgentAction } from "@/types/ai-agent";
import type { Database } from "@/types/supabase";

type AiRequestKind = "chat" | "ocr" | "image" | "speech" | "tool";
type AiMessage = AiPromptMessage;
type RestaurantAiContext = AiRestaurantContext;
type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type LegacyAiCompletionResult = Omit<AiCompletionResult, "attempts">;
type NativeAiProviderConfig = Pick<AiProviderConfig, "provider" | "baseUrl" | "apiKey">;
type ExecutedAiToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: AiToolResult | null;
};

function sanitizeAssistantText(value: string, maxLength = 900) {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function looksLikeRawAssistantPayload(value: string) {
  const text = sanitizeAssistantText(value, 1800);
  if (!text) return true;
  if (/^[{[]/.test(text)) return true;
  if (/^"(summary|reply|actions|agentPlan|readinessScore|launchBlockers)"\s*:/.test(text)) return true;
  if (/"(summary|reply|actions|agentPlan|launchBlockers|expressSetup)"\s*:/.test(text) && /[{}[\]]/.test(text)) return true;
  if (/\b(tool_call|tool_calls|function_call|raw|arguments)\b/i.test(text) && /[{}[\]]/.test(text)) return true;
  return false;
}

function formatCurrency(value: number) {
  return `${Math.max(0, Number(value || 0)).toLocaleString("vi-VN")}đ`;
}

type AiImageResult = {
  imageUrl: string | null;
  prompt: string;
  provider: AiProvider | "prompt-only";
  model: string;
  raw?: unknown;
};

const qwenNativeBaseUrl = "https://dashscope-intl.aliyuncs.com";
const xaiNativeBaseUrl = "https://api.x.ai";

const providerDefaults = {
  qwenChatModel: process.env.QWEN_MODEL || process.env.QWEN_CHAT_MODEL || "qwen-plus",
  qwenFastModel: process.env.QWEN_FAST_MODEL || process.env.QWEN_MODEL || "qwen-plus",
  qwenOcrModel: process.env.QWEN_OCR_MODEL || "qwen-vl-ocr-2025-11-20",
  qwenImageModel: process.env.QWEN_IMAGE_MODEL || "qwen-image-2.0-pro",
  xaiChatModel: process.env.XAI_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini-beta",
  xaiImageModel: process.env.XAI_IMAGE_MODEL || "grok-imagine-image"
};

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

const legacyAiBillingFeatureMap: Partial<Record<PlanFeatureKey, BillingFeatureKey>> = {
  ai_owner_assistant: "ai_chatbot",
  ai_customer_assistant: "ai_chatbot",
  ai_branding_studio: "ai_branding",
  ai_menu_ocr: "ai_menu_generation",
  ai_image_generation: "ai_image_generation",
  advanced_reports: "ai_analytics"
};

function billingAccessErrorMessage(label: string, state: "locked_plan" | "quota_exceeded" | "trial_used" | "subscription_expired") {
  if (state === "subscription_expired") return "Gói LogiVN đã hết hạn. Vui lòng gia hạn để tiếp tục dùng AI.";
  if (state === "quota_exceeded") return `${label} đã hết quota trong kỳ hiện tại. Vui lòng nâng cấp hoặc chờ kỳ mới.`;
  if (state === "trial_used") return `Bạn đã dùng thử ${label}. Vui lòng nâng cấp Premium để tiếp tục.`;
  return `${label} chỉ khả dụng trên gói Premium.`;
}

function getProviderConfig(preferred?: AiProvider): NativeAiProviderConfig {
  const qwenKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const qwenBaseUrl = (
    process.env.QWEN_NATIVE_BASE_URL ||
    process.env.DASHSCOPE_NATIVE_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    qwenNativeBaseUrl
  )
    .replace(/\/compatible-mode\/v1\/?$/, "")
    .replace(/\/$/, "");
  const xaiBaseUrl = (process.env.XAI_NATIVE_BASE_URL || process.env.XAI_BASE_URL || xaiNativeBaseUrl)
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "");

  if (preferred === "qwen" && qwenKey) {
    return {
      provider: "qwen",
      baseUrl: qwenBaseUrl,
      apiKey: qwenKey
    };
  }

  if (preferred === "xai" && xaiKey) {
    return {
      provider: "xai",
      baseUrl: xaiBaseUrl,
      apiKey: xaiKey
    };
  }

  if (qwenKey) {
    return {
      provider: "qwen",
      baseUrl: qwenBaseUrl,
      apiKey: qwenKey
    };
  }

  if (xaiKey) {
    return {
      provider: "xai",
      baseUrl: xaiBaseUrl,
      apiKey: xaiKey
    };
  }

  throw new AppError("Chưa cấu hình QWEN_API_KEY/DASHSCOPE_API_KEY hoặc XAI_API_KEY cho tính năng AI.", 500);
}

function getRequiredQwenProviderConfig(featureLabel: string): NativeAiProviderConfig {
  const config = getProviderConfig("qwen");
  if (config.provider === "qwen") return config;
  throw new AppError(`${featureLabel} yêu cầu QWEN_API_KEY hoặc DASHSCOPE_API_KEY. Không thể dùng xAI cho OCR menu.`, 500);
}

function normalizeAiProvider(value?: string | null): AiProvider | undefined {
  return value === "qwen" || value === "xai" ? value : undefined;
}

function normalizePrompt(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 4000);
}

function allowPromptOnlyImageFallback() {
  return process.env.AI_IMAGE_ALLOW_PROMPT_FALLBACK === "true";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeQwenImagePayload({
  imageUrl,
  imageBase64
}: {
  imageUrl?: string;
  imageBase64?: string;
}) {
  if (imageUrl?.trim()) return imageUrl.trim();
  const rawImage = imageBase64?.trim();
  if (!rawImage) return "";
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(rawImage)) return rawImage;

  return `data:image/jpeg;base64,${rawImage.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")}`;
}

function readAiMessageContent(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      return typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseToolArguments(rawArguments: string) {
  if (!rawArguments?.trim()) return {};
  try {
    const parsed = JSON.parse(rawArguments);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asToolRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readShortText(value: unknown, maxLength: number) {
  return typeof value === "string" ? sanitizeAssistantText(value, maxLength) : "";
}

function readStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readShortText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseMenuPriceToken(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const isThousandsSuffix = /k$/.test(normalized);
  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits) return 0;

  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (isThousandsSuffix) return amount * 1000;
  if (amount > 0 && amount < 1000) return amount * 1000;
  return amount;
}

function normalizeMenuOcrItemNameAndPrice(rawName: string, rawPrice: unknown) {
  let name = rawName.trim();
  let price = Math.round(Number(rawPrice ?? 0));

  if (!Number.isFinite(price) || price <= 0) {
    const trailingPrice = name.match(/^(.*?)(?:[\s:·._-]+)(\d{1,3}(?:[.,]\d{3})+|\d{4,8}|\d{1,3}k)\s*(?:đ|vnd)?$/i);
    if (trailingPrice) {
      const parsedPrice = parseMenuPriceToken(trailingPrice[2] || "");
      if (parsedPrice > 0) {
        name = trailingPrice[1]?.trim() || name;
        price = parsedPrice;
      }
    }
  }

  return { name, price };
}

function normalizeMenuOcrDraft(value: unknown) {
  const record = asToolRecord(value);
  const warnings = readStringList(record?.warnings, 8, 180);
  const confidence = Math.min(1, Math.max(0, Number(record?.confidence ?? 0.72)));
  const categories = Array.isArray(record?.categories) ? record.categories : [];

  return {
    categories: categories
      .map((category) => {
        const categoryRecord = asToolRecord(category);
        const name = readShortText(categoryRecord?.name, 80) || "Menu";
        const items = Array.isArray(categoryRecord?.items) ? categoryRecord.items : [];

        return {
          name,
          items: items
            .map((item) => {
              const itemRecord = asToolRecord(item);
              const parsed = normalizeMenuOcrItemNameAndPrice(readShortText(itemRecord?.name, 120), itemRecord?.price);
              const name = parsed.name;
              const price = parsed.price;
              if (!name || !Number.isFinite(price) || price <= 0) return null;

              return {
                name,
                price,
                description: readShortText(itemRecord?.description, 180) || null,
                tags: readStringList(itemRecord?.tags, 6, 32)
              };
            })
            .filter((item): item is { name: string; price: number; description: string | null; tags: string[] } => Boolean(item))
            .slice(0, 80)
        };
      })
      .filter((category) => category.items.length > 0)
      .slice(0, 20),
    warnings,
    confidence
  };
}

function normalizeBrandBoard(value: unknown) {
  const record = asToolRecord(value);
  const slogans = readStringList(record?.slogans, 3, 54);
  const fallbackSlogan = readShortText(record?.slogan, 54);

  return {
    slogans: slogans.length > 0 ? slogans : fallbackSlogan ? [fallbackSlogan] : [],
    description: readShortText(record?.description, 500),
    brandVoice: readShortText(record?.brandVoice, 160),
    logoPrompt: readShortText(record?.logoPrompt, 1500),
    menuHeroPrompt: readShortText(record?.menuHeroPrompt, 1500),
    warnings: readStringList(record?.warnings, 6, 180),
    constraints: {
      sloganMaxChars: 54,
      descriptionMaxChars: 500,
      logoCanvas: "1024x1024",
      logoRule: "Không render chữ nhỏ hoặc tên quán trực tiếp trong ảnh AI; LogiVN sẽ overlay chữ bằng UI thật."
    }
  };
}

async function resolveAiToolCalls(toolCalls: AiToolCall[], context: { restaurantId: string; userId?: string | null; customerSessionId?: string | null }) {
  const executions = await Promise.all(
    toolCalls.slice(0, 4).map(async (toolCall) => {
      const args = parseToolArguments(toolCall.function.arguments);
      const result = await executeAiToolCall(toolCall, context);
      return {
        id: toolCall.id,
        name: toolCall.function.name,
        args,
        result
      } satisfies ExecutedAiToolCall;
    })
  );

  return executions;
}

function summarizeToolExecution(toolRun: ExecutedAiToolCall) {
  const result = asToolRecord(toolRun.result);
  if (!result) {
    return [`${toolRun.name}: không có kết quả hợp lệ.`];
  }

  if (result.status === "error" || result.status === "failed") {
    return [`${toolRun.name}: ${String(result.message || "không xử lý được.")}`];
  }

  switch (toolRun.name) {
    case "search_menu": {
      const results = Array.isArray(result.results) ? (result.results as Array<Record<string, unknown>>) : [];
      const preview = results
        .slice(0, 3)
        .map((item) => String(item.name ?? ""))
        .filter(Boolean)
        .join(", ");
      return [
        `Menu xác thực: ${results.length} món khớp với truy vấn ${toolRun.args.query ? `"${String(toolRun.args.query)}"` : "đã hỏi"}.`,
        preview ? `Món nổi bật: ${preview}.` : ""
      ].filter(Boolean);
    }
    case "find_best_seller": {
      const bestSellers = Array.isArray(result.bestSellers) ? (result.bestSellers as Array<Record<string, unknown>>) : [];
      const top = bestSellers
        .slice(0, 3)
        .map((item) => String(item.name ?? ""))
        .filter(Boolean)
        .join(", ");
      return [
        `Top món bán chạy đã xác thực: ${bestSellers.length} món.`,
        top ? `Món dẫn đầu: ${top}.` : ""
      ].filter(Boolean);
    }
    case "summarize_sales":
      return [`Doanh thu ${String(result.timeRange ?? "today")}: ${Number(result.totalOrders ?? 0)} đơn, ${Number(result.paidOrders ?? 0)} đơn đã thanh toán, ${formatCurrency(Number(result.totalRevenue ?? 0))}.`];
    case "analyze_peak_hour":
      return [`Khung giờ cao điểm: ${String(result.peakHour ?? "chưa rõ")} với khoảng ${Number(result.avgOrdersPerDay ?? 0)} đơn/ngày.`];
    case "detect_payment_issue": {
      const issues = Array.isArray(result.issues) ? (result.issues as Array<Record<string, unknown>>) : [];
      const refs = issues
        .slice(0, 3)
        .map((issue) => String(issue.orderId ?? ""))
        .filter(Boolean)
        .join(", ");
      return [
        `Thanh toán cần chú ý: ${Number(result.issuesCount ?? issues.length)} giao dịch.`,
        refs ? `Mã tham chiếu: ${refs}.` : ""
      ].filter(Boolean);
    }
    case "generate_campaign": {
      const campaign = asToolRecord(result.suggestedCampaign);
      return [
        `Chiến dịch gợi ý: ${String(campaign?.title ?? "chưa rõ")}.`,
        campaign?.estimatedImpact ? `Kỳ vọng: ${String(campaign.estimatedImpact)}.` : ""
      ].filter(Boolean);
    }
    case "create_combo": {
      const items = Array.isArray(result.items) ? (result.items as Array<Record<string, unknown>>) : [];
      const names = items
        .slice(0, 3)
        .map((item) => String(item.name ?? ""))
        .filter(Boolean)
        .join(", ");
      return [
        `${String(result.comboName ?? "Combo gợi ý")}: ${items.length} món, tổng ${formatCurrency(Number(result.totalPrice ?? 0))}.`,
        names ? `Ưu tiên thêm: ${names}.` : ""
      ].filter(Boolean);
    }
    default:
      return [String(result.message || `${toolRun.name} đã chạy xong.`)];
  }
}

function buildToolEvidenceMessage(surface: "owner" | "customer", toolRuns: ExecutedAiToolCall[]) {
  const facts = toolRuns.flatMap(summarizeToolExecution);
  const cues = Array.from(
    new Set(
      toolRuns.flatMap((toolRun) => {
        switch (toolRun.name) {
          case "detect_payment_issue":
            return ["Ưu tiên CTA mở màn thanh toán hoặc thao tác đối soát thủ công, không xác nhận tiền nếu chưa kiểm tra."];
          case "generate_campaign":
            return ["Nếu chiến dịch hợp lý, ưu tiên CTA tạo draft hành động thay vì mô tả dài."];
          case "search_menu":
          case "create_combo":
            return ["Chỉ gợi ý CTA thêm món đúng theo dữ liệu menu đã xác thực, không bịa món mới."];
          default:
            return [];
        }
      })
    )
  );

  return [
    "Công cụ nội bộ đã xác thực xong. Chỉ dùng các sự thật sau, không nhắc tên tool, không lộ JSON thô.",
    ...facts.map((fact) => `- ${fact}`),
    cues.length ? `Ưu tiên action:\n${cues.map((cue) => `- ${cue}`).join("\n")}` : "",
    surface === "owner"
      ? "Nếu đã đủ dữ liệu thì trả lời cực gọn theo hướng vận hành: nhận định, việc cần làm ngay, lưu ý an toàn. Chỉ gọi thêm tool nếu còn thiếu một dữ kiện quan trọng."
      : "Nếu đã đủ dữ liệu thì trả lời cực gọn cho khách và nhắc CTA phù hợp bên dưới nếu có. Chỉ gọi thêm tool nếu còn thiếu một dữ kiện quan trọng."
  ]
    .filter(Boolean)
    .join("\n");
}

function hasUsableAssistantReply(value: string) {
  const text = sanitizeAssistantText(value, 900);
  return text.length > 0 && !looksLikeRawAssistantPayload(text);
}

function buildToolCallSignature(toolCalls: AiToolCall[]) {
  return toolCalls
    .slice(0, 4)
    .map((toolCall) => `${toolCall.function.name}:${JSON.stringify(parseToolArguments(toolCall.function.arguments))}`)
    .sort()
    .join("|");
}

function buildSyntheticToolCall(name: string, args: Record<string, unknown> = {}, prefix = "proactive"): AiToolCall {
  return {
    id: `${prefix}-${name}-${JSON.stringify(args).slice(0, 72)}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  };
}

function dedupeToolCalls(toolCalls: AiToolCall[]) {
  const seen = new Set<string>();
  return toolCalls.filter((toolCall) => {
    const signature = `${toolCall.function.name}:${JSON.stringify(parseToolArguments(toolCall.function.arguments))}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function foldedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferSalesRange(message: string) {
  const folded = foldedText(message);
  if (/hom qua|yesterday/.test(folded)) return "yesterday";
  if (/tuan|week/.test(folded)) return "this_week";
  if (/thang|month/.test(folded)) return "this_month";
  return "today";
}

function inferCampaignGoal(message: string) {
  const folded = foldedText(message);
  if (/khach moi|new customer|acquire/.test(folded)) return "acquire_new_customers";
  if (/ton|cham|xa hang|inventory/.test(folded)) return "clear_inventory";
  return "increase_revenue";
}

function extractBudget(message: string) {
  const folded = foldedText(message).replace(/,/g, ".");
  const match = folded.match(/(\d+(?:\.\d+)?)\s*(k|nghin|ngan|trieu|m|000)?/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] ?? "";
  if (unit === "trieu" || unit === "m") return Math.round(value * 1_000_000);
  if (unit === "k" || unit === "nghin" || unit === "ngan") return Math.round(value * 1_000);
  return value >= 10_000 ? Math.round(value) : null;
}

function extractPeopleCount(message: string) {
  const folded = foldedText(message);
  const match = folded.match(/(\d+)\s*(nguoi|ban|pax)/);
  if (!match) return 1;
  return Math.min(Math.max(Number(match[1]), 1), 12);
}

function extractMenuSearchQuery(message: string) {
  const folded = foldedText(message);
  const knownTerms: Array<[string, string]> = [
    ["ca phe", "cà phê"],
    ["bac xiu", "bạc xỉu"],
    ["tra sua", "trà sữa"],
    ["matcha", "matcha"],
    ["tra", "trà"],
    ["sua", "sữa"],
    ["banh", "bánh"],
    ["com", "cơm"],
    ["bun", "bún"],
    ["pho", "phở"],
    ["ga", "gà"],
    ["bo", "bò"],
    ["hai san", "hải sản"],
    ["chay", "chay"],
    ["it ngot", "ít ngọt"],
    ["it cay", "ít cay"]
  ];
  const match = knownTerms.find(([term]) => folded.includes(term));
  if (match) return match[1];

  const cleaned = folded
    .replace(/\b(goi y|mon nao|nen|thu|tim|kiem|menu|cho toi|toi muon|khach|an|uong|combo|duoi|khoang|ngon|de)\b/g, " ")
    .replace(/\d+\s*(k|nghin|ngan|trieu|m|000)?/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const candidate = cleaned
    .split(" ")
    .filter((part) => part.length >= 3)
    .slice(0, 3)
    .join(" ");

  return candidate.length >= 2 ? candidate : null;
}

function buildOwnerProactiveToolCalls(intent: OwnerAiIntent, message: string) {
  const calls: AiToolCall[] = [];

  if (intent === "overview" || intent === "reports") {
    calls.push(buildSyntheticToolCall("summarize_sales", { timeRange: inferSalesRange(message) }));
  }

  if (intent === "overview" || intent === "payments") {
    calls.push(buildSyntheticToolCall("detect_payment_issue"));
  }

  if (intent === "kitchen" || intent === "reports" || intent === "staff") {
    calls.push(buildSyntheticToolCall("analyze_peak_hour", { dayOfWeek: "all" }));
  }

  if (intent === "menu") {
    const query = extractMenuSearchQuery(message);
    if (query) calls.push(buildSyntheticToolCall("search_menu", { query }));
    calls.push(buildSyntheticToolCall("find_best_seller", { limit: 5 }));
  }

  if (intent === "promotions" || intent === "growth") {
    calls.push(buildSyntheticToolCall("generate_campaign", { goal: inferCampaignGoal(message) }));
  }

  return dedupeToolCalls(calls).slice(0, 3);
}

function buildCustomerProactiveToolCalls(intent: CustomerAiIntent, message: string) {
  const calls: AiToolCall[] = [];
  const budget = extractBudget(message);
  const shouldBuildCombo = intent === "cart" || /combo|nhom|nguoi|duoi|khoang/.test(foldedText(message));

  if (budget && shouldBuildCombo) {
    calls.push(buildSyntheticToolCall("create_combo", { budget, peopleCount: extractPeopleCount(message) }));
  }

  if (intent === "menu_discovery" || intent === "promotion" || intent === "allergy") {
    const query = extractMenuSearchQuery(message);
    if (query) calls.push(buildSyntheticToolCall("search_menu", { query }));
  }

  return dedupeToolCalls(calls).slice(0, 2);
}

async function runToolAwareChat(input: {
  surface: "owner" | "customer";
  messages: AiMessage[];
  preferredProvider?: AiProvider;
  modelOverride?: string;
  maxTokens: number;
  taskType: AiTaskType;
  toolContext: { restaurantId: string; userId?: string | null; customerSessionId?: string | null };
  proactiveToolCalls?: AiToolCall[];
}) {
  let toolRuns: ExecutedAiToolCall[] = input.proactiveToolCalls?.length
    ? await resolveAiToolCalls(input.proactiveToolCalls, input.toolContext)
    : [];

  if (toolRuns.length > 0) {
    input.messages.push({
      role: "system",
      content: buildToolEvidenceMessage(input.surface, toolRuns)
    });
  }

  let result = await runChat(
    input.messages,
    input.preferredProvider,
    input.modelOverride,
    {
      maxTokens: input.maxTokens,
      tools: allAiTools,
      toolChoice: "auto"
    },
    input.taskType
  );

  const seenToolSignatures = new Set<string>(input.proactiveToolCalls?.length ? [buildToolCallSignature(input.proactiveToolCalls)] : []);

  for (let round = 0; round < 2; round += 1) {
    const toolCalls = result.toolCalls?.slice(0, 4) ?? [];
    if (!toolCalls.length) break;

    const signature = buildToolCallSignature(toolCalls);
    if (!signature || seenToolSignatures.has(signature)) break;
    seenToolSignatures.add(signature);

    const roundToolRuns = await resolveAiToolCalls(toolCalls, input.toolContext);
    toolRuns = [...toolRuns, ...roundToolRuns];

    input.messages.push({
      role: "system",
      content: buildToolEvidenceMessage(input.surface, toolRuns)
    });

    result = await runChat(
      input.messages,
      result.provider,
      result.model,
      {
        maxTokens: input.maxTokens,
        tools: allAiTools,
        toolChoice: "auto"
      },
      "tool"
    );
  }

  if (toolRuns.length > 0 && (Boolean(result.toolCalls?.length) || !hasUsableAssistantReply(result.text))) {
    input.messages.push({
      role: "system",
      content:
        "Không gọi thêm công cụ. Dựa hoàn toàn trên dữ liệu đã xác thực để trả lời ngay bằng 1-3 câu ngắn, nêu việc cần làm tiếp theo nếu có, không markdown."
    });

    result = await runChat(
      input.messages,
      result.provider,
      result.model,
      { maxTokens: input.maxTokens },
      "tool"
    );
  }

  return { result, toolRuns };
}

function actionCue(actions: AiAgentAction[], surface: "owner" | "customer") {
  const primaryAction = actions.find((action) => action.priority === "primary") ?? actions[0];
  if (!primaryAction) return "";
  return surface === "owner"
    ? `Mình đã chuẩn bị action "${primaryAction.label}" để bạn xử lý ngay.`
    : `Mình đã chuẩn bị nút "${primaryAction.label}" cho bước tiếp theo.`;
}

function safetyCue(actions: AiAgentAction[]) {
  const sensitiveAction = actions.find((action) => action.safety === "manual_only" || action.safety === "confirm");
  if (!sensitiveAction) return "";
  return sensitiveAction.safety === "manual_only"
    ? "Hãy kiểm tra dữ liệu thật trước khi bấm xác nhận."
    : "Hãy xem lại nhanh trước khi xác nhận hành động.";
}

function buildOwnerSnapshotCue(intent: OwnerAiIntent, snapshot?: unknown) {
  const data = (snapshot ?? {}) as {
    summary24h?: { orderCount?: number; paidRevenue?: number };
    recentOrders?: Array<Record<string, unknown>>;
    tables?: { activeTableCount?: number };
    payments?: { waitingConfirm?: number };
    menu?: { unavailableCount?: number; itemCount?: number };
  };

  switch (intent) {
    case "payments":
      return typeof data.payments?.waitingConfirm === "number"
        ? `Hiện có ${data.payments.waitingConfirm} giao dịch đang chờ kiểm tra.`
        : "";
    case "tables":
      return typeof data.tables?.activeTableCount === "number"
        ? `${data.tables.activeTableCount} bàn đang có đơn mở trong ca hiện tại.`
        : "";
    case "menu":
      return typeof data.menu?.unavailableCount === "number" && typeof data.menu?.itemCount === "number"
        ? `Menu hiện có ${data.menu.itemCount} món, trong đó ${data.menu.unavailableCount} món đang tạm ẩn hoặc hết.`
        : "";
    case "reports":
      return data.summary24h
        ? `24 giờ gần nhất có ${Number(data.summary24h.orderCount ?? 0)} đơn và ${formatCurrency(Number(data.summary24h.paidRevenue ?? 0))} doanh thu đã thanh toán.`
        : "";
    case "orders":
    case "kitchen":
    case "overview":
      return data.summary24h
        ? `Ca hiện tại ghi nhận ${Number(data.summary24h.orderCount ?? 0)} đơn trong 24 giờ gần nhất.`
        : "";
    default:
      return Array.isArray(data.recentOrders) && data.recentOrders.length > 0 ? "Mình đã đọc snapshot vận hành mới nhất của quán." : "";
  }
}

function buildCustomerSnapshotCue(intent: CustomerAiIntent, input: { menuSnapshot?: unknown; cart?: unknown; orderStatus?: unknown }) {
  const cartRecord = asToolRecord(input.cart);
  const cartItems = Array.isArray(input.cart)
    ? input.cart
    : Array.isArray(cartRecord?.items)
      ? cartRecord.items
      : Array.isArray(cartRecord?.lines)
        ? cartRecord.lines
        : [];
  const orderStatus = asToolRecord(input.orderStatus);
  const menuSnapshot = (input.menuSnapshot ?? {}) as { categories?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };
  const categoryCount = Array.isArray(menuSnapshot.categories) ? menuSnapshot.categories.length : 0;
  const itemCount = Array.isArray(menuSnapshot.items) ? menuSnapshot.items.length : 0;

  switch (intent) {
    case "cart":
    case "payment":
      return cartItems.length > 0 ? `Giỏ hiện tại có ${cartItems.length} món.` : "Mình đã kiểm tra giỏ và bước thanh toán hiện tại.";
    case "order_status":
      return orderStatus?.status ? `Đơn hiện tại đang ở trạng thái ${String(orderStatus.status)}.` : "Mình đã kiểm tra trạng thái đơn gần nhất.";
    default:
      return categoryCount > 0 || itemCount > 0 ? `Mình đã kiểm tra menu thật của quán trước khi gợi ý.` : "";
  }
}

function buildOwnerFallbackReply(input: {
  intent: OwnerAiIntent;
  snapshot?: unknown;
  toolRuns: ExecutedAiToolCall[];
  actions: AiAgentAction[];
}) {
  const fact = input.toolRuns.flatMap(summarizeToolExecution).find(Boolean) || buildOwnerSnapshotCue(input.intent, input.snapshot);
  return [fact || "Mình đã đọc dữ liệu vận hành thật của quán.", actionCue(input.actions, "owner"), safetyCue(input.actions)]
    .filter(Boolean)
    .join(" ");
}

function buildCustomerFallbackReply(input: {
  intent: CustomerAiIntent;
  menuSnapshot?: unknown;
  cart?: unknown;
  orderStatus?: unknown;
  toolRuns: ExecutedAiToolCall[];
  actions: AiAgentAction[];
}) {
  const fact =
    input.toolRuns.flatMap(summarizeToolExecution).find(Boolean) ||
    buildCustomerSnapshotCue(input.intent, {
      menuSnapshot: input.menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus
    });

  return [fact || "Mình đã kiểm tra dữ liệu thật trước khi gợi ý.", actionCue(input.actions, "customer"), safetyCue(input.actions)]
    .filter(Boolean)
    .join(" ");
}

async function getRestaurantContext(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán để chạy AI.", 404);
  return data as RestaurantAiContext;
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function safeSupabaseQuery<T>(query: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  return data ?? null;
}

async function safeSupabaseCount(query: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>) {
  const { count, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

function compactOrder(row: any) {
  const table = firstOrNull(row.table);
  const orderId = String(row.id ?? "");
  return {
    id: orderId,
    shortId: orderId.slice(0, 8).toUpperCase(),
    status: row.status ?? null,
    total: Number(row.total ?? 0),
    paymentStatus: row.payment_status ?? null,
    paymentMethod: row.payment_method ?? null,
    fulfillmentType: row.fulfillment_type ?? "DINE_IN",
    tableName: table?.name ?? (row.fulfillment_type === "DELIVERY" ? "Giao hàng" : row.fulfillment_type === "PICKUP" ? "Đến lấy" : "Không rõ bàn"),
    customerName: row.customer_name ?? null,
    deliveryAddress: row.delivery_address ?? null,
    deliveryDistanceKm: row.delivery_distance_km ?? null,
    createdAt: row.created_at ?? null,
    acceptedAt: row.accepted_at ?? null,
    servedAt: row.served_at ?? null,
    serviceDueAt: row.service_due_at ?? null,
    items: ((row.items ?? []) as any[]).slice(0, 6).map((item) => {
      const menuItem = firstOrNull(item.menuItem);
      return {
        name: menuItem?.name ?? "Món chưa rõ",
        quantity: Number(item.quantity ?? 0),
        price: Number(item.price ?? 0),
        note: item.note ?? null
      };
    })
  };
}

function countRowsBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function intentNeeds(intent: OwnerAiIntent, candidates: OwnerAiIntent[]) {
  return intent === "overview" || intent === "setup" || candidates.includes(intent);
}

async function getRestaurantSetupBundle(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurant, tableCount, menuItemCount, categoryCount, staffCount, promotionCount] = await Promise.all([
    safeSupabaseQuery<RestaurantRow>(supabase.from("restaurants").select("*").eq("id", restaurantId).maybeSingle()),
    safeSupabaseCount(supabase.from("tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("users").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("promotions").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId))
  ]);

  if (!restaurant) throw new AppError("Không tìm thấy quán để AI thiết lập.", 404);
  return {
    restaurant,
    metrics: {
      tableCount,
      menuItemCount,
      categoryCount,
      staffCount,
      promotionCount
    }
  };
}

async function getOwnerOperationalSnapshot(restaurantId: string, intent: OwnerAiIntent, restaurant: RestaurantAiContext) {
  const supabase = createAdminSupabaseClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = monthStartIso();

  const recentOrdersPromise = safeSupabaseQuery<any[]>(
    supabase
      .from("orders")
      .select(
        "id,status,total,payment_method,payment_status,fulfillment_type,customer_name,delivery_address,delivery_distance_km,created_at,accepted_at,served_at,service_due_at,table:tables(name),items:order_items(quantity,price,note,menuItem:menu_items(name))"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12)
  );

  const todayOrdersPromise = safeSupabaseQuery<any[]>(
    supabase
      .from("orders")
      .select("id,status,total,payment_status,payment_method,fulfillment_type,created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(150)
  );

  const menuPromise = intentNeeds(intent, ["menu", "reports", "growth"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("menu_categories")
          .select("id,name,items:menu_items(id,category_id,name,price,image_url,is_available)")
          .eq("restaurant_id", restaurantId)
          .order("name", { ascending: true })
          .order("name", { referencedTable: "menu_items", ascending: true })
      )
    : Promise.resolve(null);

  const tablesPromise = intentNeeds(intent, ["tables", "orders", "kitchen"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("tables")
          .select("id,name,area,capacity,qr_enabled,orders:orders(id,status,total,created_at,service_due_at)")
          .eq("restaurant_id", restaurantId)
          .in("orders.status", ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"])
          .order("name", { ascending: true })
      )
    : Promise.resolve(null);

  const paymentsPromise = intentNeeds(intent, ["payments", "reports"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("payment_logs")
          .select("id,order_id,method,status,amount,created_at,order:orders!inner(restaurant_id,total,status,created_at)")
          .eq("order.restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(30)
      )
    : Promise.resolve(null);

  const promotionsPromise = intentNeeds(intent, ["promotions", "growth", "menu"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("promotions")
          .select("id,name,code,discount_type,discount_value,min_order_amount,is_active,show_on_customer_menu,starts_at,ends_at,channels")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(20)
      )
    : Promise.resolve(null);

  const reservationsPromise = intentNeeds(intent, ["reservations", "reports"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("reservations")
          .select("id,status,customer_name,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_status,created_at")
          .eq("restaurant_id", restaurantId)
          .order("starts_at", { ascending: true })
          .limit(30)
      )
    : Promise.resolve(null);

  const [recentOrdersRaw, todayOrdersRaw, menuRaw, tablesRaw, paymentsRaw, promotionsRaw, reservationsRaw] = await Promise.all([
    recentOrdersPromise,
    todayOrdersPromise,
    menuPromise,
    tablesPromise,
    paymentsPromise,
    promotionsPromise,
    reservationsPromise
  ]);

  const todayOrders = todayOrdersRaw ?? [];
  const paidRevenue = todayOrders
    .filter((order) => order.status === "paid" || order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.total ?? 0), 0);

  const menuCategories = (menuRaw ?? []).map((category) => {
    const items = ((category.items ?? []) as any[]).map((item) => ({
      id: String(item.id ?? ""),
      categoryId: String(item.category_id ?? category.id ?? ""),
      categoryName: category.name,
      name: item.name,
      price: Number(item.price ?? 0),
      image: item.image_url ?? null,
      available: Boolean(item.is_available)
    }));
    return {
      name: category.name,
      itemCount: items.length,
      availableCount: items.filter((item) => item.available).length,
      unavailableCount: items.filter((item) => !item.available).length,
      sampleItems: items.slice(0, 8)
    };
  });

  const tables = (tablesRaw ?? []).map((table) => {
    const orders = ((table.orders ?? []) as any[]).filter(Boolean);
    return {
      id: String(table.id ?? "").slice(0, 8),
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      qrEnabled: table.qr_enabled,
      activeOrderCount: orders.length,
      unpaidTotal: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      statuses: countRowsBy(orders, "status"),
      nextServiceDueAt: orders
        .map((order) => order.service_due_at)
        .filter(Boolean)
        .sort()[0] ?? null
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    intent,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      businessType: restaurant.business_type,
      address: restaurant.address,
      hotline: restaurant.hotline,
      setupReadiness:
        intent === "setup"
          ? await getRestaurantSetupBundle(restaurantId)
              .then((bundle) => buildStoreSetupReadiness(bundle.restaurant, bundle.metrics))
              .catch(() => null)
          : null
    },
    summary24h: {
      orderCount: todayOrders.length,
      statusCount: countRowsBy(todayOrders, "status"),
      paymentStatusCount: countRowsBy(todayOrders, "payment_status"),
      fulfillmentCount: countRowsBy(todayOrders, "fulfillment_type"),
      paidRevenue,
      monthStart
    },
    recentOrders: (recentOrdersRaw ?? []).map(compactOrder),
    menu: menuCategories.length
      ? {
          categoryCount: menuCategories.length,
          itemCount: menuCategories.reduce((sum, category) => sum + category.itemCount, 0),
          unavailableCount: menuCategories.reduce((sum, category) => sum + category.unavailableCount, 0),
          categories: menuCategories
        }
      : null,
    tables: tables.length
      ? {
          tableCount: tables.length,
          qrDisabledCount: tables.filter((table) => !table.qrEnabled).length,
          activeTableCount: tables.filter((table) => table.activeOrderCount > 0).length,
          tables
        }
      : null,
    payments: paymentsRaw
      ? {
          count: paymentsRaw.length,
          waitingConfirm: paymentsRaw.filter((payment) => payment.status === "waiting_confirm" || payment.status === "pending").length,
          logs: paymentsRaw.slice(0, 12).map((payment) => ({
            id: String(payment.id ?? "").slice(0, 8),
            orderId: String(payment.order_id ?? "").slice(0, 8),
            method: payment.method,
            status: payment.status,
            amount: Number(payment.amount ?? 0),
            createdAt: payment.created_at
          }))
        }
      : null,
    promotions: promotionsRaw
      ? promotionsRaw.map((promotion) => ({
          id: String(promotion.id ?? "").slice(0, 8),
          name: promotion.name,
          code: promotion.code,
          active: promotion.is_active,
          showOnCustomerMenu: promotion.show_on_customer_menu,
          discountType: promotion.discount_type,
          discountValue: promotion.discount_value,
          minOrderAmount: promotion.min_order_amount,
          channels: promotion.channels,
          startsAt: promotion.starts_at,
          endsAt: promotion.ends_at
        }))
      : null,
    reservations: reservationsRaw
      ? reservationsRaw.map((reservation) => ({
          id: String(reservation.id ?? "").slice(0, 8),
          status: reservation.status,
          customerName: reservation.customer_name,
          partySize: reservation.party_size,
          startsAt: reservation.starts_at,
          endsAt: reservation.ends_at,
          holdExpiresAt: reservation.hold_expires_at,
          depositRequiredAmount: reservation.deposit_required_amount,
          depositStatus: reservation.deposit_status
        }))
      : null
  };
}

async function getCustomerMenuSnapshot(restaurantId: string, intent: CustomerAiIntent) {
  if (!["menu_discovery", "cart", "promotion", "allergy", "delivery"].includes(intent)) return null;

  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const [categoriesRaw, promotionsRaw, restaurantRaw] = await Promise.all([
    safeSupabaseQuery<any[]>(
      supabase
        .from("menu_categories")
        .select("id,name,items:menu_items(id,category_id,name,price,image_url,is_available)")
        .eq("restaurant_id", restaurantId)
        .eq("items.is_available", true)
        .order("name", { ascending: true })
        .order("name", { referencedTable: "menu_items", ascending: true })
        .limit(12)
    ),
    safeSupabaseQuery<any[]>(
      supabase
        .from("promotions")
        .select("name,code,discount_type,discount_value,min_order_amount,starts_at,ends_at")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .eq("show_on_customer_menu", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    safeSupabaseQuery<any>(
      supabase
        .from("restaurants")
        .select("online_ordering_enabled,pickup_enabled,delivery_enabled,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,online_payment_mode")
        .eq("id", restaurantId)
        .maybeSingle()
    )
  ]);

  return {
    ordering: restaurantRaw ?? null,
    categories: (categoriesRaw ?? []).slice(0, 8).map((category) => ({
      name: category.name,
      items: ((category.items ?? []) as any[])
        .filter((item) => item.is_available)
        .slice(0, 10)
        .map((item) => ({
          id: String(item.id ?? ""),
          categoryId: String(item.category_id ?? category.id ?? ""),
          categoryName: category.name,
          name: item.name,
          price: Number(item.price ?? 0),
          image: item.image_url ?? null
        }))
    })),
    promotions: (promotionsRaw ?? []).map((promotion) => ({
      name: promotion.name,
      code: promotion.code,
      discountType: promotion.discount_type,
      discountValue: promotion.discount_value,
      minOrderAmount: promotion.min_order_amount,
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at
    }))
  };
}

export async function getRestaurantIdBySlug(slug: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán.", 404);
  return data.id as string;
}

async function logAiUsage({
  restaurantId,
  userId,
  customerSessionId,
  featureKey,
  provider,
  model,
  requestKind,
  status,
  inputTokens,
  outputTokens,
  imageCount,
  errorMessage,
  metadata
}: {
  restaurantId: string;
  userId?: string | null;
  customerSessionId?: string | null;
  featureKey: PlanFeatureKey;
  provider: AiProvider | "prompt-only";
  model: string;
  requestKind: AiRequestKind;
  status: "success" | "failed" | "blocked";
  inputTokens?: number | null;
  outputTokens?: number | null;
  imageCount?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("ai_usage_logs").insert({
    restaurant_id: restaurantId,
    user_id: userId ?? null,
    customer_session_id: customerSessionId ?? null,
    feature_key: featureKey,
    provider,
    model,
    request_kind: requestKind,
    status,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    image_count: imageCount ?? null,
    error_message: errorMessage ?? null,
    metadata: metadata ?? {}
  });

  if (error && !isMissingSchemaError(error)) throw error;

  const billingFeatureKey = legacyAiBillingFeatureMap[featureKey];
  if (!billingFeatureKey) return;

  const snapshot = await getResolvedBillingEntitlementSnapshotForRestaurant({ restaurantId }).catch(() => null);
  const access = snapshot?.features[billingFeatureKey];
  const quotaKey = access?.usage?.key ?? billingFeatureKey;
  const quotaWindow = access?.usage?.window ?? "monthly";
  const quotaLimit = access?.usage?.limit ?? null;
  const consumesTrial = Boolean(access && !access.includedInPlan && access.state === "active");
  const imageQuotaCountsImages = billingFeatureKey === "ai_image_generation" && (imageCount ?? 0) > 0;

  await recordBillingUsageEvent({
    restaurantId,
    featureKey: billingFeatureKey,
    quotaKey,
    dimension: "ai_requests",
    quantity: status === "success" ? 1 : 0,
    limitValue: quotaLimit,
    window: quotaWindow,
    countAgainstQuota: !imageQuotaCountsImages,
    consumeTrial: consumesTrial && !imageQuotaCountsImages,
    trialFeatureKey: billingFeatureKey,
    userId,
    provider,
    model,
    status,
    metadata: {
      ...(metadata ?? {}),
      customerSessionId: customerSessionId ?? null,
      requestKind
    }
  }).catch((ledgerError) => {
    console.error("[ai-service] Failed to record billing usage event", ledgerError);
  });

  const tokenTotal = Math.max(0, Number(inputTokens ?? 0)) + Math.max(0, Number(outputTokens ?? 0));
  if (status === "success" && tokenTotal > 0) {
    await recordBillingUsageEvent({
      restaurantId,
      featureKey: billingFeatureKey,
      quotaKey: `${billingFeatureKey}_tokens`,
      dimension: "ai_tokens",
      quantity: tokenTotal,
      limitValue: null,
      window: "monthly",
      countAgainstQuota: false,
      userId,
      provider,
      model,
      status,
      metadata: {
        ...(metadata ?? {}),
        customerSessionId: customerSessionId ?? null,
        requestKind
      }
    }).catch((ledgerError) => {
      console.error("[ai-service] Failed to record token usage event", ledgerError);
    });
  }

  if (status === "success" && (imageCount ?? 0) > 0) {
    await recordBillingUsageEvent({
      restaurantId,
      featureKey: billingFeatureKey,
      quotaKey,
      dimension: "ai_images",
      quantity: Number(imageCount ?? 0),
      limitValue: quotaLimit,
      window: quotaWindow,
      consumeTrial: consumesTrial,
      trialFeatureKey: billingFeatureKey,
      userId,
      provider,
      model,
      status,
      metadata: {
        ...(metadata ?? {}),
        customerSessionId: customerSessionId ?? null,
        requestKind
      }
    }).catch((ledgerError) => {
      console.error("[ai-service] Failed to record image usage event", ledgerError);
    });
  }
}

async function assertAiEntitlement({
  restaurantId,
  featureKey,
  userId,
  customerSessionId
}: {
  restaurantId: string;
  featureKey: PlanFeatureKey;
  userId?: string | null;
  customerSessionId?: string | null;
}) {
  const billingFeatureKey = legacyAiBillingFeatureMap[featureKey];
  if (billingFeatureKey) {
    const snapshot = await getResolvedBillingEntitlementSnapshotForRestaurant({ restaurantId }).catch(() => null);
    const access = snapshot?.features[billingFeatureKey];
    if (access) {
      const blockState = snapshot?.status === "expired" ? "subscription_expired" : access.state;
      if (blockState !== "active") {
        const errorMessage = billingAccessErrorMessage(access.label, blockState);
        await logAiUsage({
          restaurantId,
          userId,
          customerSessionId,
          featureKey,
          provider: "prompt-only",
          model: `${blockState}-guard`,
          requestKind: "tool",
          status: "blocked",
          errorMessage
        });
        throw new AppError(errorMessage, 402);
      }

      await assertRestaurantEntitlement(restaurantId);
      return null;
    }
  }

  const entitlement = await assertFeatureEntitlement(restaurantId, featureKey);
  const limit = entitlement.features[featureKey]?.limitValue;

  if (typeof limit === "number") {
    const supabase = createAdminSupabaseClient() as any;
    const { count, error } = await supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("feature_key", featureKey)
      .eq("status", "success")
      .gte("created_at", monthStartIso());

    if (error) {
      if (!isMissingSchemaError(error)) throw error;
    } else if (Number(count ?? 0) >= limit) {
      await logAiUsage({
        restaurantId,
        userId,
        customerSessionId,
        featureKey,
        provider: "prompt-only",
        model: "entitlement-guard",
        requestKind: "tool",
        status: "blocked",
        errorMessage: `Vượt giới hạn ${limit} lượt ${planFeatureLabels[featureKey]} trong tháng.`
      });
      throw new AppError(`Gói hiện tại giới hạn ${limit} lượt ${planFeatureLabels[featureKey]} mỗi tháng. Vui lòng nâng cấp hoặc chờ kỳ mới.`, 402);
    }
  }

  return entitlement;
}

async function qwenChat(
  config: NativeAiProviderConfig,
  model: string,
  messages: AiMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<LegacyAiCompletionResult> {
  const response = await fetch(`${config.baseUrl}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: options?.maxTokens,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {})
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "Qwen từ chối xử lý yêu cầu AI.", 502);
  }

  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    provider: "qwen",
    model,
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function qwenMultimodalOcr({
  config,
  prompt,
  imageUrl,
  imageBase64
}: {
  config: NativeAiProviderConfig;
  prompt: string;
  imageUrl?: string;
  imageBase64?: string;
}): Promise<LegacyAiCompletionResult> {
  if (config.provider !== "qwen") {
    throw new AppError("OCR menu yêu cầu cấu hình Qwen/DashScope hợp lệ.", 500);
  }

  const imagePayload = normalizeQwenImagePayload({ imageUrl, imageBase64 });
  if (!imagePayload) throw new AppError("Thiếu ảnh menu để AI OCR.", 400);

  const response = await fetch(`${config.baseUrl}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: providerDefaults.qwenOcrModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: imagePayload },
              min_pixels: 32 * 32 * 3,
              max_pixels: 32 * 32 * 8192
            }
          ]
        }
      ],
      temperature: 0.01,
      max_tokens: 3500
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "Qwen OCR không đọc được menu.", 502);
  }

  const content = json?.choices?.[0]?.message?.content ?? json?.output?.choices?.[0]?.message?.content;
  const text = readAiMessageContent(content) || String(json?.output?.text ?? "").trim();

  return {
    text,
    provider: "qwen",
    model: providerDefaults.qwenOcrModel,
    inputTokens: json?.usage?.prompt_tokens ?? json?.usage?.input_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? json?.usage?.output_tokens ?? null,
    raw: json
  };
}

async function xaiChat(config: NativeAiProviderConfig, model: string, messages: AiMessage[], options?: { maxTokens?: number }): Promise<LegacyAiCompletionResult> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: options?.maxTokens
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "xAI từ chối xử lý yêu cầu AI.", 502);
  }

  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    provider: "xai",
    model,
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function runChat(
  messages: AiMessage[],
  preferred?: AiProvider,
  modelOverride?: string,
  options?: Pick<AiCompletionOptions, "jsonMode" | "maxTokens" | "cacheTtlMs" | "tools" | "toolChoice">,
  taskType: AiTaskType = "dashboard_operation"
) {
  return runAiCompletion({
    taskType,
    messages,
    preferredProvider: preferred,
    modelOverride,
    options: {
      jsonMode: options?.jsonMode,
      maxTokens: options?.maxTokens,
      cacheTtlMs: options?.cacheTtlMs,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
      timeoutMs: taskType === "customer_ordering" ? 8_000 : 14_000
    }
  });
}

export async function runOwnerAssistant(input: {
  restaurantId: string;
  userId: string;
  threadId?: string | null;
  message: string;
  intent?: string | null;
  context?: Record<string, unknown>;
}) {
  const intent = normalizeOwnerAiIntent(input.intent, input.message);
  await assertAiEntitlement({
    restaurantId: input.restaurantId,
    featureKey: intent === "reports" ? "advanced_reports" : "ai_owner_assistant",
    userId: input.userId
  });
  if (!rateLimit(`ai-owner:${input.restaurantId}:${input.userId}`, 24, 60_000)) {
    throw new AppError("Bạn đang hỏi AI quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const restaurant = await getRestaurantContext(input.restaurantId);
  const snapshot = await getOwnerOperationalSnapshot(input.restaurantId, intent, restaurant);
  const messages = buildOwnerAssistantMessages({
    restaurant,
    intent,
    message: normalizePrompt(input.message),
    context: input.context,
    snapshot
  });

  try {
    const { result, toolRuns } = await runToolAwareChat({
      surface: "owner",
      messages,
      preferredProvider: normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      maxTokens: 260,
      taskType: intent === "reports" ? "analytics_reasoning" : intent === "growth" ? "business_insight" : "dashboard_operation",
      toolContext: { restaurantId: input.restaurantId, userId: input.userId },
      proactiveToolCalls: buildOwnerProactiveToolCalls(intent, input.message)
    });

    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent }
    });
    const actions = buildOwnerAgentActions(intent, ownerAiIntentConfig[intent].suggestions, snapshot, toolRuns);
    const reply = hasUsableAssistantReply(result.text)
      ? sanitizeAssistantText(result.text, 520)
      : sanitizeAssistantText(
          buildOwnerFallbackReply({
            intent,
            snapshot,
            toolRuns,
            actions
          }),
          520
        );
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      threadId: input.threadId,
      surface: "dashboard",
      role: "user",
      content: input.message,
      metadata: { intent, source: "owner_ai", threadId: input.threadId ?? null }
    });
    await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      conversationId,
      userId: input.userId,
      threadId: input.threadId,
      surface: "dashboard",
      role: "assistant",
      content: reply,
      provider: result.provider,
      model: result.model,
      metadata: {
        intent,
        intentLabel: ownerAiIntentConfig[intent].label,
        suggestions: ownerAiIntentConfig[intent].suggestions,
        actions,
        agentPlan: buildOwnerAgentPlan(intent, actions),
        actionIds: actions.map((action) => action.id),
        tools: toolRuns.map((tool) => tool.name),
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        threadId: input.threadId ?? null
      }
    });
    return {
      reply,
      provider: result.provider,
      model: result.model,
      intent,
      intentLabel: ownerAiIntentConfig[intent].label,
      suggestions: ownerAiIntentConfig[intent].suggestions,
      actions,
      agentPlan: buildOwnerAgentPlan(intent, actions)
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI owner assistant failed",
      metadata: { intent }
    });

    const actions = buildOwnerAgentActions(intent, ownerAiIntentConfig[intent].suggestions, snapshot, []);
    const agentPlan = buildOwnerAgentPlan(intent, actions);
    const reply = sanitizeAssistantText(
      buildOwnerFallbackReply({
        intent,
        snapshot,
        toolRuns: [],
        actions
      }) || "Mình chưa gọi được model AI, nhưng đã chuẩn bị action an toàn để bạn tiếp tục thao tác ngay.",
      520
    );

    try {
      const conversationId = await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        userId: input.userId,
        threadId: input.threadId,
        surface: "dashboard",
        role: "user",
        content: input.message,
        metadata: { intent, source: "owner_ai_fallback", threadId: input.threadId ?? null }
      });
      await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        conversationId,
        userId: input.userId,
        threadId: input.threadId,
        surface: "dashboard",
        role: "assistant",
        content: reply,
        provider: "prompt-only",
        model: "deterministic-action-router",
        metadata: {
          intent,
          intentLabel: ownerAiIntentConfig[intent].label,
          suggestions: ownerAiIntentConfig[intent].suggestions,
          actions,
          agentPlan,
          actionIds: actions.map((action) => action.id),
          fallback: true,
          threadId: input.threadId ?? null
        }
      });
    } catch {
      // The user still needs an answer even if history persistence is temporarily unavailable.
    }

    return {
      reply,
      provider: "prompt-only",
      model: "deterministic-action-router",
      intent,
      intentLabel: ownerAiIntentConfig[intent].label,
      suggestions: ownerAiIntentConfig[intent].suggestions,
      actions,
      agentPlan
    };
  }
}

export async function generateStoreSetupPlan(input: {
  restaurantId: string;
  userId: string;
  mode?: "audit" | "express" | "growth";
  focus?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_owner_assistant", userId: input.userId });
  if (!rateLimit(`ai-setup:${input.restaurantId}:${input.userId}`, 10, 60_000)) {
    throw new AppError("Bạn đang yêu cầu AI setup quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const bundle = await getRestaurantSetupBundle(input.restaurantId);
  const readiness = buildStoreSetupReadiness(bundle.restaurant, bundle.metrics);
  const restaurant: RestaurantAiContext = {
    id: bundle.restaurant.id,
    name: bundle.restaurant.name,
    slug: bundle.restaurant.slug,
    business_type: bundle.restaurant.business_type,
    address: bundle.restaurant.address,
    hotline: bundle.restaurant.hotline,
    description: bundle.restaurant.description
  };
  const messages = buildStoreSetupPlanMessages({
    restaurant,
    readiness,
    mode: input.mode ?? "audit",
    focus: input.focus
  });

  try {
    const result = await runChat(
      messages,
      normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      undefined,
      { jsonMode: true, cacheTtlMs: 8_000 },
      "setup"
    );
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent: "setup", mode: input.mode ?? "audit" }
    });
    return {
      provider: result.provider,
      model: result.model,
      text: result.text,
      data: extractJsonObject(result.text),
      readiness,
      suggestions: ownerAiIntentConfig.setup.suggestions
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI setup plan failed",
      metadata: { intent: "setup", mode: input.mode ?? "audit" }
    });
    throw error;
  }
}

export async function generateStoreSetupDraft(input: {
  restaurantId: string;
  userId: string;
  kind?: string | null;
  focus?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_owner_assistant", userId: input.userId });
  if (!rateLimit(`ai-setup-draft:${input.restaurantId}:${input.userId}`, 12, 60_000)) {
    throw new AppError("Bạn đang yêu cầu AI tạo bản nháp quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const kind = normalizeStoreSetupDraftKind(input.kind);
  const bundle = await getRestaurantSetupBundle(input.restaurantId);
  const readiness = buildStoreSetupReadiness(bundle.restaurant, bundle.metrics);
  const restaurant: RestaurantAiContext = {
    id: bundle.restaurant.id,
    name: bundle.restaurant.name,
    slug: bundle.restaurant.slug,
    business_type: bundle.restaurant.business_type,
    address: bundle.restaurant.address,
    hotline: bundle.restaurant.hotline,
    description: bundle.restaurant.description
  };
  const messages = buildStoreSetupDraftMessages({
    restaurant,
    readiness,
    kind: kind as StoreSetupDraftKind,
    focus: input.focus
  });

  try {
    const result = await runChat(
      messages,
      normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      providerDefaults.qwenFastModel,
      {
        jsonMode: true,
        cacheTtlMs: 8_000
      },
      "setup"
    );
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent: "setup", draftKind: kind }
    });
    return {
      provider: result.provider,
      model: result.model,
      text: result.text,
      data: extractJsonObject(result.text),
      readiness,
      config: storeSetupDraftConfig[kind]
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI setup draft failed",
      metadata: { intent: "setup", draftKind: kind }
    });
    throw error;
  }
}

export async function runCustomerAssistant(input: {
  restaurantId: string;
  customerSessionId?: string | null;
  threadId?: string | null;
  message: string;
  intent?: string | null;
  cart?: unknown;
  orderStatus?: unknown;
}) {
  await assertAiEntitlement({
    restaurantId: input.restaurantId,
    featureKey: "ai_customer_assistant",
    customerSessionId: input.customerSessionId
  });
  if (!rateLimit(`ai-customer:${input.restaurantId}:${input.customerSessionId || "anon"}`, 18, 60_000)) {
    throw new AppError("Bạn đang hỏi trợ lý quá nhanh. Vui lòng thử lại sau.", 429);
  }

  const restaurant = await getRestaurantContext(input.restaurantId);
  const intent = normalizeCustomerAiIntent(input.intent, input.message);
  const menuSnapshot = await getCustomerMenuSnapshot(input.restaurantId, intent);
  const messages = buildCustomerAssistantMessages({
    restaurant,
    intent,
    message: normalizePrompt(input.message),
    cart: input.cart,
    orderStatus: input.orderStatus,
    menuSnapshot
  });

  try {
    const { result, toolRuns } = await runToolAwareChat({
      surface: "customer",
      messages,
      preferredProvider: normalizeAiProvider(process.env.AI_CUSTOMER_PROVIDER),
      modelOverride: providerDefaults.qwenFastModel,
      maxTokens: 180,
      taskType: "customer_ordering",
      toolContext: {
        restaurantId: input.restaurantId,
        customerSessionId: input.customerSessionId
      },
      proactiveToolCalls: buildCustomerProactiveToolCalls(intent, input.message)
    });
    await logAiUsage({
      restaurantId: input.restaurantId,
      customerSessionId: input.customerSessionId,
      featureKey: "ai_customer_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent }
    });
    const actions = buildCustomerAgentActions(intent, restaurant.slug, {
      menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus,
      message: input.message,
      toolRuns
    });
    const agentPlan = buildCustomerAgentPlan(intent, actions);
    const reply = hasUsableAssistantReply(result.text)
      ? sanitizeAssistantText(result.text, 360)
      : sanitizeAssistantText(
          buildCustomerFallbackReply({
            intent,
            menuSnapshot,
            cart: input.cart,
            orderStatus: input.orderStatus,
            toolRuns,
            actions
          }),
          360
        );
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      customerSessionId: input.customerSessionId,
      threadId: input.threadId,
      surface: "customer",
      role: "user",
      content: input.message,
      metadata: { intent, source: "customer_ai", threadId: input.threadId ?? null }
    });
    await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      conversationId,
      customerSessionId: input.customerSessionId,
      threadId: input.threadId,
      surface: "customer",
      role: "assistant",
      content: reply,
      provider: result.provider,
      model: result.model,
      metadata: {
        intent,
        intentLabel: customerAiIntentConfig[intent].label,
        suggestions: customerAiIntentConfig[intent].suggestions,
        actions,
        agentPlan,
        actionIds: actions.map((action) => action.id),
        tools: toolRuns.map((tool) => tool.name),
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        threadId: input.threadId ?? null
      }
    });
    return {
      reply,
      provider: result.provider,
      model: result.model,
      intent,
      intentLabel: customerAiIntentConfig[intent].label,
      suggestions: customerAiIntentConfig[intent].suggestions,
      actions,
      agentPlan
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      customerSessionId: input.customerSessionId,
      featureKey: "ai_customer_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI customer assistant failed",
      metadata: { intent }
    });

    const actions = buildCustomerAgentActions(intent, restaurant.slug, {
      menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus,
      message: input.message,
      toolRuns: []
    });
    const agentPlan = buildCustomerAgentPlan(intent, actions);
    const reply = sanitizeAssistantText(
      buildCustomerFallbackReply({
        intent,
        menuSnapshot,
        cart: input.cart,
        orderStatus: input.orderStatus,
        toolRuns: [],
        actions
      }) || "Mình chưa gọi được model AI, nhưng đã chuẩn bị nút an toàn để bạn tiếp tục.",
      360
    );

    try {
      const conversationId = await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        customerSessionId: input.customerSessionId,
        threadId: input.threadId,
        surface: "customer",
        role: "user",
        content: input.message,
        metadata: { intent, source: "customer_ai_fallback", threadId: input.threadId ?? null }
      });
      await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        conversationId,
        customerSessionId: input.customerSessionId,
        threadId: input.threadId,
        surface: "customer",
        role: "assistant",
        content: reply,
        provider: "prompt-only",
        model: "deterministic-action-router",
        metadata: {
          intent,
          intentLabel: customerAiIntentConfig[intent].label,
          suggestions: customerAiIntentConfig[intent].suggestions,
          actions,
          agentPlan,
          actionIds: actions.map((action) => action.id),
          fallback: true,
          threadId: input.threadId ?? null
        }
      });
    } catch {
      // Keep the customer flow responsive even if AI history storage is unavailable.
    }

    return {
      reply,
      provider: "prompt-only",
      model: "deterministic-action-router",
      intent,
      intentLabel: customerAiIntentConfig[intent].label,
      suggestions: customerAiIntentConfig[intent].suggestions,
      actions,
      agentPlan
    };
  }
}

async function runAiImageGeneration(input: {
  kind: "logo" | "menu_preview" | "food_photo";
  prompt?: string;
  restaurantName?: string;
  businessType?: string;
}) {
  const userPrompt = input.prompt?.trim() ?? "";
  if (input.kind === "food_photo" && userPrompt.length < 4) {
    throw new AppError("Để tạo ảnh món có giá trị thật, hãy nhập tên món hoặc mô tả món cụ thể trước khi dùng quota AI.", 400);
  }

  const prompt = buildImageGenerationPrompt(input);
  const canFallbackToPromptOnly = allowPromptOnlyImageFallback();

  try {
    const config = getProviderConfig((process.env.AI_IMAGE_PROVIDER as AiProvider | undefined) || "qwen");
    if (config.provider === "qwen") {
      const size = input.kind === "logo" ? "1024*1024" : input.kind === "menu_preview" ? "1536*1024" : "1024*1024";
      const response = await fetch(`${config.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: providerDefaults.qwenImageModel,
          input: {
            messages: [
              {
                role: "user",
                content: [{ text: prompt }]
              }
            ]
          },
          parameters: {
            size,
            n: 1,
            negative_prompt:
              "low quality, blurry, distorted logo, unreadable typography, broken Vietnamese diacritics, random letters, misspelled text, watermark, QR-like artifacts, cluttered composition, cheap 3D clipart, generic mascot, plastic food, extra fingers, oversaturated colors",
            prompt_extend: true,
            watermark: false
          }
        })
      });
      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new AppError(json?.message || json?.error?.message || "Không tạo được ảnh bằng Qwen.", 502);
      const content = json?.output?.choices?.[0]?.message?.content;
      const imageUrl =
        (Array.isArray(content) ? content.find((part) => part?.image)?.image || content.find((part) => part?.url)?.url : null) ||
        json?.output?.image_url ||
        json?.output?.url ||
        json?.data?.[0]?.url ||
        null;
      if (!imageUrl) {
        throw new AppError("Qwen đã xử lý nhưng chưa trả URL ảnh. Vui lòng kiểm tra quota/model trong Alibaba Cloud hoặc thử lại.", 502);
      }
      return {
        imageUrl,
        prompt,
        provider: "qwen",
        model: providerDefaults.qwenImageModel,
        raw: json
      } satisfies AiImageResult;
    }

    if (config.provider === "xai") {
      const response = await fetch(`${config.baseUrl}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: providerDefaults.xaiImageModel,
          prompt,
          n: 1,
          response_format: "url"
        })
      });
      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new AppError(json?.message || json?.error?.message || "Không tạo được ảnh bằng xAI.", 502);
      const imageUrl = json?.data?.[0]?.url ?? null;
      if (!imageUrl) {
        throw new AppError("xAI đã xử lý nhưng chưa trả URL ảnh. Vui lòng kiểm tra quota/model tạo ảnh.", 502);
      }
      return {
        imageUrl,
        prompt,
        provider: "xai",
        model: providerDefaults.xaiImageModel,
        raw: json
      } satisfies AiImageResult;
    }
  } catch (error) {
    if (!canFallbackToPromptOnly) throw error;
  }

  return {
    imageUrl: null,
    prompt,
    provider: "prompt-only",
    model: "prompt-engineering"
  } satisfies AiImageResult;
}

export async function generateRestaurantBranding(input: {
  restaurantId: string;
  userId: string;
  restaurantName?: string;
  businessType?: string;
  tone?: string;
  audience?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_branding_studio", userId: input.userId });
  const restaurant = await getRestaurantContext(input.restaurantId);
  const result = await runChat(buildBrandingMessages({ restaurant, ...input }), "qwen", undefined, { jsonMode: true, cacheTtlMs: 20_000 }, "branding");
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_branding_studio",
    provider: result.provider,
    model: result.model,
    requestKind: "chat",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  });

  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    data: normalizeBrandBoard(extractJsonObject(result.text))
  };
}

export async function generateOnboardingBranding(input: {
  restaurantName: string;
  businessType?: string;
  customBusinessType?: string;
  address?: string;
  tone?: string;
  audience?: string;
}) {
  const messages: AiMessage[] = [
    {
      role: "system",
      content: [
        "Bạn là LogiVN CopilotAI chuyên dựng nhận diện thương hiệu cho quán F&B Việt Nam ở cả đô thị và vùng quê.",
        "Chỉ trả JSON hợp lệ, không markdown, không text ngoài JSON.",
        "Schema bắt buộc: {\"slogans\":[string,string,string],\"description\":string,\"brandVoice\":string,\"logoPrompt\":string,\"menuHeroPrompt\":string,\"warnings\":[string]}",
        "Ràng buộc dữ liệu thật:",
        "- Mỗi slogan tối đa 54 ký tự, dễ đọc trên màn hình điện thoại.",
        "- description tối đa 500 ký tự, không hứa chất lượng/y tế nếu thiếu căn cứ.",
        "- brandVoice tối đa 160 ký tự.",
        "- logoPrompt dành cho ảnh vuông 1024x1024, chỉ mô tả biểu tượng/emblem; không yêu cầu AI render tên quán hoặc chữ nhỏ.",
        "- menuHeroPrompt là ảnh nền/cover có khoảng trống để LogiVN overlay chữ bằng HTML/CSS.",
        "- Phong cách: modern AI SaaS, ấm, đáng tin, dark green + ivory, có thể có chất Việt tinh tế nhưng không quê mùa."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Tên quán: ${input.restaurantName}`,
        `Loại hình: ${input.customBusinessType || input.businessType || "quán F&B"}`,
        input.address ? `Khu vực/địa chỉ: ${input.address}` : "Khu vực/địa chỉ: chưa có",
        `Tông thương hiệu mong muốn: ${input.tone || "tối giản, thân thiện, chuyên nghiệp, hợp quán địa phương"}`,
        `Khách mục tiêu: ${input.audience || "khách địa phương, gia đình, dân văn phòng và khách quen"}`
      ].join("\n")
    }
  ];
  const result = await runChat(messages, "qwen", providerDefaults.qwenChatModel, { jsonMode: true, cacheTtlMs: 20_000 }, "branding");

  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    data: normalizeBrandBoard(extractJsonObject(result.text))
  };
}

type MenuOcrDraft = ReturnType<typeof normalizeMenuOcrDraft>;

function hasMenuOcrItems(draft: MenuOcrDraft) {
  return draft.categories.some((category) => category.items.length > 0);
}

async function runMenuOcrDraft(input: { imageUrl?: string; imageBase64?: string; rawText?: string }) {
  const prompt = buildMenuOcrPrompt(input);
  const qwenConfig = getRequiredQwenProviderConfig("AI OCR menu");
  const result =
    input.imageUrl || input.imageBase64
      ? await qwenMultimodalOcr({
          config: qwenConfig,
          prompt,
          imageUrl: input.imageUrl,
          imageBase64: input.imageBase64
        })
      : await qwenChat(
          qwenConfig,
          providerDefaults.qwenChatModel,
          [
            { role: "system", content: "Bạn chuyên OCR và chuẩn hóa menu F&B Việt Nam. Trả JSON thuần." },
            { role: "user", content: prompt }
          ],
          { jsonMode: true }
        );

  let data = normalizeMenuOcrDraft(extractJsonObject(result.text));

  if (!hasMenuOcrItems(data) && result.text.trim()) {
    const repairResult = await qwenChat(
      qwenConfig,
      providerDefaults.qwenChatModel,
      [
        {
          role: "system",
          content: "Bạn là bộ chuẩn hóa kết quả OCR menu F&B Việt Nam. Chỉ trả JSON hợp lệ theo schema, không markdown."
        },
        {
          role: "user",
          content: buildMenuOcrPrompt({ rawText: result.text })
        }
      ],
      { jsonMode: true }
    );
    const repairedData = normalizeMenuOcrDraft(extractJsonObject(repairResult.text));
    if (hasMenuOcrItems(repairedData)) {
      return { result: repairResult, data: repairedData };
    }
    data = repairedData;
  }

  if (!hasMenuOcrItems(data)) {
    throw new AppError("AI đã đọc menu nhưng chưa tách được món có giá. Vui lòng chụp rõ bảng giá hơn hoặc dán menu thô để AI chuẩn hóa.", 422);
  }

  return { result, data };
}

export async function generateMenuOcrDraft(input: {
  restaurantId: string;
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  rawText?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_menu_ocr", userId: input.userId });
  const { result, data } = await runMenuOcrDraft(input);
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_menu_ocr",
    provider: result.provider,
    model: result.model,
    requestKind: "ocr",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  });
  return { provider: result.provider, model: result.model, text: result.text, data };
}

export async function generateOnboardingMenuOcrDraft(input: {
  imageUrl?: string;
  imageBase64?: string;
  rawText?: string;
}) {
  const { result, data } = await runMenuOcrDraft(input);

  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    data
  };
}

export async function generateOnboardingAiImage(input: {
  kind: "logo" | "menu_preview" | "food_photo";
  prompt?: string;
  restaurantName?: string;
  businessType?: string;
}) {
  return runAiImageGeneration(input);
}

export async function generateAiImage(input: {
  restaurantId: string;
  userId: string;
  kind: "logo" | "menu_preview" | "food_photo";
  prompt?: string;
  restaurantName?: string;
  businessType?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_image_generation", userId: input.userId });

  try {
    const result = await runAiImageGeneration(input);
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_image_generation",
      provider: result.provider,
      model: result.model,
      requestKind: "image",
      status: "success",
      imageCount: result.imageUrl ? 1 : 0,
      metadata: result.provider === "prompt-only" ? { promptOnly: true } : undefined
    });
    return result;
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_image_generation",
      provider: "prompt-only",
      model: "failed-before-image-url",
      requestKind: "image",
      status: "failed",
      imageCount: 0,
      errorMessage: error instanceof Error ? error.message : "AI image generation failed"
    });
    throw error;
  }
}
