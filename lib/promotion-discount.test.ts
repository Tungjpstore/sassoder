import assert from "node:assert/strict";
import test from "node:test";
import { calculatePromotionDiscountAmount, evaluatePromotionDiscount } from "./promotion-discount";

test("promotion evaluator explains missing minimum order amount", () => {
  assert.deepEqual(
    evaluatePromotionDiscount({
      itemSubtotal: 79000,
      rule: {
        discountScope: "ORDER",
        discountType: "FIXED",
        discountValue: 20000,
        minOrderAmount: 100000
      }
    }),
    {
      eligible: false,
      discountAmount: 0,
      eligibleAmount: 79000,
      missingAmount: 21000,
      reason: "minimum_not_met"
    }
  );
});

test("promotion evaluator caps fixed order discount to eligible amount", () => {
  assert.equal(
    calculatePromotionDiscountAmount({
      itemSubtotal: 12000,
      rule: {
        discountScope: "ORDER",
        discountType: "FIXED",
        discountValue: 20000,
        minOrderAmount: 0
      }
    }),
    12000
  );
});

test("promotion evaluator applies delivery campaigns to delivery fee only", () => {
  assert.deepEqual(
    evaluatePromotionDiscount({
      itemSubtotal: 150000,
      deliveryFee: 18000,
      rule: {
        discountScope: "DELIVERY_FEE",
        discountType: "PERCENT",
        discountValue: 100,
        minOrderAmount: 100000
      }
    }),
    {
      eligible: true,
      discountAmount: 18000,
      eligibleAmount: 18000,
      missingAmount: 0,
      reason: null
    }
  );
});

test("promotion evaluator rejects delivery campaigns without delivery fee", () => {
  assert.deepEqual(
    evaluatePromotionDiscount({
      itemSubtotal: 150000,
      deliveryFee: 0,
      rule: {
        discountScope: "DELIVERY_FEE",
        discountType: "PERCENT",
        discountValue: 100,
        minOrderAmount: 100000
      }
    }),
    {
      eligible: false,
      discountAmount: 0,
      eligibleAmount: 0,
      missingAmount: 0,
      reason: "no_eligible_amount"
    }
  );
});
