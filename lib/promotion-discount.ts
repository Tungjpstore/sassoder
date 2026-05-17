export type PromotionDiscountScope = "ORDER" | "DELIVERY_FEE";
export type PromotionDiscountType = "PERCENT" | "FIXED";

export type PromotionDiscountRule = {
  discountScope?: PromotionDiscountScope | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  minOrderAmount: number;
};

export type PromotionDiscountEvaluation =
  | {
      eligible: true;
      discountAmount: number;
      eligibleAmount: number;
      missingAmount: 0;
      reason: null;
    }
  | {
      eligible: false;
      discountAmount: 0;
      eligibleAmount: number;
      missingAmount: number;
      reason: "no_rule" | "minimum_not_met" | "no_eligible_amount" | "zero_discount";
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
  return evaluatePromotionDiscount(input).discountAmount;
}

export function evaluatePromotionDiscount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  rule: PromotionDiscountRule | null;
}): PromotionDiscountEvaluation {
  if (!input.rule) {
    return {
      eligible: false,
      discountAmount: 0,
      eligibleAmount: 0,
      missingAmount: 0,
      reason: "no_rule"
    };
  }

  const missingAmount = Math.max(0, Math.round(input.rule.minOrderAmount - input.itemSubtotal));
  if (missingAmount > 0) {
    return {
      eligible: false,
      discountAmount: 0,
      eligibleAmount: eligiblePromotionAmount({
        itemSubtotal: input.itemSubtotal,
        deliveryFee: input.deliveryFee,
        rule: input.rule
      }),
      missingAmount,
      reason: "minimum_not_met"
    };
  }

  const eligibleAmount = eligiblePromotionAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    rule: input.rule
  });
  if (eligibleAmount <= 0) {
    return {
      eligible: false,
      discountAmount: 0,
      eligibleAmount,
      missingAmount: 0,
      reason: "no_eligible_amount"
    };
  }

  const discountAmount =
    input.rule.discountType === "PERCENT"
      ? Math.min(eligibleAmount, Math.round((eligibleAmount * input.rule.discountValue) / 100))
      : Math.min(eligibleAmount, input.rule.discountValue);

  if (discountAmount <= 0) {
    return {
      eligible: false,
      discountAmount: 0,
      eligibleAmount,
      missingAmount: 0,
      reason: "zero_discount"
    };
  }

  return {
    eligible: true,
    discountAmount,
    eligibleAmount,
    missingAmount: 0,
    reason: null
  };
}
