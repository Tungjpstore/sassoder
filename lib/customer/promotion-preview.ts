import { formatVnd } from "@/lib/money";
import { calculatePromotionDiscountAmount, evaluatePromotionDiscount, type PromotionOrderLineInput } from "@/lib/promotion-discount";
import type { PublicPromotion } from "@/types";

export function normalizePromotionCode(code: string) {
  return code.trim().toUpperCase();
}

export function findPublicPromotionByCode(promotions: readonly PublicPromotion[], code: string) {
  const normalizedCode = normalizePromotionCode(code);
  if (!normalizedCode) return null;
  return promotions.find((promotion) => promotion.code === normalizedCode) ?? null;
}

export function calculatePublicPromotionDiscount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  items?: PromotionOrderLineInput[];
  promotion: PublicPromotion | null;
}) {
  return calculatePromotionDiscountAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    items: input.items,
    rule: input.promotion
      ? {
          rewardType: input.promotion.rewardType ?? "DISCOUNT",
          discountScope: input.promotion.discountScope,
          discountType: input.promotion.discountType,
          discountValue: input.promotion.discountValue,
          minOrderAmount: input.promotion.minOrderAmount,
          freeItemMenuItemId: input.promotion.freeItemMenuItemId ?? null,
          freeItemQuantity: input.promotion.freeItemQuantity ?? null
        }
      : null
  });
}

export function evaluatePublicPromotion(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  items?: PromotionOrderLineInput[];
  promotion: PublicPromotion | null;
}) {
  return evaluatePromotionDiscount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    items: input.items,
    rule: input.promotion
      ? {
          rewardType: input.promotion.rewardType ?? "DISCOUNT",
          discountScope: input.promotion.discountScope,
          discountType: input.promotion.discountType,
          discountValue: input.promotion.discountValue,
          minOrderAmount: input.promotion.minOrderAmount,
          freeItemMenuItemId: input.promotion.freeItemMenuItemId ?? null,
          freeItemQuantity: input.promotion.freeItemQuantity ?? null
        }
      : null
  });
}

export function promotionEligibilityMessage(input: {
  promotion: PublicPromotion | null;
  itemSubtotal: number;
  deliveryFee?: number;
  items?: PromotionOrderLineInput[];
  isDeliveryMode?: boolean;
}) {
  if (!input.promotion) return "Mã sẽ được kiểm tra khi gửi đơn.";

  const evaluation = evaluatePublicPromotion(input);
  if (evaluation.eligible) return `Đã tạm giảm ${formatVnd(evaluation.discountAmount)}.`;
  if (input.promotion.discountScope === "DELIVERY_FEE" && input.isDeliveryMode === false) {
    return "Mã này chỉ áp dụng cho đơn giao hàng.";
  }
  if (evaluation.reason === "minimum_not_met") {
    return `Cần thêm ${formatVnd(evaluation.missingAmount)} để dùng mã ${input.promotion.code}.`;
  }
  if (input.promotion.discountScope === "DELIVERY_FEE") {
    return "Mã sẽ áp dụng khi phí giao hàng hợp lệ.";
  }
  if (input.promotion.rewardType === "FREE_ITEM") {
    return "Mã sẽ áp dụng khi đơn có món quà tặng hợp lệ.";
  }
  return "Mã hợp lệ nhưng chưa đủ điều kiện áp dụng.";
}

export function promotionDescription(promotion: PublicPromotion) {
  if (promotion.rewardType === "FREE_ITEM") {
    const quantity = Math.max(1, promotion.freeItemQuantity ?? 1);
    const prefix = quantity > 1 ? `Tặng ${quantity} món` : "Tặng 1 món";
    if (promotion.minOrderAmount > 0) return `${prefix} cho đơn từ ${formatVnd(promotion.minOrderAmount)}`;
    return prefix;
  }
  const value = promotion.discountType === "PERCENT" ? `${promotion.discountValue}%` : formatVnd(promotion.discountValue);
  if (promotion.discountScope === "DELIVERY_FEE" && promotion.discountType === "PERCENT" && promotion.discountValue >= 100) {
    if (promotion.minOrderAmount > 0) return `Miễn phí giao hàng cho đơn từ ${formatVnd(promotion.minOrderAmount)}`;
    return "Miễn phí giao hàng";
  }
  if (promotion.discountScope === "DELIVERY_FEE") {
    if (promotion.minOrderAmount > 0) return `Giảm ${value} phí giao hàng cho đơn từ ${formatVnd(promotion.minOrderAmount)}`;
    return `Giảm ${value} phí giao hàng`;
  }
  if (promotion.minOrderAmount > 0) return `Giảm ${value} cho đơn từ ${formatVnd(promotion.minOrderAmount)}`;
  return `Giảm ${value} cho đơn hiện tại`;
}
