import { formatVnd } from "@/lib/money";
import type { PublicPromotion } from "@/types";

export function normalizePromotionCode(code: string) {
  return code.trim().toUpperCase();
}

export function findPublicPromotionByCode(promotions: readonly PublicPromotion[], code: string) {
  const normalizedCode = normalizePromotionCode(code);
  if (!normalizedCode) return null;
  return promotions.find((promotion) => promotion.code === normalizedCode) ?? null;
}

export function calculatePublicPromotionDiscount(subtotal: number, promotion: PublicPromotion | null) {
  if (!promotion || subtotal < promotion.minOrderAmount) return 0;
  if (promotion.discountType === "PERCENT") {
    return Math.min(subtotal, Math.round((subtotal * promotion.discountValue) / 100));
  }
  return Math.min(subtotal, promotion.discountValue);
}

export function promotionDescription(promotion: PublicPromotion) {
  const value = promotion.discountType === "PERCENT" ? `${promotion.discountValue}%` : formatVnd(promotion.discountValue);
  if (promotion.minOrderAmount > 0) return `Giảm ${value} cho đơn từ ${formatVnd(promotion.minOrderAmount)}`;
  return `Giảm ${value} cho đơn hiện tại`;
}
