import "server-only";

import { runAiCompletion } from "@/lib/ai/router/model-router";
import { assertMimoDailyTaskTokenBudget, recordMimoDailyTaskTokenUsage } from "@/lib/ai/providers/mimo-quota";
import { getResolvedAiProviderConfig, normalizeAiProviderId } from "@/lib/ai/providers/registry";
import { getScopedRestaurantMemoryContext, persistAiConversationMessage } from "@/lib/ai/memory/restaurant-memory";
import { sanitizeOcrText, sanitizeOcrTextList } from "@/lib/ai/ocr/sanitizer";
import type { AiCompletionOptions, AiCompletionResult, AiProvider, AiProviderConfig, AiTaskType } from "@/lib/ai/router/types";
import { AppError } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { executeAiToolCall, getAiToolsForSurface, isAiToolAllowedForSurface, type AiToolCall, type AiToolResult, type AiToolSurface } from "@/lib/ai/tools/executor";
import { buildCustomerAgentActions, buildCustomerAgentPlan, buildOwnerAgentActions, buildOwnerAgentPlan } from "@/services/ai-agent-actions";
import {
  buildBrandingMessages,
  buildCustomerAssistantMessages,
  buildImageGenerationPrompt,
  buildInventoryOcrPrompt,
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
import { detectDocumentTextWithAwsTextract, isAwsTextractConfigured } from "@/services/aws-textract-ocr";
import { buildAgentMission } from "@/lib/ai/agent-mission";
import { buildCommandDeck } from "@/lib/ai/command-deck";
import { buildOperationalPassport } from "@/lib/ai/operational-passport";
import { recordAiSecurityEvent } from "@/lib/ai/security-audit";
import { buildOperationInsights } from "@/lib/ai/operation-insights";
import { looksLikeRawAiPayload, normalizeAiReply, sanitizeAiDisplayText } from "@/lib/ai/response-contract";
import { getInventoryAiEconomicsSignal, getInventorySnapshot, type InventoryAiEconomicsSignal, type InventorySnapshot } from "@/services/inventory-service";
import { assertPublicTenantActive } from "@/services/tenant-status-guard";
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
type NativeAiProvider = Extract<AiProvider, "mimo" | "xai">;
type NativeAiProviderConfig = Pick<AiProviderConfig, "baseUrl" | "apiKey" | "chatModel" | "fastModel" | "imageModel" | "ocrModel"> & { provider: NativeAiProvider };
type ExecutedAiToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: AiToolResult | null;
};

type AiToolRuntimeContext = {
  restaurantId: string;
  branchId?: string | null;
  userId?: string | null;
  customerSessionId?: string | null;
};

type OwnerAiSnapshotScope = {
  branchId?: string | null;
  branchName?: string | null;
};

function sanitizeAssistantText(value: string, maxLength = 900) {
  return sanitizeAiDisplayText(value, maxLength);
}

function looksLikeRawAssistantPayload(value: string) {
  return looksLikeRawAiPayload(value);
}

function formatCurrency(value: number) {
  return `${Math.max(0, Number(value || 0)).toLocaleString("vi-VN")}đ`;
}

function buildOwnerPassport(input: {
  intent: string;
  intentLabel: string;
  route?: string | null;
  summary: string;
  nextActionId?: string | null;
  nextActionLabel?: string | null;
  checkpoint?: string | null;
  confidence?: "high" | "medium" | "low";
}) {
  return buildOperationalPassport({
    surface: "dashboard",
    title: `Chủ quán · ${input.intentLabel}`,
    status: input.intent,
    goal: input.summary,
    route: input.route ?? null,
    nextActionId: input.nextActionId ?? null,
    nextActionLabel: input.nextActionLabel ?? null,
    checkpoint: input.checkpoint ?? null,
    handoffRoute: input.route ?? null,
    handoffLabel: input.intentLabel,
    confidence: input.confidence ?? "medium"
  });
}

function buildCustomerPassport(input: {
  intent: string;
  intentLabel: string;
  route?: string | null;
  summary: string;
  nextActionId?: string | null;
  nextActionLabel?: string | null;
  checkpoint?: string | null;
  confidence?: "high" | "medium" | "low";
}) {
  return buildOperationalPassport({
    surface: "customer",
    title: `Khách · ${input.intentLabel}`,
    status: input.intent,
    goal: input.summary,
    route: input.route ?? null,
    nextActionId: input.nextActionId ?? null,
    nextActionLabel: input.nextActionLabel ?? null,
    checkpoint: input.checkpoint ?? null,
    handoffRoute: input.route ?? null,
    handoffLabel: input.intentLabel,
    confidence: input.confidence ?? "medium"
  });
}

type AiImageResult = {
  imageUrl: string | null;
  prompt: string;
  provider: AiProvider | "prompt-only";
  model: string;
  raw?: unknown;
};

const mimoNativeBaseUrl = "https://token-plan-sgp.xiaomimimo.com";
const xaiNativeBaseUrl = "https://api.x.ai";

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

function isoDateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const legacyAiBillingFeatureMap: Partial<Record<PlanFeatureKey, BillingFeatureKey>> = {
  ai_owner_assistant: "ai_chatbot",
  ai_customer_assistant: "ai_chatbot",
  ai_branding_studio: "ai_branding",
  ai_menu_ocr: "ai_menu_generation",
  inventory_ai_ocr: "inventory_ai_ocr",
  inventory_ai_intelligence: "inventory_ai_intelligence",
  ai_image_generation: "ai_image_generation",
  advanced_reports: "ai_analytics"
};

function billingAccessErrorMessage(label: string, state: "locked_plan" | "quota_exceeded" | "trial_used" | "subscription_expired") {
  if (state === "subscription_expired") return "Gói LogiVN đã hết hạn. Vui lòng gia hạn để tiếp tục dùng AI.";
  if (state === "quota_exceeded") return `${label} đã hết quota trong kỳ hiện tại. Vui lòng nâng cấp hoặc chờ kỳ mới.`;
  if (state === "trial_used") return `Bạn đã dùng thử ${label}. Vui lòng nâng cấp Premium để tiếp tục.`;
  return `${label} chỉ khả dụng trên gói Premium.`;
}

function normalizeNativeProviderBaseUrl(provider: NativeAiProvider, baseUrl: string) {
  if (provider === "mimo") {
    return (baseUrl || mimoNativeBaseUrl)
      .replace(/\/v1\/?$/, "")
      .replace(/\/$/, "");
  }
  return (baseUrl || xaiNativeBaseUrl).replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

async function getProviderConfig(preferred?: NativeAiProvider): Promise<NativeAiProviderConfig> {
  const candidates: NativeAiProvider[] = preferred
    ? [preferred, ...(preferred === "mimo" ? ["xai" as const] : ["mimo" as const])]
    : ["mimo", "xai"];

  for (const provider of candidates) {
    try {
      const config = await getResolvedAiProviderConfig(provider);
      return {
        provider,
        baseUrl: normalizeNativeProviderBaseUrl(provider, config.baseUrl),
        apiKey: config.apiKey,
        chatModel: config.chatModel,
        fastModel: config.fastModel,
        imageModel: config.imageModel,
        ocrModel: config.ocrModel
      };
    } catch {
      // Try the fallback native provider before surfacing the generic config error.
    }
  }

  throw new AppError("Chưa cấu hình MIMO_API_KEY hoặc XAI_API_KEY cho tính năng AI.", 500);
}

async function getRequiredMimoProviderConfig(featureLabel: string): Promise<NativeAiProviderConfig> {
  const config = await getProviderConfig("mimo");
  if (config.provider === "mimo") return config;
  throw new AppError(`${featureLabel} yêu cầu MIMO_API_KEY. Không thể dùng xAI cho OCR menu.`, 500);
}

function normalizeNativeAiProvider(value?: string | null): NativeAiProvider | undefined {
  if (value === "qwen" || value === "dashscope") return "mimo";
  return value === "mimo" || value === "xai" ? value : undefined;
}

function normalizeAiProvider(value?: string | null): AiProvider | undefined {
  return normalizeAiProviderId(value);
}

function normalizePrompt(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 4000);
}

function ownerMemoryCategories(intent: OwnerAiIntent) {
  if (intent === "inventory") return ["inventory", "menu", "operations"] as const;
  if (intent === "staff") return ["staff", "operations", "policy"] as const;
  if (intent === "growth") return ["marketing", "menu", "brand"] as const;
  if (intent === "menu") return ["menu", "inventory", "marketing"] as const;
  if (intent === "reservations") return ["policy", "operations", "branch"] as const;
  if (intent === "reports") return ["operations", "branch", "marketing"] as const;
  return ["operations", "brand", "policy", "branch"] as const;
}

function allowPromptOnlyImageFallback() {
  return process.env.AI_IMAGE_ALLOW_PROMPT_FALLBACK === "true";
}

const LEGACY_AI_CHAT_TIMEOUT_MS = 14_000;
const LEGACY_AI_OCR_TIMEOUT_MS = 25_000;
const LEGACY_AI_IMAGE_TIMEOUT_MS = 30_000;

function isRetryableAiResponse(response: Response) {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAiWithTimeout(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; timeoutMessage: string; retries?: number }
) {
  const attempts = Math.max(1, (options.retries ?? 0) + 1);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (attempt < attempts - 1 && isRetryableAiResponse(response)) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError(options.timeoutMessage, 504);
      }
      if (attempt < attempts - 1) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      throw new AppError("Không kết nối được provider AI. Vui lòng thử lại sau.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new AppError("Provider AI tạm thời không phản hồi.", 502);
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

function normalizeMimoImagePayload({
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

function readOcrShortText(value: unknown, maxLength: number) {
  return sanitizeOcrText(value, maxLength);
}

function readOcrStringList(value: unknown, maxItems: number, maxLength: number) {
  return sanitizeOcrTextList(value, maxItems, maxLength);
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
  const warnings = readOcrStringList(record?.warnings, 8, 180);
  const confidence = Math.min(1, Math.max(0, Number(record?.confidence ?? 0.72)));
  const categories = Array.isArray(record?.categories) ? record.categories : [];

  return {
    categories: categories
      .map((category) => {
        const categoryRecord = asToolRecord(category);
        const name = readOcrShortText(categoryRecord?.name, 80) || "Menu";
        const items = Array.isArray(categoryRecord?.items) ? categoryRecord.items : [];

        return {
          name,
          items: items
            .map((item) => {
              const itemRecord = asToolRecord(item);
              const parsed = normalizeMenuOcrItemNameAndPrice(readOcrShortText(itemRecord?.name, 120), itemRecord?.price);
              const name = parsed.name;
              const price = parsed.price;
              if (!name || !Number.isFinite(price) || price <= 0) return null;

              return {
                name,
                price,
                description: readOcrShortText(itemRecord?.description, 180) || null,
                tags: readOcrStringList(itemRecord?.tags, 6, 32)
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

function parseInventoryNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;
  const lastSeparator = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  if (lastSeparator > -1) {
    const integerPart = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
    const decimalPart = cleaned.slice(lastSeparator + 1);
    const normalized =
      decimalPart.length === 3 && integerPart.length > 0 ? `${integerPart}${decimalPart}` : `${integerPart}.${decimalPart}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInventoryUnit(value: unknown) {
  const raw = readShortText(value, 24).toLowerCase();
  const normalized = raw
    .replaceAll("lít", "l")
    .replaceAll("lit", "l")
    .replaceAll("gói", "goi")
    .replaceAll("hộp", "hop")
    .replaceAll("cái", "cai")
    .replace(/[^a-zA-Z0-9_%/ .-]/g, "")
    .trim();
  const match = normalized.match(/\b(kg|g|gram|ml|l|chai|lon|goi|hop|cai|thung|bao|phan|suat|unit)\b/);
  return match?.[1] ?? (normalized || "unit");
}

function normalizeInventoryOcrDraft(value: unknown) {
  const record = asToolRecord(value);
  const warnings = readOcrStringList(record?.warnings, 8, 180);
  const confidence = Math.min(1, Math.max(0, Number(record?.confidence ?? 0.7)));
  const rows = Array.isArray(record?.rows) ? record.rows : [];

  return {
    rows: rows
      .map((row) => {
        const rowRecord = asToolRecord(row);
        const name = readOcrShortText(rowRecord?.name, 160);
        const quantity = parseInventoryNumber(rowRecord?.quantity);
        if (!name || !Number.isFinite(quantity) || quantity <= 0) return null;

        return {
          name,
          unit: normalizeInventoryUnit(readOcrShortText(rowRecord?.unit, 24)),
          quantity,
          minimumQuantity: Math.max(0, parseInventoryNumber(rowRecord?.minimumQuantity)),
          referenceUnitCost: Math.max(0, Math.round(parseInventoryNumber(rowRecord?.referenceUnitCost))),
          categoryName: readOcrShortText(rowRecord?.categoryName, 120) || null
        };
      })
      .filter(
        (
          row
        ): row is {
          name: string;
          unit: string;
          quantity: number;
          minimumQuantity: number;
          referenceUnitCost: number;
          categoryName: string | null;
        } => Boolean(row)
      )
      .slice(0, 120),
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

async function resolveAiToolCalls(toolCalls: AiToolCall[], context: AiToolRuntimeContext, surface: AiToolSurface) {
  const blockedToolCalls: AiToolCall[] = [];
  const scopedToolCalls = toolCalls.slice(0, 4).filter((toolCall) => {
    const allowed = toolCall.type === "function" && isAiToolAllowedForSurface(surface, toolCall.function.name);
    if (!allowed) {
      console.warn(`[AI Tools] Dropped ${surface} tool call outside allowlist: ${toolCall.function.name}`);
      blockedToolCalls.push(toolCall);
    }
    return allowed;
  });

  if (blockedToolCalls.length > 0) {
    await Promise.all(
      blockedToolCalls.map((toolCall) =>
        recordAiSecurityEvent({
          restaurantId: context.restaurantId,
          userId: context.userId,
          customerSessionId: context.customerSessionId,
          surface,
          eventType: "ai_tool_call_dropped",
          severity: surface === "customer" ? "critical" : "high",
          metadata: { toolName: toolCall.function.name, reason: "surface_allowlist" }
        })
      )
    );
  }

  const executions = await Promise.all(
    scopedToolCalls.map(async (toolCall) => {
      const args = parseToolArguments(toolCall.function.arguments);
      const result = await executeAiToolCall(toolCall, { ...context, surface });
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

function isCasualGreeting(message: string) {
  const folded = foldedText(message)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return false;
  if (folded.length > 80) return false;
  if (/(don|order|thanh toan|vietqr|menu|mon|bao cao|doanh thu|ca ban|khuyen mai|nhan vien|dat ban|setup|ton kho|bep)/.test(folded)) {
    return false;
  }
  return /^(hi|hello|hey|chao|xin chao|alo|alo logibot|logibot oi|cam on|thanks|thank you|ok|oke|uh|u|vang|test|thu xem)(\s+(nhe|nha|ban|anh|chi|em|logibot|bot|ai|oi|nua|di|nao|xem|thu))*$/.test(folded);
}

function buildOwnerGreetingReply(restaurant: RestaurantAiContext, message: string) {
  const folded = foldedText(message);
  if (/cam on|thanks|thank you/.test(folded)) {
    return `Dạ, LogiBot luôn sẵn sàng hỗ trợ ${restaurant.name}. Khi anh cần xử lý đơn, thanh toán, menu hay báo cáo thì nhắn thẳng việc cần làm là được.`;
  }
  if (/test|thu xem/.test(folded)) {
    return `LogiBot đang sẵn sàng trong ${restaurant.name}. Anh có thể hỏi một việc cụ thể như kiểm tra đơn chờ, thanh toán cần đối soát hoặc tạo món mới.`;
  }
  return `Chào anh, LogiBot đây. Anh cần kiểm tra vận hành, xử lý đơn, xem thanh toán hay tạo món/campaign thì cứ nhắn trực tiếp, mình sẽ mở đúng thao tác.`;
}

function buildOwnerGreetingResult(restaurant: RestaurantAiContext, message: string) {
  return {
    reply: buildOwnerGreetingReply(restaurant, message),
    provider: "prompt-only",
    model: "deterministic-greeting-router",
    intent: "overview" as OwnerAiIntent,
    intentLabel: "Tổng quan",
    suggestions: ["Kiểm tra đơn chờ", "Đối soát thanh toán", "Tạo món mới", "Tóm tắt ca bán"],
    actions: [],
    agentPlan: undefined
  };
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

  if (intent === "kitchen" || intent === "reports") {
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
  toolContext: AiToolRuntimeContext;
  proactiveToolCalls?: AiToolCall[];
}) {
  const tools = getAiToolsForSurface(input.surface);
  let toolRuns: ExecutedAiToolCall[] = input.proactiveToolCalls?.length
    ? await resolveAiToolCalls(input.proactiveToolCalls, input.toolContext, input.surface)
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
      tools,
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

    const roundToolRuns = await resolveAiToolCalls(toolCalls, input.toolContext, input.surface);
    if (!roundToolRuns.length) {
      input.messages.push({
        role: "system",
        content: "Công cụ vừa yêu cầu không khả dụng trong phạm vi hiện tại. Trả lời ngay bằng dữ liệu đã có, không gọi thêm công cụ."
      });
      result = await runChat(input.messages, result.provider, result.model, { maxTokens: input.maxTokens }, "tool");
      break;
    }
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
        tools,
        toolChoice: "auto"
      },
      "tool"
    );
  }

  if (toolRuns.length > 0 && (Boolean(result.toolCalls?.length) || !hasUsableAssistantReply(result.text))) {
    input.messages.push({
      role: "system",
      content:
        input.surface === "owner"
          ? "Không gọi thêm công cụ. Hãy sử dụng toàn bộ dữ liệu đã được cung cấp từ các công cụ ở trên để trả lời chi tiết, phân tích rõ ràng các số liệu/chỉ số (nếu có) và đề xuất hành động thực tế cụ thể cho chủ quán."
          : "Không gọi thêm công cụ. Dựa hoàn toàn trên dữ liệu đã xác thực để trả lời ngay bằng 1-3 câu ngắn, nêu việc cần làm tiếp theo nếu có, không markdown."
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
    tables?: {
      activeTableCount?: number;
      tableCount?: number;
      qrDisabledCount?: number;
      tables?: Array<{ name?: string; activeOrderCount?: number; qrEnabled?: boolean; capacity?: number; area?: string | null }>;
    };
    payments?: { waitingConfirm?: number };
    menu?: { unavailableCount?: number; itemCount?: number };
    inventory?: {
      lowStockCount?: number;
      recipeCoveragePercent?: number;
      openAlertCount?: number;
      projectedPurchaseValue?: number;
      wasteSignalCount?: number;
      highFoodCostItemCount?: number;
    };
    staff?: {
      schemaReady?: boolean;
      schemaErrors?: string[];
      memberCount?: number;
      activeCount?: number;
      suspendedCount?: number;
      archivedCount?: number;
      onlineCount?: number;
      currentlyClockedIn?: number;
      attendanceLogCount24h?: number;
      lateCount24h?: number;
      overtimeMinutes24h?: number;
      pendingApprovalCount?: number;
      pendingApprovalByType?: Record<string, number>;
      roleBreakdown?: Record<string, number>;
      assignedBranchCount?: number;
      unassignedActiveCount?: number;
      averageReviewScore?: number;
      lowReviewCount?: number;
      draftReviewCount?: number;
      shiftCount7d?: number;
      upcomingShiftCount?: number;
      clockedInStaff?: Array<Record<string, unknown>>;
      pendingRequests?: Array<Record<string, unknown>>;
      upcomingShifts?: Array<Record<string, unknown>>;
    };
    operationInsights?: {
      primaryInsightId?: string | null;
      summary?: string;
      insights?: Array<Record<string, unknown>>;
    };
  };
  const insights = Array.isArray(data.operationInsights?.insights) ? data.operationInsights.insights : [];
  const primaryInsight =
    insights.find((insight) => String(insight.id ?? "") === data.operationInsights?.primaryInsightId) ?? insights[0];

  if (primaryInsight) {
    const title = typeof primaryInsight.title === "string" ? primaryInsight.title : "";
    const detail = typeof primaryInsight.detail === "string" ? primaryInsight.detail : "";
    const action = typeof primaryInsight.action === "string" ? primaryInsight.action : "";
    return [title ? `AI Ops: ${title}.` : data.operationInsights?.summary, detail, action ? `Bước nên làm: ${action}` : ""]
      .filter(Boolean)
      .join(" ");
  }

  switch (intent) {
    case "payments":
      return typeof data.payments?.waitingConfirm === "number"
        ? `Hiện có ${data.payments.waitingConfirm} giao dịch đang chờ kiểm tra.`
        : "";
    case "tables":
      if (!data.tables) return "";
      if (Array.isArray(data.tables.tables) && data.tables.tables.length) {
        const freeTables = data.tables.tables.filter((table) => Number(table.activeOrderCount ?? 0) <= 0);
        const busyTables = data.tables.tables.filter((table) => Number(table.activeOrderCount ?? 0) > 0);
        const freeNames = freeTables
          .map((table) => {
            const capacity = typeof table.capacity === "number" && table.capacity > 0 ? ` (${table.capacity} chỗ)` : "";
            return `${table.name || "Bàn chưa đặt tên"}${capacity}`;
          })
          .slice(0, 8);
        return [
          freeNames.length ? `Bàn đang rảnh: ${freeNames.join(", ")}${freeTables.length > freeNames.length ? ` và ${freeTables.length - freeNames.length} bàn khác` : ""}.` : "Hiện chưa thấy bàn rảnh trong snapshot.",
          `${busyTables.length}/${data.tables.tableCount ?? data.tables.tables.length} bàn đang có đơn mở.`,
          typeof data.tables.qrDisabledCount === "number" && data.tables.qrDisabledCount > 0 ? `${data.tables.qrDisabledCount} bàn đang tắt QR.` : ""
        ]
          .filter(Boolean)
          .join(" ");
      }
      return typeof data.tables.activeTableCount === "number"
        ? `${data.tables.activeTableCount} bàn đang có đơn mở trong ca hiện tại.`
        : "";
    case "menu":
      return typeof data.menu?.unavailableCount === "number" && typeof data.menu?.itemCount === "number"
        ? `Menu hiện có ${data.menu.itemCount} món, trong đó ${data.menu.unavailableCount} món đang tạm ẩn hoặc hết.`
        : "";
    case "inventory":
      return data.inventory
        ? `Kho hiện có ${data.inventory.lowStockCount ?? 0} nguyên liệu dưới ngưỡng, recipe coverage ${Math.round(Number(data.inventory.recipeCoveragePercent ?? 0))}%, ${data.inventory.openAlertCount ?? 0} alert mở, dự kiến nhập ${formatCurrency(Number(data.inventory.projectedPurchaseValue ?? 0))}, ${data.inventory.wasteSignalCount ?? 0} tín hiệu hao hụt.`
        : "";
    case "staff":
      if (!data.staff) return "";
      if (data.staff.schemaReady === false) {
        const errors = (data.staff.schemaErrors ?? []).slice(0, 2).join("; ");
        return `Chưa tải được snapshot nhân sự thật; không kết luận là chưa có nhân viên${errors ? ` (${errors})` : ""}.`;
      }
      return `Nhân sự hiện có ${Number(data.staff.activeCount ?? 0)}/${Number(data.staff.memberCount ?? 0)} người đang hoạt động, ${Number(data.staff.currentlyClockedIn ?? 0)} người đang check-in, ${Number(data.staff.lateCount24h ?? 0)} lượt muộn trong 24h, ${Number(data.staff.pendingApprovalCount ?? 0)} yêu cầu chờ duyệt, ${Number(data.staff.unassignedActiveCount ?? 0)} active chưa gán chi nhánh, review TB ${Number(data.staff.averageReviewScore ?? 0).toFixed(1)}/5 và ${Number(data.staff.upcomingShiftCount ?? data.staff.shiftCount7d ?? 0)} ca sắp tới.`;
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

function buildCustomerSnapshotCue(
  intent: CustomerAiIntent,
  input: { menuSnapshot?: unknown; cart?: unknown; orderStatus?: unknown; reservationStatus?: unknown }
) {
  const cartRecord = asToolRecord(input.cart);
  const cartItems = Array.isArray(input.cart)
    ? input.cart
    : Array.isArray(cartRecord?.items)
      ? cartRecord.items
      : Array.isArray(cartRecord?.lines)
        ? cartRecord.lines
        : [];
  const orderStatus = asToolRecord(input.orderStatus);
  const reservationStatus = asToolRecord(input.reservationStatus);
  const menuSnapshot = (input.menuSnapshot ?? {}) as { categories?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };
  const categoryCount = Array.isArray(menuSnapshot.categories) ? menuSnapshot.categories.length : 0;
  const itemCount = Array.isArray(menuSnapshot.items) ? menuSnapshot.items.length : 0;

  switch (intent) {
    case "cart":
    case "payment":
      return cartItems.length > 0 ? `Giỏ hiện tại có ${cartItems.length} món.` : "Mình đã kiểm tra giỏ và bước thanh toán hiện tại.";
    case "order_status":
      return orderStatus?.status ? `Đơn hiện tại đang ở trạng thái ${String(orderStatus.status)}.` : "Mình đã kiểm tra trạng thái đơn gần nhất.";
    case "reservation":
      return reservationStatus?.status
        ? `Lịch đặt hiện tại đang ở trạng thái ${String(reservationStatus.status)}.`
        : "Mình đã kiểm tra luồng đặt bàn và các nút thao tác an toàn.";
    default:
      return categoryCount > 0 || itemCount > 0 ? `Mình đã kiểm tra menu thật của quán trước khi gợi ý.` : "";
  }
}

function shortTimeOfDay(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function customerPublicInfoFallback(restaurant: RestaurantAiContext, message: string) {
  const folded = foldedText(message);
  const opening = shortTimeOfDay(restaurant.opening_time);
  const closing = shortTimeOfDay(restaurant.closing_time);

  if (/dia chi|o dau|duong nao|chi nhanh/.test(folded)) {
    return restaurant.address ? `Địa chỉ quán là ${restaurant.address}.` : "Mình chưa thấy địa chỉ quán trên hệ thống.";
  }

  if (/hotline|so dien thoai|lien he|goi quan/.test(folded)) {
    return restaurant.hotline ? `Bạn có thể liên hệ quán qua hotline ${restaurant.hotline}.` : "Mình chưa thấy hotline quán trên hệ thống.";
  }

  if (/gio|mo cua|dong cua|con mo|hom nay/.test(folded)) {
    return opening && closing ? `Giờ mở cửa quán đang cấu hình là ${opening} - ${closing}.` : "Mình chưa thấy giờ mở cửa của quán trên hệ thống.";
  }

  if (/wifi|gui xe|dau xe|mat khau|thu cung|pet|tre em|khong gian|lam viec|hoc bai/.test(folded)) {
    return "Mình chưa thấy thông tin này trên hệ thống. Bạn có thể hỏi nhân viên để được xác nhận chính xác tại quán.";
  }

  return `Chào bạn, mình là LogiBot của ${restaurant.name}. Mình có thể trả lời nhanh về quán, menu, đặt bàn hoặc hỗ trợ gọi nhân viên.`;
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
  restaurant: RestaurantAiContext;
  message: string;
  menuSnapshot?: unknown;
  cart?: unknown;
  orderStatus?: unknown;
  reservationStatus?: unknown;
  toolRuns: ExecutedAiToolCall[];
  actions: AiAgentAction[];
}) {
  const fact =
    input.toolRuns.flatMap(summarizeToolExecution).find(Boolean) ||
    (input.intent === "guest_faq" ? customerPublicInfoFallback(input.restaurant, input.message) : "") ||
    buildCustomerSnapshotCue(input.intent, {
      menuSnapshot: input.menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus,
      reservationStatus: input.reservationStatus
    });

  return [fact || "Mình đã kiểm tra dữ liệu thật trước khi gợi ý.", actionCue(input.actions, "customer"), safetyCue(input.actions)]
    .filter(Boolean)
    .join(" ");
}

function buildReadinessFallbackText(readiness: { score?: number; nextActions?: Array<{ action?: string; label?: string }>; criticalMissing?: Array<{ action?: string }> }) {
  const nextAction = readiness.nextActions?.[0];
  const blocker = readiness.criticalMissing?.[0];
  return [
    `Điểm sẵn sàng hiện tại ${Number(readiness.score ?? 0)}%.`,
    blocker?.action ? `Cần xử lý trước: ${blocker.action}.` : "",
    nextAction?.action || nextAction?.label ? `Bước tiếp theo: ${nextAction.action || nextAction.label}.` : "Mở đúng khu vực để hoàn tất cấu hình."
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBrandingFallbackText(data: ReturnType<typeof normalizeBrandBoard>) {
  return [
    data.slogans.length ? `Slogan đề xuất: ${data.slogans.slice(0, 2).join(" · ")}.` : "",
    data.description ? `Mô tả thương hiệu: ${data.description}` : "",
    data.logoPrompt ? "Đã tạo prompt logo an toàn để dùng cho ảnh AI." : ""
  ]
    .filter(Boolean)
    .join(" ") || "Đã tạo bản nháp thương hiệu gồm slogan, mô tả và prompt hình ảnh để bạn áp dụng.";
}

function buildMenuOcrReplyText(data: MenuOcrDraft) {
  const itemCount = data.categories.reduce((sum, category) => sum + category.items.length, 0);
  const firstCategory = data.categories[0]?.name;
  return [
    `Đã đọc được ${data.categories.length} danh mục với ${itemCount} món.`,
    firstCategory ? `Danh mục đầu tiên: ${firstCategory}.` : "",
    data.warnings[0] ? `Lưu ý: ${data.warnings[0]}` : "Bạn có thể kiểm tra trùng món rồi nhập vào menu."
  ]
    .filter(Boolean)
    .join(" ");
}

async function getRestaurantContext(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description,opening_time,closing_time")
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
    branchId: row.branch_id ?? null,
    branchAssignmentSource: row.branch_assignment_source ?? null,
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

function applyBranchScope(query: any, branchId?: string | null, column = "branch_id") {
  return branchId ? query.eq(column, branchId) : query;
}

function readContextBranchId(context?: Record<string, unknown>) {
  const value = context?.branchId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveOwnerAiSnapshotScope(restaurantId: string, context?: Record<string, unknown>): Promise<OwnerAiSnapshotScope> {
  const branchId = readContextBranchId(context);
  if (!branchId) return { branchId: null, branchName: null };

  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("store_branches")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .eq("id", branchId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Chi nhánh AI Ops không thuộc quán hiện tại hoặc đã bị tắt.", 403);
  return { branchId, branchName: data.name ? String(data.name) : null };
}

function reservationMatchesBranch(row: any, branchId: string | null) {
  if (!branchId) return true;
  const locks = Array.isArray(row?.locks) ? row.locks : [];
  return locks.some((lock: any) => {
    const table = Array.isArray(lock?.table) ? lock.table[0] : lock?.table;
    return table?.branch_id === branchId;
  });
}

function scopeStaffAiRowsByBranch(input: {
  members: any[] | null;
  attendance: any[] | null;
  approvals: any[] | null;
  shifts: any[] | null;
  branchAssignments: any[] | null;
  reviews: any[] | null;
  schemaErrors?: string[] | null;
}) {
  const memberIds = new Set<string>();
  for (const row of [...(input.attendance ?? []), ...(input.approvals ?? []), ...(input.shifts ?? []), ...(input.branchAssignments ?? [])]) {
    if (row?.staff_member_id) memberIds.add(String(row.staff_member_id));
  }

  return {
    members: (input.members ?? []).filter((member) => memberIds.has(String(member.id))),
    attendance: input.attendance ?? [],
    approvals: input.approvals ?? [],
    shifts: input.shifts ?? [],
    branchAssignments: input.branchAssignments ?? [],
    reviews: (input.reviews ?? []).filter((review) => memberIds.has(String(review.staff_member_id))),
    schemaErrors: input.schemaErrors ?? []
  };
}

function numericInventoryValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function emptyOwnerInventorySnapshot(schemaReady: boolean): InventorySnapshot {
  return {
    schemaReady,
    ingredientCount: 0,
    activeIngredientCount: 0,
    lowStockCount: 0,
    recipeReadyItemCount: 0,
    menuItemCount: 0,
    recipeCoveragePercent: 0,
    openCountSessions: 0,
    openAlertCount: 0,
    wasteSpikeAlertCount: 0,
    priceSpikeAlertCount: 0,
    supplierDelayAlertCount: 0,
    expiringBatchCount: 0,
    openPurchaseOrderCount: 0,
    totalReferenceValue: 0,
    lowStockIngredients: [],
    recentMovements: []
  };
}

function emptyOwnerInventoryEconomics(schemaReady: boolean): InventoryAiEconomicsSignal {
  return {
    schemaReady,
    projectedPurchaseValue: 0,
    weeklyUsageValue: 0,
    reorderSuggestionCount: 0,
    highReorderCount: 0,
    topReorderSuggestion: null,
    wasteSignalCount: 0,
    topWasteSignal: null,
    priceSignalCount: 0,
    topPriceSignal: null,
    highFoodCostItemCount: 0,
    topHighFoodCostItem: null
  };
}

function countInventoryAlertRowsByType(rows: any[], alertType: string) {
  return rows.filter((row) => row?.alert_type === alertType).length;
}

async function getOwnerInventoryAiData(
  restaurantId: string,
  branchId: string | null
): Promise<{ snapshot: InventorySnapshot; economics: InventoryAiEconomicsSignal | null }> {
  if (!branchId) {
    const snapshot = await getInventorySnapshot(restaurantId);
    return {
      snapshot,
      economics: snapshot.schemaReady ? await getInventoryAiEconomicsSignal(restaurantId, snapshot).catch(() => null) : null
    };
  }

  const supabase = createAdminSupabaseClient() as any;
  const expiryCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const movementSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const weekSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [stockRows, movementRows, alertRows, openCountSessions, openPurchaseOrderCount, recipeRows, menuItemCount] = await Promise.all([
    safeSupabaseQuery<any[]>(
      supabase
        .from("stock_balances")
        .select(
          "id,batch_id,ingredient_id,on_hand_quantity,reserved_quantity,incoming_quantity,ingredient:ingredients(name,unit,minimum_quantity,reference_unit_cost,is_active),batch:inventory_batches(expiration_date,status,unit_cost)"
        )
        .eq("restaurant_id", restaurantId)
        .eq("branch_id", branchId)
        .limit(2000)
    ),
    safeSupabaseQuery<any[]>(
      supabase
        .from("inventory_movements")
        .select("id,ingredient_id,movement_type,quantity_delta,unit_cost,source_type,reason,created_at,ingredient:ingredients(name,unit,reference_unit_cost)")
        .eq("restaurant_id", restaurantId)
        .eq("branch_id", branchId)
        .gte("created_at", movementSince)
        .order("created_at", { ascending: false })
        .limit(500)
    ),
    safeSupabaseQuery<any[]>(
      supabase
        .from("inventory_alerts")
        .select("alert_type,severity,status")
        .eq("restaurant_id", restaurantId)
        .eq("branch_id", branchId)
        .in("status", ["open", "acknowledged"])
        .limit(1000)
    ),
    safeSupabaseCount(
      supabase
        .from("inventory_counts")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("branch_id", branchId)
        .in("status", ["draft", "submitted"])
    ),
    safeSupabaseCount(
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("branch_id", branchId)
        .in("status", ["draft", "pending", "approved", "ordered", "partially_delivered"])
    ),
    safeSupabaseQuery<any[]>(supabase.from("menu_item_recipes").select("menu_item_id").eq("restaurant_id", restaurantId).limit(3000)),
    safeSupabaseCount(supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId))
  ]);

  if (!stockRows || !movementRows || !alertRows) {
    return { snapshot: emptyOwnerInventorySnapshot(false), economics: emptyOwnerInventoryEconomics(false) };
  }

  const ingredientMap = new Map<
    string,
    { id: string; name: string; unit: string; onHandQuantity: number; minimumQuantity: number; referenceUnitCost: number; isActive: boolean }
  >();
  let totalReferenceValue = 0;
  const expiringBatchIds = new Set<string>();

  for (const row of stockRows) {
    const ingredientId = String(row?.ingredient_id ?? "");
    if (!ingredientId) continue;
    const ingredient = firstOrNull(row.ingredient);
    const batch = firstOrNull(row.batch);
    const onHandQuantity = Math.max(0, numericInventoryValue(row.on_hand_quantity));
    const minimumQuantity = numericInventoryValue(ingredient?.minimum_quantity);
    const referenceUnitCost = numericInventoryValue(batch?.unit_cost ?? ingredient?.reference_unit_cost);
    const current = ingredientMap.get(ingredientId) ?? {
      id: ingredientId,
      name: String(ingredient?.name ?? "Nguyen lieu"),
      unit: String(ingredient?.unit ?? "unit"),
      onHandQuantity: 0,
      minimumQuantity,
      referenceUnitCost,
      isActive: ingredient?.is_active !== false
    };
    current.onHandQuantity += onHandQuantity;
    current.minimumQuantity = Math.max(current.minimumQuantity, minimumQuantity);
    if (referenceUnitCost > 0) current.referenceUnitCost = referenceUnitCost;
    current.isActive = current.isActive && ingredient?.is_active !== false;
    ingredientMap.set(ingredientId, current);
    totalReferenceValue += onHandQuantity * referenceUnitCost;

    if (row?.batch_id && onHandQuantity > 0 && batch?.expiration_date && batch.expiration_date <= expiryCutoff && ["active", "quarantined", "expired"].includes(String(batch.status ?? ""))) {
      expiringBatchIds.add(String(row.batch_id));
    }
  }

  const lowStockIngredients = [...ingredientMap.values()]
    .filter((ingredient) => ingredient.isActive && ingredient.minimumQuantity > 0 && ingredient.onHandQuantity <= ingredient.minimumQuantity)
    .sort((left, right) => left.onHandQuantity - right.onHandQuantity)
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      onHandQuantity: Math.round(ingredient.onHandQuantity * 1000) / 1000,
      minimumQuantity: Math.round(ingredient.minimumQuantity * 1000) / 1000,
      referenceUnitCost: Math.round(ingredient.referenceUnitCost)
    }));

  const recipeReadyItemIds = new Set((recipeRows ?? []).map((row) => row?.menu_item_id).filter((id): id is string => Boolean(id)));
  const recentMovements = movementRows.slice(0, 8).map((movement) => {
    const ingredient = firstOrNull(movement.ingredient);
    return {
      id: String(movement.id),
      movementType: movement.movement_type as InventorySnapshot["recentMovements"][number]["movementType"],
      quantityDelta: numericInventoryValue(movement.quantity_delta),
      unitCost: movement.unit_cost === null || movement.unit_cost === undefined ? null : numericInventoryValue(movement.unit_cost),
      sourceType: String(movement.source_type ?? "manual"),
      reason: movement.reason ?? null,
      createdAt: String(movement.created_at ?? ""),
      ingredientName: String(ingredient?.name ?? "Nguyen lieu"),
      ingredientUnit: String(ingredient?.unit ?? "unit")
    };
  });

  const projectedPurchaseValue = lowStockIngredients.reduce((sum, ingredient) => {
    const reorderQuantity = Math.max(0, ingredient.minimumQuantity * 2 - ingredient.onHandQuantity);
    return sum + reorderQuantity * ingredient.referenceUnitCost;
  }, 0);
  const weeklyUsageValue = movementRows
    .filter((movement) => String(movement.created_at ?? "") >= weekSince && numericInventoryValue(movement.quantity_delta) < 0)
    .reduce((sum, movement) => sum + Math.abs(numericInventoryValue(movement.quantity_delta)) * numericInventoryValue(movement.unit_cost ?? firstOrNull(movement.ingredient)?.reference_unit_cost), 0);
  const reorderSuggestions = lowStockIngredients.map((ingredient) => {
    const monthlyUsage = movementRows
      .filter((movement) => String(movement.ingredient_id ?? "") === ingredient.id && numericInventoryValue(movement.quantity_delta) < 0)
      .reduce((sum, movement) => sum + Math.abs(numericInventoryValue(movement.quantity_delta)), 0);
    const dailyUsage = Math.round((monthlyUsage / 30) * 1000) / 1000;
    const daysLeft = dailyUsage > 0 ? Math.floor(ingredient.onHandQuantity / dailyUsage) : null;
    const reorderQuantity = Math.max(0, ingredient.minimumQuantity * 2 - ingredient.onHandQuantity);
    const urgency = ingredient.onHandQuantity <= 0 || (daysLeft !== null && daysLeft <= 2) ? "high" : ingredient.onHandQuantity <= ingredient.minimumQuantity * 0.5 ? "medium" : "low";
    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      onHandQuantity: ingredient.onHandQuantity,
      minimumQuantity: ingredient.minimumQuantity,
      dailyUsage,
      daysLeft,
      reorderQuantity: Math.round(reorderQuantity * 1000) / 1000,
      estimatedCost: Math.round(reorderQuantity * ingredient.referenceUnitCost),
      urgency
    } satisfies NonNullable<InventoryAiEconomicsSignal["topReorderSuggestion"]>;
  });
  const wasteSignals = movementRows
    .filter((movement) => ["waste", "expired"].includes(String(movement.movement_type)))
    .reduce<Map<string, NonNullable<InventoryAiEconomicsSignal["topWasteSignal"]>>>((acc, movement) => {
      const ingredientId = String(movement.ingredient_id ?? "");
      if (!ingredientId) return acc;
      const ingredient = firstOrNull(movement.ingredient);
      const current = acc.get(ingredientId) ?? {
        ingredientId,
        name: String(ingredient?.name ?? "Nguyen lieu"),
        unit: String(ingredient?.unit ?? "unit"),
        wasteQuantity: 0,
        wasteCost: 0,
        movementCount: 0
      };
      const quantity = Math.abs(numericInventoryValue(movement.quantity_delta));
      current.wasteQuantity += quantity;
      current.wasteCost += quantity * numericInventoryValue(movement.unit_cost ?? ingredient?.reference_unit_cost);
      current.movementCount += 1;
      acc.set(ingredientId, current);
      return acc;
    }, new Map());
  const topWasteSignal = [...wasteSignals.values()].sort((left, right) => right.wasteCost - left.wasteCost)[0] ?? null;

  return {
    snapshot: {
      schemaReady: true,
      ingredientCount: ingredientMap.size,
      activeIngredientCount: [...ingredientMap.values()].filter((ingredient) => ingredient.isActive).length,
      lowStockCount: lowStockIngredients.length,
      recipeReadyItemCount: recipeReadyItemIds.size,
      menuItemCount,
      recipeCoveragePercent: menuItemCount > 0 ? Math.round((recipeReadyItemIds.size / menuItemCount) * 100) : 0,
      openCountSessions,
      openAlertCount: alertRows.length,
      wasteSpikeAlertCount: countInventoryAlertRowsByType(alertRows, "waste_spike"),
      priceSpikeAlertCount: countInventoryAlertRowsByType(alertRows, "price_spike"),
      supplierDelayAlertCount: countInventoryAlertRowsByType(alertRows, "supplier_delay"),
      expiringBatchCount: expiringBatchIds.size,
      openPurchaseOrderCount,
      totalReferenceValue: Math.round(totalReferenceValue),
      lowStockIngredients,
      recentMovements
    },
    economics: {
      schemaReady: true,
      projectedPurchaseValue: Math.round(projectedPurchaseValue),
      weeklyUsageValue: Math.round(weeklyUsageValue),
      reorderSuggestionCount: reorderSuggestions.length,
      highReorderCount: reorderSuggestions.filter((suggestion) => suggestion.urgency === "high").length,
      topReorderSuggestion: reorderSuggestions.sort((left, right) => right.estimatedCost - left.estimatedCost)[0] ?? null,
      wasteSignalCount: wasteSignals.size,
      topWasteSignal: topWasteSignal ? { ...topWasteSignal, wasteQuantity: Math.round(topWasteSignal.wasteQuantity * 1000) / 1000, wasteCost: Math.round(topWasteSignal.wasteCost) } : null,
      priceSignalCount: 0,
      topPriceSignal: null,
      highFoodCostItemCount: 0,
      topHighFoodCostItem: null
    }
  };
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

function buildStaffAiSnapshot(input: {
  members?: any[] | null;
  attendance?: any[] | null;
  approvals?: any[] | null;
  shifts?: any[] | null;
  branchAssignments?: any[] | null;
  reviews?: any[] | null;
  schemaErrors?: string[] | null;
}) {
  const members = input.members ?? [];
  const attendance = input.attendance ?? [];
  const approvals = input.approvals ?? [];
  const shifts = input.shifts ?? [];
  const branchAssignments = input.branchAssignments ?? [];
  const reviews = input.reviews ?? [];
  const schemaErrors = (input.schemaErrors ?? []).filter(Boolean).slice(0, 6);
  const now = Date.now();
  const activeMembers = members.filter((member) => member.employment_status === "active" && !member.archived_at);
  const suspendedMembers = members.filter((member) => member.employment_status === "suspended" && !member.archived_at);
  const openAttendance = attendance.filter((log) => !log.clock_out_at);
  const lateLogs = attendance.filter((log) => log.attendance_state === "late" || Number(log.late_minutes ?? 0) > 0);
  const overtimeLogs = attendance.filter((log) => log.attendance_state === "overtime" || Number(log.overtime_minutes ?? 0) > 0);
  const pendingApprovals = approvals.filter((request) => request.status === "pending");
  const activeBranchAssignments = branchAssignments.filter((assignment) => assignment.assignment_status === "active");
  const assignedMemberIds = new Set(activeBranchAssignments.map((assignment) => String(assignment.staff_member_id ?? "")));
  const reviewedMemberIds = new Set(reviews.map((review) => String(review.staff_member_id ?? "")));
  const reviewScores = reviews.map((review) => Number(review.score ?? 0)).filter((score) => Number.isFinite(score) && score > 0);
  const lowReviewCount = reviews.filter((review) => Number(review.score ?? 0) > 0 && Number(review.score ?? 0) < 3.5).length;
  const draftReviewCount = reviews.filter((review) => review.status !== "completed").length;
  const onlineMembers = activeMembers.filter((member) => {
    const seenAt = member.last_seen_at ? new Date(member.last_seen_at).getTime() : 0;
    return Number.isFinite(seenAt) && now - seenAt <= 15 * 60 * 1000;
  });
  const memberNameById = new Map(members.map((member) => [String(member.id), String(member.full_name ?? "Nhân viên")]));

  return {
    schemaReady: true,
    schemaErrors,
    memberCount: members.length,
    activeCount: activeMembers.length,
    suspendedCount: suspendedMembers.length,
    archivedCount: members.filter((member) => Boolean(member.archived_at)).length,
    onlineCount: onlineMembers.length,
    currentlyClockedIn: openAttendance.length,
    attendanceLogCount24h: attendance.length,
    lateCount24h: lateLogs.length,
    overtimeMinutes24h: overtimeLogs.reduce((sum, log) => sum + Number(log.overtime_minutes ?? 0), 0),
    pendingApprovalCount: pendingApprovals.length,
    pendingApprovalByType: countRowsBy(pendingApprovals, "request_type"),
    roleBreakdown: countRowsBy(activeMembers, "role_code"),
    assignedBranchCount: activeMembers.filter((member) => assignedMemberIds.has(String(member.id))).length,
    unassignedActiveCount: activeMembers.filter((member) => !assignedMemberIds.has(String(member.id))).length,
    reviewedActiveCount: activeMembers.filter((member) => reviewedMemberIds.has(String(member.id))).length,
    unreviewedActiveCount: activeMembers.filter((member) => !reviewedMemberIds.has(String(member.id))).length,
    averageReviewScore: reviewScores.length ? Math.round((reviewScores.reduce((sum, score) => sum + score, 0) / reviewScores.length) * 10) / 10 : 0,
    lowReviewCount,
    draftReviewCount,
    shiftCount7d: shifts.length,
    upcomingShiftCount: shifts.filter((shift) => shift.status === "scheduled" || shift.status === "confirmed").length,
    activeStaff: activeMembers.slice(0, 8).map((member) => ({
      id: String(member.id ?? "").slice(0, 8),
      name: member.full_name,
      role: member.role_code,
      lastSeenAt: member.last_seen_at ?? null
    })),
    clockedInStaff: openAttendance.slice(0, 8).map((log) => ({
      staffMemberId: String(log.staff_member_id ?? "").slice(0, 8),
      name: memberNameById.get(String(log.staff_member_id)) ?? "Nhân viên",
      state: log.attendance_state,
      clockInAt: log.clock_in_at,
      lateMinutes: Number(log.late_minutes ?? 0),
      overtimeMinutes: Number(log.overtime_minutes ?? 0)
    })),
    pendingRequests: pendingApprovals.slice(0, 8).map((request) => ({
      id: String(request.id ?? "").slice(0, 8),
      staffMemberId: String(request.staff_member_id ?? "").slice(0, 8),
      name: memberNameById.get(String(request.staff_member_id)) ?? "Nhân viên",
      type: request.request_type,
      reason: request.reason ?? null,
      createdAt: request.created_at
    })),
    upcomingShifts: shifts.slice(0, 8).map((shift) => ({
      id: String(shift.id ?? "").slice(0, 8),
      staffMemberId: String(shift.staff_member_id ?? "").slice(0, 8),
      name: memberNameById.get(String(shift.staff_member_id)) ?? "Nhân viên",
      scheduledDate: shift.scheduled_date,
      status: shift.status
    }))
  };
}

function buildStaffAiUnavailableSnapshot(schemaErrors: string[]) {
  return {
    schemaReady: false,
    schemaErrors: schemaErrors.filter(Boolean).slice(0, 6),
    memberCount: null,
    activeCount: null,
    onlineCount: null,
    currentlyClockedIn: null,
    attendanceLogCount24h: null,
    pendingApprovalCount: null,
    upcomingShiftCount: null
  };
}

async function safeStaffAiQuery<T>(
  source: string,
  query: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  options: { required?: boolean } = {}
) {
  const { data, error } = await query;
  if (error) {
    const message = error.message || error.code || "query failed";
    return { source, data: null, error: `${source}: ${message}`, required: Boolean(options.required) };
  }
  return { source, data: data ?? null, error: null, required: Boolean(options.required) };
}

export async function getOwnerOperationalSnapshot(
  restaurantId: string,
  intent: OwnerAiIntent,
  restaurant: RestaurantAiContext,
  scope: OwnerAiSnapshotScope = {}
) {
  const supabase = createAdminSupabaseClient() as any;
  const branchId = scope.branchId ?? null;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = monthStartIso();
  const today = isoDateOffset(0);
  const nextWeek = isoDateOffset(7);

  const recentOrdersPromise = safeSupabaseQuery<any[]>(
    applyBranchScope(
      supabase
        .from("orders")
        .select(
          "id,branch_id,branch_assignment_source,status,total,payment_method,payment_status,fulfillment_type,customer_name,delivery_address,delivery_distance_km,created_at,accepted_at,served_at,service_due_at,table:tables(name),items:order_items(quantity,price,note,menuItem:menu_items(name))"
        )
        .eq("restaurant_id", restaurantId),
      branchId
    )
      .order("created_at", { ascending: false })
      .limit(12)
  );

  const todayOrdersPromise = safeSupabaseQuery<any[]>(
    applyBranchScope(
      supabase
        .from("orders")
        .select("id,branch_id,branch_assignment_source,status,total,payment_status,payment_method,fulfillment_type,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", since),
      branchId
    )
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
        applyBranchScope(
          supabase
            .from("tables")
            .select("id,branch_id,name,area,capacity,qr_enabled,orders:orders(id,status,total,created_at,service_due_at)")
            .eq("restaurant_id", restaurantId)
            .in("orders.status", ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"]),
          branchId
        )
          .order("name", { ascending: true })
      )
    : Promise.resolve(null);

  const paymentsPromise = intentNeeds(intent, ["payments", "reports"])
    ? safeSupabaseQuery<any[]>(
        applyBranchScope(
          supabase
            .from("payment_logs")
            .select("id,order_id,method,status,amount,created_at,order:orders!inner(restaurant_id,total,status,created_at,branch_id)")
            .eq("order.restaurant_id", restaurantId),
          branchId,
          "order.branch_id"
        )
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

  const inventoryPromise: Promise<{
    snapshot: Awaited<ReturnType<typeof getInventorySnapshot>>;
    economics: Awaited<ReturnType<typeof getInventoryAiEconomicsSignal>> | null;
  } | null> = intentNeeds(intent, ["inventory", "overview", "reports"])
    ? getOwnerInventoryAiData(restaurantId, branchId).catch(() => null)
    : Promise.resolve(null);

  const reservationsPromise = intentNeeds(intent, ["reservations", "reports"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("reservations")
          .select("id,status,customer_name,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_status,created_at,locks:reservation_table_locks(table:tables(branch_id,name))")
          .eq("restaurant_id", restaurantId)
          .order("starts_at", { ascending: true })
          .limit(30)
      )
    : Promise.resolve(null);

  const staffPromise = intentNeeds(intent, ["staff", "reports"])
    ? Promise.all([
        safeStaffAiQuery<any[]>(
          "staff_members",
          supabase
            .from("staff_members")
            .select("id,full_name,role_code,employment_status,last_seen_at,suspended_at,archived_at,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120),
          { required: true }
        ),
        safeStaffAiQuery<any[]>(
          "attendance_logs",
          applyBranchScope(
            supabase
              .from("attendance_logs")
              .select("id,staff_member_id,branch_id,attendance_state,approval_state,late_minutes,overtime_minutes,work_minutes,clock_in_at,clock_out_at")
              .eq("restaurant_id", restaurantId)
              .gte("clock_in_at", since),
            branchId
          )
            .order("clock_in_at", { ascending: false })
            .limit(120)
        ),
        safeStaffAiQuery<any[]>(
          "attendance_approval_requests",
          applyBranchScope(
            supabase
              .from("attendance_approval_requests")
              .select("id,staff_member_id,branch_id,request_type,status,reason,created_at")
              .eq("restaurant_id", restaurantId),
            branchId
          )
            .order("created_at", { ascending: false })
            .limit(120)
        ),
        safeStaffAiQuery<any[]>(
          "shift_assignments",
          applyBranchScope(
            supabase
              .from("shift_assignments")
              .select("id,staff_member_id,branch_id,shift_id,scheduled_date,status")
              .eq("restaurant_id", restaurantId)
              .gte("scheduled_date", today)
              .lte("scheduled_date", nextWeek),
            branchId
          )
            .order("scheduled_date", { ascending: true })
            .limit(120)
        ),
        safeStaffAiQuery<any[]>(
          "staff_branch_assignments",
          applyBranchScope(
            supabase
              .from("staff_branch_assignments")
              .select("id,staff_member_id,branch_id,is_primary,assignment_status")
              .eq("restaurant_id", restaurantId)
              .eq("assignment_status", "active"),
            branchId
          )
            .limit(160)
        ),
        safeStaffAiQuery<any[]>(
          "staff_reviews",
          supabase
            .from("staff_reviews")
            .select("id,staff_member_id,period_label,score,status,created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(120)
        )
      ]).then((results) => {
        const schemaErrors = results.map((result) => result.error).filter((error): error is string => Boolean(error));
        const requiredErrors = results.filter((result) => result.required && result.error).map((result) => result.error as string);
        if (requiredErrors.length) return buildStaffAiUnavailableSnapshot(requiredErrors);

        const [members, attendance, approvals, shifts, branchAssignments, reviews] = results.map((result) => result.error ? [] : result.data);
        return buildStaffAiSnapshot(
          branchId
            ? scopeStaffAiRowsByBranch({ members, attendance, approvals, shifts, branchAssignments, reviews, schemaErrors })
            : { members, attendance, approvals, shifts, branchAssignments, reviews, schemaErrors }
        );
      })
    : Promise.resolve(null);

  const [recentOrdersRaw, todayOrdersRaw, menuRaw, tablesRaw, paymentsRaw, promotionsRaw, inventoryRaw, reservationsRaw, staffRaw] = await Promise.all([
    recentOrdersPromise,
    todayOrdersPromise,
    menuPromise,
    tablesPromise,
    paymentsPromise,
    promotionsPromise,
    inventoryPromise,
    reservationsPromise,
    staffPromise
  ]);
  const inventorySnapshotRaw = inventoryRaw?.snapshot ?? null;
  const inventoryEconomicsRaw = inventoryRaw?.economics ?? null;
  const reservationsScoped = (reservationsRaw ?? []).filter((reservation) => reservationMatchesBranch(reservation, branchId));

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

  const snapshot = {
    generatedAt: new Date().toISOString(),
    intent,
    scope: {
      type: branchId ? "branch" : "restaurant",
      branchId,
      branchName: scope.branchName ?? null
    },
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
    inventory: inventorySnapshotRaw
      ? {
          schemaReady: inventorySnapshotRaw.schemaReady,
          activeIngredientCount: inventorySnapshotRaw.activeIngredientCount,
          lowStockCount: inventorySnapshotRaw.lowStockCount,
          recipeCoveragePercent: inventorySnapshotRaw.recipeCoveragePercent,
          recipeReadyItemCount: inventorySnapshotRaw.recipeReadyItemCount,
          menuItemCount: inventorySnapshotRaw.menuItemCount,
          totalReferenceValue: inventorySnapshotRaw.totalReferenceValue,
          expiringBatchCount: inventorySnapshotRaw.expiringBatchCount,
          openAlertCount: inventorySnapshotRaw.openAlertCount,
          wasteSpikeAlertCount: inventorySnapshotRaw.wasteSpikeAlertCount,
          priceSpikeAlertCount: inventorySnapshotRaw.priceSpikeAlertCount,
          supplierDelayAlertCount: inventorySnapshotRaw.supplierDelayAlertCount,
          openPurchaseOrderCount: inventorySnapshotRaw.openPurchaseOrderCount,
          projectedPurchaseValue: inventoryEconomicsRaw?.projectedPurchaseValue ?? 0,
          weeklyUsageValue: inventoryEconomicsRaw?.weeklyUsageValue ?? 0,
          reorderSuggestionCount: inventoryEconomicsRaw?.reorderSuggestionCount ?? 0,
          highReorderCount: inventoryEconomicsRaw?.highReorderCount ?? 0,
          topReorderSuggestion: inventoryEconomicsRaw?.topReorderSuggestion
            ? {
                name: inventoryEconomicsRaw.topReorderSuggestion.name,
                unit: inventoryEconomicsRaw.topReorderSuggestion.unit,
                daysLeft: inventoryEconomicsRaw.topReorderSuggestion.daysLeft,
                reorderQuantity: inventoryEconomicsRaw.topReorderSuggestion.reorderQuantity,
                estimatedCost: inventoryEconomicsRaw.topReorderSuggestion.estimatedCost,
                urgency: inventoryEconomicsRaw.topReorderSuggestion.urgency
              }
            : null,
          wasteSignalCount: inventoryEconomicsRaw?.wasteSignalCount ?? 0,
          topWasteSignal: inventoryEconomicsRaw?.topWasteSignal,
          priceSignalCount: inventoryEconomicsRaw?.priceSignalCount ?? 0,
          topPriceSignal: inventoryEconomicsRaw?.topPriceSignal,
          highFoodCostItemCount: inventoryEconomicsRaw?.highFoodCostItemCount ?? 0,
          topHighFoodCostItem: inventoryEconomicsRaw?.topHighFoodCostItem,
          lowStockIngredients: inventorySnapshotRaw.lowStockIngredients.slice(0, 5).map((ingredient) => ({
            name: ingredient.name,
            unit: ingredient.unit,
            onHandQuantity: ingredient.onHandQuantity,
            minimumQuantity: ingredient.minimumQuantity,
            referenceUnitCost: ingredient.referenceUnitCost
          }))
        }
      : null,
    reservations: reservationsRaw
      ? reservationsScoped.map((reservation) => ({
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
      : null,
    staff: staffRaw
  };

  return {
    ...snapshot,
    operationInsights: buildOperationInsights(snapshot)
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
  const { data, error } = await supabase.from("restaurants").select("id,platform_status,deleted_at").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán.", 404);
  assertPublicTenantActive(data);
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
  metadata,
  aiResult
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
  aiResult?: AiCompletionResult | null;
}) {
  const enrichedMetadata = {
    ...(metadata ?? {}),
    ...(aiResult
      ? {
          providerAttempts: aiResult.attempts.map((attempt) => ({
            provider: attempt.provider,
            model: attempt.model,
            status: attempt.status,
            latencyMs: attempt.latencyMs,
            estimatedCostVnd: attempt.estimatedCostVnd ?? null,
            errorMessage: attempt.errorMessage ? attempt.errorMessage.slice(0, 220) : null
          })),
          estimatedCostVnd: aiResult.estimatedCostVnd ?? null,
          cacheHit: Boolean(aiResult.cacheHit),
          latencyMs: aiResult.latencyMs ?? null,
          taskType: aiResult.taskType ?? null
        }
      : {})
  };
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
    metadata: enrichedMetadata
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
      ...enrichedMetadata,
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
        ...enrichedMetadata,
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
        ...enrichedMetadata,
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

async function mimoChat(
  config: NativeAiProviderConfig,
  model: string,
  messages: AiMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<LegacyAiCompletionResult> {
  await assertMimoDailyTaskTokenBudget("ocr", options?.maxTokens ?? null);

  const response = await fetchAiWithTimeout(
    `${config.baseUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.35,
        max_completion_tokens: options?.maxTokens,
        top_p: 0.95,
        ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {})
      })
    },
    {
      timeoutMs: LEGACY_AI_CHAT_TIMEOUT_MS,
      timeoutMessage: "MiMo phản hồi quá lâu. Vui lòng thử lại sau.",
      retries: 1
    }
  );

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "MiMo từ chối xử lý yêu cầu AI.", 502);
  }

  recordMimoDailyTaskTokenUsage("ocr", json?.usage?.prompt_tokens ?? null, json?.usage?.completion_tokens ?? null);

  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    provider: "mimo",
    model,
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function mimoMultimodalOcr({
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
  if (config.provider !== "mimo") {
    throw new AppError("OCR menu yêu cầu cấu hình Xiaomi MiMo hợp lệ.", 500);
  }

  const imagePayload = normalizeMimoImagePayload({ imageUrl, imageBase64 });
  if (!imagePayload) throw new AppError("Thiếu ảnh menu để AI OCR.", 400);

  await assertMimoDailyTaskTokenBudget("ocr", 3500);

  const response = await fetchAiWithTimeout(
    `${config.baseUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.ocrModel,
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
        max_completion_tokens: 3500,
        top_p: 0.95
      })
    },
    {
      timeoutMs: LEGACY_AI_OCR_TIMEOUT_MS,
      timeoutMessage: "MiMo OCR phản hồi quá lâu. Vui lòng thử lại với ảnh rõ hơn hoặc nhỏ hơn.",
      retries: 1
    }
  );

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "MiMo OCR không đọc được menu.", 502);
  }

  const content = json?.choices?.[0]?.message?.content ?? json?.output?.choices?.[0]?.message?.content;
  const text = readAiMessageContent(content) || String(json?.output?.text ?? "").trim();
  recordMimoDailyTaskTokenUsage("ocr", json?.usage?.prompt_tokens ?? json?.usage?.input_tokens ?? null, json?.usage?.completion_tokens ?? json?.usage?.output_tokens ?? null);

  return {
    text,
    provider: "mimo",
    model: config.ocrModel,
    inputTokens: json?.usage?.prompt_tokens ?? json?.usage?.input_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? json?.usage?.output_tokens ?? null,
    raw: json
  };
}

async function xaiChat(config: NativeAiProviderConfig, model: string, messages: AiMessage[], options?: { maxTokens?: number }): Promise<LegacyAiCompletionResult> {
  const response = await fetchAiWithTimeout(
    `${config.baseUrl}/v1/chat/completions`,
    {
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
    },
    {
      timeoutMs: LEGACY_AI_CHAT_TIMEOUT_MS,
      timeoutMessage: "xAI phản hồi quá lâu. Vui lòng thử lại sau.",
      retries: 1
    }
  );

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
  options?: Pick<AiCompletionOptions, "jsonMode" | "maxTokens" | "topP" | "cacheTtlMs" | "tools" | "toolChoice">,
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
      topP: options?.topP,
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
  const scope = await resolveOwnerAiSnapshotScope(input.restaurantId, input.context);
  if (isCasualGreeting(input.message)) {
    const greetingResult = buildOwnerGreetingResult(restaurant, input.message);
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      threadId: input.threadId,
      surface: "dashboard",
      role: "user",
      content: input.message,
      metadata: { intent: greetingResult.intent, source: "owner_ai_greeting", threadId: input.threadId ?? null, scope }
    });
    await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      conversationId,
      userId: input.userId,
      threadId: input.threadId,
      surface: "dashboard",
      role: "assistant",
      content: greetingResult.reply,
      provider: greetingResult.provider,
      model: greetingResult.model,
      metadata: {
        intent: greetingResult.intent,
        intentLabel: greetingResult.intentLabel,
        suggestions: greetingResult.suggestions,
        actions: [],
        actionIds: [],
        greeting: true,
        threadId: input.threadId ?? null,
        scope
      }
    });
    return greetingResult;
  }

  const [snapshot, memory] = await Promise.all([
    getOwnerOperationalSnapshot(input.restaurantId, intent, restaurant, scope),
    getScopedRestaurantMemoryContext({
      restaurantId: input.restaurantId,
      query: input.message,
      categories: [...ownerMemoryCategories(intent)],
      includeSensitive: true,
      limit: 5
    }).catch(() => ({ context: "", items: [], schemaReady: false }))
  ]);
  const messages = buildOwnerAssistantMessages({
    restaurant,
    intent,
    message: normalizePrompt(input.message),
    context: input.context,
    snapshot,
    memoryContext: memory.context
  });

  try {
    const { result, toolRuns } = await runToolAwareChat({
      surface: "owner",
      messages,
      preferredProvider: normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      maxTokens: 800,
      taskType: intent === "reports" ? "analytics_reasoning" : intent === "growth" ? "business_insight" : "dashboard_operation",
      toolContext: { restaurantId: input.restaurantId, branchId: scope.branchId ?? null, userId: input.userId },
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
      metadata: { intent, memorySchemaReady: memory.schemaReady, memoryCount: memory.items.length, scope },
      aiResult: result
    });
    const actions = buildOwnerAgentActions(intent, ownerAiIntentConfig[intent].suggestions, snapshot, toolRuns, input.message);
    const currentRoute = typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null;
    const agentPlan = buildOwnerAgentPlan(intent, actions);
    const replyContract = normalizeAiReply({
      rawText: result.text,
      fallbackText: buildOwnerFallbackReply({
        intent,
        snapshot,
        toolRuns,
        actions
      }),
      emptyText: "Mình đã đọc dữ liệu vận hành và chuẩn bị action an toàn để bạn tiếp tục.",
      maxLength: 520
    });
    const reply = replyContract.reply;
    const passport = buildOwnerPassport({
      intent,
      intentLabel: ownerAiIntentConfig[intent].label,
      route: currentRoute,
      summary: agentPlan.summary,
      nextActionId: agentPlan.nextBestActionId ?? actions[0]?.id ?? null,
      nextActionLabel: actions.find((action) => action.id === agentPlan.nextBestActionId)?.label ?? actions[0]?.label ?? null,
      confidence: agentPlan.confidence
    });
    const mission = buildAgentMission({
      surface: "dashboard",
      title: agentPlan.title,
      outcome: agentPlan.summary,
      route: currentRoute,
      actions,
      urgency: actions.some((action) => action.priority === "primary" && (action.type === "api" || action.type === "ui")) ? "now" : "soon",
      estimatedMinutes: Math.max(3, Math.min(12, actions.length * 2)),
      operatorNote: agentPlan.safetyNote
    });
    const commandDeck = buildCommandDeck({
      surface: "dashboard",
      title: agentPlan.title,
      headline: reply,
      actions,
      mission,
      passport,
      confidence: agentPlan.confidence
    });
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      threadId: input.threadId,
      surface: "dashboard",
      role: "user",
      content: input.message,
      metadata: { intent, source: "owner_ai", threadId: input.threadId ?? null, scope }
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
        agentPlan,
        actionIds: actions.map((action) => action.id),
        tools: toolRuns.map((tool) => tool.name),
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        threadId: input.threadId ?? null,
        replyQuality: replyContract.quality,
        commandDeck,
        mission,
        passport,
        scope
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
      agentPlan,
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
      metadata: { intent, scope }
    });

    const actions = buildOwnerAgentActions(intent, ownerAiIntentConfig[intent].suggestions, snapshot, [], input.message);
    const agentPlan = buildOwnerAgentPlan(intent, actions);
    const passport = buildOwnerPassport({
      intent,
      intentLabel: ownerAiIntentConfig[intent].label,
      route: typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null,
      summary: agentPlan.summary,
      nextActionId: agentPlan.nextBestActionId ?? actions[0]?.id ?? null,
      nextActionLabel: actions.find((action) => action.id === agentPlan.nextBestActionId)?.label ?? actions[0]?.label ?? null,
      confidence: agentPlan.confidence
    });
    const mission = buildAgentMission({
      surface: "dashboard",
      title: agentPlan.title,
      outcome: agentPlan.summary,
      route: typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null,
      actions,
      urgency: "soon",
      estimatedMinutes: Math.max(3, Math.min(12, actions.length * 2)),
      operatorNote: agentPlan.safetyNote
    });
    const replyContract = normalizeAiReply({
      rawText: "",
      fallbackText: buildOwnerFallbackReply({
        intent,
        snapshot,
        toolRuns: [],
        actions
      }) || "Mình chưa gọi được model AI, nhưng đã chuẩn bị action an toàn để bạn tiếp tục thao tác ngay.",
      emptyText: "Mình đã chuẩn bị action an toàn để bạn tiếp tục thao tác ngay.",
      maxLength: 520
    });
    const reply = replyContract.reply;
    const commandDeck = buildCommandDeck({
      surface: "dashboard",
      title: agentPlan.title,
      headline: reply,
      actions,
      mission,
      passport,
      confidence: agentPlan.confidence,
      premiumReason: "Ngay cả khi model lỗi, Command Deck vẫn giữ luồng xử lý bằng router hành động an toàn."
    });

    try {
      const conversationId = await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        userId: input.userId,
        threadId: input.threadId,
        surface: "dashboard",
        role: "user",
        content: input.message,
        metadata: { intent, source: "owner_ai_fallback", threadId: input.threadId ?? null, scope }
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
          threadId: input.threadId ?? null,
          replyQuality: replyContract.quality,
          commandDeck,
          mission,
          passport,
          scope
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
      agentPlan,
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
    const nextSetupAction = readiness.nextActions[0] ?? null;
    const passport = buildOperationalPassport({
      surface: "dashboard",
      title: "Chủ quán · Setup quán",
      status: input.mode ?? "audit",
      goal: `Điểm sẵn sàng ${readiness.score}%`,
      route: "/dashboard/settings",
      nextActionId: nextSetupAction?.key ?? null,
      nextActionLabel: nextSetupAction?.action ?? null,
      checkpoint: readiness.criticalMissing[0]?.action ?? null,
      handoffRoute: nextSetupAction?.route ?? "/dashboard/settings",
      handoffLabel: nextSetupAction?.label ?? "Mở cài đặt quán",
      confidence: readiness.score >= 80 ? "high" : readiness.score >= 50 ? "medium" : "low"
    });
    const data = extractJsonObject(result.text);
    const replyContract = normalizeAiReply({
      rawText: result.text,
      fallbackText: buildReadinessFallbackText(readiness),
      emptyText: "Đã tạo kế hoạch setup quán với bước tiếp theo rõ ràng.",
      maxLength: 520
    });
    const mission = buildAgentMission({
      surface: "dashboard",
      title: "Setup Commander",
      outcome: replyContract.reply,
      route: nextSetupAction?.route ?? "/dashboard/settings",
      urgency: readiness.score < 70 ? "now" : "soon",
      estimatedMinutes: 30,
      fallbackSteps: readiness.nextActions.slice(0, 4).map((action, index) => ({
        id: `setup-${action.key || index}`,
        label: action.action || action.label,
        description: action.label,
        status: index === 0 ? "ready" : "queued"
      })),
      successCriteria: [
        `Điểm sẵn sàng đạt tối thiểu ${Math.min(100, Math.max(80, readiness.score))}%.`,
        "Không còn blocker quan trọng trước khi bán thật.",
        "Chủ quán biết màn cần mở để áp dụng bước tiếp theo."
      ]
    });
    const commandDeck = buildCommandDeck({
      surface: "dashboard",
      title: "Setup Commander",
      headline: replyContract.reply,
      mission,
      passport,
      confidence: passport.confidence,
      premiumReason: "Setup Commander gom readiness, blocker và nút mở đúng màn thành một luồng setup thương mại hóa được."
    });
    return {
      provider: result.provider,
      model: result.model,
      reply: replyContract.reply,
      text: replyContract.reply,
      data,
      readiness,
      suggestions: ownerAiIntentConfig.setup.suggestions,
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
      undefined,
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
    const nextSetupAction = readiness.nextActions[0] ?? null;
    const passport = buildOperationalPassport({
      surface: "dashboard",
      title: `Chủ quán · ${storeSetupDraftConfig[kind].label}`,
      status: kind,
      goal: storeSetupDraftConfig[kind].outputFocus,
      route: storeSetupDraftConfig[kind].route,
      nextActionId: nextSetupAction?.key ?? null,
      nextActionLabel: nextSetupAction?.action ?? null,
      checkpoint: readiness.criticalMissing[0]?.action ?? null,
      handoffRoute: nextSetupAction?.route ?? storeSetupDraftConfig[kind].route,
      handoffLabel: nextSetupAction?.label ?? storeSetupDraftConfig[kind].label,
      confidence: readiness.score >= 80 ? "high" : readiness.score >= 50 ? "medium" : "low"
    });
    const data = extractJsonObject(result.text);
    const replyContract = normalizeAiReply({
      rawText: result.text,
      fallbackText: `${storeSetupDraftConfig[kind].label}: ${storeSetupDraftConfig[kind].outputFocus}. ${buildReadinessFallbackText(readiness)}`,
      emptyText: "Đã tạo bản nháp setup để bạn mở đúng khu vực và áp dụng.",
      maxLength: 520
    });
    const mission = buildAgentMission({
      surface: "dashboard",
      title: storeSetupDraftConfig[kind].label,
      outcome: replyContract.reply,
      route: storeSetupDraftConfig[kind].route,
      urgency: "soon",
      estimatedMinutes: 8,
      fallbackSteps: [
        {
          id: `draft-${kind}-review`,
          label: "Xem bản nháp AI",
          description: storeSetupDraftConfig[kind].outputFocus,
          status: "ready"
        },
        {
          id: `draft-${kind}-apply`,
          label: "Mở nơi áp dụng",
          description: `Đi tới ${storeSetupDraftConfig[kind].route} để kiểm tra và dùng bản nháp.`,
          status: "queued"
        }
      ],
      successCriteria: [
        "Bản nháp có nơi áp dụng rõ ràng.",
        "Không hiển thị JSON thô hoặc hướng dẫn cho dev.",
        "Chủ quán có thể quyết định dùng, sửa hoặc tạo lại."
      ]
    });
    const commandDeck = buildCommandDeck({
      surface: "dashboard",
      title: storeSetupDraftConfig[kind].label,
      headline: replyContract.reply,
      mission,
      passport,
      confidence: passport.confidence,
      premiumReason: "Draft Agent biến bản nháp AI thành một điểm áp dụng cụ thể thay vì chỉ sinh văn bản."
    });
    return {
      provider: result.provider,
      model: result.model,
      reply: replyContract.reply,
      text: replyContract.reply,
      data,
      readiness,
      config: storeSetupDraftConfig[kind],
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
  reservationStatus?: unknown;
  context?: Record<string, unknown>;
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
    reservationStatus: input.reservationStatus,
    menuSnapshot,
    context: input.context
  });

  try {
    const { result, toolRuns } = await runToolAwareChat({
      surface: "customer",
      messages,
      preferredProvider: normalizeAiProvider(process.env.AI_CUSTOMER_PROVIDER),
      modelOverride: undefined,
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
      metadata: { intent },
      aiResult: result
    });
    const actions = buildCustomerAgentActions(intent, restaurant.slug, {
      menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus,
      reservationStatus: input.reservationStatus,
      message: input.message,
      toolRuns
    });
    const agentPlan = buildCustomerAgentPlan(intent, actions);
    const currentRoute = typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null;
    const passport = buildCustomerPassport({
      intent,
      intentLabel: customerAiIntentConfig[intent].label,
      route: currentRoute,
      summary: agentPlan.summary,
      nextActionId: agentPlan.nextBestActionId ?? actions[0]?.id ?? null,
      nextActionLabel: actions.find((action) => action.id === agentPlan.nextBestActionId)?.label ?? actions[0]?.label ?? null,
      confidence: agentPlan.confidence
    });
    const mission = buildAgentMission({
      surface: "customer",
      title: agentPlan.title,
      outcome: agentPlan.summary,
      route: currentRoute,
      actions,
      urgency: intent === "payment" || intent === "order_status" ? "now" : "soon",
      estimatedMinutes: Math.max(1, Math.min(8, actions.length * 2)),
      operatorNote: agentPlan.safetyNote
    });
    const replyContract = normalizeAiReply({
      rawText: result.text,
      fallbackText: buildCustomerFallbackReply({
        intent,
        restaurant,
        message: input.message,
        menuSnapshot,
        cart: input.cart,
        orderStatus: input.orderStatus,
        reservationStatus: input.reservationStatus,
        toolRuns,
        actions
      }),
      emptyText: "Mình đã kiểm tra dữ liệu thật và chuẩn bị nút an toàn cho bước tiếp theo.",
      maxLength: 360
    });
    const reply = replyContract.reply;
    const commandDeck = buildCommandDeck({
      surface: "customer",
      title: agentPlan.title,
      headline: reply,
      actions,
      mission,
      passport,
      confidence: agentPlan.confidence
    });
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      customerSessionId: input.customerSessionId,
      threadId: input.threadId,
      surface: "customer",
      role: "user",
      content: input.message,
      metadata: { intent, source: "customer_ai", threadId: input.threadId ?? null, hasReservationStatus: Boolean(input.reservationStatus) }
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
        threadId: input.threadId ?? null,
        replyQuality: replyContract.quality,
        commandDeck,
        mission,
        passport
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
      agentPlan,
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
      metadata: { intent, hasReservationStatus: Boolean(input.reservationStatus) }
    });

    const actions = buildCustomerAgentActions(intent, restaurant.slug, {
      menuSnapshot,
      cart: input.cart,
      orderStatus: input.orderStatus,
      reservationStatus: input.reservationStatus,
      message: input.message,
      toolRuns: []
    });
    const agentPlan = buildCustomerAgentPlan(intent, actions);
    const passport = buildCustomerPassport({
      intent,
      intentLabel: customerAiIntentConfig[intent].label,
      route: typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null,
      summary: agentPlan.summary,
      nextActionId: agentPlan.nextBestActionId ?? actions[0]?.id ?? null,
      nextActionLabel: actions.find((action) => action.id === agentPlan.nextBestActionId)?.label ?? actions[0]?.label ?? null,
      confidence: agentPlan.confidence
    });
    const mission = buildAgentMission({
      surface: "customer",
      title: agentPlan.title,
      outcome: agentPlan.summary,
      route: typeof input.context?.currentPath === "string" ? input.context.currentPath : typeof input.context?.route === "string" ? input.context.route : null,
      actions,
      urgency: "soon",
      estimatedMinutes: Math.max(1, Math.min(8, actions.length * 2)),
      operatorNote: agentPlan.safetyNote
    });
    const replyContract = normalizeAiReply({
      rawText: "",
      fallbackText: buildCustomerFallbackReply({
        intent,
        restaurant,
        message: input.message,
        menuSnapshot,
        cart: input.cart,
        orderStatus: input.orderStatus,
        reservationStatus: input.reservationStatus,
        toolRuns: [],
        actions
      }) || "Mình chưa gọi được model AI, nhưng đã chuẩn bị nút an toàn để bạn tiếp tục.",
      emptyText: "Mình đã chuẩn bị nút an toàn để bạn tiếp tục.",
      maxLength: 360
    });
    const reply = replyContract.reply;
    const commandDeck = buildCommandDeck({
      surface: "customer",
      title: agentPlan.title,
      headline: reply,
      actions,
      mission,
      passport,
      confidence: agentPlan.confidence,
      premiumReason: "Nếu model tạm lỗi, Command Deck vẫn đưa khách tới bước đặt món hoặc thanh toán an toàn."
    });

    try {
      const conversationId = await persistAiConversationMessage({
        restaurantId: input.restaurantId,
        customerSessionId: input.customerSessionId,
        threadId: input.threadId,
        surface: "customer",
        role: "user",
        content: input.message,
        metadata: { intent, source: "customer_ai_fallback", threadId: input.threadId ?? null, hasReservationStatus: Boolean(input.reservationStatus) }
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
          threadId: input.threadId ?? null,
          replyQuality: replyContract.quality,
          commandDeck,
          mission,
          passport
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
      agentPlan,
      replyQuality: replyContract.quality,
      commandDeck,
      mission,
      passport
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
    const config = await getProviderConfig(normalizeNativeAiProvider(process.env.AI_IMAGE_PROVIDER) || "xai");

    if (config.provider === "xai") {
      const response = await fetchAiWithTimeout(
        `${config.baseUrl}/v1/images/generations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: config.imageModel,
            prompt,
            n: 1,
            response_format: "url"
          })
        },
        {
          timeoutMs: LEGACY_AI_IMAGE_TIMEOUT_MS,
          timeoutMessage: "xAI tạo ảnh phản hồi quá lâu. Vui lòng thử lại sau."
        }
      );
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
        model: config.imageModel,
        raw: json
      } satisfies AiImageResult;
    }

    throw new AppError("Provider tạo ảnh hiện tại chưa hỗ trợ trả URL ảnh. Hãy cấu hình XAI_API_KEY hoặc bật prompt fallback.", 500);
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
  const result = await runChat(buildBrandingMessages({ restaurant, ...input }), "mimo", undefined, { jsonMode: true, cacheTtlMs: 20_000 }, "branding");
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_branding_studio",
    provider: result.provider,
    model: result.model,
    requestKind: "chat",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    aiResult: result
  });

  const data = normalizeBrandBoard(extractJsonObject(result.text));
  const replyContract = normalizeAiReply({
    rawText: result.text,
    fallbackText: buildBrandingFallbackText(data),
    emptyText: "Đã tạo bản nháp thương hiệu để bạn áp dụng.",
    maxLength: 520
  });
  const mission = buildAgentMission({
    surface: "dashboard",
    title: "Brand Growth Agent",
    outcome: replyContract.reply,
    route: "/dashboard/settings?section=brand",
    urgency: "soon",
    estimatedMinutes: 6,
    fallbackSteps: [
      {
        id: "brand-review-slogan",
        label: data.slogans[0] ? `Chọn slogan: ${data.slogans[0]}` : "Chọn slogan",
        description: "Dùng slogan ngắn, dễ đọc trên mobile.",
        status: "ready"
      },
      {
        id: "brand-apply-profile",
        label: "Áp dụng vào hồ sơ thương hiệu",
        description: "Kiểm mô tả, giọng thương hiệu và logo prompt trước khi lưu.",
        status: "queued"
      }
    ],
    successCriteria: [
      "Có slogan ngắn dùng được ngay.",
      "Có mô tả thương hiệu không phóng đại.",
      "Có prompt logo tránh chữ nhỏ lỗi typography."
    ]
  });
  const commandDeck = buildCommandDeck({
    surface: "dashboard",
    title: "Brand Growth Agent",
    headline: replyContract.reply,
    mission,
    premiumReason: "Brand Command Deck tập trung slogan, mô tả và hướng áp dụng thương hiệu thay vì sinh nội dung rời rạc."
  });

  return {
    provider: result.provider,
    model: result.model,
    reply: replyContract.reply,
    text: replyContract.reply,
    data,
    commandDeck,
    mission,
    replyQuality: replyContract.quality
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
  const result = await runChat(messages, "mimo", undefined, { jsonMode: true, cacheTtlMs: 20_000 }, "branding");

  const data = normalizeBrandBoard(extractJsonObject(result.text));
  const replyContract = normalizeAiReply({
    rawText: result.text,
    fallbackText: buildBrandingFallbackText(data),
    emptyText: "Đã tạo bản nháp thương hiệu để bạn áp dụng.",
    maxLength: 520
  });
  const mission = buildAgentMission({
    surface: "onboarding",
    title: "Onboarding Brand Agent",
    outcome: replyContract.reply,
    route: "/dashboard/onboarding",
    urgency: "soon",
    estimatedMinutes: 5,
    fallbackSteps: [
      {
        id: "onboarding-brand-choose",
        label: data.slogans[0] ? `Chọn slogan: ${data.slogans[0]}` : "Chọn slogan",
        description: "Giữ slogan ngắn để hiển thị tốt trên mobile.",
        status: "ready"
      },
      {
        id: "onboarding-brand-apply",
        label: "Áp dụng vào hồ sơ quán",
        description: "Dùng mô tả và voice thương hiệu làm bản nháp.",
        status: "queued"
      }
    ]
  });
  const commandDeck = buildCommandDeck({
    surface: "onboarding",
    title: "Onboarding Brand Agent",
    headline: replyContract.reply,
    mission,
    premiumReason: "Onboarding Command Deck giúp người mới chọn và áp dụng bản sắc quán ngay trong luồng tạo quán."
  });

  return {
    provider: result.provider,
    model: result.model,
    reply: replyContract.reply,
    text: replyContract.reply,
    data,
    commandDeck,
    mission,
    replyQuality: replyContract.quality
  };
}

type MenuOcrDraft = ReturnType<typeof normalizeMenuOcrDraft>;
type InventoryOcrDraft = ReturnType<typeof normalizeInventoryOcrDraft>;

function hasMenuOcrItems(draft: MenuOcrDraft) {
  return draft.categories.some((category) => category.items.length > 0);
}

function hasInventoryOcrRows(draft: InventoryOcrDraft) {
  return draft.rows.length > 0;
}

async function enrichOcrInputWithTextract(input: { imageUrl?: string; imageBase64?: string; rawText?: string }, label: "menu" | "inventory") {
  if (!input.imageUrl && !input.imageBase64) return input;
  if (!isAwsTextractConfigured()) {
    if (input.rawText?.trim()) return { rawText: input.rawText.trim() };
    throw new AppError(`OCR ảnh ${label === "menu" ? "menu" : "hóa đơn"} cần AWS Textract. Vui lòng cấu hình OCR_PROVIDER=textract và AWS_TEXTRACT_* trước khi gửi ảnh.`, 503);
  }

  try {
    const textract = await detectDocumentTextWithAwsTextract({ imageUrl: input.imageUrl, imageBase64: input.imageBase64 });
    if (!textract.text.trim()) {
      if (input.rawText?.trim()) return { rawText: input.rawText.trim() };
      throw new AppError(`AWS Textract chưa đọc được chữ từ ảnh ${label === "menu" ? "menu" : "hóa đơn"}. Vui lòng chụp rõ hơn hoặc dán nội dung thô.`, 422);
    }
    const rawText = [input.rawText, textract.text].filter(Boolean).join("\n").trim();
    return { rawText };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.warn(`[ai-ocr] textract ${label} failed`, { error: error instanceof Error ? error.message : error });
    if (input.rawText?.trim()) return { rawText: input.rawText.trim() };
    throw new AppError(`AWS Textract chưa xử lý được ảnh ${label === "menu" ? "menu" : "hóa đơn"}. Vui lòng thử ảnh rõ hơn hoặc dán nội dung thô.`, 502);
  }
}

async function runMenuOcrDraft(input: { imageUrl?: string; imageBase64?: string; rawText?: string }) {
  const ocrInput = await enrichOcrInputWithTextract(input, "menu");
  const prompt = buildMenuOcrPrompt(ocrInput);
  const mimoConfig = await getRequiredMimoProviderConfig("AI OCR menu");
  const result = await mimoChat(
    mimoConfig,
    mimoConfig.chatModel,
    [
      { role: "system", content: "Bạn chuyên chuẩn hóa text OCR menu F&B Việt Nam thành JSON thuần. Không cần đọc ảnh; chỉ xử lý chữ đã được trích xuất." },
      { role: "user", content: prompt }
    ],
    { jsonMode: true }
  );

  let data = normalizeMenuOcrDraft(extractJsonObject(result.text));

  if (!hasMenuOcrItems(data) && result.text.trim()) {
    const repairResult = await mimoChat(
      mimoConfig,
      mimoConfig.chatModel,
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

async function runInventoryOcrDraft(input: { imageUrl?: string; imageBase64?: string; rawText?: string }) {
  const ocrInput = await enrichOcrInputWithTextract(input, "inventory");
  const prompt = buildInventoryOcrPrompt(ocrInput);
  const mimoConfig = await getRequiredMimoProviderConfig("AI OCR nhập kho");
  const result = await mimoChat(
    mimoConfig,
    mimoConfig.chatModel,
    [
      { role: "system", content: "Bạn chuyên chuẩn hóa text OCR hóa đơn/phiếu nhập kho F&B Việt Nam thành JSON thuần. Không cần đọc ảnh; chỉ xử lý chữ đã được trích xuất." },
      { role: "user", content: prompt }
    ],
    { jsonMode: true }
  );

  let data = normalizeInventoryOcrDraft(extractJsonObject(result.text));

  if (!hasInventoryOcrRows(data) && result.text.trim()) {
    const repairResult = await mimoChat(
      mimoConfig,
      mimoConfig.chatModel,
      [
        {
          role: "system",
          content: "Bạn là bộ chuẩn hóa kết quả OCR nhập kho F&B Việt Nam. Chỉ trả JSON hợp lệ theo schema, không markdown."
        },
        {
          role: "user",
          content: buildInventoryOcrPrompt({ rawText: result.text })
        }
      ],
      { jsonMode: true }
    );
    const repairedData = normalizeInventoryOcrDraft(extractJsonObject(repairResult.text));
    if (hasInventoryOcrRows(repairedData)) {
      return { result: repairResult, data: repairedData };
    }
    data = repairedData;
  }

  if (!hasInventoryOcrRows(data)) {
    throw new AppError("AI đã đọc nội dung nhưng chưa tách được dòng nhập kho. Vui lòng chụp rõ hóa đơn hoặc dán text có tên, số lượng, đơn vị.", 422);
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
    outputTokens: result.outputTokens,
    metadata: { taskType: "ocr" }
  });
  const text = buildMenuOcrReplyText(data);
  const mission = buildAgentMission({
    surface: "dashboard",
    title: "Menu OCR Agent",
    outcome: text,
    route: "/dashboard/menu",
    urgency: "now",
    estimatedMinutes: Math.max(3, Math.min(12, data.categories.length + 2)),
    fallbackSteps: [
      {
        id: "ocr-review-duplicates",
        label: "Đối chiếu món trùng",
        description: "So tên món/giá trước khi nhập vào database.",
        status: "ready"
      },
      {
        id: "ocr-import-menu",
        label: "Nhập vào menu",
        description: "Chỉ nhập các món đã đọc được giá hợp lệ.",
        status: "needs_confirmation"
      }
    ]
  });
  const commandDeck = buildCommandDeck({
    surface: "dashboard",
    title: "Menu OCR Agent",
    headline: text,
    mission,
    premiumReason: "OCR Command Deck nhấn mạnh đối chiếu trùng và trạng thái nhập menu để tránh cảm giác bấm xong bị đứng."
  });
  return {
    provider: result.provider,
    model: result.model,
    text,
    data,
    commandDeck,
    mission
  };
}

export async function generateInventoryOcrDraft(input: {
  restaurantId: string;
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  rawText?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "inventory_ai_ocr", userId: input.userId });
  const { result, data } = await runInventoryOcrDraft(input);
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "inventory_ai_ocr",
    provider: result.provider,
    model: result.model,
    requestKind: "ocr",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    metadata: { taskType: "ocr" }
  });

  const totalQuantity = data.rows.reduce((sum, row) => sum + row.quantity, 0);
  const text = [
    `Đã đọc được ${data.rows.length} dòng nhập kho.`,
    `Tổng số lượng nhận diện: ${Number(totalQuantity.toFixed(3)).toLocaleString("vi-VN")}.`,
    data.warnings[0] ? `Lưu ý: ${data.warnings[0]}` : "Bạn có thể rà lại bảng nháp rồi nhập vào kho."
  ].join(" ");

  return {
    provider: result.provider,
    model: result.model,
    text,
    data
  };
}

export async function generateOnboardingMenuOcrDraft(input: {
  imageUrl?: string;
  imageBase64?: string;
  rawText?: string;
}) {
  const { result, data } = await runMenuOcrDraft(input);

  const text = buildMenuOcrReplyText(data);
  const mission = buildAgentMission({
    surface: "onboarding",
    title: "Onboarding OCR Agent",
    outcome: text,
    route: "/dashboard/onboarding",
    urgency: "now",
    estimatedMinutes: Math.max(3, Math.min(12, data.categories.length + 2)),
    fallbackSteps: [
      {
        id: "onboarding-ocr-review",
        label: "Kiểm món OCR",
        description: "Xem lại tên món, giá và danh mục trước khi lưu.",
        status: "ready"
      },
      {
        id: "onboarding-ocr-apply",
        label: "Áp dụng vào menu onboarding",
        description: "Menu sẽ lưu khi người dùng hoàn tất tạo quán.",
        status: "needs_confirmation"
      }
    ]
  });
  const commandDeck = buildCommandDeck({
    surface: "onboarding",
    title: "Onboarding OCR Agent",
    headline: text,
    mission,
    premiumReason: "Onboarding OCR Command Deck làm rõ món đã đọc, bước kiểm tra và thời điểm lưu vào quán."
  });
  return {
    provider: result.provider,
    model: result.model,
    text,
    data,
    commandDeck,
    mission
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
