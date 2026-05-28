import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptPlatformAiSecret,
  encryptPlatformAiSecret,
  fingerprintPlatformAiSecret
} from "@/lib/ai/platform-ai-secret-crypto";

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
