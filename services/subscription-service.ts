import "server-only";

import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { buildResolvedEntitlementSnapshot } from "@/lib/billing/entitlements";
import { assertServerFeatureAccess } from "@/lib/billing/feature-gates";
import {
  buildPaymentPolicySummary,
  computeConfirmedSubscriptionTransition,
  isSubscriptionUsable
} from "@/lib/billing/subscription-transitions";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BillingFeatureKey, BillingPlanCode, QuotaDimension, QuotaSnapshot, QuotaWindow } from "@/lib/billing/types";

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  trial_days: number;
  features: unknown;
  is_active: boolean;
  sort_order: number;
};

const planFeatureKeys = [
  "core_dashboard",
  "menu_management",
  "table_qr",
  "order_realtime",
  "kitchen_screen",
  "vietqr_payments",
  "cash_payments",
  "promotions",
  "staff_call",
  "online_ordering",
  "delivery_basic",
  "delivery_realtime_tracking",
  "reservations",
  "reservation_deposits",
  "advanced_reports",
  "scheduled_reports",
  "staff_management",
  "bulk_qr_export",
  "priority_support",
  "ai_owner_assistant",
  "ai_customer_assistant",
  "ai_branding_studio",
  "ai_menu_ocr",
  "ai_image_generation",
  "ai_voice_input",
  "ai_voice_notifications"
] as const;

export type PlanFeatureKey = (typeof planFeatureKeys)[number];

export type PlanFeatureState = {
  enabled: boolean;
  limitValue: number | null;
  source: "plan" | "override" | "fallback";
};

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  contact_email?: string | null;
  platform_status?: "active" | "suspended" | "deleted";
  suspended_at?: string | null;
  deleted_at?: string | null;
};

type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
  trial_started_at: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  suspended_at: string | null;
  cancelled_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  plan_id: string | null;
  amount: number;
  months: number;
  method: string;
  status: "waiting_confirm" | "confirmed" | "rejected" | "expired";
  transfer_content: string;
  raw_data: unknown;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
};

type BillingSettings = {
  bankCode: string;
  bankAccount: string;
  bankAccountName: string;
  transferPrefix: string;
  defaultPlanCode: string;
};

const defaultBillingSettings: BillingSettings = {
  bankCode: "VCB",
  bankAccount: "1234567890",
  bankAccountName: "LOGIVN",
  transferPrefix: "LOGIVN",
  defaultPlanCode: "pro"
};

type PlanCapabilityRow = {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

type RestaurantFeatureOverrideRow = PlanCapabilityRow & {
  expires_at: string | null;
};

type UsageQuotaRow = {
  feature_key: string;
  dimension: string;
  quota_window: string;
  used_value: number | string;
  limit_value: number | string | null;
  period_start: string;
  period_end: string | null;
  reset_at: string | null;
};

type BillingV2PlanRow = {
  id: string;
  code: BillingPlanCode;
  name: string;
  description: string | null;
  monthly_price: number;
  metadata?: Record<string, unknown> | null;
};

type BillingV2SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "grace" | "pending_payment" | "cancelled" | "expired" | "suspended";
  current_period_start: string | null;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  plan?: BillingV2PlanRow | BillingV2PlanRow[] | null;
};

type BillingV2PaymentRow = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  invoice_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "detected" | "waiting_confirmation" | "confirmed" | "failed" | "expired" | "cancelled" | "refunded";
  transfer_code: string;
  created_at: string;
  confirmed_at: string | null;
  deleted_at?: string | null;
};

type SubscriptionReminderCandidateRow = {
  id: string;
  restaurant_id: string;
  status: SubscriptionRow["status"];
  trial_ends_at: string | null;
  current_period_end: string | null;
  restaurant?: { name: string; slug: string; contact_email: string | null } | { name: string; slug: string; contact_email: string | null }[] | null;
  plan?: Pick<PlanRow, "name" | "code" | "monthly_price"> | Pick<PlanRow, "name" | "code" | "monthly_price">[] | null;
};

const featureLabels: Record<PlanFeatureKey, string> = {
  core_dashboard: "Dashboard vận hành",
  menu_management: "Quản lý menu",
  table_qr: "Bàn & QR",
  order_realtime: "Đơn hàng realtime",
  kitchen_screen: "Màn hình bếp",
  vietqr_payments: "Thanh toán VietQR",
  cash_payments: "Thanh toán tiền mặt",
  promotions: "Khuyến mãi",
  staff_call: "Gọi nhân viên",
  online_ordering: "Đặt món online",
  delivery_basic: "Giao hàng cơ bản",
  delivery_realtime_tracking: "Theo dõi giao hàng realtime",
  reservations: "Đặt bàn trước",
  reservation_deposits: "Nhận cọc đặt bàn",
  advanced_reports: "Báo cáo nâng cao",
  scheduled_reports: "Gửi báo cáo tự động",
  staff_management: "Quản lý nhân viên",
  bulk_qr_export: "In/tải QR hàng loạt",
  priority_support: "Hỗ trợ ưu tiên",
  ai_owner_assistant: "AI trợ lý chủ quán",
  ai_customer_assistant: "AI hỗ trợ khách gọi món",
  ai_branding_studio: "AI tạo slogan, mô tả và nhận diện quán",
  ai_menu_ocr: "AI quét OCR menu",
  ai_image_generation: "AI tạo ảnh menu/logo",
  ai_voice_input: "Nhập liệu bằng giọng nói",
  ai_voice_notifications: "Thông báo vận hành bằng giọng nói"
};

export const planFeatureLabels = featureLabels;

const fallbackCapabilities: Record<"pro" | "premium", Partial<Record<PlanFeatureKey, Omit<PlanFeatureState, "source">>>> = {
  pro: {
    core_dashboard: { enabled: true, limitValue: null },
    menu_management: { enabled: true, limitValue: 500 },
    table_qr: { enabled: true, limitValue: 300 },
    order_realtime: { enabled: true, limitValue: null },
    kitchen_screen: { enabled: true, limitValue: null },
    vietqr_payments: { enabled: true, limitValue: null },
    cash_payments: { enabled: true, limitValue: null },
    promotions: { enabled: true, limitValue: 20 },
    staff_call: { enabled: true, limitValue: null },
    online_ordering: { enabled: true, limitValue: null },
    delivery_basic: { enabled: true, limitValue: null },
    delivery_realtime_tracking: { enabled: false, limitValue: null },
    reservations: { enabled: false, limitValue: null },
    reservation_deposits: { enabled: false, limitValue: null },
    advanced_reports: { enabled: false, limitValue: null },
    scheduled_reports: { enabled: true, limitValue: 3 },
    staff_management: { enabled: true, limitValue: 8 },
    bulk_qr_export: { enabled: true, limitValue: null },
    priority_support: { enabled: false, limitValue: null },
    ai_owner_assistant: { enabled: true, limitValue: 300 },
    ai_customer_assistant: { enabled: true, limitValue: 1000 },
    ai_branding_studio: { enabled: true, limitValue: 40 },
    ai_menu_ocr: { enabled: false, limitValue: null },
    ai_image_generation: { enabled: false, limitValue: null },
    ai_voice_input: { enabled: true, limitValue: 300 },
    ai_voice_notifications: { enabled: false, limitValue: null }
  },
  premium: {
    core_dashboard: { enabled: true, limitValue: null },
    menu_management: { enabled: true, limitValue: 2000 },
    table_qr: { enabled: true, limitValue: 1000 },
    order_realtime: { enabled: true, limitValue: null },
    kitchen_screen: { enabled: true, limitValue: null },
    vietqr_payments: { enabled: true, limitValue: null },
    cash_payments: { enabled: true, limitValue: null },
    promotions: { enabled: true, limitValue: 200 },
    staff_call: { enabled: true, limitValue: null },
    online_ordering: { enabled: true, limitValue: null },
    delivery_basic: { enabled: true, limitValue: null },
    delivery_realtime_tracking: { enabled: true, limitValue: null },
    reservations: { enabled: true, limitValue: null },
    reservation_deposits: { enabled: true, limitValue: null },
    advanced_reports: { enabled: true, limitValue: null },
    scheduled_reports: { enabled: true, limitValue: 20 },
    staff_management: { enabled: true, limitValue: 50 },
    bulk_qr_export: { enabled: true, limitValue: null },
    priority_support: { enabled: true, limitValue: null },
    ai_owner_assistant: { enabled: true, limitValue: 3000 },
    ai_customer_assistant: { enabled: true, limitValue: 10000 },
    ai_branding_studio: { enabled: true, limitValue: 300 },
    ai_menu_ocr: { enabled: true, limitValue: 500 },
    ai_image_generation: { enabled: true, limitValue: 300 },
    ai_voice_input: { enabled: true, limitValue: 3000 },
    ai_voice_notifications: { enabled: true, limitValue: null }
  }
};

const entitlementCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof readRestaurantEntitlement>> }>();
const entitlementCacheTtlMs = 5_000;

function asFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

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

function getFallbackCapabilityMap(planCode?: string | null) {
  const tier = planCode === "premium" ? "premium" : "pro";
  return planFeatureKeys.reduce(
    (map, featureKey) => {
      const fallback = fallbackCapabilities[tier][featureKey] ?? { enabled: false, limitValue: null };
      map[featureKey] = { ...fallback, source: "fallback" };
      return map;
    },
    {} as Record<PlanFeatureKey, PlanFeatureState>
  );
}

function normalizeFeatureKey(value: string): PlanFeatureKey | null {
  return planFeatureKeys.includes(value as PlanFeatureKey) ? (value as PlanFeatureKey) : null;
}

async function getEffectiveCapabilities({
  planId,
  restaurantId,
  planCode
}: {
  planId: string;
  restaurantId: string;
  planCode?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const capabilities = getFallbackCapabilityMap(planCode);

  try {
    const now = new Date().toISOString();
    const [planResult, overrideResult] = await Promise.all([
      supabase.from("plan_capabilities").select("feature_key,enabled,limit_value").eq("plan_id", planId),
      supabase
        .from("restaurant_feature_overrides")
        .select("feature_key,enabled,limit_value,expires_at")
        .eq("restaurant_id", restaurantId)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
    ]);

    if (planResult.error) {
      if (!isMissingSchemaError(planResult.error)) throw planResult.error;
      return capabilities;
    }

    for (const row of (planResult.data ?? []) as PlanCapabilityRow[]) {
      const featureKey = normalizeFeatureKey(row.feature_key);
      if (!featureKey) continue;
      capabilities[featureKey] = {
        enabled: row.enabled,
        limitValue: row.limit_value,
        source: "plan"
      };
    }

    if (overrideResult.error) {
      if (!isMissingSchemaError(overrideResult.error)) throw overrideResult.error;
      return capabilities;
    }

    for (const row of (overrideResult.data ?? []) as RestaurantFeatureOverrideRow[]) {
      const featureKey = normalizeFeatureKey(row.feature_key);
      if (!featureKey) continue;
      capabilities[featureKey] = {
        enabled: row.enabled,
        limitValue: row.limit_value ?? capabilities[featureKey].limitValue,
        source: "override"
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  return capabilities;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function hashMaybe(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSettings(value: unknown): BillingSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultBillingSettings;
  const settings = value as Record<string, unknown>;

  return {
    bankCode: typeof settings.bankCode === "string" && settings.bankCode ? settings.bankCode : defaultBillingSettings.bankCode,
    bankAccount:
      typeof settings.bankAccount === "string" && settings.bankAccount ? settings.bankAccount : defaultBillingSettings.bankAccount,
    bankAccountName:
      typeof settings.bankAccountName === "string" && settings.bankAccountName
        ? settings.bankAccountName
        : defaultBillingSettings.bankAccountName,
    transferPrefix:
      typeof settings.transferPrefix === "string" && settings.transferPrefix
        ? settings.transferPrefix
        : defaultBillingSettings.transferPrefix,
    defaultPlanCode:
      typeof settings.defaultPlanCode === "string" && settings.defaultPlanCode
        ? settings.defaultPlanCode
        : defaultBillingSettings.defaultPlanCode
  };
}

function vietQrUrl({
  bank,
  account,
  amount,
  transferContent
}: {
  bank: string;
  account: string;
  amount: number;
  transferContent: string;
}) {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: transferContent
  });

  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${params.toString()}`;
}

function daysUntil(value: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function dateOnly(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateVi(value: string | Date | null | undefined) {
  if (!value) return "chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + "đ";
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function monthEndIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

function dayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function dayEndIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString();
}

function lifetimeStartIso() {
  return new Date(Date.UTC(1970, 0, 1, 0, 0, 0, 0)).toISOString();
}

function getQuotaPeriod(window: QuotaWindow) {
  if (window === "daily") {
    return {
      periodStart: dayStartIso(),
      periodEnd: dayEndIso(),
      resetAt: dayEndIso()
    };
  }

  if (window === "lifetime") {
    return {
      periodStart: lifetimeStartIso(),
      periodEnd: null,
      resetAt: null
    };
  }

  return {
    periodStart: monthStartIso(),
    periodEnd: monthEndIso(),
    resetAt: monthEndIso()
  };
}

function normalizeBillingPlanCode(planCode?: string | null): BillingPlanCode {
  return planCode === "premium" ? "premium" : "pro";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeQuotaWindow(window?: string | null): QuotaWindow {
  if (window === "daily" || window === "lifetime") return window;
  return "monthly";
}

function normalizeQuotaDimension(dimension?: string | null): QuotaDimension {
  if (
    dimension === "tables" ||
    dimension === "staff" ||
    dimension === "ai_requests" ||
    dimension === "ai_tokens" ||
    dimension === "ai_images" ||
    dimension === "exports" ||
    dimension === "analytics_runs" ||
    dimension === "automation_runs"
  ) {
    return dimension;
  }

  return "ai_requests";
}

const legacyBillingFeatureMap: Partial<Record<PlanFeatureKey, BillingFeatureKey>> = {
  ai_owner_assistant: "advanced_ai_assistant",
  ai_customer_assistant: "ai_chatbot",
  ai_branding_studio: "ai_branding",
  ai_menu_ocr: "ai_menu_generation",
  ai_image_generation: "ai_image_generation",
  scheduled_reports: "export_pdf",
  advanced_reports: "ai_analytics"
};

async function readLegacyUsageBridge(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const usage: Partial<Record<string, Omit<QuotaSnapshot, "used"> & { used?: number }>> = {};
  const usagePriority = new Map<string, number>();
  const trialsUsed: Partial<Record<BillingFeatureKey, boolean>> = {};

  try {
    const { data: quotaRows, error: quotaError } = await supabase
      .from("usage_quotas")
      .select("feature_key,dimension,quota_window,period_start,used_value,limit_value,period_end,reset_at")
      .eq("restaurant_id", restaurantId);

    if (quotaError && !isMissingSchemaError(quotaError)) throw quotaError;

    for (const row of ((quotaRows ?? []) as UsageQuotaRow[])) {
      const window = normalizeQuotaWindow(row.quota_window);
      const periodStart = new Date(row.period_start).getTime();
      const isCurrentWindow =
        window === "lifetime" ||
        (window === "daily" && periodStart >= new Date(dayStartIso()).getTime()) ||
        (window === "monthly" && periodStart >= new Date(monthStartIso()).getTime());
      const dimension = normalizeQuotaDimension(row.dimension);

      // Token ledgers are useful for cost analytics, but entitlement progress bars
      // must use request/image/export counters or quotas can appear unlimited.
      if (!isCurrentWindow || dimension === "ai_tokens") continue;

      const priority =
        (row.limit_value === null ? 0 : 100) +
        (dimension === "ai_images"
          ? 40
          : dimension === "analytics_runs"
            ? 35
            : dimension === "automation_runs"
              ? 30
              : dimension === "exports"
                ? 25
                : dimension === "ai_requests"
                  ? 20
                  : 10);
      const existingPriority = usagePriority.get(row.feature_key) ?? -1;
      if (existingPriority > priority) continue;

      usagePriority.set(row.feature_key, priority);
      usage[row.feature_key] = {
        key: row.feature_key,
        label: row.feature_key,
        used: Number(row.used_value ?? 0),
        limit: row.limit_value === null ? null : Number(row.limit_value),
        unit: dimension,
        window,
        resetLabel: row.reset_at || row.period_end ? `Reset: ${formatDateVi(row.reset_at || row.period_end)}` : undefined
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }

  const legacyFeatureKeys = Object.keys(legacyBillingFeatureMap) as PlanFeatureKey[];
  const { data: aiUsageRows, error: aiUsageError } = await supabase
    .from("ai_usage_logs")
    .select("feature_key,status,created_at")
    .eq("restaurant_id", restaurantId)
    .in("feature_key", legacyFeatureKeys)
    .gte("created_at", monthStartIso());

  if (aiUsageError && !isMissingSchemaError(aiUsageError)) throw aiUsageError;

  const successCounts = new Map<BillingFeatureKey, number>();
  for (const row of (aiUsageRows ?? []) as Array<{ feature_key: PlanFeatureKey; status: string }>) {
    const billingFeatureKey = legacyBillingFeatureMap[row.feature_key];
    if (!billingFeatureKey || row.status !== "success") continue;
    successCounts.set(billingFeatureKey, (successCounts.get(billingFeatureKey) ?? 0) + 1);
  }

  for (const [featureKey, used] of successCounts.entries()) {
    if (!usage[featureKey]) {
      usage[featureKey] = {
        key: featureKey,
        label: featureKey,
        used,
        limit: null,
        unit: "lượt",
        window: "monthly"
      };
    } else if (typeof usage[featureKey]?.used !== "number" || usage[featureKey]?.used === 0) {
      usage[featureKey] = {
        ...usage[featureKey],
        used
      };
    }
  }

  const { data: trialRows, error: trialError } = await supabase
    .from("trial_usage")
    .select("feature_key")
    .eq("restaurant_id", restaurantId);

  if (trialError && !isMissingSchemaError(trialError)) throw trialError;

  for (const row of (trialRows ?? []) as Array<{ feature_key: string }>) {
    if (
      row.feature_key === "ai_branding" ||
      row.feature_key === "ai_analytics" ||
      row.feature_key === "ai_image_generation"
    ) {
      trialsUsed[row.feature_key] = true;
    }
  }

  if ((successCounts.get("ai_branding") ?? 0) > 0) trialsUsed.ai_branding = true;
  if ((successCounts.get("ai_image_generation") ?? 0) > 0) trialsUsed.ai_image_generation = true;
  if ((successCounts.get("ai_analytics") ?? 0) > 0) trialsUsed.ai_analytics = true;

  return { usage, trialsUsed };
}

async function readBillingV2Bridge(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [subscriptionResult, paymentResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_started_at,trial_ends_at,plan:subscription_plans(id,code,name,description,monthly_price,metadata)")
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id,restaurant_id,subscription_id,invoice_id,amount,currency,status,transfer_code,created_at,confirmed_at,deleted_at")
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  if (subscriptionResult.error) {
    if (isMissingSchemaError(subscriptionResult.error)) return null;
    throw subscriptionResult.error;
  }
  if (paymentResult.error) {
    if (isMissingSchemaError(paymentResult.error)) return null;
    throw paymentResult.error;
  }

  const subscription = subscriptionResult.data as BillingV2SubscriptionRow | null;
  const payments = (paymentResult.data ?? []) as BillingV2PaymentRow[];
  if (!subscription && payments.length === 0) return null;

  return {
    subscription,
    plan: firstOrNull(subscription?.plan),
    payments
  };
}

export async function getResolvedBillingEntitlementSnapshotForRestaurant({
  restaurantId,
  ownerEmail
}: {
  restaurantId: string;
  ownerEmail?: string | null;
}) {
  const portal = await getRestaurantBillingPortal({ restaurantId, ownerEmail });
  return portal.resolvedSnapshot;
}

export async function assertBillingFeatureEntitlement({
  restaurantId,
  featureKey,
  ownerEmail
}: {
  restaurantId: string;
  featureKey: BillingFeatureKey;
  ownerEmail?: string | null;
}) {
  const snapshot = await getResolvedBillingEntitlementSnapshotForRestaurant({ restaurantId, ownerEmail });
  return assertServerFeatureAccess(snapshot, featureKey);
}

export async function recordBillingUsageEvent({
  restaurantId,
  featureKey,
  quotaKey,
  dimension,
  quantity = 1,
  limitValue = null,
  window = "monthly",
  countAgainstQuota = true,
  consumeTrial = false,
  trialFeatureKey,
  userId,
  provider,
  model,
  requestId,
  status = "success",
  metadata
}: {
  restaurantId: string;
  featureKey: BillingFeatureKey;
  quotaKey?: string | null;
  dimension: QuotaDimension;
  quantity?: number;
  limitValue?: number | null;
  window?: QuotaWindow;
  countAgainstQuota?: boolean;
  consumeTrial?: boolean;
  trialFeatureKey?: BillingFeatureKey;
  userId?: string | null;
  provider?: string | null;
  model?: string | null;
  requestId?: string | null;
  status?: "success" | "failed" | "blocked";
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const quantityValue = Math.max(0, Number(quantity) || 0);
  const quotaFeatureKey = quotaKey || featureKey;
  const shouldConsumeTrial = consumeTrial || quotaFeatureKey.endsWith("_trial");

  const { error: usageLogError } = await supabase.from("feature_usage_logs").insert({
    restaurant_id: restaurantId,
    user_id: userId ?? null,
    feature_key: featureKey,
    dimension,
    quantity: quantityValue,
    provider: provider ?? null,
    model: model ?? null,
    request_id: requestId ?? null,
    status,
    metadata: metadata ?? {}
  });

  if (usageLogError && !isMissingSchemaError(usageLogError)) throw usageLogError;
  if (status !== "success") return;

  if (shouldConsumeTrial) {
    const { error: trialError } = await supabase.from("trial_usage").upsert(
      {
        restaurant_id: restaurantId,
        feature_key: trialFeatureKey ?? featureKey,
        consumed_by: null,
        source: "runtime",
        metadata: {
          ...(metadata ?? {}),
          quotaKey: quotaFeatureKey,
          userId: userId ?? null
        }
      },
      { onConflict: "restaurant_id,feature_key", ignoreDuplicates: true }
    );

    if (trialError && !isMissingSchemaError(trialError)) throw trialError;
  }

  if (!countAgainstQuota || quantityValue <= 0) return;

  const { periodStart, periodEnd, resetAt } = getQuotaPeriod(window);

  const { data: existingQuota, error: existingQuotaError } = await supabase
    .from("usage_quotas")
    .select("id,used_value")
    .eq("restaurant_id", restaurantId)
    .eq("feature_key", quotaFeatureKey)
    .eq("dimension", dimension)
    .eq("quota_window", window)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (existingQuotaError) {
    if (isMissingSchemaError(existingQuotaError)) return;
    throw existingQuotaError;
  }

  if (existingQuota?.id) {
    const { error: updateQuotaError } = await supabase
      .from("usage_quotas")
      .update({
        used_value: Number(existingQuota.used_value ?? 0) + quantityValue,
        limit_value: limitValue,
        period_end: periodEnd,
        reset_at: resetAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingQuota.id);

    if (updateQuotaError && !isMissingSchemaError(updateQuotaError)) throw updateQuotaError;
    return;
  }

  const { error: insertQuotaError } = await supabase.from("usage_quotas").insert({
    restaurant_id: restaurantId,
    feature_key: quotaFeatureKey,
    dimension,
    quota_window: window,
    period_start: periodStart,
    period_end: periodEnd,
    used_value: quantityValue,
    limit_value: limitValue,
    reset_at: resetAt,
    source: "runtime",
    metadata: metadata ?? {}
  });

  if (insertQuotaError && !isMissingSchemaError(insertQuotaError)) throw insertQuotaError;
}

function mapLegacySubscriptionStatusToBillingStatus(status: SubscriptionRow["status"]): "trialing" | "active" | "grace" | "pending_payment" | "cancelled" | "expired" | "suspended" {
  if (status === "trialing" || status === "active" || status === "pending_payment" || status === "cancelled" || status === "expired" || status === "suspended") {
    return status;
  }

  return status === "past_due" ? "grace" : "active";
}

async function mirrorLegacyPaymentRequestToBillingV2({
  restaurant,
  subscription,
  currentPlanCode,
  targetPlanCode,
  amount,
  months,
  transferContent,
  billingAction,
  legacyPaymentId
}: {
  restaurant: RestaurantRow;
  subscription: SubscriptionRow;
  currentPlanCode: string;
  targetPlanCode: string;
  amount: number;
  months: number;
  transferContent: string;
  billingAction: "renew" | "upgrade" | "downgrade";
  legacyPaymentId: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  try {
    const { data: v2Plans, error: planError } = await supabase
      .from("subscription_plans")
      .select("id,code")
      .in("code", [normalizeBillingPlanCode(currentPlanCode), normalizeBillingPlanCode(targetPlanCode)]);
    if (planError) {
      if (isMissingSchemaError(planError)) return;
      throw planError;
    }

    const planByCode = new Map(((v2Plans ?? []) as Array<{ id: string; code: BillingPlanCode }>).map((plan) => [plan.code, plan.id]));
    const currentV2PlanId = planByCode.get(normalizeBillingPlanCode(currentPlanCode));
    const targetV2PlanId = planByCode.get(normalizeBillingPlanCode(targetPlanCode));
    if (!targetV2PlanId) return;

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    let v2SubscriptionId = existingSubscription?.id ?? null;
    if (!v2SubscriptionId) {
      const { data: createdSubscription, error: createSubscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          restaurant_id: restaurant.id,
          plan_id: currentV2PlanId ?? targetV2PlanId,
          status: mapLegacySubscriptionStatusToBillingStatus(subscription.status),
          interval: "month",
          started_at: subscription.created_at,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          trial_started_at: subscription.trial_started_at,
          trial_ends_at: subscription.trial_ends_at,
          metadata: {
            source: "legacy_bridge",
            legacySubscriptionId: subscription.id
          }
        })
        .select("id")
        .single();
      if (createSubscriptionError) throw createSubscriptionError;
      v2SubscriptionId = createdSubscription.id;
    }

    const invoiceNumber = `LGV-${restaurant.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        restaurant_id: restaurant.id,
        subscription_id: v2SubscriptionId,
        plan_id: targetV2PlanId,
        invoice_number: invoiceNumber,
        billing_reason: billingAction,
        status: "pending",
        subtotal: amount,
        total: amount,
        currency: "VND",
        issued_at: new Date().toISOString(),
        due_at: new Date().toISOString(),
        metadata: {
          source: "legacy_bridge",
          months,
          legacySubscriptionId: subscription.id,
          legacyPaymentId
        }
      })
      .select("id")
      .single();
    if (invoiceError) throw invoiceError;

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        restaurant_id: restaurant.id,
        subscription_id: v2SubscriptionId,
        invoice_id: invoice.id,
        provider: "vietqr",
        amount,
        currency: "VND",
        status: "waiting_confirmation",
        transfer_code: transferContent,
        expires_at: monthEndIso(),
        metadata: {
          source: "legacy_bridge",
          billingAction,
          months,
          legacySubscriptionId: subscription.id,
          legacyPaymentId
        }
      })
      .select("id")
      .single();
    if (paymentError) throw paymentError;

    await supabase.from("billing_payment_logs").insert({
      payment_id: payment.id,
      event_type: "payment_requested",
      actor_type: "system",
      payload: {
        source: "legacy_bridge",
        legacyPaymentId,
        billingAction
      }
    });

    await supabase
      .from("subscriptions")
      .update({
        latest_invoice_id: invoice.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2SubscriptionId);

    await supabase.from("upgrade_events").insert({
      restaurant_id: restaurant.id,
      from_plan_id: currentV2PlanId ?? null,
      to_plan_id: targetV2PlanId,
      trigger: billingAction,
      source: "restaurant_dashboard",
      context: {
        source: "legacy_bridge",
        months,
        transferContent,
        legacyPaymentId
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[subscription-service] Failed to mirror legacy payment request to billing v2", error);
      return;
    }
    throw error;
  }
}

async function mirrorLegacyPaymentFinalStateToBillingV2(paymentId: string) {
  const supabase = createAdminSupabaseClient() as any;
  try {
    const { data: payment, error: legacyPaymentError } = await supabase
      .from("subscription_payment_logs")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (legacyPaymentError) {
      if (isMissingSchemaError(legacyPaymentError)) return;
      throw legacyPaymentError;
    }
    if (!payment) return;

    const legacyPayment = payment as PaymentRow;
    const { data: legacySubscription, error: legacySubscriptionError } = await supabase
      .from("restaurant_subscriptions")
      .select("*,plan:saas_plans(code,name)")
      .eq("id", legacyPayment.subscription_id)
      .maybeSingle();
    if (legacySubscriptionError) throw legacySubscriptionError;
    if (!legacySubscription) return;

    const nextPlanCode =
      firstOrNull((legacySubscription as { plan?: { code: string } | Array<{ code: string }> | null }).plan)?.code ?? "pro";
    const { data: v2Subscription, error: v2SubscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("restaurant_id", legacyPayment.restaurant_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (v2SubscriptionError) throw v2SubscriptionError;
    if (!v2Subscription?.id) return;

    const { data: v2Plan, error: v2PlanError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("code", normalizeBillingPlanCode(nextPlanCode))
      .maybeSingle();
    if (v2PlanError) throw v2PlanError;

    const { data: v2Payment, error: v2PaymentError } = await supabase
      .from("payments")
      .select("id,invoice_id")
      .eq("transfer_code", legacyPayment.transfer_content)
      .maybeSingle();
    if (v2PaymentError) throw v2PaymentError;
    if (!v2Payment?.id) return;

    const paymentStatus =
      legacyPayment.status === "confirmed"
        ? "confirmed"
        : legacyPayment.status === "rejected"
          ? "failed"
          : legacyPayment.status === "expired"
            ? "expired"
            : "waiting_confirmation";

    await supabase
      .from("payments")
      .update({
        status: paymentStatus,
        confirmed_at: legacyPayment.confirmed_at,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2Payment.id);

    await supabase
      .from("billing_payment_logs")
      .insert({
        payment_id: v2Payment.id,
        event_type: paymentStatus === "confirmed" ? "payment_confirmed" : "payment_closed",
        actor_type: "system",
        payload: {
          source: "legacy_bridge",
          legacyPaymentId: legacyPayment.id,
          status: legacyPayment.status
        }
      });

    if (v2Payment.invoice_id) {
      await supabase
        .from("invoices")
        .update({
          status: paymentStatus === "confirmed" ? "paid" : paymentStatus === "expired" ? "failed" : "failed",
          paid_at: legacyPayment.confirmed_at,
          updated_at: new Date().toISOString()
        })
        .eq("id", v2Payment.invoice_id);
    }

    await supabase
      .from("subscriptions")
      .update({
        plan_id: v2Plan?.id ?? undefined,
        status: paymentStatus === "confirmed" ? "active" : undefined,
        current_period_start: (legacySubscription as SubscriptionRow).current_period_start,
        current_period_end: (legacySubscription as SubscriptionRow).current_period_end,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2Subscription.id);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[subscription-service] Failed to mirror legacy payment final state to billing v2", error);
      return;
    }
    throw error;
  }
}

function buildSubscriptionReminderEmail({
  restaurantName,
  planName,
  daysLeft,
  periodEnd
}: {
  restaurantName: string;
  planName: string;
  daysLeft: number;
  periodEnd: string;
}) {
  const urgency =
    daysLeft <= 0
      ? "Gói LogiVN của quán hết hạn hôm nay."
      : daysLeft === 1
        ? "Gói LogiVN của quán còn 1 ngày."
        : `Gói LogiVN của quán còn ${daysLeft} ngày.`;

  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;color:#0F172A;">
    <div style="max-width:640px;margin:0 auto;padding:28px;">
      <div style="border:1px solid #E2E8F0;border-radius:20px;background:#FFFFFF;overflow:hidden;">
        <div style="padding:22px 26px;background:#0F4D3A;color:#FFFFFF;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.78;">LogiVN Billing</div>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;">Nhắc gia hạn gói ${planName}</h1>
        </div>
        <div style="padding:24px 26px;">
          <p style="font-size:16px;line-height:1.7;margin:0;">${urgency}</p>
          <div style="margin:18px 0;padding:16px;border:1px solid #E2E8F0;border-radius:14px;background:#F8FAFC;">
            <p style="margin:0 0 8px;font-weight:700;">${restaurantName}</p>
            <p style="margin:0;color:#475569;">Ngày hết hạn: <strong>${formatDateVi(periodEnd)}</strong></p>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#475569;margin:0;">Vui lòng vào Dashboard > Cài đặt > Gói LogiVN để tạo mã VietQR gia hạn. Hệ thống sẽ tự mở lại đầy đủ tính năng ngay sau khi LogiVN xác minh thanh toán.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function sendSubscriptionReminderEmail({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BILLING_EMAIL_FROM ?? process.env.RESEND_FROM ?? "LogiVN <billing@logivn.com>";

  if (!apiKey) {
    throw new AppError("Thiếu RESEND_API_KEY để gửi email nhắc gia hạn", 500);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  const json = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new AppError(json?.message ?? "Resend từ chối gửi email nhắc gia hạn", 502);
  }

  return { providerMessageId: json?.id ?? null, raw: json };
}

async function insertReminderLog({
  restaurantId,
  subscriptionId,
  reminderKey,
  recipient,
  status,
  errorMessage,
  metadata
}: {
  restaurantId: string;
  subscriptionId: string;
  reminderKey: string;
  recipient: string | null;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("subscription_reminder_logs").insert({
    restaurant_id: restaurantId,
    subscription_id: subscriptionId,
    reminder_key: reminderKey,
    channel: "email",
    recipient,
    status,
    error_message: errorMessage ?? null,
    metadata: metadata ?? {}
  });

  if (error && error.code !== "23505") {
    if (!isMissingSchemaError(error)) throw error;
  }
}

function getSubscriptionAccessEnd(subscription: SubscriptionRow) {
  return subscription.current_period_end || subscription.trial_ends_at;
}

async function readRestaurantEntitlement(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurantResult, subscriptionResult] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,platform_status,suspended_at,deleted_at")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("restaurant_subscriptions")
      .select("*,plan:saas_plans(id,code,name,monthly_price,trial_days,features,is_active,sort_order)")
      .eq("restaurant_id", restaurantId)
      .in("status", ["trialing", "pending_payment", "active", "past_due", "suspended", "cancelled", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const { data: restaurant, error: restaurantError } = restaurantResult;

  if (restaurantError) throw restaurantError;
  if (!restaurant) {
    return {
      allowed: false,
      statusCode: 404,
      reason: "Không tìm thấy quán.",
      restaurantStatus: "missing" as const,
      subscriptionStatus: null as SubscriptionRow["status"] | null,
      features: getFallbackCapabilityMap("pro")
    };
  }

  const restaurantStatus = restaurant.platform_status ?? "active";
  if (restaurantStatus === "deleted") {
    return {
      allowed: false,
      statusCode: 403,
      reason: "Quán đã bị xoá mềm trên nền tảng LogiVN.",
      restaurantStatus,
      subscriptionStatus: null as SubscriptionRow["status"] | null,
      features: getFallbackCapabilityMap("pro")
    };
  }

  if (restaurantStatus === "suspended") {
    return {
      allowed: false,
      statusCode: 403,
      reason: "Quán đang bị tạm dừng. Vui lòng liên hệ LogiVN để mở lại.",
      restaurantStatus,
      subscriptionStatus: null as SubscriptionRow["status"] | null,
      features: getFallbackCapabilityMap("pro")
    };
  }

  const { data: subscription, error: subscriptionError } = subscriptionResult;

  if (subscriptionError) throw subscriptionError;
  if (!subscription) {
    return {
      allowed: false,
      statusCode: 402,
      reason: "Quán chưa có gói LogiVN hợp lệ. Vui lòng kích hoạt trial hoặc gia hạn gói.",
      restaurantStatus,
      subscriptionStatus: null as SubscriptionRow["status"] | null,
      features: getFallbackCapabilityMap("pro")
    };
  }

  let sub = subscription as SubscriptionRow;
  let plan = firstOrNull((subscription as { plan?: PlanRow | PlanRow[] | null }).plan);
  const repair = await repairRequestedOnboardingPlanIfNeeded({
    supabase,
    subscription: sub,
    currentPlan: plan
  });
  sub = repair.subscription;
  plan = repair.plan ?? plan;

  const features = await getEffectiveCapabilities({
    planId: sub.plan_id,
    restaurantId,
    planCode: plan?.code
  });
  const allowed = isSubscriptionUsable(sub);
  const periodEnd = getSubscriptionAccessEnd(sub);
  const daysLeft = daysUntil(periodEnd);
  const pendingButStillUsable = sub.status === "pending_payment" && allowed;
  return {
    allowed,
    statusCode: allowed ? 200 : 402,
    reason: allowed
      ? null
      : sub.status === "pending_payment"
        ? "Gói LogiVN đang chờ xác minh thanh toán và không còn kỳ sử dụng hợp lệ. Vui lòng hoàn tất gia hạn để tiếp tục vận hành."
        : "Gói LogiVN đã hết hạn hoặc không còn khả dụng. Vui lòng gia hạn để tiếp tục dùng tính năng vận hành.",
    restaurantStatus,
    subscriptionStatus: sub.status,
    subscriptionId: sub.id,
    planId: sub.plan_id,
    planCode: plan?.code ?? null,
    planName: plan?.name ?? "Gói LogiVN",
    currentPeriodEnd: sub.current_period_end,
    trialEndsAt: sub.trial_ends_at,
    periodEnd,
    daysLeft,
    features,
    warning:
      allowed && !pendingButStillUsable && daysLeft <= 7
        ? {
            severity: daysLeft <= 1 ? "danger" : "warning",
            message:
              daysLeft <= 0
                ? "Gói LogiVN hết hạn hôm nay. Vui lòng gia hạn để tránh gián đoạn vận hành."
                : `Gói LogiVN còn ${daysLeft} ngày. Hãy gia hạn sớm để ca bán không bị gián đoạn.`
          }
        : null
  };
}

export async function getRestaurantEntitlement(restaurantId: string) {
  const cached = entitlementCache.get(restaurantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await readRestaurantEntitlement(restaurantId);
  entitlementCache.set(restaurantId, {
    value,
    expiresAt: Date.now() + entitlementCacheTtlMs
  });
  return value;
}

export function invalidateRestaurantEntitlementCache(restaurantId?: string) {
  if (restaurantId) entitlementCache.delete(restaurantId);
  else entitlementCache.clear();
}

export async function assertRestaurantEntitlement(restaurantId: string) {
  const entitlement = await getRestaurantEntitlement(restaurantId);
  if (!entitlement.allowed) {
    throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
  }

  return entitlement;
}

export async function assertFeatureEntitlement(restaurantId: string, featureKey: PlanFeatureKey) {
  const entitlement = await assertRestaurantEntitlement(restaurantId);
  const feature = entitlement.features[featureKey];
  if (!feature?.enabled) {
    throw new AppError(`Tính năng "${featureLabels[featureKey]}" chưa có trong gói hiện tại. Vui lòng nâng cấp gói để sử dụng.`, 402);
  }

  return entitlement;
}

export async function assertRestaurantResourceLimit({
  restaurantId,
  featureKey,
  table,
  label,
  increment = 1
}: {
  restaurantId: string;
  featureKey: PlanFeatureKey;
  table: "tables" | "users" | "menu_items";
  label: string;
  increment?: number;
}) {
  const entitlement = await assertFeatureEntitlement(restaurantId, featureKey);
  const limit = entitlement.features[featureKey]?.limitValue;
  if (limit === null || typeof limit !== "number") return entitlement;

  const supabase = createAdminSupabaseClient() as any;
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
  if (error) throw error;
  const nextCount = Number(count ?? 0) + increment;
  if (nextCount > limit) {
    throw new AppError(`Gói ${entitlement.planName} giới hạn tối đa ${limit} ${label}. Vui lòng nâng cấp gói để mở rộng.`, 402);
  }

  return entitlement;
}

export function hasFeature(
  entitlement: Awaited<ReturnType<typeof getRestaurantEntitlement>>,
  featureKey: PlanFeatureKey
) {
  return entitlement.allowed && Boolean(entitlement.features[featureKey]?.enabled);
}

export async function getBillingSettings() {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", "billing").maybeSingle();
  if (error) throw error;
  return normalizeSettings(data?.value);
}

async function readActivePlans() {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("saas_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PlanRow[]).map((plan) => ({
    ...plan,
    features: asFeatures(plan.features)
  }));
}

export async function getActivePlans() {
  return readActivePlans();
}

export const getPublicActivePlans = unstable_cache(readActivePlans, ["public-active-plans"], {
  tags: ["public-active-plans"],
  revalidate: 3600
});

async function getDefaultPlan(planCode?: string) {
  const supabase = createAdminSupabaseClient() as any;
  const billing = await getBillingSettings();
  const { data, error } = await supabase
    .from("saas_plans")
    .select("*")
    .eq("code", planCode || billing.defaultPlanCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Chưa cấu hình gói SaaS mặc định cho LogiVN.", 500);

  return data as PlanRow;
}

async function getActivePlanByCode(planCode: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("saas_plans")
    .select("*")
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Gói LogiVN này chưa khả dụng.", 404);

  return data as PlanRow;
}

async function repairRequestedOnboardingPlanIfNeeded({
  supabase,
  subscription,
  currentPlan,
  requestedPlanCode
}: {
  supabase: any;
  subscription: SubscriptionRow;
  currentPlan?: PlanRow | null;
  requestedPlanCode?: BillingPlanCode | null;
}) {
  const metadata = asRecord(subscription.metadata);
  const metadataRequestedPlanCode =
    metadata.requestedPlanCode === "premium" || metadata.requestedPlanCode === "pro"
      ? (metadata.requestedPlanCode as BillingPlanCode)
      : null;
  const intendedPlanCode = requestedPlanCode ?? metadataRequestedPlanCode;
  const canRepairStatus = subscription.status === "trialing" || subscription.status === "pending_payment";

  if (
    intendedPlanCode !== "premium" ||
    metadata.source !== "onboarding" ||
    !canRepairStatus ||
    currentPlan?.code === "premium"
  ) {
    return { subscription, plan: currentPlan ?? null, repaired: false };
  }

  const premiumPlan = await getActivePlanByCode("premium");
  if (subscription.plan_id === premiumPlan.id) {
    return { subscription, plan: premiumPlan, repaired: false };
  }

  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .update({
      plan_id: premiumPlan.id,
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        requestedPlanCode: "premium",
        repairedRequestedPlanAt: new Date().toISOString(),
        repairedFromPlanCode: currentPlan?.code ?? null,
        repairedFromPlanId: subscription.plan_id
      }
    })
    .eq("id", subscription.id)
    .select("*")
    .single();

  if (error) throw error;
  return { subscription: data as SubscriptionRow, plan: premiumPlan, repaired: true };
}

async function getRestaurant(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,contact_email")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Không tìm thấy quán.", 404);
  return data as RestaurantRow;
}

export async function createInitialRestaurantSubscription({
  restaurantId,
  ownerUserId,
  ownerEmail,
  planCode,
  ip,
  userAgent
}: {
  restaurantId: string;
  ownerUserId?: string;
  ownerEmail: string;
  planCode?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const requestedPlanCode = normalizeBillingPlanCode(planCode);
  const plan = await getDefaultPlan(requestedPlanCode);
  const now = new Date();
  const trialEnds = addDays(now, plan.trial_days);
  const normalizedOwnerEmail = ownerEmail.toLowerCase();

  const { data: existing, error: existingError } = await supabase
    .from("restaurant_subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    const { data: currentPlan, error: currentPlanError } = await supabase.from("saas_plans").select("*").eq("id", existing.plan_id).maybeSingle();
    if (currentPlanError) throw currentPlanError;
    const repaired = await repairRequestedOnboardingPlanIfNeeded({
      supabase,
      subscription: existing as SubscriptionRow,
      currentPlan: (currentPlan as PlanRow | null) ?? null,
      requestedPlanCode
    });
    return repaired.subscription;
  }

  const { count: existingTrialClaims, error: claimsError } = await supabase
    .from("trial_claims")
    .select("id", { count: "exact", head: true })
    .eq("owner_email", normalizedOwnerEmail);

  if (claimsError && claimsError.code !== "PGRST205") throw claimsError;
  const hasUsedTrial = Number(existingTrialClaims ?? 0) > 0;

  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .insert({
      restaurant_id: restaurantId,
      plan_id: plan.id,
      status: hasUsedTrial ? "pending_payment" : "trialing",
      trial_started_at: now.toISOString(),
      trial_ends_at: hasUsedTrial ? now.toISOString() : trialEnds.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: hasUsedTrial ? now.toISOString() : trialEnds.toISOString(),
      metadata: {
        source: "onboarding",
        trialBlockedByPriorClaim: hasUsedTrial,
        requestedPlanCode
      }
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.from("trial_claims").insert({
    restaurant_id: restaurantId,
    owner_email: normalizedOwnerEmail,
    owner_user_id: ownerUserId ?? null,
    ip_hash: hashMaybe(ip),
    user_agent_hash: hashMaybe(userAgent)
  });

  return data as SubscriptionRow;
}

async function getOrCreateSubscription(restaurantId: string, ownerEmail?: string | null) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "pending_payment", "active", "past_due", "suspended"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as SubscriptionRow;

  const restaurant = await getRestaurant(restaurantId);
  return createInitialRestaurantSubscription({
    restaurantId,
    ownerEmail: ownerEmail || restaurant.contact_email || `${restaurant.slug}@logivn.local`
  });
}


export async function getRestaurantBillingPortal({
  restaurantId,
  ownerEmail
}: {
  restaurantId: string;
  ownerEmail?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurant, initialSubscription, plans, billing, v2Billing] = await Promise.all([
    getRestaurant(restaurantId),
    getOrCreateSubscription(restaurantId, ownerEmail),
    getActivePlans(),
    getBillingSettings(),
    readBillingV2Bridge(restaurantId)
  ]);

  let subscription = initialSubscription;
  let currentPlan = plans.find((plan) => plan.id === subscription.plan_id) ?? (await getDefaultPlan());
  const repair = await repairRequestedOnboardingPlanIfNeeded({
    supabase,
    subscription,
    currentPlan
  });
  subscription = repair.subscription;
  currentPlan = repair.plan ?? currentPlan;
  let paymentRequests: Array<PaymentRow & { qrUrl: string }> = [];
  let pendingPayment: (PaymentRow & { qrUrl: string }) | null = null;
  const periodEnd = getSubscriptionAccessEnd(subscription);
  const daysLeft = daysUntil(periodEnd);
  const usable = isSubscriptionUsable(subscription);

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (paymentsError) throw paymentsError;
  paymentRequests = ((paymentRows ?? []) as PaymentRow[]).map((payment) => ({
    ...payment,
    qrUrl: vietQrUrl({
      bank: billing.bankCode,
      account: billing.bankAccount,
      amount: payment.amount,
      transferContent: payment.transfer_content
    })
  }));

  if (paymentRequests.length === 0 && v2Billing?.payments.length) {
    paymentRequests = v2Billing.payments.map((payment) => ({
      id: payment.id,
      restaurant_id: payment.restaurant_id,
      subscription_id: payment.subscription_id,
      plan_id: v2Billing.plan?.id ?? subscription.plan_id,
      amount: payment.amount,
      months: Number((v2Billing.plan?.metadata as Record<string, unknown> | undefined)?.months ?? 1),
      method: "VIETQR",
      status:
        payment.status === "confirmed"
          ? "confirmed"
          : payment.status === "failed" || payment.status === "cancelled" || payment.status === "refunded"
            ? "rejected"
            : payment.status === "expired"
              ? "expired"
              : "waiting_confirm",
      transfer_content: payment.transfer_code,
      raw_data: {
        source: "billing_v2"
      },
      created_at: payment.created_at,
      confirmed_at: payment.confirmed_at,
      confirmed_by: null,
      rejected_at: null,
      rejected_reason: null,
      qrUrl: vietQrUrl({
        bank: billing.bankCode,
        account: billing.bankAccount,
        amount: payment.amount,
        transferContent: payment.transfer_code
      })
    }));
  }

  pendingPayment = paymentRequests.find((payment) => payment.status === "waiting_confirm") ?? null;

  const { usage, trialsUsed } = await readLegacyUsageBridge(restaurantId);
  const resolvedSnapshot = buildResolvedEntitlementSnapshot({
    planCode: normalizeBillingPlanCode(currentPlan.code),
    planName: currentPlan.name,
    daysLeft,
    status: !usable ? "expired" : pendingPayment ? "pending_payment" : "active",
    usage,
    trialsUsed
  });

  const pendingPaymentMeta = asRecord(pendingPayment?.raw_data);
  const pendingPlanFromPayment = pendingPayment?.plan_id ? plans.find((plan) => plan.id === pendingPayment.plan_id) ?? null : null;
  const pendingTargetPlanCode = typeof pendingPaymentMeta.planCode === "string" ? pendingPaymentMeta.planCode : null;
  const pendingTargetPlan = (pendingTargetPlanCode ? plans.find((plan) => plan.code === pendingTargetPlanCode) : null) ?? pendingPlanFromPayment ?? currentPlan;
  const pendingPolicy = pendingPayment
    ? buildPaymentPolicySummary({
        subscription: {
          ...subscription,
          metadata: asRecord(subscription.metadata)
        },
        currentPlan,
        targetPlan: pendingTargetPlan,
        months: pendingPayment.months
      })
    : null;

  return {
    restaurant,
    plans,
    billing,
    subscription,
    currentPlan: {
      ...currentPlan,
      features: asFeatures(currentPlan.features)
    },
    paymentRequests,
    pendingPayment,
    pendingChange:
      pendingPayment && pendingPolicy
        ? {
            action: pendingPolicy.billingAction,
            targetPlanCode: pendingTargetPlan.code,
            targetPlanName: pendingTargetPlan.name,
            effectiveAt: pendingPolicy.effectiveAt,
            policyKey: pendingPolicy.policyKey,
            summary: pendingPolicy.summary,
            isImmediate: pendingPolicy.isImmediate
          }
        : null,
    daysLeft,
    usable,
    hasPendingPayment: Boolean(pendingPayment),
    needsPayment: !usable,
    resolvedSnapshot
  };
}

export async function createSubscriptionPaymentRequest({
  restaurantId,
  ownerEmail,
  months = 1,
  planCode
}: {
  restaurantId: string;
  ownerEmail?: string | null;
  months?: number;
  planCode?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const restaurant = await getRestaurant(restaurantId);
  const subscription = await getOrCreateSubscription(restaurantId, ownerEmail);
  const currentPlanResult = await supabase.from("saas_plans").select("*").eq("id", subscription.plan_id).maybeSingle();
  if (currentPlanResult.error) throw currentPlanResult.error;
  if (!currentPlanResult.data) throw new AppError("Không tìm thấy gói hiện tại.", 404);

  const currentPlan = currentPlanResult.data as PlanRow;
  const targetPlan = planCode ? await getActivePlanByCode(planCode) : currentPlan;
  const billing = await getBillingSettings();
  const normalizedMonths = Math.min(24, Math.max(1, Number(months) || 1));
  const amount = targetPlan.monthly_price * normalizedMonths;
  const billingAction =
    targetPlan.id === currentPlan.id
      ? "renew"
      : targetPlan.monthly_price > currentPlan.monthly_price
        ? "upgrade"
        : "downgrade";
  const policy = buildPaymentPolicySummary({
    subscription: {
      ...subscription,
      metadata: asRecord(subscription.metadata)
    },
    currentPlan,
    targetPlan,
    months: normalizedMonths
  });

  if (billingAction === "downgrade" && isSubscriptionUsable(subscription)) {
    throw new AppError(policy.summary, 409);
  }

  const { data: existingPending, error: existingPendingError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("subscription_id", subscription.id)
    .eq("status", "waiting_confirm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPendingError) throw existingPendingError;
  if (existingPending) {
    const pending = existingPending as PaymentRow;
    if (pending.plan_id === targetPlan.id && pending.months === normalizedMonths) {
      return {
        ...pending,
        qrUrl: vietQrUrl({
          bank: billing.bankCode,
          account: billing.bankAccount,
          amount: pending.amount,
          transferContent: pending.transfer_content
        }),
        bank: billing.bankCode,
        account: billing.bankAccount,
        accountName: billing.bankAccountName
      };
    }

    const { error: expireError } = await supabase
      .from("subscription_payment_logs")
      .update({
        status: "expired",
        rejected_at: new Date().toISOString(),
        rejected_reason: "Chủ quán tạo yêu cầu gói/thời hạn mới nên QR cũ tự hết hiệu lực."
      })
      .eq("id", pending.id)
      .eq("status", "waiting_confirm");
    if (expireError) throw expireError;
    await mirrorLegacyPaymentFinalStateToBillingV2(pending.id);
  }

  const transferContent = `${billing.transferPrefix}-${restaurant.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now()
    .toString(36)
    .toUpperCase()}`;

  const { data, error } = await supabase
    .from("subscription_payment_logs")
    .insert({
      restaurant_id: restaurantId,
      subscription_id: subscription.id,
      plan_id: targetPlan.id,
      amount,
      months: normalizedMonths,
      method: "VIETQR",
      status: "waiting_confirm",
      transfer_content: transferContent,
      raw_data: {
        source: "restaurant_dashboard",
        billingAction,
        policyKey: policy.policyKey,
        effectiveAt: policy.effectiveAt,
        effectiveSummary: policy.summary,
        fromPlanCode: currentPlan.code,
        fromPlanName: currentPlan.name,
        planCode: targetPlan.code,
        planName: targetPlan.name
      }
    })
    .select()
    .single();

  if (error) throw error;

  await mirrorLegacyPaymentRequestToBillingV2({
    restaurant,
    subscription,
    currentPlanCode: currentPlan.code,
    targetPlanCode: targetPlan.code,
    amount,
    months: normalizedMonths,
    transferContent,
    billingAction,
    legacyPaymentId: (data as PaymentRow).id
  });

  const subscriptionStillUsable = isSubscriptionUsable(subscription);
  await supabase
    .from("restaurant_subscriptions")
    .update({
      status: subscriptionStillUsable ? subscription.status : "pending_payment",
      updated_at: new Date().toISOString()
    })
    .eq("id", subscription.id);

  return {
    ...(data as PaymentRow),
    qrUrl: vietQrUrl({
      bank: billing.bankCode,
      account: billing.bankAccount,
      amount,
      transferContent
    }),
    bank: billing.bankCode,
    account: billing.bankAccount,
    accountName: billing.bankAccountName
  };
}

export async function confirmSubscriptionPayment({
  paymentId,
  confirmedBy = "platform-admin"
}: {
  paymentId: string;
  confirmedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { data: payment, error: paymentError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment) throw new AppError("Không tìm thấy giao dịch gói.", 404);
  if (payment.status !== "waiting_confirm") throw new AppError("Giao dịch này không còn chờ xác nhận.", 409);

  const paymentRow = payment as PaymentRow;
  const { data: subscription, error: subError } = await supabase
    .from("restaurant_subscriptions")
    .select("*")
    .eq("id", paymentRow.subscription_id)
    .maybeSingle();

  if (subError) throw subError;
  if (!subscription) throw new AppError("Không tìm thấy subscription của giao dịch.", 404);

  const sub = subscription as SubscriptionRow;
  const currentPlanResult = await supabase.from("saas_plans").select("*").eq("id", sub.plan_id).maybeSingle();
  if (currentPlanResult.error) throw currentPlanResult.error;
  if (!currentPlanResult.data) throw new AppError("Không tìm thấy gói hiện tại.", 404);

  const targetPlanId = paymentRow.plan_id ?? sub.plan_id;
  const targetPlanResult = await supabase.from("saas_plans").select("*").eq("id", targetPlanId).maybeSingle();
  if (targetPlanResult.error) throw targetPlanResult.error;
  if (!targetPlanResult.data) throw new AppError("Không tìm thấy gói đích của giao dịch.", 404);

  let transition;
  try {
    transition = computeConfirmedSubscriptionTransition({
      subscription: {
        ...sub,
        metadata: asRecord(sub.metadata)
      },
      payment: paymentRow,
      currentPlan: currentPlanResult.data as PlanRow,
      targetPlan: targetPlanResult.data as PlanRow
    });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Không thể xác nhận giao dịch gói với trạng thái hiện tại.", 409);
  }

  const { error: applyError } = await supabase.rpc("apply_subscription_payment_confirmation", {
    p_payment_id: paymentRow.id,
    p_confirmed_by: confirmedBy,
    p_next_plan_id: transition.planId,
    p_current_period_start: transition.currentPeriodStart,
    p_current_period_end: transition.currentPeriodEnd,
    p_subscription_metadata: transition.metadata
  });

  if (applyError) {
    const status = applyError.code === "P0002" ? 404 : applyError.code === "P0001" ? 409 : 400;
    throw new AppError(applyError.message || "Không thể áp dụng xác nhận thanh toán gói.", status);
  }

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    actor: confirmedBy,
    action: "subscription_payment_confirmed_runtime",
    target_type: "subscription_payment",
    target_id: paymentRow.id,
    metadata: {
      restaurantId: paymentRow.restaurant_id,
      subscriptionId: sub.id,
      previousPlanId: sub.plan_id,
      nextPlanId: transition.planId,
      currentPeriodEnd: transition.currentPeriodEnd
    }
  });
  if (auditError && !isMissingSchemaError(auditError)) {
    console.error("[subscription-service] Failed to write subscription confirmation audit log", auditError);
  }
  invalidateRestaurantEntitlementCache(paymentRow.restaurant_id);
  await mirrorLegacyPaymentFinalStateToBillingV2(paymentId);
}

export async function rejectSubscriptionPayment({
  paymentId,
  reason,
  rejectedBy = "platform-admin"
}: {
  paymentId: string;
  reason?: string;
  rejectedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("subscription_payment_logs")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_reason: reason || `Từ chối bởi ${rejectedBy}`
    })
    .eq("id", paymentId)
    .eq("status", "waiting_confirm")
    .select("restaurant_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Giao dịch này không còn chờ xác minh.", 409);
  invalidateRestaurantEntitlementCache(data.restaurant_id);
  await mirrorLegacyPaymentFinalStateToBillingV2(paymentId);
}

export async function sendSubscriptionExpiryReminders() {
  const supabase = createAdminSupabaseClient() as any;
  const horizon = addDays(new Date(), 14).toISOString();
  const { data, error } = await supabase
    .from("restaurant_subscriptions")
    .select("id,restaurant_id,status,trial_ends_at,current_period_end,restaurant:restaurants(name,slug,contact_email),plan:saas_plans(name,code,monthly_price)")
    .in("status", ["trialing", "active"])
    .or(`trial_ends_at.lte.${horizon},current_period_end.lte.${horizon}`);

  if (error) {
    if (isMissingSchemaError(error)) return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
    throw error;
  }

  const thresholds = new Set([14, 7, 3, 1, 0]);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of (data ?? []) as SubscriptionReminderCandidateRow[]) {
    const periodEnd = row.current_period_end || row.trial_ends_at;
    if (!periodEnd) continue;
    const daysLeft = daysUntil(periodEnd);
    if (!thresholds.has(daysLeft)) continue;

    const restaurant = firstOrNull(row.restaurant);
    const plan = firstOrNull(row.plan);
    const recipient = restaurant?.contact_email?.trim().toLowerCase() || null;
    const reminderKey = `expiry_${daysLeft}d_${dateOnly(periodEnd)}`.replace(/[^a-z0-9_:-]/gi, "_").toLowerCase();

    if (!recipient) {
      skipped += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "skipped",
        errorMessage: "Quán chưa có email liên hệ.",
        metadata: { daysLeft, periodEnd }
      });
      continue;
    }

    if (!process.env.RESEND_API_KEY) {
      skipped += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "skipped",
        errorMessage: "Thiếu RESEND_API_KEY.",
        metadata: { daysLeft, periodEnd }
      });
      continue;
    }

    try {
      const emailResult = await sendSubscriptionReminderEmail({
        to: recipient,
        subject: daysLeft <= 0 ? "Gói LogiVN hết hạn hôm nay" : `Gói LogiVN còn ${daysLeft} ngày`,
        html: buildSubscriptionReminderEmail({
          restaurantName: restaurant?.name ?? "Quán của bạn",
          planName: plan?.name ?? "LogiVN",
          daysLeft,
          periodEnd
        })
      });
      sent += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "sent",
        metadata: { daysLeft, periodEnd, providerMessageId: emailResult.providerMessageId }
      });
    } catch (sendError) {
      failed += 1;
      await insertReminderLog({
        restaurantId: row.restaurant_id,
        subscriptionId: row.id,
        reminderKey,
        recipient,
        status: "failed",
        errorMessage: sendError instanceof Error ? sendError.message : "Không gửi được email nhắc gia hạn.",
        metadata: { daysLeft, periodEnd }
      });
    }
  }

  return {
    scanned: (data ?? []).length,
    sent,
    skipped,
    failed
  };
}

export async function expireStaleRestaurantSubscriptions() {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const reminders = await sendSubscriptionExpiryReminders();
  const { data: expiredTrials, error: trialError } = await supabase
    .from("restaurant_subscriptions")
    .update({
      status: "expired",
      updated_at: now
    })
    .eq("status", "trialing")
    .lt("trial_ends_at", now)
    .select("id,restaurant_id");

  if (trialError) throw trialError;

  const { data: pastDueSubscriptions, error: activeError } = await supabase
    .from("restaurant_subscriptions")
    .update({
      status: "past_due",
      updated_at: now
    })
    .eq("status", "active")
    .lt("current_period_end", now)
    .select("id,restaurant_id");

  if (activeError) throw activeError;

  const affectedRestaurantIds = new Set<string>();
  for (const row of expiredTrials ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const row of pastDueSubscriptions ?? []) affectedRestaurantIds.add(row.restaurant_id);
  for (const restaurantId of affectedRestaurantIds) invalidateRestaurantEntitlementCache(restaurantId);

  const result = {
    expiredTrials: expiredTrials?.length ?? 0,
    pastDueSubscriptions: pastDueSubscriptions?.length ?? 0,
    reminders
  };

  if (result.expiredTrials || result.pastDueSubscriptions) {
    await supabase.from("platform_audit_logs").insert({
      actor: "system-cron",
      action: "subscriptions_expired",
      target_type: "restaurant_subscription",
      metadata: result
    });
  }

  return result;
}
