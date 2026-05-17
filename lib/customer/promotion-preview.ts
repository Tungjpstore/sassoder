import { formatVnd } from "@/lib/money";
import { calculatePromotionDiscountAmount } from "@/lib/promotion-discount";
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
  promotion: PublicPromotion | null;
}) {
  return calculatePromotionDiscountAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    rule: input.promotion
      ? {
          discountScope: input.promotion.discountScope,
          discountType: input.promotion.discountType,
          discountValue: input.promotion.discountValue,
          minOrderAmount: input.promotion.minOrderAmount
        }
      : null
  });
}

export function promotionDescription(promotion: PublicPromotion) {
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
