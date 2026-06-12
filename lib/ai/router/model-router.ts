import "server-only";

import { AppError } from "@/lib/response";
import { createStableAiCacheKey, getAiCache, setAiCache } from "@/lib/ai/services/cache";
import { availableResolvedAiProviders, estimateAiCostVnd, getResolvedAiProviderConfig } from "@/lib/ai/providers/registry";
import { runAnthropicMessagesChat } from "@/lib/ai/providers/anthropic-messages";
import { runBedrockConverseChat } from "@/lib/ai/providers/bedrock-converse";
import { runOpenAiCompatibleChat } from "@/lib/ai/providers/openai-compatible";
import { assertMimoDailyTaskTokenBudget, recordMimoDailyTaskTokenUsage } from "@/lib/ai/providers/mimo-quota";
import { buildAiProviderOrder } from "@/lib/ai/router/provider-routing";
import { resolveProviderTimeoutMs } from "@/lib/ai/router/provider-timeouts";
import type { AiCompletionRequest, AiCompletionResult, AiProvider, AiTaskType } from "@/lib/ai/router/types";

export async function chooseAiProviderOrder(request: Pick<AiCompletionRequest, "taskType" | "preferredProvider" | "options">) {
  const available = await availableResolvedAiProviders();
  if (available.length === 0) throw new AppError("Chưa cấu hình provider AI server-side.", 500);
  const candidates = await Promise.all(available.map((provider) => getResolvedAiProviderConfig(provider)));

  const ordered = buildAiProviderOrder({
    taskType: request.taskType,
    preferredProvider: request.preferredProvider,
    options: request.options,
    candidates
  });
  if (ordered.length === 0) throw new AppError(`Chưa có provider AI phù hợp cho task ${request.taskType}.`, 500);
  return ordered;
}

async function pickModel(provider: AiProvider, taskType: AiTaskType, modelOverride?: string) {
  const config = await getResolvedAiProviderConfig(provider);
  if (modelOverride) return modelOverride;
  if (taskType === "analytics_reasoning" || taskType === "business_insight" || taskType === "batch_report") {
    return config.reasoningModel || config.chatModel;
  }
  if (taskType === "customer_ordering" || taskType === "upsell" || taskType === "tool") return config.fastModel;
  if (taskType === "ocr") return config.ocrModel;
  if (taskType === "image") return config.imageModel;
  return config.chatModel;
}

function runProviderChat(input: Parameters<typeof runOpenAiCompatibleChat>[0]) {
  if (input.config.protocol === "bedrock-converse") return runBedrockConverseChat(input);
  if (input.config.protocol === "anthropic-messages") return runAnthropicMessagesChat(input);
  return runOpenAiCompatibleChat(input);
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

  for (const provider of await chooseAiProviderOrder(request)) {
    const config = await getResolvedAiProviderConfig(provider);
    const model = await pickModel(provider, request.taskType, request.modelOverride);
    const startedAt = Date.now();
    try {
      if (provider === "mimo") {
        await assertMimoDailyTaskTokenBudget(request.taskType, request.options?.maxTokens ?? null);
      }

      const timeoutMs = resolveProviderTimeoutMs(provider, request.taskType, request.options?.timeoutMs);
      const options = request.options ? { ...request.options } : {};
      if (timeoutMs) options.timeoutMs = timeoutMs;

      const result = await runProviderChat({
        config,
        model,
        messages: request.messages,
        options
      });
      const estimatedCostVnd = estimateAiCostVnd(config, result.inputTokens, result.outputTokens);
      const completed: AiCompletionResult = {
        ...result,
        estimatedCostVnd,
        taskType: request.taskType,
        attempts: [
          ...attempts,
          { provider, model, status: "success", latencyMs: result.latencyMs ?? Date.now() - startedAt, estimatedCostVnd }
        ]
      };
      if (provider === "mimo") {
        recordMimoDailyTaskTokenUsage(request.taskType, result.inputTokens, result.outputTokens);
      }
      if (cacheKey && cacheTtl > 0) setAiCache(cacheKey, completed, cacheTtl);
      return completed;
    } catch (error) {
      lastError = error;
      attempts.push({
        provider,
        model,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        estimatedCostVnd: null,
        errorMessage: error instanceof Error ? error.message : "AI provider failed"
      });
    }
  }

  if (lastError) throw lastError;
  throw new AppError("AI Router không tìm thấy provider khả dụng.", 500);
}
