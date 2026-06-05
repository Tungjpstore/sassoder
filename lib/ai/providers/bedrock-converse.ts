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
      if (part && typeof part === "object" && typeof (part as { content?: unknown }).content === "string") return (part as { content: string }).content;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toBedrockMessages(messages: AiPromptMessage[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => readMessageText(message.content))
    .filter(Boolean)
    .map((text) => ({ text }));

  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [{ text: readMessageText(message.content) }]
    }))
    .filter((message) => message.content.some((part) => part.text));

  return {
    system: system.length ? system : undefined,
    messages: conversation.length
      ? conversation
      : [
          {
            role: "user" as const,
            content: [{ text: "Hay ho tro chu quan theo ngu canh da cung cap." }]
          }
        ]
  };
}

function extractText(json: any) {
  const content = json?.output?.message?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function runBedrockConverseChat({
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
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 18_000);
  const startedAt = Date.now();
  const payload = toBedrockMessages(messages);

  try {
    const response = await fetch(joinUrl(config.baseUrl, `/model/${encodeURIComponent(model)}/converse`), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        inferenceConfig: {
          temperature: options?.temperature ?? 0.28,
          maxTokens: options?.maxTokens ?? 900
        }
      })
    });

    const json = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      const message = json?.message || json?.error?.message || json?.Error?.Message || "Bedrock tu choi xu ly yeu cau AI.";
      throw new AppError(message, 502);
    }

    return {
      text: extractText(json),
      provider: config.provider,
      model,
      inputTokens: json?.usage?.inputTokens ?? null,
      outputTokens: json?.usage?.outputTokens ?? null,
      raw: json,
      latencyMs: json?.metrics?.latencyMs ?? Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("Bedrock phan hoi qua lau. AI Router se thu provider khac neu co.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
