import type { AiPromptMessage } from "@/services/ai-prompt-router";

export type AiProvider = "qwen" | "xai" | "openai" | "gemini" | "claude" | "vercel_gateway" | "nvidia";

export type AiProviderProtocol = "openai-compatible" | "anthropic-messages";

export type AiTaskType =
  | "customer_ordering"
  | "menu_generation"
  | "upsell"
  | "dashboard_operation"
  | "analytics_reasoning"
  | "business_insight"
  | "batch_report"
  | "batch_inventory"
  | "batch_marketing"
  | "batch_ocr"
  | "batch_embedding"
  | "setup"
  | "branding"
  | "ocr"
  | "image"
  | "tool";

export type AiCompletionOptions = {
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  cacheTtlMs?: number;
  cacheKey?: string;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
};

export type AiCompletionRequest = {
  taskType: AiTaskType;
  messages: AiPromptMessage[];
  preferredProvider?: AiProvider;
  modelOverride?: string;
  options?: AiCompletionOptions;
};

export type AiCompletionResult = {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostVnd?: number | null;
  raw?: unknown;
  cacheHit?: boolean;
  latencyMs?: number;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  attempts: Array<{
    provider: AiProvider;
    model: string;
    status: "success" | "failed";
    latencyMs: number;
    estimatedCostVnd?: number | null;
    errorMessage?: string;
  }>;
};

export type AiProviderConfig = {
  provider: AiProvider;
  protocol: AiProviderProtocol;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  fastModel: string;
  imageModel: string;
  ocrModel: string;
  supportsJsonMode: boolean;
  supportsToolCalling: boolean;
  supportsImageGeneration: boolean;
  supportsOcr: boolean;
  inputTokenCostPerMillionVnd: number;
  outputTokenCostPerMillionVnd: number;
  priority: number;
};

export type AiProviderReadiness = {
  provider: AiProvider;
  configured: boolean;
  managedByAdmin?: boolean;
  keySource?: "database" | "environment" | "missing";
  protocol: AiProviderProtocol;
  envNames: string[];
  missingEnvNames: string[];
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
