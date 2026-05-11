import type { AiPromptMessage } from "@/services/ai-prompt-router";

export type AiProvider = "qwen" | "xai";

export type AiTaskType =
  | "customer_ordering"
  | "menu_generation"
  | "upsell"
  | "dashboard_operation"
  | "analytics_reasoning"
  | "business_insight"
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
    errorMessage?: string;
  }>;
};

export type AiProviderConfig = {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  fastModel: string;
  imageModel: string;
  ocrModel: string;
};
