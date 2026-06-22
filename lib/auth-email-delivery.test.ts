import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuthEmailDeliveryConfigured,
  getAuthEmailDeliveryStatus,
  isAuthEmailDeliveryConfigured
} from "./auth-email-delivery";

test("auth email delivery reports unavailable when no transactional provider is configured", () => {
  assert.equal(isAuthEmailDeliveryConfigured({}), false);
  assert.equal(isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "   " }), false);
  assert.equal(getAuthEmailDeliveryStatus({}), "delivery_unavailable");
});

test("auth email delivery reports configured when Resend is present", () => {
  assert.equal(isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "re_test_key" }), true);
  assert.equal(getAuthEmailDeliveryStatus({ RESEND_API_KEY: "re_test_key" }), "configured");
  assert.equal(assertAuthEmailDeliveryConfigured({ RESEND_API_KEY: " re_test_key " }), "resend");
});

test("auth email delivery blocks SES until production access is confirmed", () => {
  const env = {
    EMAIL_PROVIDER: "ses",
    AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SES_SECRET_ACCESS_KEY: "secret"
  };
  assert.equal(isAuthEmailDeliveryConfigured(env), false);
  assert.equal(getAuthEmailDeliveryStatus(env), "delivery_unavailable");
});

test("auth email delivery reports configured when confirmed SES is present", () => {
  const env = {
    EMAIL_PROVIDER: "ses",
    SES_PRODUCTION_ACCESS_CONFIRMED: "true",
    AWS_SES_ACCESS_KEY_ID: "AKIA_TEST",
    AWS_SES_SECRET_ACCESS_KEY: "secret"
  };
  assert.equal(isAuthEmailDeliveryConfigured(env), true);
  assert.equal(getAuthEmailDeliveryStatus(env), "configured");
  assert.equal(assertAuthEmailDeliveryConfigured(env), "ses");
});

test("auth email delivery throws a service error when OTP email is unavailable", () => {
  assert.throws(
    () => assertAuthEmailDeliveryConfigured({}),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("hệ thống gửi mã xác thực chưa sẵn sàng") &&
      (error as { status?: number }).status === 503
  );
});
