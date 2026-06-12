import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registrySource = readFileSync(new URL("./registry.ts", import.meta.url), "utf8");

test("provider id normalization maps legacy Qwen aliases to MiMo", () => {
  assert.match(registrySource, /if \(normalized === "qwen" \|\| normalized === "dashscope" \|\| normalized === "alibaba_qwen"\) return "mimo"/);
});

test("operational provider readiness hides legacy Qwen provider", () => {
  assert.match(registrySource, /function isOperationalProviderVisible\(provider: AiProvider\) \{[\s\S]*return provider !== "qwen";[\s\S]*\}/);
  assert.match(registrySource, /providerDefinitions\(\)\.filter\(\(definition\) => isOperationalProviderVisible\(definition\.provider\)\)/);
});
