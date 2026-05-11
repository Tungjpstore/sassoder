import "server-only";

import { AppError } from "@/lib/response";
import type { AiProvider, AiProviderConfig } from "@/lib/ai/router/types";

const qwenIntlBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const xaiBaseUrl = "https://api.x.ai/v1";

function stripChatCompletionsPath(baseUrl: string) {
  return baseUrl.trim().replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
}

function normalizeQwenCompatibleBaseUrl(baseUrl: string) {
  const cleanBaseUrl = stripChatCompletionsPath(baseUrl);
  if (cleanBaseUrl.endsWith("/compatible-mode/v1")) return cleanBaseUrl;
  return `${cleanBaseUrl.replace(/\/compatible-mode\/?$/, "")}/compatible-mode/v1`;
}

function normalizeV1BaseUrl(baseUrl: string) {
  const cleanBaseUrl = stripChatCompletionsPath(baseUrl);
  if (cleanBaseUrl.endsWith("/v1")) return cleanBaseUrl;
  return `${cleanBaseUrl}/v1`;
}

export function getAiProviderConfig(provider: AiProvider): AiProviderConfig {
  const qwenKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();
  const xaiKey = (process.env.XAI_API_KEY || "").trim();

  if (provider === "qwen") {
    if (!qwenKey) throw new AppError("Chưa cấu hình QWEN_API_KEY hoặc DASHSCOPE_API_KEY.", 500);
    return {
      provider: "qwen",
      apiKey: qwenKey,
      baseUrl: normalizeQwenCompatibleBaseUrl(process.env.QWEN_BASE_URL || process.env.DASHSCOPE_BASE_URL || qwenIntlBaseUrl),
      chatModel: process.env.QWEN_MODEL || process.env.QWEN_CHAT_MODEL || "qwen-plus",
      fastModel: process.env.QWEN_FAST_MODEL || process.env.QWEN_MODEL || "qwen-plus",
      imageModel: process.env.QWEN_IMAGE_MODEL || "qwen-image-2.0-pro",
      ocrModel: process.env.QWEN_OCR_MODEL || "qwen-vl-ocr-2025-11-20"
    };
  }

  if (!xaiKey) throw new AppError("Chưa cấu hình XAI_API_KEY.", 500);
  return {
    provider: "xai",
    apiKey: xaiKey,
    baseUrl: normalizeV1BaseUrl(process.env.XAI_BASE_URL || xaiBaseUrl),
    chatModel: process.env.XAI_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini-beta",
    fastModel: process.env.XAI_FAST_MODEL || process.env.XAI_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini-beta",
    imageModel: process.env.XAI_IMAGE_MODEL || "grok-imagine-image",
    ocrModel: process.env.XAI_OCR_MODEL || process.env.XAI_MODEL || "grok-3-mini-beta"
  };
}

export function availableAiProviders() {
  const providers: AiProvider[] = [];
  if ((process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)?.trim()) providers.push("qwen");
  if (process.env.XAI_API_KEY?.trim()) providers.push("xai");
  return providers;
}
