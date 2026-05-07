import "server-only";

import { createHash } from "crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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

function hasCurrentAccessWindow(subscription: SubscriptionRow, allowOpenEnded = true) {
  const accessEnd = getSubscriptionAccessEnd(subscription);
  if (!accessEnd) return allowOpenEnded;
  return new Date(accessEnd).getTime() >= Date.now();
}

function isSubscriptionUsable(subscription: SubscriptionRow) {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return hasCurrentAccessWindow(subscription);
  }

  // A renewal or upgrade payment can be waiting for manual confirmation while the
  // current paid/trial window is still valid. Do not lock the restaurant in that case.
  if (subscription.status === "pending_payment") {
    return hasCurrentAccessWindow(subscription, false);
  }

  return false;
}

async function readRestaurantEntitlement(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id,platform_status,suspended_at,deleted_at")
    .eq("id", restaurantId)
    .maybeSingle();

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

  const { data: subscription, error: subscriptionError } = await supabase
    .from("restaurant_subscriptions")
    .select("*,plan:saas_plans(id,code,name,monthly_price,trial_days,features,is_active,sort_order)")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing", "pending_payment", "active", "past_due", "suspended", "cancelled", "expired"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const sub = subscription as SubscriptionRow;
  const plan = firstOrNull((subscription as { plan?: PlanRow | PlanRow[] | null }).plan);
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

export async function getActivePlans() {
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
  const plan = await getDefaultPlan(planCode || undefined);
  const now = new Date();
  const trialEnds = addDays(now, plan.trial_days);
  const normalizedOwnerEmail = ownerEmail.toLowerCase();

  const { data: existing, error: existingError } = await supabase
    .from("restaurant_subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as SubscriptionRow;

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
        trialBlockedByPriorClaim: hasUsedTrial
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
  const [restaurant, subscription, plans, billing] = await Promise.all([
    getRestaurant(restaurantId),
    getOrCreateSubscription(restaurantId, ownerEmail),
    getActivePlans(),
    getBillingSettings()
  ]);

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (paymentsError) throw paymentsError;

  const currentPlan = plans.find((plan) => plan.id === subscription.plan_id) ?? (await getDefaultPlan());
  const paymentRequests = ((paymentRows ?? []) as PaymentRow[]).map((payment) => ({
    ...payment,
    qrUrl: vietQrUrl({
      bank: billing.bankCode,
      account: billing.bankAccount,
      amount: payment.amount,
      transferContent: payment.transfer_content
    })
  }));
  const pendingPayment = paymentRequests.find((payment) => payment.status === "waiting_confirm") ?? null;

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
    daysLeft: daysUntil(getSubscriptionAccessEnd(subscription)),
    usable: isSubscriptionUsable(subscription),
    hasPendingPayment: Boolean(pendingPayment),
    needsPayment: !isSubscriptionUsable(subscription)
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
        fromPlanCode: currentPlan.code,
        fromPlanName: currentPlan.name,
        planCode: targetPlan.code,
        planName: targetPlan.name
      }
    })
    .select()
    .single();

  if (error) throw error;

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
  const { data: paymentBeforeConfirm, error: paymentBeforeConfirmError } = await supabase
    .from("subscription_payment_logs")
    .select("restaurant_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentBeforeConfirmError) throw paymentBeforeConfirmError;

  const { data: rpcResult, error: rpcError } = await supabase.rpc("confirm_subscription_payment_atomic", {
    p_payment_id: paymentId,
    p_confirmed_by: confirmedBy
  });

  if (!rpcError) {
    invalidateRestaurantEntitlementCache(paymentBeforeConfirm?.restaurant_id ?? undefined);
    return rpcResult;
  }
  if (rpcError.code !== "PGRST202" && rpcError.code !== "42883") {
    throw rpcError;
  }

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
  const now = new Date();
  const basePeriod = sub.current_period_end && new Date(sub.current_period_end).getTime() > now.getTime()
    ? new Date(sub.current_period_end)
    : now;
  const nextPeriodEnd = addMonths(basePeriod, paymentRow.months);

  const { data: lockedPayment, error: paymentUpdateError } = await supabase
    .from("subscription_payment_logs")
    .update({
      status: "confirmed",
      confirmed_at: now.toISOString(),
      confirmed_by: confirmedBy
    })
    .eq("id", paymentRow.id)
    .eq("status", "waiting_confirm")
    .select("id")
    .maybeSingle();

  if (paymentUpdateError) throw paymentUpdateError;
  if (!lockedPayment) throw new AppError("Giao dịch này vừa được xử lý bởi phiên khác.", 409);

  const [{ error: subscriptionUpdateError }, { error: restaurantUpdateError }] = await Promise.all([
    supabase
      .from("restaurant_subscriptions")
      .update({
        plan_id: paymentRow.plan_id ?? sub.plan_id,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: nextPeriodEnd.toISOString(),
        suspended_at: null,
        updated_at: now.toISOString()
      })
      .eq("id", sub.id),
    supabase
      .from("restaurants")
      .update({
        platform_status: "active",
        suspended_at: null,
        suspended_reason: null
      })
      .eq("id", paymentRow.restaurant_id)
  ]);

  if (subscriptionUpdateError) throw subscriptionUpdateError;
  if (restaurantUpdateError) throw restaurantUpdateError;
  invalidateRestaurantEntitlementCache(paymentRow.restaurant_id);
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
