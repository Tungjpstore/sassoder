import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuthEmailDeliveryConfigured,
  getAuthEmailDeliveryStatus,
  isAuthEmailDeliveryConfigured
} from "./auth-email-delivery";

test("auth email delivery reports unavailable when RESEND_API_KEY is missing", () => {
  assert.equal(isAuthEmailDeliveryConfigured({}), false);
  assert.equal(isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "   " }), false);
  assert.equal(getAuthEmailDeliveryStatus({}), "delivery_unavailable");
});

test("auth email delivery reports configured when RESEND_API_KEY is present", () => {
  assert.equal(isAuthEmailDeliveryConfigured({ RESEND_API_KEY: "re_test_key" }), true);
  assert.equal(getAuthEmailDeliveryStatus({ RESEND_API_KEY: "re_test_key" }), "configured");
  assert.equal(assertAuthEmailDeliveryConfigured({ RESEND_API_KEY: " re_test_key " }), "re_test_key");
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
