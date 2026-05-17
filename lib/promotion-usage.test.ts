import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePromotionUsageLimit } from "./promotion-usage";

test("promotion usage limits allow unlimited campaigns", () => {
  assert.deepEqual(evaluatePromotionUsageLimit({}), {
    available: true,
    remainingTotalUsage: null,
    remainingCustomerUsage: null,
    reason: null
  });
});

test("promotion usage limits block exhausted campaign totals", () => {
  assert.deepEqual(evaluatePromotionUsageLimit({ totalUsageLimit: 10, totalUsed: 10, perCustomerUsageLimit: 2, customerUsed: 1 }), {
    available: false,
    remainingTotalUsage: 0,
    remainingCustomerUsage: 1,
    reason: "total_limit_reached"
  });
});

test("promotion usage limits block repeat abuse by customer session", () => {
  assert.deepEqual(evaluatePromotionUsageLimit({ totalUsageLimit: 10, totalUsed: 3, perCustomerUsageLimit: 1, customerUsed: 1 }), {
    available: false,
    remainingTotalUsage: 7,
    remainingCustomerUsage: 0,
    reason: "customer_limit_reached"
  });
});
