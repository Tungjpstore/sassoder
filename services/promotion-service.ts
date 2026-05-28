import type { PostgrestError } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { calculatePromotionDiscountAmount, evaluatePromotionDiscount, type PromotionOrderLineInput } from "@/lib/promotion-discount";
import { DEFAULT_RESTAURANT_TIMEZONE, promotionDateTimeToUtcIso } from "@/lib/promotion-timezone";
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

type PromotionRewardType = "DISCOUNT" | "FREE_ITEM";
type PromotionRewardFields = {
  reward_type?: PromotionRewardType | null;
  free_item_menu_item_id?: string | null;
  free_item_quantity?: number | null;
};
type PromotionWritePayload = {
  restaurant_id?: string;
  name: string;
  code: string;
  discount_scope: "ORDER" | "DELIVERY_FEE";
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  min_order_amount: number;
  total_usage_limit: number | null;
  per_customer_usage_limit: number | null;
  reward_type: PromotionRewardType;
  free_item_menu_item_id: string | null;
  free_item_quantity: number;
  starts_at: string | null;
  ends_at: string | null;
  channels: string[];
  is_active?: boolean;
  show_on_customer_menu?: boolean;
};

type PromotionDiscountConfig = Pick<Promotion, "discount_type" | "discount_value" | "min_order_amount"> & {
  discount_scope?: "ORDER" | "DELIVERY_FEE" | null;
  reward_type?: PromotionRewardType | null;
  free_item_menu_item_id?: string | null;
  free_item_quantity?: number | null;
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
  reward_type?: "DISCOUNT" | "FREE_ITEM" | null;
  free_item_menu_item_id?: string | null;
  free_item_quantity?: number | null;
  starts_at: string | null;
  ends_at: string | null;
};
type PromotionUsageCounts = {
  counts: Map<string, { totalUsed: number; customerUsed: number }>;
  hasCustomerKeyColumn: boolean;
};
type PromotionUsageRow = {
  promotion_id: string | null;
  promotion_customer_key_hash?: string | null;
};

const publicPromotionSelect = "id,name,code,discount_scope,discount_type,discount_value,min_order_amount,total_usage_limit,per_customer_usage_limit,reward_type,free_item_menu_item_id,free_item_quantity,starts_at,ends_at";
const legacyPublicPromotionSelect = publicPromotionSelect
  .replace("discount_scope,", "")
  .replace("total_usage_limit,per_customer_usage_limit,", "")
  .replace("reward_type,free_item_menu_item_id,free_item_quantity,", "");
const promotionDashboardCacheTtlMs = 10_000;
const promotionsCache = new Map<string, { expiresAt: number; value: Promotion[] }>();
const promotionUsageCache = new Map<string, { expiresAt: number; value: PromotionUsageSummary[] }>();

function readCachedPromotionValue<T>(cache: Map<string, { expiresAt: number; value: T }>, restaurantId: string) {
  const cached = cache.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(restaurantId);
    return null;
  }
  return cached.value;
}

function writeCachedPromotionValue<T>(cache: Map<string, { expiresAt: number; value: T }>, restaurantId: string, value: T) {
  cache.set(restaurantId, {
    value,
    expiresAt: Date.now() + promotionDashboardCacheTtlMs
  });
}

function invalidatePromotionDashboardCache(restaurantId: string) {
  promotionsCache.delete(restaurantId);
  promotionUsageCache.delete(restaurantId);
}

function isMissingPromotionDiscountScope(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /discount_scope|total_usage_limit|per_customer_usage_limit|reward_type|free_item_menu_item_id|free_item_quantity/i.test(message)
  );
}

function throwPromotionWriteError(error: PostgrestError | null, code: string) {
  if ((error as { code?: string } | null)?.code === "23505") {
    throw new AppError(`Mã ${code} đã tồn tại trong quán. Vui lòng dùng mã khác.`, 409);
  }
  throwIfSupabaseError(error);
}

function isMissingPromotionCustomerKeySchema(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    /promotion_customer_key_hash/i.test(message)
  );
}

function withDefaultDiscountScope<T extends { discount_scope?: "ORDER" | "DELIVERY_FEE" | null } & PromotionRewardFields>(promotion: T) {
  return {
    ...promotion,
    discount_scope: promotion.discount_scope ?? "ORDER",
    total_usage_limit: "total_usage_limit" in promotion ? promotion.total_usage_limit ?? null : null,
    per_customer_usage_limit: "per_customer_usage_limit" in promotion ? promotion.per_customer_usage_limit ?? null : null,
    reward_type: promotionRewardType(promotion.reward_type),
    free_item_menu_item_id: promotion.free_item_menu_item_id ?? null,
    free_item_quantity: promotion.free_item_quantity ?? 1
  };
}

function promotionRewardType(value: unknown): PromotionRewardType {
  return value === "FREE_ITEM" ? "FREE_ITEM" : "DISCOUNT";
}

async function readPromotionUsageCounts(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  input: {
    restaurantId: string;
    promotionIds: string[];
    customerKeyHash?: string | null;
  }
): Promise<PromotionUsageCounts> {
  if (input.promotionIds.length === 0) {
    return { counts: new Map<string, { totalUsed: number; customerUsed: number }>(), hasCustomerKeyColumn: true };
  }

  let hasCustomerKeyColumn = true;
  let rows: PromotionUsageRow[] | null = null;
  const usageResult = await supabase
    .from("orders")
    .select("promotion_id,promotion_customer_key_hash")
    .eq("restaurant_id", input.restaurantId)
    .in("promotion_id", input.promotionIds)
    .neq("status", "cancelled");

  if (isMissingPromotionCustomerKeySchema(usageResult.error)) {
    hasCustomerKeyColumn = false;
    const fallbackResult = await supabase
      .from("orders")
      .select("promotion_id")
      .eq("restaurant_id", input.restaurantId)
      .in("promotion_id", input.promotionIds)
      .neq("status", "cancelled");
    throwIfSupabaseError(fallbackResult.error);
    rows = fallbackResult.data as PromotionUsageRow[] | null;
  } else {
    throwIfSupabaseError(usageResult.error);
    rows = usageResult.data as PromotionUsageRow[] | null;
  }

  const counts = new Map<string, { totalUsed: number; customerUsed: number }>();
  for (const row of rows ?? []) {
    if (!row.promotion_id) continue;
    const current = counts.get(row.promotion_id) ?? { totalUsed: 0, customerUsed: 0 };
    current.totalUsed += 1;
    if (input.customerKeyHash && row.promotion_customer_key_hash === input.customerKeyHash) {
      current.customerUsed += 1;
    }
    counts.set(row.promotion_id, current);
  }

  return { counts, hasCustomerKeyColumn };
}

async function readRestaurantPromotionTimezone(supabase: ReturnType<typeof createServerSupabaseClient> | ReturnType<typeof createAdminSupabaseClient>, restaurantId: string) {
  const client = await supabase;
  const { data, error } = await client.from("restaurants").select("timezone").eq("id", restaurantId).maybeSingle();
  if ((error as PostgrestError | null)?.code === "42703" || (error as PostgrestError | null)?.code === "PGRST204") {
    return DEFAULT_RESTAURANT_TIMEZONE;
  }
  throwIfSupabaseError(error);
  const timezone = (data as { timezone?: string | null } | null)?.timezone;
  return timezone?.trim() || DEFAULT_RESTAURANT_TIMEZONE;
}

function parsePromotionDateTime(value: string | undefined, timezone: string, label: string) {
  const parsed = promotionDateTimeToUtcIso(value, timezone);
  if (value?.trim() && !parsed) {
    throw new AppError(`${label} khuyến mãi không hợp lệ.`, 400);
  }
  return parsed;
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
  const cached = readCachedPromotionValue(promotionsCache, restaurantId);
  if (cached) return cached;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error);
  const promotions = (data ?? []).map((promotion) => withDefaultDiscountScope(promotion)) as Promotion[];
  writeCachedPromotionValue(promotionsCache, restaurantId, promotions);
  return promotions;
}

export async function listPromotionUsageSummary(restaurantId: string) {
  const cached = readCachedPromotionValue(promotionUsageCache, restaurantId);
  if (cached) return cached;

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

  const usage = [...byPromotion.values()];
  writeCachedPromotionValue(promotionUsageCache, restaurantId, usage);
  return usage;
}

export function calculatePromotionDiscount(input: {
  itemSubtotal: number;
  deliveryFee?: number;
  promotion: PromotionDiscountConfig;
  items?: PromotionOrderLineInput[];
}) {
  return calculatePromotionDiscountAmount({
    itemSubtotal: input.itemSubtotal,
    deliveryFee: input.deliveryFee,
    items: input.items,
    rule: {
      rewardType: promotionRewardType(input.promotion.reward_type),
      discountScope: input.promotion.discount_scope ?? "ORDER",
      discountType: input.promotion.discount_type,
      discountValue: input.promotion.discount_value,
      minOrderAmount: input.promotion.min_order_amount,
      freeItemMenuItemId: input.promotion.free_item_menu_item_id ?? null,
      freeItemQuantity: input.promotion.free_item_quantity ?? null
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
  const usageResult = await readPromotionUsageCounts(supabase, {
    restaurantId,
    promotionIds: rows.filter((promotion) => promotion.total_usage_limit).map((promotion) => promotion.id)
  });

  return rows
    .map((promotion) => {
      const usage = usageResult.counts.get(promotion.id);
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
        rewardType: promotionRewardType(promotion.reward_type),
        freeItemMenuItemId: promotion.free_item_menu_item_id ?? null,
        freeItemQuantity: promotion.free_item_quantity ?? 1,
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
  customerKeyHash,
  items
}: {
  restaurantId: string;
  code?: string;
  subtotal: number;
  deliveryFee?: number;
  channel: "QR_MENU" | "WEBSITE";
  customerKeyHash?: string | null;
  items?: PromotionOrderLineInput[];
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
  const usageResult = await readPromotionUsageCounts(supabase, {
    restaurantId,
    promotionIds: [promotion.id],
    customerKeyHash
  });
  if (promotion.per_customer_usage_limit && !customerKeyHash) {
    throw new AppError(`Mã ${promotion.code} cần định danh khách an toàn trước khi áp dụng.`, 400);
  }
  if (promotion.per_customer_usage_limit && !usageResult.hasCustomerKeyColumn) {
    throw new AppError(`Mã ${promotion.code} cần nâng cấp định danh khách an toàn trước khi áp dụng.`, 400);
  }
  const usage = usageResult.counts.get(promotion.id);
  const usageLimit = evaluatePromotionUsageLimit({
    totalUsageLimit: promotion.total_usage_limit,
    perCustomerUsageLimit: customerKeyHash ? promotion.per_customer_usage_limit : null,
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
    items,
    rule: {
      rewardType: promotionRewardType(promotion.reward_type),
      discountScope: promotion.discount_scope,
      discountType: promotion.discount_type,
      discountValue: promotion.discount_value,
      minOrderAmount: promotion.min_order_amount,
      freeItemMenuItemId: promotion.free_item_menu_item_id ?? null,
      freeItemQuantity: promotion.free_item_quantity ?? null
    }
  });
  if (!evaluation.eligible) {
    if (evaluation.reason === "minimum_not_met") {
      throw new AppError(`Đơn hàng cần thêm ${evaluation.missingAmount.toLocaleString("vi-VN")}đ để áp dụng mã ${promotion.code}.`, 400);
    }
    if (promotion.discount_scope === "DELIVERY_FEE") {
      throw new AppError("Mã này chỉ áp dụng khi đơn có phí giao hàng hợp lệ.", 400);
    }
    if (promotion.reward_type === "FREE_ITEM") {
      throw new AppError("Mã này chỉ áp dụng khi đơn có món quà tặng hợp lệ.", 400);
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
    rewardType?: "DISCOUNT" | "FREE_ITEM";
    freeItemMenuItemId?: string | null;
    freeItemQuantity?: number | null;
    startsAt?: string;
    endsAt?: string;
    channels: string[];
    isActive?: boolean;
    showOnCustomerMenu?: boolean;
  }
) {
  const supabase = await createServerSupabaseClient();
  const timezone = await readRestaurantPromotionTimezone(supabase, restaurantId);
  const payload: PromotionWritePayload = {
    restaurant_id: restaurantId,
    name: input.name,
    code: input.code,
    discount_scope: input.discountScope ?? "ORDER",
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? 0,
    total_usage_limit: input.totalUsageLimit ?? null,
    per_customer_usage_limit: input.perCustomerUsageLimit ?? null,
    reward_type: input.rewardType ?? "DISCOUNT",
    free_item_menu_item_id: input.freeItemMenuItemId ?? null,
    free_item_quantity: input.freeItemQuantity ?? 1,
    starts_at: parsePromotionDateTime(input.startsAt, timezone, "Thời gian bắt đầu"),
    ends_at: parsePromotionDateTime(input.endsAt, timezone, "Thời gian kết thúc"),
    channels: input.channels,
    is_active: input.isActive ?? true,
    show_on_customer_menu: input.showOnCustomerMenu ?? true
  };

  let { data, error } = await supabase
    .from("promotions")
    .insert(payload as Database["public"]["Tables"]["promotions"]["Insert"])
    .select()
    .single();

  if (isMissingPromotionDiscountScope(error)) {
    const {
      discount_scope: _discountScope,
      total_usage_limit: _totalUsageLimit,
      per_customer_usage_limit: _perCustomerUsageLimit,
      reward_type: _rewardType,
      free_item_menu_item_id: _freeItemMenuItemId,
      free_item_quantity: _freeItemQuantity,
      ...legacyPayload
    } = payload;
    void _discountScope;
    void _totalUsageLimit;
    void _perCustomerUsageLimit;
    void _rewardType;
    void _freeItemMenuItemId;
    void _freeItemQuantity;
    ({ data, error } = await supabase
      .from("promotions")
      .insert(legacyPayload as Database["public"]["Tables"]["promotions"]["Insert"])
      .select()
      .single());
  }

  throwPromotionWriteError(error, input.code);
  invalidatePromotionDashboardCache(restaurantId);
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
    rewardType?: "DISCOUNT" | "FREE_ITEM";
    freeItemMenuItemId?: string | null;
    freeItemQuantity?: number | null;
    startsAt?: string;
    endsAt?: string;
    channels: string[];
  }
) {
  const supabase = await createServerSupabaseClient();
  const timezone = await readRestaurantPromotionTimezone(supabase, restaurantId);
  const payload: Omit<PromotionWritePayload, "restaurant_id" | "is_active" | "show_on_customer_menu"> = {
    name: input.name,
    code: input.code,
    discount_scope: input.discountScope ?? "ORDER",
    discount_type: input.discountType,
    discount_value: input.discountValue,
    min_order_amount: input.minOrderAmount ?? 0,
    total_usage_limit: input.totalUsageLimit ?? null,
    per_customer_usage_limit: input.perCustomerUsageLimit ?? null,
    reward_type: input.rewardType ?? "DISCOUNT",
    free_item_menu_item_id: input.freeItemMenuItemId ?? null,
    free_item_quantity: input.freeItemQuantity ?? 1,
    starts_at: parsePromotionDateTime(input.startsAt, timezone, "Thời gian bắt đầu"),
    ends_at: parsePromotionDateTime(input.endsAt, timezone, "Thời gian kết thúc"),
    channels: input.channels
  };

  let { data, error } = await supabase
    .from("promotions")
    .update(payload as Database["public"]["Tables"]["promotions"]["Update"])
    .eq("id", input.promotionId)
    .eq("restaurant_id", restaurantId)
    .select()
    .single();

  if (isMissingPromotionDiscountScope(error)) {
    const {
      discount_scope: _discountScope,
      total_usage_limit: _totalUsageLimit,
      per_customer_usage_limit: _perCustomerUsageLimit,
      reward_type: _rewardType,
      free_item_menu_item_id: _freeItemMenuItemId,
      free_item_quantity: _freeItemQuantity,
      ...legacyPayload
    } = payload;
    void _discountScope;
    void _totalUsageLimit;
    void _perCustomerUsageLimit;
    void _rewardType;
    void _freeItemMenuItemId;
    void _freeItemQuantity;
    ({ data, error } = await supabase
      .from("promotions")
      .update(legacyPayload as Database["public"]["Tables"]["promotions"]["Update"])
      .eq("id", input.promotionId)
      .eq("restaurant_id", restaurantId)
      .select()
      .single());
  }

  throwPromotionWriteError(error, input.code);
  invalidatePromotionDashboardCache(restaurantId);
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
  invalidatePromotionDashboardCache(restaurantId);
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
  invalidatePromotionDashboardCache(restaurantId);
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
  invalidatePromotionDashboardCache(restaurantId);
}
