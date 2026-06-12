import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decryptPlatformAiSecret,
  encryptPlatformAiSecret,
  fingerprintPlatformAiSecret
} from "@/lib/ai/platform-ai-secret-crypto";

const providerConfigServiceSource = readFileSync(new URL("./platform-ai-provider-config-service.ts", import.meta.url), "utf8");
const platformAdminActionsSource = readFileSync(new URL("../features/platform-admin/actions.ts", import.meta.url), "utf8");

test("platform AI API keys are encrypted with stable non-secret fingerprints", () => {
  const previousSecret = process.env.PLATFORM_AI_SECRET_KEY;
  process.env.PLATFORM_AI_SECRET_KEY = "test-platform-ai-secret-key-with-enough-entropy";

  try {
    const rawKey = "sk-test-logivn-ai-key-1234567890";
    const encrypted = encryptPlatformAiSecret(rawKey);

    assert.notEqual(encrypted.ciphertext, rawKey);
    assert.equal(encrypted.lastFour, "7890");
    assert.equal(encrypted.fingerprint, fingerprintPlatformAiSecret(rawKey));
    assert.equal(decryptPlatformAiSecret(encrypted), rawKey);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.PLATFORM_AI_SECRET_KEY;
    } else {
      process.env.PLATFORM_AI_SECRET_KEY = previousSecret;
    }
  }
});

test("admin AI provider config excludes legacy Qwen from configurable providers", () => {
  assert.match(providerConfigServiceSource, /adminConfigurableAiProviders = \["mimo", "deepseek", "nvidia", "bedrock", "openai", "gemini", "xai", "claude", "vercel_gateway"\]/);
  assert.doesNotMatch(providerConfigServiceSource, /adminConfigurableAiProviders = \[[^\]]*"qwen"/);
});

test("legacy Qwen provider is blocked in admin update flow", () => {
  assert.match(providerConfigServiceSource, /Provider AI \$\{provider\} chỉ còn ở chế độ legacy và không thể chỉnh từ admin\./);
  assert.match(platformAdminActionsSource, /provider: z\.enum\(adminConfigurableAiProviders\)/);
});
