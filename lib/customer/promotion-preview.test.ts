import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePublicPromotionDiscount,
  evaluatePublicPromotion,
  findPublicPromotionByCode,
  normalizePromotionCode,
  promotionEligibilityMessage,
  promotionDescription
} from "./promotion-preview";
import { formatVnd } from "@/lib/money";
import type { PublicPromotion } from "@/types";

const fixedPromotion: PublicPromotion = {
  id: "promo-fixed",
  name: "Giảm 20k",
  code: "FREESHIP20",
  discountScope: "ORDER",
  discountType: "FIXED",
  discountValue: 20000,
  minOrderAmount: 80000,
  totalUsageLimit: null,
  perCustomerUsageLimit: null,
  remainingTotalUsage: null,
  startsAt: null,
  endsAt: null
};

const percentPromotion: PublicPromotion = {
  ...fixedPromotion,
  id: "promo-percent",
  code: "SALE10",
  discountType: "PERCENT",
  discountValue: 10,
  minOrderAmount: 0
};

const freeDeliveryPromotion: PublicPromotion = {
  ...fixedPromotion,
  id: "promo-freeship",
  code: "FREESHIP",
  discountScope: "DELIVERY_FEE",
  discountType: "PERCENT",
  discountValue: 100,
  minOrderAmount: 100000
};

test("promotion preview normalizes and finds public promotion codes", () => {
  assert.equal(normalizePromotionCode(" sale10 "), "SALE10");
  assert.equal(findPublicPromotionByCode([fixedPromotion, percentPromotion], "sale10")?.id, "promo-percent");
  assert.equal(findPublicPromotionByCode([fixedPromotion], ""), null);
});

test("promotion preview calculates fixed and percentage discounts safely", () => {
  assert.equal(calculatePublicPromotionDiscount({ itemSubtotal: 70000, promotion: fixedPromotion }), 0);
  assert.equal(calculatePublicPromotionDiscount({ itemSubtotal: 90000, promotion: fixedPromotion }), 20000);
  assert.equal(calculatePublicPromotionDiscount({ itemSubtotal: 120000, promotion: percentPromotion }), 12000);
});

test("promotion preview never discounts below zero and describes minimum orders", () => {
  assert.equal(calculatePublicPromotionDiscount({ itemSubtotal: 10000, promotion: { ...fixedPromotion, minOrderAmount: 0 } }), 10000);
  assert.equal(promotionDescription(fixedPromotion), `Giảm ${formatVnd(20000)} cho đơn từ ${formatVnd(80000)}`);
});

test("promotion preview applies free delivery campaigns to delivery fee only", () => {
  assert.equal(
    calculatePublicPromotionDiscount({
      itemSubtotal: 120000,
      deliveryFee: 18000,
      promotion: freeDeliveryPromotion
    }),
    18000
  );
  assert.equal(
    calculatePublicPromotionDiscount({
      itemSubtotal: 90000,
      deliveryFee: 18000,
      promotion: freeDeliveryPromotion
    }),
    0
  );
  assert.equal(promotionDescription(freeDeliveryPromotion), `Miễn phí giao hàng cho đơn từ ${formatVnd(100000)}`);
});

test("promotion preview explains eligibility state for checkout UX", () => {
  assert.deepEqual(evaluatePublicPromotion({ itemSubtotal: 90000, deliveryFee: 18000, promotion: freeDeliveryPromotion }), {
    eligible: false,
    discountAmount: 0,
    eligibleAmount: 18000,
    missingAmount: 10000,
    reason: "minimum_not_met"
  });
  assert.equal(
    promotionEligibilityMessage({
      itemSubtotal: 90000,
      deliveryFee: 18000,
      promotion: freeDeliveryPromotion,
      isDeliveryMode: true
    }),
    `Cần thêm ${formatVnd(10000)} để dùng mã FREESHIP.`
  );
  assert.equal(
    promotionEligibilityMessage({
      itemSubtotal: 90000,
      deliveryFee: 0,
      promotion: freeDeliveryPromotion,
      isDeliveryMode: false
    }),
    "Mã này chỉ áp dụng cho đơn giao hàng."
  );
});
