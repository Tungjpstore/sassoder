import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePublicPromotionDiscount,
  findPublicPromotionByCode,
  normalizePromotionCode,
  promotionDescription
} from "./promotion-preview";
import { formatVnd } from "@/lib/money";
import type { PublicPromotion } from "@/types";

const fixedPromotion: PublicPromotion = {
  id: "promo-fixed",
  name: "Giảm 20k",
  code: "FREESHIP20",
  discountType: "FIXED",
  discountValue: 20000,
  minOrderAmount: 80000,
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

test("promotion preview normalizes and finds public promotion codes", () => {
  assert.equal(normalizePromotionCode(" sale10 "), "SALE10");
  assert.equal(findPublicPromotionByCode([fixedPromotion, percentPromotion], "sale10")?.id, "promo-percent");
  assert.equal(findPublicPromotionByCode([fixedPromotion], ""), null);
});

test("promotion preview calculates fixed and percentage discounts safely", () => {
  assert.equal(calculatePublicPromotionDiscount(70000, fixedPromotion), 0);
  assert.equal(calculatePublicPromotionDiscount(90000, fixedPromotion), 20000);
  assert.equal(calculatePublicPromotionDiscount(120000, percentPromotion), 12000);
});

test("promotion preview never discounts below zero and describes minimum orders", () => {
  assert.equal(calculatePublicPromotionDiscount(10000, { ...fixedPromotion, minOrderAmount: 0 }), 10000);
  assert.equal(promotionDescription(fixedPromotion), `Giảm ${formatVnd(20000)} cho đơn từ ${formatVnd(80000)}`);
});
