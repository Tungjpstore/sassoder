import "server-only";

import { AppError } from "@/lib/response";
import type { AiCompletionOptions, AiCompletionResult, AiProviderConfig } from "@/lib/ai/router/types";
import type { AiPromptMessage } from "@/services/ai-prompt-router";

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function readMessageText(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toAnthropicMessages(messages: AiPromptMessage[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => readMessageText(message.content))
    .filter(Boolean)
    .join("\n\n");

  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: readMessageText(message.content)
    }))
    .filter((message) => message.content);

  return { system, messages: conversation.length ? conversation : [{ role: "user", content: "Hãy hỗ trợ chủ quán theo ngữ cảnh đã cung cấp." }] };
}

function extractText(json: any) {
  const content = json?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function runAnthropicMessagesChat({
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
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 16_000);
  const startedAt = Date.now();
  const payload = toAnthropicMessages(messages);

  try {
    const response = await fetch(joinUrl(config.baseUrl, "/messages"), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        system: payload.system || undefined,
        messages: payload.messages,
        temperature: options?.temperature ?? 0.28,
        max_tokens: options?.maxTokens ?? 900
      })
    });

    const json = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      throw new AppError(json?.error?.message || `${config.provider} từ chối xử lý yêu cầu AI.`, 502);
    }

    return {
      text: extractText(json),
      provider: config.provider,
      model,
      inputTokens: json?.usage?.input_tokens ?? null,
      outputTokens: json?.usage?.output_tokens ?? null,
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
