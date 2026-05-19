import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicAuthEmailStatusPayload } from "./auth-email-status-response";

test("public auth email status does not expose account registration state", () => {
  const payload = buildPublicAuthEmailStatusPayload("configured");
  const serialized = JSON.stringify(payload);

  assert.equal(payload.status, "accepted");
  assert.equal(serialized.includes("registered"), false);
  assert.equal(serialized.includes("pending_verification"), false);
  assert.equal(serialized.includes("available"), false);
  assert.equal(serialized.includes("@"), false);
});

test("public auth email status exposes only delivery readiness when email delivery is unavailable", () => {
  const payload = buildPublicAuthEmailStatusPayload("delivery_unavailable");

  assert.equal(payload.status, "delivery_unavailable");
  assert.equal(payload.emailDeliveryStatus, "delivery_unavailable");
  assert.ok(payload.message?.includes("hệ thống gửi mã xác thực chưa sẵn sàng"));
});
