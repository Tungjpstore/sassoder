import assert from "node:assert/strict";
import test from "node:test";
import {
  createBillingWebhookSignature,
  getBillingWebhookEventKey,
  normalizeBillingWebhookEvent,
  resolveBillingWebhookPaymentStatus,
  verifyBillingWebhookSignature
} from "@/lib/billing/webhook-events";

test("billing webhook signatures support raw hex and sha256-prefixed values", () => {
  const rawBody = JSON.stringify({ transferCode: "LOGIVN-ABC", status: "confirmed" });
  const signature = createBillingWebhookSignature(rawBody, "secret");

  assert.equal(verifyBillingWebhookSignature(rawBody, signature, "secret"), true);
  assert.equal(verifyBillingWebhookSignature(rawBody, `sha256=${signature}`, "secret"), true);
  assert.equal(verifyBillingWebhookSignature(rawBody, signature, "wrong-secret"), false);
});

test("billing webhook events normalize provider fields and stable idempotency keys", () => {
  const event = normalizeBillingWebhookEvent({
    event_id: "evt_123",
    provider: "payos",
    provider_reference: "pay_123",
    transfer_code: "LOGIVN-ABC",
    status: "FAILED",
    amount: 99000,
    occurred_at: "2026-05-19T00:00:00.000Z"
  });

  assert.equal(event.eventId, "evt_123");
  assert.equal(event.providerReference, "pay_123");
  assert.equal(event.transferCode, "LOGIVN-ABC");
  assert.equal(event.status, "failed");
  assert.equal(event.amount, 99000);
  assert.equal(event.currency, null);
  assert.equal(getBillingWebhookEventKey(event, null), "evt_123");
});

test("billing webhook fallback idempotency keys keep lifecycle statuses distinct", () => {
  const detected = normalizeBillingWebhookEvent({
    provider: "payos",
    provider_reference: "pay_123",
    status: "detected",
    amount: 99000,
    currency: "vnd"
  });
  const confirmed = normalizeBillingWebhookEvent({
    provider: "payos",
    provider_reference: "pay_123",
    status: "confirmed",
    amount: 99000,
    currency: "vnd"
  });

  assert.equal(detected.currency, "VND");
  assert.equal(getBillingWebhookEventKey(detected, null), "payos:pay_123:detected:99000:VND");
  assert.equal(getBillingWebhookEventKey(confirmed, null), "payos:pay_123:confirmed:99000:VND");
});

test("billing webhook events reject missing payment identity", () => {
  assert.throws(
    () =>
      normalizeBillingWebhookEvent({
        status: "confirmed"
      }),
    /providerReference or transferCode/
  );
});

test("billing webhook status resolution does not downgrade terminal payments", () => {
  assert.equal(
    resolveBillingWebhookPaymentStatus({
      currentStatus: "confirmed",
      webhookStatus: "failed"
    }),
    "confirmed"
  );
  assert.equal(
    resolveBillingWebhookPaymentStatus({
      currentStatus: "refunded",
      webhookStatus: "confirmed"
    }),
    "refunded"
  );
  assert.equal(
    resolveBillingWebhookPaymentStatus({
      currentStatus: "waiting_confirmation",
      webhookStatus: "confirmed"
    }),
    "confirmed"
  );
});
