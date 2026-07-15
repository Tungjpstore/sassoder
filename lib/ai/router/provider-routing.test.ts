import assert from "node:assert/strict";
import test from "node:test";
import { buildAiProviderOrder } from "./provider-routing";
import type { AiProvider, AiProviderConfig } from "./types";

function candidate(provider: AiProvider, overrides: Partial<AiProviderConfig> = {}) {
  return {
    provider,
    supportsJsonMode: true,
    supportsToolCalling: provider !== "bedrock",
    supportsImageGeneration: provider === "openai" || provider === "xai" || provider === "vercel_gateway",
    supportsOcr: provider === "mimo" || provider === "openai" || provider === "gemini" || provider === "vercel_gateway",
    ...overrides
  };
}

test("buildAiProviderOrder prefers MiMo and keeps DeepSeek/Gemini fallback", () => {
  const order = buildAiProviderOrder({
    taskType: "customer_ordering",
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("gemini"), candidate("openai")]
  });

  assert.deepEqual(order.slice(0, 4), ["mimo", "deepseek", "gemini", "openai"]);
});

test("buildAiProviderOrder routes reasoning to MiMo before fallback providers", () => {
  const order = buildAiProviderOrder({
    taskType: "analytics_reasoning",
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("openai"), candidate("xai")]
  });

  assert.deepEqual(order.slice(0, 4), ["mimo", "deepseek", "openai", "xai"]);
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

test("buildAiProviderOrder keeps MiMo first for OCR when available", () => {
  const order = buildAiProviderOrder({
    taskType: "ocr",
    preferredProvider: "openai",
    candidates: [candidate("openai"), candidate("gemini"), candidate("mimo")]
  });

  assert.deepEqual(order, ["mimo", "gemini", "openai"]);
});

test("buildAiProviderOrder sends batch jobs to MiMo before normal fallbacks", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_report",
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("nvidia"), candidate("openai")]
  });

  assert.deepEqual(order.slice(0, 4), ["mimo", "deepseek", "openai", "nvidia"]);
});

test("buildAiProviderOrder honors an explicit batch provider while retaining MiMo fallback", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_inventory",
    preferredProvider: "openai",
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("nvidia"), candidate("openai")]
  });

  assert.deepEqual(order.slice(0, 4), ["openai", "mimo", "deepseek", "nvidia"]);
});

test("buildAiProviderOrder sends batch OCR text normalization away from MiMo first", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_ocr",
    options: { jsonMode: true },
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("gemini"), candidate("openai"), candidate("bedrock")]
  });

  assert.deepEqual(order, ["gemini", "deepseek", "openai", "bedrock", "mimo"]);
});

test("buildAiProviderOrder honors explicit OCR text provider before fallbacks", () => {
  const order = buildAiProviderOrder({
    taskType: "batch_ocr",
    preferredProvider: "openai",
    options: { jsonMode: true },
    candidates: [candidate("mimo"), candidate("deepseek"), candidate("gemini"), candidate("openai")]
  });

  assert.deepEqual(order, ["openai", "gemini", "deepseek", "mimo"]);
});

test("buildAiProviderOrder uses Bedrock as text and JSON fallback but still skips it for tools", () => {
  const textOrder = buildAiProviderOrder({
    taskType: "dashboard_operation",
    candidates: [candidate("mimo"), candidate("bedrock"), candidate("openai")]
  });

  assert.deepEqual(textOrder.slice(0, 3), ["mimo", "openai", "bedrock"]);

  const jsonOrder = buildAiProviderOrder({
    taskType: "dashboard_operation",
    options: { jsonMode: true },
    candidates: [candidate("mimo"), candidate("bedrock"), candidate("openai")]
  });

  assert.deepEqual(jsonOrder.slice(0, 3), ["mimo", "openai", "bedrock"]);

  const toolOrder = buildAiProviderOrder({
    taskType: "tool",
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
    candidates: [candidate("mimo"), candidate("bedrock"), candidate("openai")]
  });

  assert.deepEqual(toolOrder, ["mimo", "openai"]);
});
