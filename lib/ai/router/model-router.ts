import "server-only";

import { AppError } from "@/lib/response";
import { createStableAiCacheKey, getAiCache, setAiCache } from "@/lib/ai/services/cache";
import { availableAiProviders, getAiProviderConfig } from "@/lib/ai/providers/registry";
import { runOpenAiCompatibleChat } from "@/lib/ai/providers/openai-compatible";
import type { AiCompletionRequest, AiCompletionResult, AiProvider, AiTaskType } from "@/lib/ai/router/types";

const reasoningTasks = new Set<AiTaskType>(["analytics_reasoning", "business_insight"]);
const qwenFirstTasks = new Set<AiTaskType>(["customer_ordering", "menu_generation", "upsell", "dashboard_operation", "setup", "branding", "ocr", "image", "tool"]);

function chooseProviderOrder(taskType: AiTaskType, preferredProvider?: AiProvider) {
  const available = availableAiProviders();
  if (available.length === 0) throw new AppError("Chưa cấu hình QWEN_API_KEY/DASHSCOPE_API_KEY hoặc XAI_API_KEY cho AI.", 500);

  const preferred = preferredProvider && available.includes(preferredProvider) ? preferredProvider : null;
  const primary: AiProvider = preferred ?? (reasoningTasks.has(taskType) && available.includes("xai") ? "xai" : "qwen");
  const ordered: AiProvider[] = [];

  if (available.includes(primary)) ordered.push(primary);
  if (qwenFirstTasks.has(taskType) && available.includes("qwen") && !ordered.includes("qwen")) ordered.push("qwen");
  if (available.includes("xai") && !ordered.includes("xai")) ordered.push("xai");
  if (available.includes("qwen") && !ordered.includes("qwen")) ordered.push("qwen");

  return ordered;
}

function pickModel(provider: AiProvider, taskType: AiTaskType, modelOverride?: string) {
  const config = getAiProviderConfig(provider);
  if (modelOverride) return modelOverride;
  if (taskType === "customer_ordering" || taskType === "upsell" || taskType === "tool") return config.fastModel;
  if (taskType === "ocr") return config.ocrModel;
  if (taskType === "image") return config.imageModel;
  return config.chatModel;
}

export async function runAiCompletion(request: AiCompletionRequest): Promise<AiCompletionResult> {
  const cacheTtl = request.options?.cacheTtlMs ?? 0;
  const cacheKey =
    request.options?.cacheKey ??
    (cacheTtl > 0
      ? await createStableAiCacheKey([request.taskType, request.preferredProvider, request.modelOverride, request.options?.jsonMode, request.messages])
      : null);

  if (cacheKey && cacheTtl > 0) {
    const cached = getAiCache<AiCompletionResult>(cacheKey);
    if (cached) return { ...cached, cacheHit: true, attempts: cached.attempts ?? [] };
  }

  const attempts: AiCompletionResult["attempts"] = [];
  let lastError: unknown = null;

  for (const provider of chooseProviderOrder(request.taskType, request.preferredProvider)) {
    const config = getAiProviderConfig(provider);
    const model = pickModel(provider, request.taskType, request.modelOverride);
    const startedAt = Date.now();
    try {
      const result = await runOpenAiCompatibleChat({
        config,
        model,
        messages: request.messages,
        options: request.options
      });
      const completed: AiCompletionResult = {
        ...result,
        attempts: [...attempts, { provider, model, status: "success", latencyMs: result.latencyMs ?? Date.now() - startedAt }]
      };
      if (cacheKey && cacheTtl > 0) setAiCache(cacheKey, completed, cacheTtl);
      return completed;
    } catch (error) {
      lastError = error;
      attempts.push({
        provider,
        model,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "AI provider failed"
      });
    }
  }

  if (lastError) throw lastError;
  throw new AppError("AI Router không tìm thấy provider khả dụng.", 500);
}
