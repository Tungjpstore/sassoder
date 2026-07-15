import assert from "node:assert/strict";
import test from "node:test";
import { canMarkCustomerPaid, canStartDineInPayment } from "./payment-gates";

test("canStartDineInPayment blocks pending and cancelled", () => {
  assert.equal(canStartDineInPayment({ status: "pending" }), false);
  assert.equal(canStartDineInPayment({ status: "cancelled" }), false);
  assert.equal(canStartDineInPayment({ status: "pending", bill: { status: "open" } }), false);
});

test("canStartDineInPayment allows kitchen progress and bill after accept", () => {
  assert.equal(canStartDineInPayment({ status: "ordering" }), true);
  assert.equal(canStartDineInPayment({ status: "completed" }), true);
  assert.equal(canStartDineInPayment({ status: "ordering", bill: { status: "open" } }), true);
  assert.equal(canStartDineInPayment({ status: "waiting_payment" }), true);
});

test("canMarkCustomerPaid only after checkout enters payment wait states", () => {
  assert.equal(canMarkCustomerPaid({ status: "ordering" }), false);
  assert.equal(canMarkCustomerPaid({ status: "completed" }), false);
  assert.equal(canMarkCustomerPaid({ status: "waiting_payment" }), true);
  assert.equal(canMarkCustomerPaid({ status: "ordering", bill: { status: "waiting_payment" } }), true);
  assert.equal(canMarkCustomerPaid({ paymentStatus: "waiting_confirm" }), true);
});
