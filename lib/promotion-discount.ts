export type PromotionDiscountScope = "ORDER" | "DELIVERY_FEE";
export type PromotionDiscountType = "PERCENT" | "FIXED";
export type PromotionRewardType = "DISCOUNT" | "FREE_ITEM";

export type PromotionDiscountRule = {
  rewardType?: PromotionRewardType | null;
  discountScope?: PromotionDiscountScope | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  minOrderAmount: number;
  freeItemMenuItemId?: string | null;
  freeItemQuantity?: number | null;
};

export type PromotionOrderLineInput = {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
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
  items?: PromotionOrderLineInput[];
}) {
  if (input.rule.rewardType === "FREE_ITEM") {
    const freeItemId = input.rule.freeItemMenuItemId;
    if (!freeItemId) return 0;
    const line = input.items?.find((item) => item.menuItemId === freeItemId);
    if (!line || line.quantity <= 0 || line.unitPrice <= 0) return 0;
    const freeQuantity = Math.min(Math.max(1, Math.round(input.rule.freeItemQuantity ?? 1)), Math.max(0, Math.floor(line.quantity)));
    return Math.max(0, Math.round(line.unitPrice * freeQuantity));
  }
  if (input.rule.discountScope === "DELIVERY_FEE") return Math.max(0, Math.round(input.deliveryFee ?? 0));
  return Math.max(0, Math.round(input.itemSubtotal));
}

export function calculatePromotionDiscountAmount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  rule: PromotionDiscountRule | null;
  items?: PromotionOrderLineInput[];
}) {
  return evaluatePromotionDiscount(input).discountAmount;
}

export function evaluatePromotionDiscount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  rule: PromotionDiscountRule | null;
  items?: PromotionOrderLineInput[];
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
        rule: input.rule,
        items: input.items
      }),
      missingAmount,
      reason: "minimum_not_met"
    };
  }

  const eligibleAmount = eligiblePromotionAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    rule: input.rule,
    items: input.items
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
    input.rule.rewardType === "FREE_ITEM"
      ? Math.min(Math.max(0, Math.round(input.itemSubtotal)), eligibleAmount)
      : input.rule.discountType === "PERCENT"
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
