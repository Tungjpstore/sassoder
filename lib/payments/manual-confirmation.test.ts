import assert from "node:assert/strict";
import test from "node:test";
import { inferManualConfirmationMethod, resolveManualConfirmationMethod } from "./manual-confirmation";

test("manual confirmation keeps explicit payment method precedence", () => {
  assert.equal(resolveManualConfirmationMethod({ currentMethod: "CASH", requestedMethod: "QR" }), "CASH");
  assert.equal(inferManualConfirmationMethod({ currentMethod: "QR", requestedMethod: "CASH", status: "waiting_confirm" }), "QR");
  assert.equal(inferManualConfirmationMethod({ currentMethod: null, requestedMethod: "CASH", status: "waiting_payment" }), "CASH");
});

test("manual confirmation recovers missing method from payment state", () => {
  assert.equal(inferManualConfirmationMethod({ paymentStatus: "waiting_payment" }), "QR");
  assert.equal(inferManualConfirmationMethod({ paymentStatus: "waiting_confirm" }), "CASH");
  assert.equal(inferManualConfirmationMethod({ billStatus: "waiting_payment" }), "QR");
  assert.equal(inferManualConfirmationMethod({ billStatus: "waiting_confirm" }), "CASH");
  // Kitchen-ready unpaid must not invent CASH — UI sends explicit paymentMethod on "Thu tiền mặt".
  assert.equal(inferManualConfirmationMethod({ status: "completed", paymentStatus: "unpaid" }), null);
});

test("manual confirmation does not invent a method for unrelated states", () => {
  assert.equal(inferManualConfirmationMethod({ status: "pending", paymentStatus: "unpaid" }), null);
  assert.equal(inferManualConfirmationMethod({ status: "ordering", paymentStatus: "unpaid" }), null);
});
