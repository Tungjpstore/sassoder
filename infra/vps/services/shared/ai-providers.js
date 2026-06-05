import { readEnv } from "./env.js";

const providerConfig = {
  openai: {
    apiKey: "OPENAI_API_KEY",
    baseUrl: "OPENAI_BASE_URL",
    model: "OPENAI_CHAT_MODEL",
    defaultBaseUrl: "https://api.openai.com/v1",
    kind: "openai-compatible"
  },
  xai: {
    apiKey: "XAI_API_KEY",
    baseUrl: "XAI_BASE_URL",
    model: "XAI_CHAT_MODEL",
    defaultBaseUrl: "https://api.x.ai/v1",
    kind: "openai-compatible"
  },
  qwen: {
    apiKey: "DASHSCOPE_API_KEY",
    baseUrl: "DASHSCOPE_BASE_URL",
    model: "QWEN_CHAT_MODEL",
    defaultModel: "qwen-plus",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    kind: "openai-compatible"
  },
  bedrock: {
    apiKey: "AWS_BEARER_TOKEN_BEDROCK",
    baseUrl: "BEDROCK_BASE_URL",
    model: "BEDROCK_MODEL",
    defaultModel: "us.amazon.nova-2-lite-v1:0",
    defaultBaseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    kind: "bedrock-converse"
  },
  claude: {
    apiKey: "ANTHROPIC_API_KEY",
    baseUrl: "ANTHROPIC_BASE_URL",
    model: "ANTHROPIC_MODEL",
    defaultModel: "claude-haiku-4-5",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    kind: "anthropic"
  }
};

export function providerOrder(preferredProvider) {
  const configured = readEnv("AI_PROVIDER_FALLBACK_ORDER", "qwen,xai,openai,claude")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);

  if (!preferredProvider) return configured;
  return [preferredProvider, ...configured.filter((provider) => provider !== preferredProvider)];
}

function resolveProvider(provider) {
  const config = providerConfig[provider];
  if (!config) throw new Error(`Unsupported AI provider: ${provider}`);

  return {
    provider,
    apiKey: readEnv(config.apiKey),
    baseUrl: readEnv(config.baseUrl, config.defaultBaseUrl).replace(/\/$/, ""),
    model: readEnv(config.model, config.defaultModel || ""),
    kind: config.kind
  };
}

function readMessageText(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
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

function messagesToAnthropic(messages) {
  const system = messages.find((message) => message.role === "system")?.content;
  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content)
    }));

  return { system, messages: chatMessages };
}

function messagesToBedrock(messages) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => readMessageText(message.content))
    .filter(Boolean)
    .map((text) => ({ text }));

  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [{ text: readMessageText(message.content) }]
    }))
    .filter((message) => message.content.some((part) => part.text));

  return {
    system: system.length ? system : undefined,
    messages: chatMessages.length ? chatMessages : [{ role: "user", content: [{ text: "Hay ho tro chu quan theo ngu canh da cung cap." }] }]
  };
}

async function postJson(url, body, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!response.ok) {
      const message = json?.error?.message || json?.message || response.statusText;
      throw new Error(`AI provider HTTP ${response.status}: ${message}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function chatWithOpenAiCompatible(provider, request, timeoutMs) {
  const json = await postJson(
    `${provider.baseUrl}/chat/completions`,
    {
      model: request.model || provider.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1200
    },
    {
      authorization: `Bearer ${provider.apiKey}`
    },
    timeoutMs
  );

  return {
    provider: provider.provider,
    model: json.model || request.model || provider.model,
    content: json.choices?.[0]?.message?.content || "",
    raw: json
  };
}

async function chatWithAnthropic(provider, request, timeoutMs) {
  const anthropicMessages = messagesToAnthropic(request.messages);
  const json = await postJson(
    `${provider.baseUrl}/messages`,
    {
      model: request.model || provider.model,
      system: anthropicMessages.system,
      messages: anthropicMessages.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1200
    },
    {
      "x-api-key": provider.apiKey,
      "anthropic-version": readEnv("ANTHROPIC_VERSION", "2023-06-01")
    },
    timeoutMs
  );

  return {
    provider: provider.provider,
    model: json.model || request.model || provider.model,
    content: json.content?.map((item) => item.text || "").join("\n").trim() || "",
    raw: json
  };
}

async function chatWithBedrock(provider, request, timeoutMs) {
  const payload = messagesToBedrock(request.messages);
  const json = await postJson(
    `${provider.baseUrl}/model/${encodeURIComponent(request.model || provider.model)}/converse`,
    {
      ...payload,
      inferenceConfig: {
        temperature: request.temperature ?? 0.2,
        maxTokens: request.maxTokens ?? 1200
      }
    },
    {
      authorization: `Bearer ${provider.apiKey}`
    },
    timeoutMs
  );

  return {
    provider: provider.provider,
    model: request.model || provider.model,
    content: json.output?.message?.content?.map((item) => item.text || "").filter(Boolean).join("\n").trim() || "",
    raw: json
  };
}

async function chatOnce(providerName, request, timeoutMs) {
  const provider = resolveProvider(providerName);
  if (!provider.apiKey || !provider.model) {
    throw new Error(`Provider ${providerName} is missing API key or model`);
  }

  if (provider.kind === "anthropic") {
    return chatWithAnthropic(provider, request, timeoutMs);
  }

  if (provider.kind === "bedrock-converse") {
    return chatWithBedrock(provider, request, timeoutMs);
  }

  return chatWithOpenAiCompatible(provider, request, timeoutMs);
}

export async function chatWithFallback(request, logger) {
  const timeoutMs = Number(readEnv("AI_PROVIDER_TIMEOUT_MS", "45000"));
  const attempts = [];

  for (const providerName of providerOrder(request.provider)) {
    try {
      const result = await chatOnce(providerName, request, timeoutMs);
      return {
        ...result,
        attempts
      };
    } catch (error) {
      attempts.push({
        provider: providerName,
        error: error instanceof Error ? error.message : String(error)
      });
      logger?.warn({ provider: providerName, error }, "AI provider attempt failed");
    }
  }

  const detail = attempts.map((attempt) => `${attempt.provider}: ${attempt.error}`).join("; ");
  throw new Error(`All AI providers failed: ${detail}`);
}
