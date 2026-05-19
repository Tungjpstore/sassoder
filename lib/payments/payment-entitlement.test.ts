import assert from "node:assert/strict";
import test from "node:test";
import { paymentMethodToEntitlementFeature } from "./payment-entitlement";

test("maps payment methods to the matching billing feature", () => {
  assert.equal(paymentMethodToEntitlementFeature("QR"), "vietqr_payments");
  assert.equal(paymentMethodToEntitlementFeature("CASH"), "cash_payments");
});
