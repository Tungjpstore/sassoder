import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@/lib/response";
import {
  classifyAiProviderRuntimeError,
  getAiProviderRuntimeBlock,
  recordAiProviderRuntimeFailure,
  resetAiProviderRuntimeHealth
} from "./provider-runtime-health";

test("classifyAiProviderRuntimeError treats Bedrock daily token exhaustion as quota", () => {
  const error = new AppError("Too many tokens per day, please wait before trying again.", 429);

  assert.equal(classifyAiProviderRuntimeError("bedrock", error), "quota");
});

test("recordAiProviderRuntimeFailure blocks Bedrock temporarily after quota errors", () => {
  resetAiProviderRuntimeHealth();
  const now = Date.parse("2026-06-28T00:00:00.000Z");
  const error = new AppError("Too many tokens per day, please wait before trying again.", 429);

  const block = recordAiProviderRuntimeFailure("bedrock", error, now);

  assert.equal(block?.provider, "bedrock");
  assert.equal(block?.reason, "quota");
  assert.equal(getAiProviderRuntimeBlock("bedrock", now + 1)?.reason, "quota");
  assert.equal(getAiProviderRuntimeBlock("bedrock", now + 7 * 60 * 60 * 1000), null);
});
