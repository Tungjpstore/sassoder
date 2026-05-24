import "server-only";

import { AppError } from "@/lib/response";
import type { AiProvider, AiProviderConfig, AiProviderProtocol, AiProviderReadiness } from "@/lib/ai/router/types";

const qwenIntlBaseUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const xaiBaseUrl = "https://api.x.ai/v1";
const openAiBaseUrl = "https://api.openai.com/v1";
const geminiOpenAiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
const claudeBaseUrl = "https://api.anthropic.com/v1";
const vercelGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";
const nvidiaBaseUrl = "https://integrate.api.nvidia.com/v1";

const providerOrder: AiProvider[] = ["qwen", "nvidia", "openai", "gemini", "xai", "claude", "vercel_gateway"];

type ProviderDefinition = {
  provider: AiProvider;
  protocol: AiProviderProtocol;
  baseUrl: string;
  keyEnvNames: string[];
  baseUrlEnvNames: string[];
  chatModelEnvNames: string[];
  fastModelEnvNames: string[];
  imageModelEnvNames: string[];
  ocrModelEnvNames: string[];
  chatModel: string;
  fastModel: string;
  imageModel: string;
  ocrModel: string;
  supportsJsonMode: boolean;
  supportsToolCalling: boolean;
  supportsImageGeneration: boolean;
  supportsOcr: boolean;
  priority: number;
};

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

function readEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function readNumberEnv(names: string[]) {
  const value = Number(readEnv(names));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeProviderBaseUrl(provider: AiProvider, baseUrl: string) {
  if (provider === "qwen") return normalizeQwenCompatibleBaseUrl(baseUrl);
  if (provider === "claude") return baseUrl.trim().replace(/\/$/, "");
  return normalizeV1BaseUrl(baseUrl);
}

function providerDefinitions(): ProviderDefinition[] {
  const definitions = [
    {
      provider: "qwen",
      protocol: "openai-compatible",
      keyEnvNames: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"],
      baseUrlEnvNames: ["QWEN_BASE_URL", "DASHSCOPE_BASE_URL"],
      baseUrl: qwenIntlBaseUrl,
      chatModelEnvNames: ["QWEN_MODEL", "QWEN_CHAT_MODEL"],
      fastModelEnvNames: ["QWEN_FAST_MODEL", "QWEN_MODEL"],
      imageModelEnvNames: ["QWEN_IMAGE_MODEL"],
      ocrModelEnvNames: ["QWEN_OCR_MODEL"],
      chatModel: "qwen-plus",
      fastModel: "qwen-plus",
      imageModel: "qwen-image-2.0-pro",
      ocrModel: "qwen-vl-ocr-2025-11-20",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: true,
      supportsOcr: true,
      priority: 10
    },
    {
      provider: "nvidia",
      protocol: "openai-compatible",
      keyEnvNames: ["NVIDIA_AI_API_KEY", "DSX_AIR_API_KEY", "NVIDIA_API_KEY"],
      baseUrlEnvNames: ["NVIDIA_AI_BASE_URL", "DSX_AIR_BASE_URL", "NVIDIA_BASE_URL"],
      baseUrl: nvidiaBaseUrl,
      chatModelEnvNames: ["NVIDIA_AI_CHAT_MODEL", "NVIDIA_AI_MODEL", "DSX_AIR_CHAT_MODEL", "DSX_AIR_MODEL"],
      fastModelEnvNames: ["NVIDIA_AI_FAST_MODEL", "NVIDIA_AI_CHAT_MODEL", "NVIDIA_AI_MODEL", "DSX_AIR_FAST_MODEL", "DSX_AIR_MODEL"],
      imageModelEnvNames: ["NVIDIA_AI_IMAGE_MODEL", "NVIDIA_AI_VISION_MODEL", "DSX_AIR_IMAGE_MODEL", "DSX_AIR_VISION_MODEL"],
      ocrModelEnvNames: ["NVIDIA_AI_OCR_MODEL", "NVIDIA_AI_VISION_MODEL", "DSX_AIR_OCR_MODEL", "DSX_AIR_VISION_MODEL"],
      chatModel: "meta/llama-3.1-70b-instruct",
      fastModel: "meta/llama-3.1-8b-instruct",
      imageModel: "unsupported",
      ocrModel: "unsupported",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: false,
      supportsOcr: false,
      priority: 15
    },
    {
      provider: "openai",
      protocol: "openai-compatible",
      keyEnvNames: ["OPENAI_API_KEY"],
      baseUrlEnvNames: ["OPENAI_BASE_URL"],
      baseUrl: openAiBaseUrl,
      chatModelEnvNames: ["OPENAI_MODEL", "OPENAI_CHAT_MODEL"],
      fastModelEnvNames: ["OPENAI_FAST_MODEL", "OPENAI_MODEL"],
      imageModelEnvNames: ["OPENAI_IMAGE_MODEL"],
      ocrModelEnvNames: ["OPENAI_OCR_MODEL", "OPENAI_FAST_MODEL", "OPENAI_MODEL"],
      chatModel: "gpt-4.1-mini",
      fastModel: "gpt-4.1-nano",
      imageModel: "gpt-image-1",
      ocrModel: "gpt-4.1-mini",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: true,
      supportsOcr: true,
      priority: 20
    },
    {
      provider: "gemini",
      protocol: "openai-compatible",
      keyEnvNames: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      baseUrlEnvNames: ["GEMINI_BASE_URL"],
      baseUrl: geminiOpenAiBaseUrl,
      chatModelEnvNames: ["GEMINI_MODEL", "GEMINI_CHAT_MODEL"],
      fastModelEnvNames: ["GEMINI_FAST_MODEL", "GEMINI_MODEL"],
      imageModelEnvNames: ["GEMINI_IMAGE_MODEL"],
      ocrModelEnvNames: ["GEMINI_OCR_MODEL", "GEMINI_FAST_MODEL", "GEMINI_MODEL"],
      chatModel: "gemini-2.5-flash",
      fastModel: "gemini-2.5-flash",
      imageModel: "gemini-2.5-flash-image",
      ocrModel: "gemini-2.5-flash",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: false,
      supportsOcr: true,
      priority: 30
    },
    {
      provider: "xai",
      protocol: "openai-compatible",
      keyEnvNames: ["XAI_API_KEY"],
      baseUrlEnvNames: ["XAI_BASE_URL"],
      baseUrl: xaiBaseUrl,
      chatModelEnvNames: ["XAI_MODEL", "XAI_CHAT_MODEL"],
      fastModelEnvNames: ["XAI_FAST_MODEL", "XAI_MODEL", "XAI_CHAT_MODEL"],
      imageModelEnvNames: ["XAI_IMAGE_MODEL"],
      ocrModelEnvNames: ["XAI_OCR_MODEL", "XAI_MODEL"],
      chatModel: "grok-3-mini-beta",
      fastModel: "grok-3-mini-beta",
      imageModel: "grok-imagine-image",
      ocrModel: "grok-3-mini-beta",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: true,
      supportsOcr: false,
      priority: 40
    },
    {
      provider: "claude",
      protocol: "anthropic-messages",
      keyEnvNames: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
      baseUrlEnvNames: ["ANTHROPIC_BASE_URL", "CLAUDE_BASE_URL"],
      baseUrl: claudeBaseUrl,
      chatModelEnvNames: ["ANTHROPIC_MODEL", "CLAUDE_MODEL"],
      fastModelEnvNames: ["ANTHROPIC_FAST_MODEL", "CLAUDE_FAST_MODEL", "ANTHROPIC_MODEL", "CLAUDE_MODEL"],
      imageModelEnvNames: ["ANTHROPIC_IMAGE_MODEL", "CLAUDE_IMAGE_MODEL"],
      ocrModelEnvNames: ["ANTHROPIC_OCR_MODEL", "CLAUDE_OCR_MODEL", "ANTHROPIC_FAST_MODEL", "CLAUDE_FAST_MODEL"],
      chatModel: "claude-sonnet-4-5",
      fastModel: "claude-haiku-4-5",
      imageModel: "unsupported",
      ocrModel: "claude-haiku-4-5",
      supportsJsonMode: false,
      supportsToolCalling: false,
      supportsImageGeneration: false,
      supportsOcr: false,
      priority: 50
    },
    {
      provider: "vercel_gateway",
      protocol: "openai-compatible",
      keyEnvNames: ["VERCEL_AI_GATEWAY_API_KEY", "AI_GATEWAY_API_KEY"],
      baseUrlEnvNames: ["VERCEL_AI_GATEWAY_BASE_URL", "AI_GATEWAY_BASE_URL"],
      baseUrl: vercelGatewayBaseUrl,
      chatModelEnvNames: ["VERCEL_AI_GATEWAY_MODEL", "AI_GATEWAY_MODEL"],
      fastModelEnvNames: ["VERCEL_AI_GATEWAY_FAST_MODEL", "AI_GATEWAY_FAST_MODEL", "VERCEL_AI_GATEWAY_MODEL", "AI_GATEWAY_MODEL"],
      imageModelEnvNames: ["VERCEL_AI_GATEWAY_IMAGE_MODEL", "AI_GATEWAY_IMAGE_MODEL"],
      ocrModelEnvNames: ["VERCEL_AI_GATEWAY_OCR_MODEL", "AI_GATEWAY_OCR_MODEL", "VERCEL_AI_GATEWAY_FAST_MODEL", "AI_GATEWAY_FAST_MODEL"],
      chatModel: "openai/gpt-4.1-mini",
      fastModel: "openai/gpt-4.1-nano",
      imageModel: "openai/gpt-image-1",
      ocrModel: "openai/gpt-4.1-mini",
      supportsJsonMode: true,
      supportsToolCalling: true,
      supportsImageGeneration: true,
      supportsOcr: true,
      priority: 60
    }
  ] satisfies ProviderDefinition[];

  return definitions.sort((a, b) => a.priority - b.priority);
}

function findProviderDefinition(provider: AiProvider) {
  return providerDefinitions().find((definition) => definition.provider === provider);
}

function buildProviderConfig(definition: ProviderDefinition): AiProviderConfig {
  return {
    provider: definition.provider,
    protocol: definition.protocol,
    apiKey: readEnv(definition.keyEnvNames),
    baseUrl: normalizeProviderBaseUrl(definition.provider, readEnv(definition.baseUrlEnvNames) || definition.baseUrl),
    chatModel: readEnv(definition.chatModelEnvNames) || definition.chatModel,
    fastModel: readEnv(definition.fastModelEnvNames) || definition.fastModel,
    imageModel: readEnv(definition.imageModelEnvNames) || definition.imageModel,
    ocrModel: readEnv(definition.ocrModelEnvNames) || definition.ocrModel,
    supportsJsonMode: definition.supportsJsonMode,
    supportsToolCalling: definition.supportsToolCalling,
    supportsImageGeneration: definition.supportsImageGeneration,
    supportsOcr: definition.supportsOcr,
    inputTokenCostPerMillionVnd: readNumberEnv([`AI_COST_VND_${definition.provider.toUpperCase()}_INPUT_1M`]),
    outputTokenCostPerMillionVnd: readNumberEnv([`AI_COST_VND_${definition.provider.toUpperCase()}_OUTPUT_1M`]),
    priority: definition.priority
  };
}

export function getAiProviderConfig(provider: AiProvider): AiProviderConfig {
  const definition = findProviderDefinition(provider);
  if (!definition) throw new AppError(`AI provider ${provider} không được hỗ trợ.`, 500);
  const config = buildProviderConfig(definition);
  if (!config.apiKey) throw new AppError(`Chưa cấu hình ${definition.keyEnvNames.join(" hoặc ")}.`, 500);
  return config;
}

export function availableAiProviders() {
  return getAiProviderReadiness()
    .filter((provider) => provider.configured)
    .sort((a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider))
    .map((provider) => provider.provider);
}

export function getAiProviderReadiness(): AiProviderReadiness[] {
  return providerDefinitions().map((definition) => {
    const config = buildProviderConfig(definition);
    const configured = Boolean(config.apiKey);
    return {
      provider: definition.provider,
      configured,
      protocol: definition.protocol,
      envNames: [...definition.keyEnvNames, ...definition.baseUrlEnvNames],
      missingEnvNames: configured ? [] : definition.keyEnvNames,
      chatModel: config.chatModel,
      fastModel: config.fastModel,
      imageModel: config.imageModel,
      ocrModel: config.ocrModel,
      supportsJsonMode: config.supportsJsonMode,
      supportsToolCalling: config.supportsToolCalling,
      supportsImageGeneration: config.supportsImageGeneration,
      supportsOcr: config.supportsOcr,
      priority: config.priority
    };
  });
}

export function normalizeAiProviderId(value?: string | null): AiProvider | undefined {
  const normalized = value?.trim();
  if (normalized === "dsx_air" || normalized === "dsx-air" || normalized === "nvidia_dsx_air") return "nvidia";
  return normalized && providerOrder.includes(normalized as AiProvider) ? (normalized as AiProvider) : undefined;
}

export function estimateAiCostVnd(config: AiProviderConfig, inputTokens?: number | null, outputTokens?: number | null) {
  const inputCost = ((inputTokens ?? 0) / 1_000_000) * config.inputTokenCostPerMillionVnd;
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * config.outputTokenCostPerMillionVnd;
  const total = inputCost + outputCost;
  return total > 0 ? Math.round(total) : null;
}
