import type { PostgrestError } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { calculatePromotionDiscountAmount, evaluatePromotionDiscount } from "@/lib/promotion-discount";
import { evaluatePromotionUsageLimit } from "@/lib/promotion-usage";
import { AppError } from "@/lib/response";
import type { Database } from "@/types/supabase";
import type { PublicPromotion as SharedPublicPromotion } from "@/types";

export type Promotion = Database["public"]["Tables"]["promotions"]["Row"];
export type PromotionStatus = "active" | "scheduled" | "ended" | "paused";
export type PublicPromotion = SharedPublicPromotion;
export type PromotionUsageSummary = {
  promotionId: string;
  orders: number;
  revenue: number;
  discount: number;
};

type PromotionDiscountConfig = Pick<Promotion, "discount_type" | "discount_value" | "min_order_amount"> & {
  discount_scope?: "ORDER" | "DELIVERY_FEE" | null;
};
type PublicPromotionRow = {
  id: string;
  name: string;
  code: string;
  discount_scope?: "ORDER" | "DELIVERY_FEE" | null;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  min_order_amount: number;
  total_usage_limit?: number | null;
  per_customer_usage_limit?: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

const publicPromotionSelect = "id,name,code,discount_scope,discount_type,discount_value,min_order_amount,total_usage_limit,per_customer_usage_limit,starts_at,ends_at";
const legacyPublicPromotionSelect = publicPromotionSelect
  .replace("discount_scope,", "")
  .replace("total_usage_limit,per_customer_usage_limit,", "");

function isMissingPromotionDiscountScope(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /discount_scope|total_usage_limit|per_customer_usage_limit/i.test(message)
  );
}

function throwPromotionWriteError(error: PostgrestError | null, code: string) {
  if ((error as { code?: string } | null)?.code === "23505") {
    throw new AppError(`Mã ${code} đã tồn tại trong quán. Vui lòng dùng mã khác.`, 409);
  }
  throwIfSupabaseError(error);
}

function withDefaultDiscountScope<T extends { discount_scope?: "ORDER" | "DELIVERY_FEE" | null }>(promotion: T) {
  return {
    ...promotion,
    discount_scope: promotion.discount_scope ?? "ORDER",
    total_usage_limit: "total_usage_limit" in promotion ? promotion.total_usage_limit ?? null : null,
    per_customer_usage_limit: "per_customer_usage_limit" in promotion ? promotion.per_customer_usage_limit ?? null : null
  };
}

async function readPromotionUsageCounts(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    restaurantId: string;
    promotionIds: string[];
    customerSessionId?: string | null;
  }
) {
  if (input.promotionIds.length === 0) return new Map<string, { totalUsed: number; customerUsed: number }>();

  const { data, error } = await supabase
    .from("orders")
    .select("promotion_id,customer_session_id")
    .eq("restaurant_id", input.restaurantId)
    .in("promotion_id", input.promotionIds)
    .neq("status", "cancelled");

  throwIfSupabaseError(error);

  const counts = new Map<string, { totalUsed: number; customerUsed: number }>();
  for (const row of data ?? []) {
    if (!row.promotion_id) continue;
    const current = counts.get(row.promotion_id) ?? { totalUsed: 0, customerUsed: 0 };
    current.totalUsed += 1;
    if (input.customerSessionId && row.customer_session_id === input.customerSessionId) {
      current.customerUsed += 1;
    }
    counts.set(row.promotion_id, current);
  }

  return counts;
}

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
  return (data ?? []).map((promotion) => withDefaultDiscountScope(promotion)) as Promotion[];
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

export function calculatePromotionDiscount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  promotion: PromotionDiscountConfig;
}) {
  return calculatePromotionDiscountAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    rule: {
      discountScope: input.promotion.discount_scope ?? "ORDER",
      discountType: input.promotion.discount_type,
      discountValue: input.promotion.discount_value,
      minOrderAmount: input.promotion.min_order_amount
    }
  });
}

export async function listPublicPromotions(restaurantId: string, channel: "QR_MENU" | "WEBSITE" = "QR_MENU"): Promise<PublicPromotion[]> {
  const supabase = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const buildQuery = (select: string) =>
    supabase
      .from("promotions")
      .select(select)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .eq("show_on_customer_menu", true)
      .contains("channels", [channel])
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false })
      .limit(12);

  let { data, error } = await buildQuery(publicPromotionSelect);
  if (isMissingPromotionDiscountScope(error)) {
    ({ data, error } = await buildQuery(legacyPublicPromotionSelect));
  }

  throwIfSupabaseError(error);
  const rows = (data ?? []) as unknown as PublicPromotionRow[];
  const usageCounts = await readPromotionUsageCounts(supabase, {
    restaurantId,
    promotionIds: rows.filter((promotion) => promotion.total_usage_limit).map((promotion) => promotion.id)
  });

  return rows
    .map((promotion) => {
      const usage = usageCounts.get(promotion.id);
      const usageLimit = evaluatePromotionUsageLimit({
        totalUsageLimit: promotion.total_usage_limit ?? null,
        perCustomerUsageLimit: null,
        totalUsed: usage?.totalUsed ?? 0
      });

      return {
        id: promotion.id,
        name: promotion.name,
        code: promotion.code,
        discountScope: promotion.discount_scope ?? "ORDER",
        discountType: promotion.discount_type,
        discountValue: promotion.discount_value,
        minOrderAmount: promotion.min_order_amount,
        totalUsageLimit: promotion.total_usage_limit ?? null,
        perCustomerUsageLimit: promotion.per_customer_usage_limit ?? null,
        remainingTotalUsage: usageLimit.remainingTotalUsage,
        startsAt: promotion.starts_at,
        endsAt: promotion.ends_at
      };
    })
    .filter((promotion) => promotion.remainingTotalUsage !== 0) satisfies PublicPromotion[];
}

export async function resolvePromotionForOrder({
  restaurantId,
  code,
  subtotal,
  deliveryFee,
  channel,
  customerSessionId
}: {
  restaurantId: string;
  code?: string;
  subtotal: number;
  deliveryFee?: number;
  channel: "QR_MENU" | "WEBSITE";
  customerSessionId?: string | null;
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
  if (!data) {
    throw new AppError("Mã khuyến mãi không khả dụng hoặc không áp dụng cho kênh đặt món này.", 400);
  }

  const promotion = withDefaultDiscountScope(data as Promotion);
  const usageCounts = await readPromotionUsageCounts(supabase, {
    restaurantId,
    promotionIds: [promotion.id],
    customerSessionId
  });
  const usage = usageCounts.get(promotion.id);
  const usageLimit = evaluatePromotionUsageLimit({
    totalUsageLimit: promotion.total_usage_limit,
    perCustomerUsageLimit: customerSessionId ? promotion.per_customer_usage_limit : null,
    totalUsed: usage?.totalUsed ?? 0,
    customerUsed: usage?.customerUsed ?? 0
  });
  if (!usageLimit.available) {
    if (usageLimit.reason === "customer_limit_reached") {
      throw new AppError(`Bạn đã dùng hết lượt cho mã ${promotion.code}.`, 400);
    }
    throw new AppError(`Mã ${promotion.code} đã hết lượt sử dụng.`, 400);
  }

  const evaluation = evaluatePromotionDiscount({
    itemSubtotal: subtotal,
    deliveryFee,
    rule: {
      discountScope: promotion.discount_scope,
      discountType: promotion.discount_type,
      discountValue: promotion.discount_value,
      minOrderAmount: promotion.min_order_amount
    }
  });
  if (!evaluation.eligible) {
    if (evaluation.reason === "minimum_not_met") {
      throw new AppError(`Đơn hàng cần thêm ${evaluation.missingAmount.toLocaleString("vi-VN")}đ để áp dụng mã ${promotion.code}.`, 400);
    }
    if (promotion.discount_scope === "DELIVERY_FEE") {
      throw new AppError("Mã này chỉ áp dụng khi đơn có phí giao hàng hợp lệ.", 400);
    }
    throw new AppError("Mã khuyến mãi chưa đủ điều kiện áp dụng.", 400);
  }

  return { promotion, discountAmount: evaluation.discountAmount };
}

export async function createPromotion(
  restaurantId: string,
  input: {
    name: string;
    code: string;
    discountScope?: "ORDER" | "DELIVERY_FEE";
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    minOrderAmount?: number;
    totalUsageLimit?: number | null;
    perCustomerUsageLimit?: number | null;
    startsAt?: string;
    endsAt?: string;
    channels: string[];
  }
) {
  const supabase = await createServerSupabaseClient();
  const payload = {
    restaurant_id: restaurantId,
    name: input.name,
    code: input.code,
    discount_scope: input.discountScope ?? "ORDER",
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? 0,
    total_usage_limit: input.totalUsageLimit ?? null,
    per_customer_usage_limit: input.perCustomerUsageLimit ?? null,
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    channels: input.channels
  } satisfies Database["public"]["Tables"]["promotions"]["Insert"];

  let { data, error } = await supabase
    .from("promotions")
    .insert(payload)
    .select()
    .single();

  if (isMissingPromotionDiscountScope(error)) {
    const {
      discount_scope: _discountScope,
      total_usage_limit: _totalUsageLimit,
      per_customer_usage_limit: _perCustomerUsageLimit,
      ...legacyPayload
    } = payload;
    void _discountScope;
    void _totalUsageLimit;
    void _perCustomerUsageLimit;
    ({ data, error } = await supabase
      .from("promotions")
      .insert(legacyPayload)
      .select()
      .single());
  }

  throwPromotionWriteError(error, input.code);
  return withDefaultDiscountScope(data as Promotion);
}

export async function updatePromotion(
  restaurantId: string,
  input: {
    promotionId: string;
    name: string;
    code: string;
    discountScope?: "ORDER" | "DELIVERY_FEE";
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    minOrderAmount?: number;
    totalUsageLimit?: number | null;
    perCustomerUsageLimit?: number | null;
    startsAt?: string;
    endsAt?: string;
    channels: string[];
  }
) {
  const supabase = await createServerSupabaseClient();
  const payload = {
    name: input.name,
    code: input.code,
    discount_scope: input.discountScope ?? "ORDER",
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? 0,
    total_usage_limit: input.totalUsageLimit ?? null,
    per_customer_usage_limit: input.perCustomerUsageLimit ?? null,
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    channels: input.channels
  } satisfies Database["public"]["Tables"]["promotions"]["Update"];

  let { data, error } = await supabase
    .from("promotions")
    .update(payload)
    .eq("id", input.promotionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  if (isMissingPromotionDiscountScope(error)) {
    const {
      discount_scope: _discountScope,
      total_usage_limit: _totalUsageLimit,
      per_customer_usage_limit: _perCustomerUsageLimit,
      ...legacyPayload
    } = payload;
    void _discountScope;
    void _totalUsageLimit;
    void _perCustomerUsageLimit;
    ({ data, error } = await supabase
      .from("promotions")
      .update(legacyPayload)
      .eq("id", input.promotionId)
      .eq("restaurant_id", restaurantId)
      .select()
      .single());
  }

  throwPromotionWriteError(error, input.code);
  return withDefaultDiscountScope(data as Promotion);
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
  return withDefaultDiscountScope(data as Promotion);
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
  return withDefaultDiscountScope(data as Promotion);
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
