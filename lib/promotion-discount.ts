export type PromotionDiscountScope = "ORDER" | "DELIVERY_FEE";
export type PromotionDiscountType = "PERCENT" | "FIXED";

export type PromotionDiscountRule = {
  discountScope?: PromotionDiscountScope | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  minOrderAmount: number;
};

function eligiblePromotionAmount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  rule: PromotionDiscountRule;
}) {
  if (input.rule.discountScope === "DELIVERY_FEE") return Math.max(0, Math.round(input.deliveryFee ?? 0));
  return Math.max(0, Math.round(input.itemSubtotal));
}

export function calculatePromotionDiscountAmount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  rule: PromotionDiscountRule | null;
}) {
  if (!input.rule || input.itemSubtotal < input.rule.minOrderAmount) return 0;
  const eligibleAmount = eligiblePromotionAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    rule: input.rule
  });
  if (eligibleAmount <= 0) return 0;
  if (input.rule.discountType === "PERCENT") {
    return Math.min(eligibleAmount, Math.round((eligibleAmount * input.rule.discountValue) / 100));
  }
  return Math.min(eligibleAmount, input.rule.discountValue);
}
