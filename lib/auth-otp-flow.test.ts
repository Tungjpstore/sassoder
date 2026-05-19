import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOtpCooldownStorageKey,
  normalizeOtpDigits,
  otpCooldownExpiresAt,
  remainingOtpCooldownSeconds
} from "./auth-otp-flow";

test("normalizeOtpDigits keeps only compact numeric OTP input", () => {
  assert.equal(normalizeOtpDigits("12 3-4a5b678"), "123456");
  assert.equal(normalizeOtpDigits("abc"), "");
  assert.equal(normalizeOtpDigits(null), "");
});
test("buildOtpCooldownStorageKey scopes cooldown by purpose and normalized email", () => {
  assert.equal(buildOtpCooldownStorageKey({ email: " Owner@Example.COM ", purpose: "signup" }), "logivn:auth-otp:signup:owner@example.com");
  assert.equal(buildOtpCooldownStorageKey({ email: "owner@example.com", purpose: "recovery" }), "logivn:auth-otp:recovery:owner@example.com");
  assert.equal(buildOtpCooldownStorageKey({ email: "", purpose: "signup" }), "");
});

test("remainingOtpCooldownSeconds derives positive remaining seconds from an expiry timestamp", () => {
  const now = 1_000_000;
  assert.equal(otpCooldownExpiresAt(now, 45), 1_045_000);
  assert.equal(remainingOtpCooldownSeconds(1_044_200, now), 45);
  assert.equal(remainingOtpCooldownSeconds(999_999, now), 0);
  assert.equal(remainingOtpCooldownSeconds("bad", now), 0);
});
