import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import type { Database } from "@/types/supabase";

export type Promotion = Database["public"]["Tables"]["promotions"]["Row"];
export type PromotionStatus = "active" | "scheduled" | "ended" | "paused";
export type PublicPromotion = {
  id: string;
  name: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  startsAt: string | null;
  endsAt: string | null;
};
export type PromotionUsageSummary = {
  promotionId: string;
  orders: number;
  revenue: number;
  discount: number;
};

export function getPromotionStatus(promotion: Promotion, now = new Date()): PromotionStatus {
  if (!promotion.is_active) return "paused";
  const startsAt = promotion.starts_at ? new Date(promotion.starts_at) : null;
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at) : null;
  if (startsAt && startsAt > now) return "scheduled";
  if (endsAt && endsAt < now) return "ended";
  return "active";
}

export function promotionStatusLabel(status: PromotionStatus) {
  if (status === "active") return "Đang chạy";
  if (status === "scheduled") return "Sắp diễn ra";
  if (status === "paused") return "Đang tạm dừng";
  return "Đã kết thúc";
}

export async function listPromotions(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error);
  return (data ?? []) as Promotion[];
}

export async function listPromotionUsageSummary(restaurantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("promotion_id,total,discount_amount")
    .eq("restaurant_id", restaurantId)
    .not("promotion_id", "is", null);

  throwIfSupabaseError(error);

  const byPromotion = new Map<string, PromotionUsageSummary>();
  for (const order of data ?? []) {
    if (!order.promotion_id) continue;
    const current = byPromotion.get(order.promotion_id) ?? {
      promotionId: order.promotion_id,
      orders: 0,
      revenue: 0,
      discount: 0
    };
    current.orders += 1;
    current.revenue += order.total;
    current.discount += order.discount_amount ?? 0;
    byPromotion.set(order.promotion_id, current);
  }

  return [...byPromotion.values()];
}

export function calculatePromotionDiscount(subtotal: number, promotion: Pick<Promotion, "discount_type" | "discount_value" | "min_order_amount">) {
  if (subtotal < promotion.min_order_amount) return 0;
  if (promotion.discount_type === "PERCENT") {
    return Math.min(subtotal, Math.round((subtotal * promotion.discount_value) / 100));
  }
  return Math.min(subtotal, promotion.discount_value);
}

export async function listPublicPromotions(restaurantId: string, channel: "QR_MENU" | "WEBSITE" = "QR_MENU") {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("id,name,code,discount_type,discount_value,min_order_amount,starts_at,ends_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .eq("show_on_customer_menu", true)
    .contains("channels", [channel])
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false })
    .limit(12);

  throwIfSupabaseError(error);
  return (data ?? []).map((promotion) => ({
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    discountType: promotion.discount_type,
    discountValue: promotion.discount_value,
    minOrderAmount: promotion.min_order_amount,
    startsAt: promotion.starts_at,
    endsAt: promotion.ends_at
  })) satisfies PublicPromotion[];
}

export async function resolvePromotionForOrder({
  restaurantId,
  code,
  subtotal,
  channel
}: {
  restaurantId: string;
  code?: string;
  subtotal: number;
  channel: "QR_MENU" | "WEBSITE";
}) {
  const normalizedCode = code?.trim().toUpperCase();
  if (!normalizedCode) return { promotion: null, discountAmount: 0 };

  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("code", normalizedCode)
    .eq("is_active", true)
    .contains("channels", [channel])
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .maybeSingle();

  throwIfSupabaseError(error);
  if (!data) return { promotion: null, discountAmount: 0 };

  const discountAmount = calculatePromotionDiscount(subtotal, data);
  if (discountAmount <= 0) return { promotion: null, discountAmount: 0 };

  return { promotion: data as Promotion, discountAmount };
}

export async function createPromotion(
  restaurantId: string,
  input: {
    name: string;
    code: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    minOrderAmount?: number;
    startsAt?: string;
    endsAt?: string;
    channels: string[];
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotions")
    .insert({
      restaurant_id: restaurantId,
      name: input.name,
      code: input.code,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      min_order_amount: input.minOrderAmount ?? 0,
      starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
      ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      channels: input.channels
    })
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as Promotion;
}

export async function updatePromotionCustomerVisibility(
  restaurantId: string,
  input: {
    promotionId: string;
    showOnCustomerMenu: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotions")
    .update({ show_on_customer_menu: input.showOnCustomerMenu })
    .eq("id", input.promotionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as Promotion;
}

export async function updatePromotionActiveStatus(
  restaurantId: string,
  input: {
    promotionId: string;
    isActive: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotions")
    .update({ is_active: input.isActive })
    .eq("id", input.promotionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  throwIfSupabaseError(error);
  return data as Promotion;
}

export async function deletePromotion(restaurantId: string, promotionId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("promotions")
    .delete()
    .eq("id", promotionId)
    .eq("restaurant_id", restaurantId);

  throwIfSupabaseError(error);
}
