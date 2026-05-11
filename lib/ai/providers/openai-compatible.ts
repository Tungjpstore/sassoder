import "server-only";

import { AppError } from "@/lib/response";
import type { AiCompletionOptions, AiCompletionResult, AiProviderConfig } from "@/lib/ai/router/types";
import type { AiPromptMessage } from "@/services/ai-prompt-router";

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function chatCompletionsUrl(config: AiProviderConfig) {
  if (config.provider === "qwen") {
    return config.baseUrl.includes("/compatible-mode/v1")
      ? joinUrl(config.baseUrl, "/chat/completions")
      : joinUrl(config.baseUrl, "/compatible-mode/v1/chat/completions");
  }

  return config.baseUrl.endsWith("/v1")
    ? joinUrl(config.baseUrl, "/chat/completions")
    : joinUrl(config.baseUrl, "/v1/chat/completions");
}

function extractMessageText(message: any) {
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text.trim();
    if (typeof content.content === "string") return content.content.trim();
  }

  return "";
}

export async function runOpenAiCompatibleChat({
  config,
  model,
  messages,
  options
}: {
  config: AiProviderConfig;
  model: string;
  messages: AiPromptMessage[];
  options?: AiCompletionOptions;
}): Promise<Omit<AiCompletionResult, "attempts">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 12_000);
  const startedAt = Date.now();

  try {
    const response = await fetch(chatCompletionsUrl(config), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.28,
        max_tokens: options?.maxTokens,
        ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(options?.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
        ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {})
      })
    });

    const json = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      throw new AppError(json?.message || json?.error?.message || `${config.provider} từ chối xử lý yêu cầu AI.`, 502);
    }

    const message = json?.choices?.[0]?.message;

    return {
      text: extractMessageText(message),
      provider: config.provider,
      model,
      inputTokens: json?.usage?.prompt_tokens ?? null,
      outputTokens: json?.usage?.completion_tokens ?? null,
      toolCalls: message?.tool_calls ?? undefined,
      raw: json,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(`${config.provider} phản hồi quá lâu. AI Router sẽ thử provider khác nếu có.`, 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
