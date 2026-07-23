import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("services/payment-service.ts", "utf8");

test("payment service routes checkout and payment transitions through atomic RPC wrappers", () => {
  assert.match(source, /checkoutBillAtomic\(/);
  assert.match(source, /transitionPaymentAtomic\(/);
  assert.match(source, /state_version/);
  assert.match(source, /buildFinancialStageIdempotencyKey/);
  assert.doesNotMatch(source, /\.from\("orders"\)\s*\n\s*\.update\(/);
  assert.doesNotMatch(source, /\.from\("table_bills"\)\s*\n\s*\.update\(/);
  assert.doesNotMatch(source, /\.from\("payment_logs"\)\s*\n\s*\.(?:insert|update|delete)\(/);
});
