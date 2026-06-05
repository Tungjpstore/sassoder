import assert from "node:assert/strict";
import test from "node:test";
import { buildAiProviderOrder } from "./provider-routing";
import type { AiProvider, AiProviderConfig } from "./types";

function candidate(provider: AiProvider, overrides: Partial<AiProviderConfig> = {}) {
  return {
    provider,
    supportsJsonMode: provider !== "bedrock",
    supportsToolCalling: provider !== "bedrock",
    supportsImageGeneration: provider === "qwen" || provider === "openai" || provider === "xai" || provider === "vercel_gateway",
    supportsOcr: provider === "qwen" || provider === "openai" || provider === "gemini" || provider === "vercel_gateway",
    ...overrides
  };
}

test("buildAiProviderOrder prefers fast operational providers and keeps openai fallback", () => {
  const order = buildAiProviderOrder({
    taskType: "customer_ordering",
    candidates: [candidate("qwen"), candidate("openai"), candidate("xai")]
  });

  assert.deepEqual(order.slice(0, 3), ["qwen", "openai", "xai"]);
});

test("buildAiProviderOrder routes reasoning to openai before xai and qwen", () => {
  const order = buildAiProviderOrder({
    taskType: "analytics_reasoning",
    candidates: [candidate("qwen"), candidate("openai"), candidate("xai")]
  });

  assert.deepEqual(order.slice(0, 3), ["openai", "xai", "qwen"]);
});

test("buildAiProviderOrder filters providers that cannot handle tool calls", () => {
  const order = buildAiProviderOrder({
    taskType: "tool",
    preferredProvider: "claude",
    options: {
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Lookup data",
            parameters: { type: "object" }
          }
        }
      ]
    },
    candidates: [candidate("claude", { supportsToolCalling: false }), candidate("openai")]
  });

  assert.deepEqual(order, ["openai"]);
});

test("buildAiProviderOrder keeps qwen first for OCR when available", () => {
  const order = buildAiProviderOrder({
    taskType: "ocr",
    preferredProvider: "openai",
    candidates: [candidate("openai"), candidate("gemini"), candidate("qwen")]
  });

  assert.deepEqual(order, ["qwen", "openai", "gemini"]);
});

test("buildAiProviderOrder sends batch jobs to nvidia before normal fallbacks", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_report",
    candidates: [candidate("qwen"), candidate("nvidia"), candidate("openai")]
  });

  assert.deepEqual(order.slice(0, 3), ["nvidia", "qwen", "openai"]);
});

test("buildAiProviderOrder honors an explicit batch provider while retaining nvidia fallback", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_inventory",
    preferredProvider: "openai",
    candidates: [candidate("qwen"), candidate("nvidia"), candidate("openai")]
  });

  assert.deepEqual(order.slice(0, 3), ["openai", "nvidia", "qwen"]);
});

test("buildAiProviderOrder uses Bedrock as text fallback but skips it for JSON mode", () => {
  const textOrder = buildAiProviderOrder({
    taskType: "dashboard_operation",
    candidates: [candidate("qwen"), candidate("bedrock"), candidate("openai")]
  });

  assert.deepEqual(textOrder.slice(0, 3), ["qwen", "bedrock", "openai"]);

  const jsonOrder = buildAiProviderOrder({
    taskType: "dashboard_operation",
    options: { jsonMode: true },
    candidates: [candidate("qwen"), candidate("bedrock"), candidate("openai")]
  });

  assert.deepEqual(jsonOrder.slice(0, 2), ["qwen", "openai"]);
});
