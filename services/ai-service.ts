import "server-only";

import { runAiCompletion } from "@/lib/ai/router/model-router";
import { persistAiConversationMessage } from "@/lib/ai/memory/restaurant-memory";
import type { AiCompletionResult, AiProvider, AiProviderConfig, AiTaskType } from "@/lib/ai/router/types";
import { AppError } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildCustomerAgentActions, buildCustomerAgentPlan, buildOwnerAgentActions, buildOwnerAgentPlan } from "@/services/ai-agent-actions";
import {
  buildBrandingMessages,
  buildCustomerAssistantMessages,
  buildImageGenerationPrompt,
  buildMenuOcrPrompt,
  buildOwnerAssistantMessages,
  buildStoreSetupDraftMessages,
  buildStoreSetupPlanMessages,
  customerAiIntentConfig,
  normalizeStoreSetupDraftKind,
  normalizeCustomerAiIntent,
  normalizeOwnerAiIntent,
  ownerAiIntentConfig,
  storeSetupDraftConfig,
  type AiPromptMessage,
  type AiRestaurantContext,
  type CustomerAiIntent,
  type OwnerAiIntent,
  type StoreSetupDraftKind
} from "@/services/ai-prompt-router";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import { assertFeatureEntitlement, planFeatureLabels, type PlanFeatureKey } from "@/services/subscription-service";
import type { Database } from "@/types/supabase";

type AiRequestKind = "chat" | "ocr" | "image" | "speech" | "tool";
type AiMessage = AiPromptMessage;
type RestaurantAiContext = AiRestaurantContext;
type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];
type LegacyAiCompletionResult = Omit<AiCompletionResult, "attempts">;
type NativeAiProviderConfig = Pick<AiProviderConfig, "provider" | "baseUrl" | "apiKey">;

function sanitizeAssistantText(value: string, maxLength = 900) {
  return value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

type AiImageResult = {
  imageUrl: string | null;
  prompt: string;
  provider: AiProvider | "prompt-only";
  model: string;
  raw?: unknown;
};

const qwenNativeBaseUrl = "https://dashscope-intl.aliyuncs.com";
const xaiNativeBaseUrl = "https://api.x.ai";

const providerDefaults = {
  qwenChatModel: process.env.QWEN_MODEL || process.env.QWEN_CHAT_MODEL || "qwen-plus",
  qwenFastModel: process.env.QWEN_FAST_MODEL || process.env.QWEN_MODEL || "qwen-plus",
  qwenOcrModel: process.env.QWEN_OCR_MODEL || "qwen-vl-ocr",
  qwenImageModel: process.env.QWEN_IMAGE_MODEL || "qwen-image-2.0-pro",
  xaiChatModel: process.env.XAI_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini-beta",
  xaiImageModel: process.env.XAI_IMAGE_MODEL || "grok-imagine-image"
};

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getProviderConfig(preferred?: AiProvider): NativeAiProviderConfig {
  const qwenKey = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const qwenBaseUrl = (
    process.env.QWEN_NATIVE_BASE_URL ||
    process.env.DASHSCOPE_NATIVE_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    qwenNativeBaseUrl
  )
    .replace(/\/compatible-mode\/v1\/?$/, "")
    .replace(/\/$/, "");
  const xaiBaseUrl = (process.env.XAI_NATIVE_BASE_URL || process.env.XAI_BASE_URL || xaiNativeBaseUrl)
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "");

  if (preferred === "qwen" && qwenKey) {
    return {
      provider: "qwen",
      baseUrl: qwenBaseUrl,
      apiKey: qwenKey
    };
  }

  if (preferred === "xai" && xaiKey) {
    return {
      provider: "xai",
      baseUrl: xaiBaseUrl,
      apiKey: xaiKey
    };
  }

  if (qwenKey) {
    return {
      provider: "qwen",
      baseUrl: qwenBaseUrl,
      apiKey: qwenKey
    };
  }

  if (xaiKey) {
    return {
      provider: "xai",
      baseUrl: xaiBaseUrl,
      apiKey: xaiKey
    };
  }

  throw new AppError("Chưa cấu hình QWEN_API_KEY/DASHSCOPE_API_KEY hoặc XAI_API_KEY cho tính năng AI.", 500);
}

function normalizeAiProvider(value?: string | null): AiProvider | undefined {
  return value === "qwen" || value === "xai" ? value : undefined;
}

function normalizePrompt(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 4000);
}

function allowPromptOnlyImageFallback() {
  return process.env.AI_IMAGE_ALLOW_PROMPT_FALLBACK === "true";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function getRestaurantContext(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán để chạy AI.", 404);
  return data as RestaurantAiContext;
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function safeSupabaseQuery<T>(query: PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  return data ?? null;
}

async function safeSupabaseCount(query: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>) {
  const { count, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

function compactOrder(row: any) {
  const table = firstOrNull(row.table);
  const orderId = String(row.id ?? "");
  return {
    id: orderId,
    shortId: orderId.slice(0, 8).toUpperCase(),
    status: row.status ?? null,
    total: Number(row.total ?? 0),
    paymentStatus: row.payment_status ?? null,
    paymentMethod: row.payment_method ?? null,
    fulfillmentType: row.fulfillment_type ?? "DINE_IN",
    tableName: table?.name ?? (row.fulfillment_type === "DELIVERY" ? "Giao hàng" : row.fulfillment_type === "PICKUP" ? "Đến lấy" : "Không rõ bàn"),
    customerName: row.customer_name ?? null,
    deliveryAddress: row.delivery_address ?? null,
    deliveryDistanceKm: row.delivery_distance_km ?? null,
    createdAt: row.created_at ?? null,
    acceptedAt: row.accepted_at ?? null,
    servedAt: row.served_at ?? null,
    serviceDueAt: row.service_due_at ?? null,
    items: ((row.items ?? []) as any[]).slice(0, 6).map((item) => {
      const menuItem = firstOrNull(item.menuItem);
      return {
        name: menuItem?.name ?? "Món chưa rõ",
        quantity: Number(item.quantity ?? 0),
        price: Number(item.price ?? 0),
        note: item.note ?? null
      };
    })
  };
}

function countRowsBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function intentNeeds(intent: OwnerAiIntent, candidates: OwnerAiIntent[]) {
  return intent === "overview" || intent === "setup" || candidates.includes(intent);
}

async function getRestaurantSetupBundle(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurant, tableCount, menuItemCount, categoryCount, staffCount, promotionCount] = await Promise.all([
    safeSupabaseQuery<RestaurantRow>(supabase.from("restaurants").select("*").eq("id", restaurantId).maybeSingle()),
    safeSupabaseCount(supabase.from("tables").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("menu_categories").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("users").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId)),
    safeSupabaseCount(supabase.from("promotions").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId))
  ]);

  if (!restaurant) throw new AppError("Không tìm thấy quán để AI thiết lập.", 404);
  return {
    restaurant,
    metrics: {
      tableCount,
      menuItemCount,
      categoryCount,
      staffCount,
      promotionCount
    }
  };
}

async function getOwnerOperationalSnapshot(restaurantId: string, intent: OwnerAiIntent, restaurant: RestaurantAiContext) {
  const supabase = createAdminSupabaseClient() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthStart = monthStartIso();

  const recentOrdersPromise = safeSupabaseQuery<any[]>(
    supabase
      .from("orders")
      .select(
        "id,status,total,payment_method,payment_status,fulfillment_type,customer_name,delivery_address,delivery_distance_km,created_at,accepted_at,served_at,service_due_at,table:tables(name),items:order_items(quantity,price,note,menuItem:menu_items(name))"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(12)
  );

  const todayOrdersPromise = safeSupabaseQuery<any[]>(
    supabase
      .from("orders")
      .select("id,status,total,payment_status,payment_method,fulfillment_type,created_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(150)
  );

  const menuPromise = intentNeeds(intent, ["menu", "reports", "growth"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("menu_categories")
          .select("id,name,items:menu_items(id,category_id,name,price,image_url,is_available)")
          .eq("restaurant_id", restaurantId)
          .order("name", { ascending: true })
          .order("name", { referencedTable: "menu_items", ascending: true })
      )
    : Promise.resolve(null);

  const tablesPromise = intentNeeds(intent, ["tables", "orders", "kitchen"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("tables")
          .select("id,name,area,capacity,qr_enabled,orders:orders(id,status,total,created_at,service_due_at)")
          .eq("restaurant_id", restaurantId)
          .in("orders.status", ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"])
          .order("name", { ascending: true })
      )
    : Promise.resolve(null);

  const paymentsPromise = intentNeeds(intent, ["payments", "reports"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("payment_logs")
          .select("id,order_id,method,status,amount,created_at,order:orders!inner(restaurant_id,total,status,created_at)")
          .eq("order.restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(30)
      )
    : Promise.resolve(null);

  const promotionsPromise = intentNeeds(intent, ["promotions", "growth", "menu"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("promotions")
          .select("id,name,code,discount_type,discount_value,min_order_amount,is_active,show_on_customer_menu,starts_at,ends_at,channels")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(20)
      )
    : Promise.resolve(null);

  const reservationsPromise = intentNeeds(intent, ["reservations", "reports"])
    ? safeSupabaseQuery<any[]>(
        supabase
          .from("reservations")
          .select("id,status,customer_name,party_size,starts_at,ends_at,hold_expires_at,deposit_required_amount,deposit_status,created_at")
          .eq("restaurant_id", restaurantId)
          .order("starts_at", { ascending: true })
          .limit(30)
      )
    : Promise.resolve(null);

  const [recentOrdersRaw, todayOrdersRaw, menuRaw, tablesRaw, paymentsRaw, promotionsRaw, reservationsRaw] = await Promise.all([
    recentOrdersPromise,
    todayOrdersPromise,
    menuPromise,
    tablesPromise,
    paymentsPromise,
    promotionsPromise,
    reservationsPromise
  ]);

  const todayOrders = todayOrdersRaw ?? [];
  const paidRevenue = todayOrders
    .filter((order) => order.status === "paid" || order.payment_status === "paid")
    .reduce((sum, order) => sum + Number(order.total ?? 0), 0);

  const menuCategories = (menuRaw ?? []).map((category) => {
    const items = ((category.items ?? []) as any[]).map((item) => ({
      id: String(item.id ?? ""),
      categoryId: String(item.category_id ?? category.id ?? ""),
      categoryName: category.name,
      name: item.name,
      price: Number(item.price ?? 0),
      image: item.image_url ?? null,
      available: Boolean(item.is_available)
    }));
    return {
      name: category.name,
      itemCount: items.length,
      availableCount: items.filter((item) => item.available).length,
      unavailableCount: items.filter((item) => !item.available).length,
      sampleItems: items.slice(0, 8)
    };
  });

  const tables = (tablesRaw ?? []).map((table) => {
    const orders = ((table.orders ?? []) as any[]).filter(Boolean);
    return {
      id: String(table.id ?? "").slice(0, 8),
      name: table.name,
      area: table.area,
      capacity: table.capacity,
      qrEnabled: table.qr_enabled,
      activeOrderCount: orders.length,
      unpaidTotal: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      statuses: countRowsBy(orders, "status"),
      nextServiceDueAt: orders
        .map((order) => order.service_due_at)
        .filter(Boolean)
        .sort()[0] ?? null
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    intent,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      businessType: restaurant.business_type,
      address: restaurant.address,
      hotline: restaurant.hotline,
      setupReadiness:
        intent === "setup"
          ? await getRestaurantSetupBundle(restaurantId)
              .then((bundle) => buildStoreSetupReadiness(bundle.restaurant, bundle.metrics))
              .catch(() => null)
          : null
    },
    summary24h: {
      orderCount: todayOrders.length,
      statusCount: countRowsBy(todayOrders, "status"),
      paymentStatusCount: countRowsBy(todayOrders, "payment_status"),
      fulfillmentCount: countRowsBy(todayOrders, "fulfillment_type"),
      paidRevenue,
      monthStart
    },
    recentOrders: (recentOrdersRaw ?? []).map(compactOrder),
    menu: menuCategories.length
      ? {
          categoryCount: menuCategories.length,
          itemCount: menuCategories.reduce((sum, category) => sum + category.itemCount, 0),
          unavailableCount: menuCategories.reduce((sum, category) => sum + category.unavailableCount, 0),
          categories: menuCategories
        }
      : null,
    tables: tables.length
      ? {
          tableCount: tables.length,
          qrDisabledCount: tables.filter((table) => !table.qrEnabled).length,
          activeTableCount: tables.filter((table) => table.activeOrderCount > 0).length,
          tables
        }
      : null,
    payments: paymentsRaw
      ? {
          count: paymentsRaw.length,
          waitingConfirm: paymentsRaw.filter((payment) => payment.status === "waiting_confirm" || payment.status === "pending").length,
          logs: paymentsRaw.slice(0, 12).map((payment) => ({
            id: String(payment.id ?? "").slice(0, 8),
            orderId: String(payment.order_id ?? "").slice(0, 8),
            method: payment.method,
            status: payment.status,
            amount: Number(payment.amount ?? 0),
            createdAt: payment.created_at
          }))
        }
      : null,
    promotions: promotionsRaw
      ? promotionsRaw.map((promotion) => ({
          id: String(promotion.id ?? "").slice(0, 8),
          name: promotion.name,
          code: promotion.code,
          active: promotion.is_active,
          showOnCustomerMenu: promotion.show_on_customer_menu,
          discountType: promotion.discount_type,
          discountValue: promotion.discount_value,
          minOrderAmount: promotion.min_order_amount,
          channels: promotion.channels,
          startsAt: promotion.starts_at,
          endsAt: promotion.ends_at
        }))
      : null,
    reservations: reservationsRaw
      ? reservationsRaw.map((reservation) => ({
          id: String(reservation.id ?? "").slice(0, 8),
          status: reservation.status,
          customerName: reservation.customer_name,
          partySize: reservation.party_size,
          startsAt: reservation.starts_at,
          endsAt: reservation.ends_at,
          holdExpiresAt: reservation.hold_expires_at,
          depositRequiredAmount: reservation.deposit_required_amount,
          depositStatus: reservation.deposit_status
        }))
      : null
  };
}

async function getCustomerMenuSnapshot(restaurantId: string, intent: CustomerAiIntent) {
  if (!["menu_discovery", "cart", "promotion", "allergy", "delivery"].includes(intent)) return null;

  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const [categoriesRaw, promotionsRaw, restaurantRaw] = await Promise.all([
    safeSupabaseQuery<any[]>(
      supabase
        .from("menu_categories")
        .select("id,name,items:menu_items(id,category_id,name,price,image_url,is_available)")
        .eq("restaurant_id", restaurantId)
        .eq("items.is_available", true)
        .order("name", { ascending: true })
        .order("name", { referencedTable: "menu_items", ascending: true })
        .limit(12)
    ),
    safeSupabaseQuery<any[]>(
      supabase
        .from("promotions")
        .select("name,code,discount_type,discount_value,min_order_amount,starts_at,ends_at")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .eq("show_on_customer_menu", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
    safeSupabaseQuery<any>(
      supabase
        .from("restaurants")
        .select("online_ordering_enabled,pickup_enabled,delivery_enabled,delivery_radius_km,free_delivery_radius_km,delivery_base_fee,delivery_fee_per_km,min_order_for_delivery,online_payment_mode")
        .eq("id", restaurantId)
        .maybeSingle()
    )
  ]);

  return {
    ordering: restaurantRaw ?? null,
    categories: (categoriesRaw ?? []).slice(0, 8).map((category) => ({
      name: category.name,
      items: ((category.items ?? []) as any[])
        .filter((item) => item.is_available)
        .slice(0, 10)
        .map((item) => ({
          id: String(item.id ?? ""),
          categoryId: String(item.category_id ?? category.id ?? ""),
          categoryName: category.name,
          name: item.name,
          price: Number(item.price ?? 0),
          image: item.image_url ?? null
        }))
    })),
    promotions: (promotionsRaw ?? []).map((promotion) => ({
      name: promotion.name,
      code: promotion.code,
      discountType: promotion.discount_type,
      discountValue: promotion.discount_value,
      minOrderAmount: promotion.min_order_amount,
      startsAt: promotion.starts_at,
      endsAt: promotion.ends_at
    }))
  };
}

export async function getRestaurantIdBySlug(slug: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase.from("restaurants").select("id").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán.", 404);
  return data.id as string;
}

async function logAiUsage({
  restaurantId,
  userId,
  customerSessionId,
  featureKey,
  provider,
  model,
  requestKind,
  status,
  inputTokens,
  outputTokens,
  imageCount,
  errorMessage,
  metadata
}: {
  restaurantId: string;
  userId?: string | null;
  customerSessionId?: string | null;
  featureKey: PlanFeatureKey;
  provider: AiProvider | "prompt-only";
  model: string;
  requestKind: AiRequestKind;
  status: "success" | "failed" | "blocked";
  inputTokens?: number | null;
  outputTokens?: number | null;
  imageCount?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("ai_usage_logs").insert({
    restaurant_id: restaurantId,
    user_id: userId ?? null,
    customer_session_id: customerSessionId ?? null,
    feature_key: featureKey,
    provider,
    model,
    request_kind: requestKind,
    status,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    image_count: imageCount ?? null,
    error_message: errorMessage ?? null,
    metadata: metadata ?? {}
  });

  if (error && !isMissingSchemaError(error)) throw error;
}

async function assertAiEntitlement({
  restaurantId,
  featureKey,
  userId,
  customerSessionId
}: {
  restaurantId: string;
  featureKey: PlanFeatureKey;
  userId?: string | null;
  customerSessionId?: string | null;
}) {
  const entitlement = await assertFeatureEntitlement(restaurantId, featureKey);
  const limit = entitlement.features[featureKey]?.limitValue;

  if (typeof limit === "number") {
    const supabase = createAdminSupabaseClient() as any;
    const { count, error } = await supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("feature_key", featureKey)
      .eq("status", "success")
      .gte("created_at", monthStartIso());

    if (error) {
      if (!isMissingSchemaError(error)) throw error;
    } else if (Number(count ?? 0) >= limit) {
      await logAiUsage({
        restaurantId,
        userId,
        customerSessionId,
        featureKey,
        provider: "prompt-only",
        model: "entitlement-guard",
        requestKind: "tool",
        status: "blocked",
        errorMessage: `Vượt giới hạn ${limit} lượt ${planFeatureLabels[featureKey]} trong tháng.`
      });
      throw new AppError(`Gói hiện tại giới hạn ${limit} lượt ${planFeatureLabels[featureKey]} mỗi tháng. Vui lòng nâng cấp hoặc chờ kỳ mới.`, 402);
    }
  }

  return entitlement;
}

async function qwenChat(
  config: NativeAiProviderConfig,
  model: string,
  messages: AiMessage[],
  options?: { jsonMode?: boolean; maxTokens?: number }
): Promise<LegacyAiCompletionResult> {
  const response = await fetch(`${config.baseUrl}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: options?.maxTokens,
      ...(options?.jsonMode ? { response_format: { type: "json_object" } } : {})
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "Qwen từ chối xử lý yêu cầu AI.", 502);
  }

  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    provider: "qwen",
    model,
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function qwenMultimodalOcr({
  config,
  prompt,
  imageUrl,
  imageBase64
}: {
  config: NativeAiProviderConfig;
  prompt: string;
  imageUrl?: string;
  imageBase64?: string;
}): Promise<LegacyAiCompletionResult> {
  const imagePayload = imageUrl || (imageBase64 ? `data:image/jpeg;base64,${imageBase64.replace(/^data:image\/[a-z+]+;base64,/i, "")}` : "");
  if (!imagePayload) throw new AppError("Thiếu ảnh menu để AI OCR.", 400);

  const response = await fetch(`${config.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: providerDefaults.qwenOcrModel,
      input: {
        messages: [
          {
            role: "user",
            content: [{ image: imagePayload }, { text: prompt }]
          }
        ]
      }
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "Qwen OCR không đọc được menu.", 502);
  }

  const content = json?.output?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content
        .map((part) => part?.text)
        .filter(Boolean)
        .join("\n")
    : String(content ?? json?.output?.text ?? "").trim();

  return {
    text,
    provider: "qwen",
    model: providerDefaults.qwenOcrModel,
    inputTokens: json?.usage?.input_tokens ?? json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.output_tokens ?? json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function xaiChat(config: NativeAiProviderConfig, model: string, messages: AiMessage[], options?: { maxTokens?: number }): Promise<LegacyAiCompletionResult> {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: options?.maxTokens
    })
  });

  const json = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new AppError(json?.message || json?.error?.message || "xAI từ chối xử lý yêu cầu AI.", 502);
  }

  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    provider: "xai",
    model,
    inputTokens: json?.usage?.prompt_tokens ?? null,
    outputTokens: json?.usage?.completion_tokens ?? null,
    raw: json
  };
}

async function runChat(
  messages: AiMessage[],
  preferred?: AiProvider,
  modelOverride?: string,
  options?: { jsonMode?: boolean; maxTokens?: number; cacheTtlMs?: number },
  taskType: AiTaskType = "dashboard_operation"
) {
  return runAiCompletion({
    taskType,
    messages,
    preferredProvider: preferred,
    modelOverride,
    options: {
      jsonMode: options?.jsonMode,
      maxTokens: options?.maxTokens,
      cacheTtlMs: options?.cacheTtlMs,
      timeoutMs: taskType === "customer_ordering" ? 8_000 : 14_000
    }
  });
}

export async function runOwnerAssistant(input: {
  restaurantId: string;
  userId: string;
  message: string;
  intent?: string | null;
  context?: Record<string, unknown>;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_owner_assistant", userId: input.userId });
  if (!rateLimit(`ai-owner:${input.restaurantId}:${input.userId}`, 24, 60_000)) {
    throw new AppError("Bạn đang hỏi AI quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const restaurant = await getRestaurantContext(input.restaurantId);
  const intent = normalizeOwnerAiIntent(input.intent, input.message);
  const snapshot = await getOwnerOperationalSnapshot(input.restaurantId, intent, restaurant);
  const messages = buildOwnerAssistantMessages({
    restaurant,
    intent,
    message: normalizePrompt(input.message),
    context: input.context,
    snapshot
  });

  try {
    const result = await runChat(
      messages,
      normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      undefined,
      { maxTokens: 260 },
      intent === "reports" ? "analytics_reasoning" : intent === "growth" ? "business_insight" : "dashboard_operation"
    );
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent }
    });
    const actions = buildOwnerAgentActions(intent, ownerAiIntentConfig[intent].suggestions, snapshot);
    const conversationId = await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      surface: "dashboard",
      role: "user",
      content: input.message,
      metadata: { intent, source: "owner_ai" }
    });
    await persistAiConversationMessage({
      restaurantId: input.restaurantId,
      conversationId,
      userId: input.userId,
      surface: "dashboard",
      role: "assistant",
      content: result.text,
      provider: result.provider,
      model: result.model,
      metadata: { intent, actions: actions.map((action) => action.id), attempts: result.attempts, latencyMs: result.latencyMs }
    });
    return {
      reply: sanitizeAssistantText(result.text, 520),
      provider: result.provider,
      model: result.model,
      intent,
      intentLabel: ownerAiIntentConfig[intent].label,
      suggestions: ownerAiIntentConfig[intent].suggestions,
      actions,
      agentPlan: buildOwnerAgentPlan(intent, actions)
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI owner assistant failed",
      metadata: { intent }
    });
    throw error;
  }
}

export async function generateStoreSetupPlan(input: {
  restaurantId: string;
  userId: string;
  mode?: "audit" | "express" | "growth";
  focus?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_owner_assistant", userId: input.userId });
  if (!rateLimit(`ai-setup:${input.restaurantId}:${input.userId}`, 10, 60_000)) {
    throw new AppError("Bạn đang yêu cầu AI setup quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const bundle = await getRestaurantSetupBundle(input.restaurantId);
  const readiness = buildStoreSetupReadiness(bundle.restaurant, bundle.metrics);
  const restaurant: RestaurantAiContext = {
    id: bundle.restaurant.id,
    name: bundle.restaurant.name,
    slug: bundle.restaurant.slug,
    business_type: bundle.restaurant.business_type,
    address: bundle.restaurant.address,
    hotline: bundle.restaurant.hotline,
    description: bundle.restaurant.description
  };
  const messages = buildStoreSetupPlanMessages({
    restaurant,
    readiness,
    mode: input.mode ?? "audit",
    focus: input.focus
  });

  try {
    const result = await runChat(
      messages,
      normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      undefined,
      { jsonMode: true, cacheTtlMs: 8_000 },
      "setup"
    );
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent: "setup", mode: input.mode ?? "audit" }
    });
    return {
      provider: result.provider,
      model: result.model,
      text: result.text,
      data: extractJsonObject(result.text),
      readiness,
      suggestions: ownerAiIntentConfig.setup.suggestions
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI setup plan failed",
      metadata: { intent: "setup", mode: input.mode ?? "audit" }
    });
    throw error;
  }
}

export async function generateStoreSetupDraft(input: {
  restaurantId: string;
  userId: string;
  kind?: string | null;
  focus?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_owner_assistant", userId: input.userId });
  if (!rateLimit(`ai-setup-draft:${input.restaurantId}:${input.userId}`, 12, 60_000)) {
    throw new AppError("Bạn đang yêu cầu AI tạo bản nháp quá nhanh. Vui lòng chờ một chút.", 429);
  }

  const kind = normalizeStoreSetupDraftKind(input.kind);
  const bundle = await getRestaurantSetupBundle(input.restaurantId);
  const readiness = buildStoreSetupReadiness(bundle.restaurant, bundle.metrics);
  const restaurant: RestaurantAiContext = {
    id: bundle.restaurant.id,
    name: bundle.restaurant.name,
    slug: bundle.restaurant.slug,
    business_type: bundle.restaurant.business_type,
    address: bundle.restaurant.address,
    hotline: bundle.restaurant.hotline,
    description: bundle.restaurant.description
  };
  const messages = buildStoreSetupDraftMessages({
    restaurant,
    readiness,
    kind: kind as StoreSetupDraftKind,
    focus: input.focus
  });

  try {
    const result = await runChat(
      messages,
      normalizeAiProvider(process.env.AI_OWNER_PROVIDER),
      providerDefaults.qwenFastModel,
      {
        jsonMode: true,
        cacheTtlMs: 8_000
      },
      "setup"
    );
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: result.provider,
      model: result.model,
      requestKind: "chat",
      status: "success",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      metadata: { intent: "setup", draftKind: kind }
    });
    return {
      provider: result.provider,
      model: result.model,
      text: result.text,
      data: extractJsonObject(result.text),
      readiness,
      config: storeSetupDraftConfig[kind]
    };
  } catch (error) {
    await logAiUsage({
      restaurantId: input.restaurantId,
      userId: input.userId,
      featureKey: "ai_owner_assistant",
      provider: "prompt-only",
      model: "failed-before-provider",
      requestKind: "chat",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "AI setup draft failed",
      metadata: { intent: "setup", draftKind: kind }
    });
    throw error;
  }
}

export async function runCustomerAssistant(input: {
  restaurantId: string;
  customerSessionId?: string | null;
  message: string;
  intent?: string | null;
  cart?: unknown;
  orderStatus?: unknown;
}) {
  await assertAiEntitlement({
    restaurantId: input.restaurantId,
    featureKey: "ai_customer_assistant",
    customerSessionId: input.customerSessionId
  });
  if (!rateLimit(`ai-customer:${input.restaurantId}:${input.customerSessionId || "anon"}`, 18, 60_000)) {
    throw new AppError("Bạn đang hỏi trợ lý quá nhanh. Vui lòng thử lại sau.", 429);
  }

  const restaurant = await getRestaurantContext(input.restaurantId);
  const intent = normalizeCustomerAiIntent(input.intent, input.message);
  const menuSnapshot = await getCustomerMenuSnapshot(input.restaurantId, intent);
  const messages = buildCustomerAssistantMessages({
    restaurant,
    intent,
    message: normalizePrompt(input.message),
    cart: input.cart,
    orderStatus: input.orderStatus,
    menuSnapshot
  });

  const result = await runChat(
    messages,
    normalizeAiProvider(process.env.AI_CUSTOMER_PROVIDER),
    providerDefaults.qwenFastModel,
    {
      maxTokens: 180
    },
    "customer_ordering"
  );
  await logAiUsage({
    restaurantId: input.restaurantId,
    customerSessionId: input.customerSessionId,
    featureKey: "ai_customer_assistant",
    provider: result.provider,
    model: result.model,
    requestKind: "chat",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    metadata: { intent }
  });
  const actions = buildCustomerAgentActions(intent, restaurant.slug, {
    menuSnapshot,
    cart: input.cart,
    orderStatus: input.orderStatus,
    message: input.message
  });
  const conversationId = await persistAiConversationMessage({
    restaurantId: input.restaurantId,
    customerSessionId: input.customerSessionId,
    surface: "customer",
    role: "user",
    content: input.message,
    metadata: { intent, source: "customer_ai" }
  });
  await persistAiConversationMessage({
    restaurantId: input.restaurantId,
    conversationId,
    customerSessionId: input.customerSessionId,
    surface: "customer",
    role: "assistant",
    content: result.text,
    provider: result.provider,
    model: result.model,
    metadata: { intent, actions: actions.map((action) => action.id), attempts: result.attempts, latencyMs: result.latencyMs }
  });
  return {
    reply: sanitizeAssistantText(result.text, 360),
    provider: result.provider,
    model: result.model,
    intent,
    intentLabel: customerAiIntentConfig[intent].label,
    suggestions: customerAiIntentConfig[intent].suggestions,
    actions,
    agentPlan: buildCustomerAgentPlan(intent, actions)
  };
}

export async function generateRestaurantBranding(input: {
  restaurantId: string;
  userId: string;
  restaurantName?: string;
  businessType?: string;
  tone?: string;
  audience?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_branding_studio", userId: input.userId });
  const restaurant = await getRestaurantContext(input.restaurantId);
  const result = await runChat(buildBrandingMessages({ restaurant, ...input }), "qwen", undefined, { jsonMode: true, cacheTtlMs: 20_000 }, "branding");
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_branding_studio",
    provider: result.provider,
    model: result.model,
    requestKind: "chat",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  });

  return {
    provider: result.provider,
    model: result.model,
    text: result.text,
    data: extractJsonObject(result.text)
  };
}

export async function generateMenuOcrDraft(input: {
  restaurantId: string;
  userId: string;
  imageUrl?: string;
  imageBase64?: string;
  rawText?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_menu_ocr", userId: input.userId });
  const prompt = buildMenuOcrPrompt(input);
  const result =
    input.imageUrl || input.imageBase64
      ? await qwenMultimodalOcr({
          config: getProviderConfig("qwen"),
          prompt,
          imageUrl: input.imageUrl,
          imageBase64: input.imageBase64
        })
      : await runChat(
          [
            { role: "system", content: "Bạn chuyên OCR và chuẩn hóa menu F&B Việt Nam. Trả JSON thuần." },
            { role: "user", content: prompt }
          ],
          "qwen",
          providerDefaults.qwenChatModel,
          { jsonMode: true, cacheTtlMs: 20_000 },
          "ocr"
        );
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_menu_ocr",
    provider: result.provider,
    model: result.model,
    requestKind: "ocr",
    status: "success",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  });
  return { provider: result.provider, model: result.model, text: result.text, data: extractJsonObject(result.text) };
}

export async function generateAiImage(input: {
  restaurantId: string;
  userId: string;
  kind: "logo" | "menu_preview" | "food_photo";
  prompt?: string;
  restaurantName?: string;
  businessType?: string;
}) {
  await assertAiEntitlement({ restaurantId: input.restaurantId, featureKey: "ai_image_generation", userId: input.userId });
  const prompt = buildImageGenerationPrompt(input);
  const canFallbackToPromptOnly = allowPromptOnlyImageFallback();

  try {
    const config = getProviderConfig((process.env.AI_IMAGE_PROVIDER as AiProvider | undefined) || "qwen");
    if (config.provider === "qwen") {
      const size = input.kind === "logo" ? "1024*1024" : input.kind === "menu_preview" ? "1536*1024" : "1024*1024";
      const response = await fetch(`${config.baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: providerDefaults.qwenImageModel,
          input: {
            messages: [
              {
                role: "user",
                content: [{ text: prompt }]
              }
            ]
          },
          parameters: {
            size,
            n: 1,
            negative_prompt:
              "low quality, blurry, distorted logo, unreadable typography, broken Vietnamese diacritics, extra letters, misspelled text, watermark, QR-like artifacts, cluttered composition",
            prompt_extend: true,
            watermark: false
          }
        })
      });
      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new AppError(json?.message || json?.error?.message || "Không tạo được ảnh bằng Qwen.", 502);
      const content = json?.output?.choices?.[0]?.message?.content;
      const imageUrl =
        (Array.isArray(content) ? content.find((part) => part?.image)?.image || content.find((part) => part?.url)?.url : null) ||
        json?.output?.image_url ||
        json?.output?.url ||
        json?.data?.[0]?.url ||
        null;
      if (!imageUrl) {
        throw new AppError("Qwen đã xử lý nhưng chưa trả URL ảnh. Vui lòng kiểm tra quota/model trong Alibaba Cloud hoặc thử lại.", 502);
      }
      const result: AiImageResult = {
        imageUrl,
        prompt,
        provider: "qwen",
        model: providerDefaults.qwenImageModel,
        raw: json
      };
      await logAiUsage({
        restaurantId: input.restaurantId,
        userId: input.userId,
        featureKey: "ai_image_generation",
        provider: result.provider,
        model: result.model,
        requestKind: "image",
        status: "success",
        imageCount: imageUrl ? 1 : 0
      });
      return result;
    }

    if (config.provider === "xai") {
      const response = await fetch(`${config.baseUrl}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: providerDefaults.xaiImageModel,
          prompt,
          n: 1,
          response_format: "url"
        })
      });
      const json = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new AppError(json?.message || json?.error?.message || "Không tạo được ảnh bằng xAI.", 502);
      const imageUrl = json?.data?.[0]?.url ?? null;
      if (!imageUrl) {
        throw new AppError("xAI đã xử lý nhưng chưa trả URL ảnh. Vui lòng kiểm tra quota/model tạo ảnh.", 502);
      }
      const result: AiImageResult = {
        imageUrl,
        prompt,
        provider: "xai",
        model: providerDefaults.xaiImageModel,
        raw: json
      };
      await logAiUsage({
        restaurantId: input.restaurantId,
        userId: input.userId,
        featureKey: "ai_image_generation",
        provider: result.provider,
        model: result.model,
        requestKind: "image",
        status: "success",
        imageCount: 1
      });
      return result;
    }
  } catch (error) {
    if (!canFallbackToPromptOnly) {
      await logAiUsage({
        restaurantId: input.restaurantId,
        userId: input.userId,
        featureKey: "ai_image_generation",
        provider: "prompt-only",
        model: "failed-before-image-url",
        requestKind: "image",
        status: "failed",
        imageCount: 0,
        errorMessage: error instanceof Error ? error.message : "AI image generation failed"
      });
      throw error;
    }
  }

  const result: AiImageResult = {
    imageUrl: null,
    prompt,
    provider: "prompt-only",
    model: "prompt-engineering"
  };
  await logAiUsage({
    restaurantId: input.restaurantId,
    userId: input.userId,
    featureKey: "ai_image_generation",
    provider: result.provider,
    model: result.model,
    requestKind: "image",
    status: "success",
    imageCount: 0,
    metadata: { promptOnly: true }
  });
  return result;
}
