import assert from "node:assert/strict";
import test from "node:test";
import { calculatePromotionDiscountAmount } from "./promotion-discount";

const orderPromotion = {
  discountScope: "ORDER" as const,
  discountType: "FIXED" as const,
  discountValue: 20000,
  minOrderAmount: 80000
};

const freeDeliveryPromotion = {
  discountScope: "DELIVERY_FEE" as const,
  discountType: "PERCENT" as const,
  discountValue: 100,
  minOrderAmount: 100000
};

test("promotion discount applies normal coupons to item subtotal", () => {
  assert.equal(
    calculatePromotionDiscountAmount({
      itemSubtotal: 120000,
      deliveryFee: 18000,
      rule: orderPromotion
    }),
    20000
  );
});

test("promotion discount applies delivery campaigns to delivery fee only", () => {
  assert.equal(
    calculatePromotionDiscountAmount({
      itemSubtotal: 120000,
      deliveryFee: 18000,
      rule: freeDeliveryPromotion
    }),
    18000
  );
  assert.equal(
    calculatePromotionDiscountAmount({
      itemSubtotal: 120000,
      deliveryFee: 0,
      rule: freeDeliveryPromotion
    }),
    0
  );
});

test("promotion discount uses item subtotal for minimum order checks", () => {
  assert.equal(
    calculatePromotionDiscountAmount({
      itemSubtotal: 90000,
      deliveryFee: 18000,
      rule: freeDeliveryPromotion
    }),
    0
  );
});
