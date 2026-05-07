import "server-only";

import { AppError } from "@/lib/response";
import { getAppUrl } from "@/lib/app-url";
import { getPlatformAdminAuthStatus } from "@/lib/platform-admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

type PlatformStatus = "active" | "suspended" | "deleted";
type UserAccountStatus = "active" | "blocked";
type SubscriptionStatus = "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
type PaymentStatus = "waiting_confirm" | "confirmed" | "rejected" | "expired";

type PlatformSettingsKey = "brand" | "landing" | "billing";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  table_count: number | null;
  contact_email: string | null;
  hotline: string | null;
  address: string | null;
  platform_status?: PlatformStatus;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  deleted_at?: string | null;
  created_at: string;
};

type UserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "STAFF";
  restaurant_id: string;
  account_status?: UserAccountStatus;
  blocked_at?: string | null;
  blocked_reason?: string | null;
};

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
  created_at?: string;
  updated_at?: string;
};

type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  plan?: Pick<PlanRow, "code" | "name" | "monthly_price"> | Pick<PlanRow, "code" | "name" | "monthly_price">[] | null;
};

type PaymentRow = {
  id: string;
  restaurant_id: string;
  plan_id: string | null;
  subscription_id: string | null;
  amount: number;
  months: number;
  method: string;
  status: PaymentStatus;
  transfer_content: string;
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  restaurant?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  plan?: Pick<PlanRow, "code" | "name" | "monthly_price"> | Pick<PlanRow, "code" | "name" | "monthly_price">[] | null;
};

type RegistrationIntentRow = {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type TrialClaimRow = {
  id: string;
  restaurant_id: string | null;
  owner_email: string;
  claimed_at: string;
};

type AuditLogRow = {
  id: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: unknown;
  created_at: string;
};

type SettingRow = {
  key: PlatformSettingsKey;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
};

const fallbackBrandSettings = {
  companyName: "LogiVN",
  legalName: "LogiVN",
  hotline: "1900 633 876",
  email: "support@logivn.com",
  address: "Tầng 3, 139 Nguyễn Trãi, Quận 1, TP. HCM",
  logoUrl: "/brand/logivn/logo-horizontal-nav.png",
  primaryColor: "#0F4D3A",
  accentColor: "#F28C28"
};

const fallbackLandingSettings = {
  heroTitle: "Nền tảng gọi món & vận hành thông minh cho quán Việt",
  heroSubtitle: "QR menu, vận hành đơn, VietQR và báo cáo trong một hệ thống nhẹ, rõ ràng, dễ mở rộng.",
  primaryCta: "Dùng thử miễn phí",
  secondaryCta: "Xem demo",
  trustTitle: "Vì sao hơn 5.000+ quán đã chọn LogiVN?",
  dashboardTitle: "Giao diện hiện đại - Dễ dùng trên mọi thiết bị",
  dashboardSubtitle: "Theo dõi hoạt động của quán mọi lúc mọi nơi với dashboard trực quan và báo cáo chi tiết.",
  finalTitle: "Sẵn sàng nâng tầm trải nghiệm và doanh thu cho quán của bạn?",
  finalSubtitle: "Đăng ký demo miễn phí - Trải nghiệm LogiVN ngay hôm nay.",
  footerTagline: "Gọi món QR & vận hành thông minh cho quán Việt.",
  bannerUrl: "/brand/logivn/landing-hero.webp"
};

const fallbackBillingSettings = {
  bankCode: "VCB",
  bankAccount: "1234567890",
  bankAccountName: "LOGIVN",
  transferPrefix: "LOGIVN",
  defaultPlanCode: "pro"
};

const fallbackPlan: PlanRow = {
  id: "schema-pending-pro",
  code: "pro",
  name: "LogiVN Pro",
  description: "Gói thương mại mặc định. Cần chạy migration để chỉnh sửa trong /admin.",
  monthly_price: 99000,
  trial_days: 30,
  features: ["QR menu theo bàn", "Quản lý đơn realtime", "VietQR thủ công", "Báo cáo email"],
  is_active: true,
  sort_order: 10
};

let platformAdminSnapshotCache: { expiresAt: number; value: Awaited<ReturnType<typeof readPlatformAdminSnapshot>> } | null = null;
const platformAdminSnapshotTtlMs = 5_000;

function firstOrNull<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

function daysUntil(value: string | null | undefined) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function subscriptionIsCurrentlyUsable(subscription: SubscriptionRow) {
  const periodEnd = subscription.current_period_end || subscription.trial_ends_at;
  const notExpired = !periodEnd || new Date(periodEnd).getTime() >= Date.now();
  return (subscription.status === "active" || subscription.status === "trialing") && notExpired;
}

function envStatus(name: string, label: string, required = true) {
  const configured = Boolean(process.env[name]?.trim());

  return {
    name,
    label,
    required,
    configured,
    status: configured ? "OK" : required ? "Thiếu" : "Tuỳ chọn"
  };
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

async function countRows(supabase: any, table: string, warnings: string[], build?: (query: any) => any) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      warnings.push(`Thiếu bảng hoặc cột: ${table}`);
      return 0;
    }
    throw error;
  }
  return count ?? 0;
}

async function safeData<T>(label: string, promise: PromiseLike<{ data: T | null; error: any }>, fallback: T, warnings: string[]) {
  const { data, error } = await promise;
  if (error) {
    if (isMissingSchemaError(error)) {
      warnings.push(`Cần chạy migration cho ${label}`);
      return fallback;
    }
    throw error;
  }
  return data ?? fallback;
}

function normalizeSettingRows(rows: SettingRow[]) {
  const byKey = new Map(rows.map((row) => [row.key, row]));

  return {
    brand: {
      value: asObject(byKey.get("brand")?.value, fallbackBrandSettings),
      updatedAt: byKey.get("brand")?.updated_at ?? null,
      updatedBy: byKey.get("brand")?.updated_by ?? null
    },
    landing: {
      value: asObject(byKey.get("landing")?.value, fallbackLandingSettings),
      updatedAt: byKey.get("landing")?.updated_at ?? null,
      updatedBy: byKey.get("landing")?.updated_by ?? null
    },
    billing: {
      value: asObject(byKey.get("billing")?.value, fallbackBillingSettings),
      updatedAt: byKey.get("billing")?.updated_at ?? null,
      updatedBy: byKey.get("billing")?.updated_by ?? null
    }
  };
}

async function writePlatformAuditLog({
  actor = "platform-admin",
  action,
  targetType,
  targetId,
  metadata = {}
}: {
  actor?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata
  });

  if (error && !isMissingSchemaError(error)) throw error;
}

export function invalidatePlatformAdminSnapshotCache() {
  platformAdminSnapshotCache = null;
}

export async function uploadPlatformAsset(file: FormDataEntryValue | null, folder: "brand" | "landing") {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new AppError("Chỉ hỗ trợ tải ảnh thương hiệu.", 400);
  if (file.size > 8 * 1024 * 1024) throw new AppError("Ảnh thương hiệu không được vượt quá 8MB.", 400);

  const supabase = createAdminSupabaseClient() as any;
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
  const path = `${folder}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("platform-assets").upload(path, file, {
    contentType: file.type,
    upsert: true
  });

  if (error) throw error;
  const { data } = supabase.storage.from("platform-assets").getPublicUrl(path);
  return data.publicUrl as string;
}

export async function updatePlatformSetting({
  key,
  value,
  updatedBy = "platform-admin"
}: {
  key: PlatformSettingsKey;
  value: Record<string, unknown>;
  updatedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy
  });

  if (error) throw error;
  await writePlatformAuditLog({
    actor: updatedBy,
    action: "platform_setting_updated",
    targetType: "platform_setting",
    targetId: key,
    metadata: { key }
  });
  invalidatePlatformAdminSnapshotCache();
}

export async function updateSaasPlan({
  planId,
  name,
  description,
  monthlyPrice,
  trialDays,
  features,
  isActive
}: {
  planId: string;
  name: string;
  description: string;
  monthlyPrice: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("saas_plans")
    .update({
      name,
      description,
      monthly_price: monthlyPrice,
      trial_days: trialDays,
      features,
      is_active: isActive,
      updated_at: new Date().toISOString()
    })
    .eq("id", planId);

  if (error) throw error;
  await writePlatformAuditLog({
    action: "saas_plan_updated",
    targetType: "saas_plan",
    targetId: planId,
    metadata: { name, monthlyPrice, trialDays, isActive }
  });
  invalidatePlatformAdminSnapshotCache();
}

export async function updateTenantPlatformStatus({
  restaurantId,
  status,
  reason
}: {
  restaurantId: string;
  status: PlatformStatus;
  reason?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const update =
    status === "active"
      ? { platform_status: "active", suspended_at: null, suspended_reason: null, deleted_at: null }
      : status === "suspended"
        ? { platform_status: "suspended", suspended_at: now, suspended_reason: reason || "Tạm dừng bởi LogiVN" }
        : { platform_status: "deleted", deleted_at: now, suspended_reason: reason || "Xóa mềm bởi LogiVN" };

  const { error } = await supabase.from("restaurants").update(update).eq("id", restaurantId);
  if (error) throw error;

  if (status === "suspended") {
    await supabase
      .from("restaurant_subscriptions")
      .update({ status: "suspended", suspended_at: now, updated_at: now })
      .eq("restaurant_id", restaurantId)
      .in("status", ["trialing", "pending_payment", "active", "past_due"]);
  }

  await writePlatformAuditLog({
    action: "tenant_status_updated",
    targetType: "restaurant",
    targetId: restaurantId,
    metadata: { status, reason: reason || null }
  });
  invalidatePlatformAdminSnapshotCache();
}

export async function updatePlatformUserStatus({
  userId,
  status,
  reason
}: {
  userId: string;
  status: UserAccountStatus;
  reason?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const update =
    status === "active"
      ? { account_status: "active", blocked_at: null, blocked_reason: null }
      : { account_status: "blocked", blocked_at: new Date().toISOString(), blocked_reason: reason || "Blocked by platform admin" };

  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) throw error;
  await writePlatformAuditLog({
    action: "platform_user_status_updated",
    targetType: "user",
    targetId: userId,
    metadata: { status, reason: reason || null }
  });
  invalidatePlatformAdminSnapshotCache();
}

async function readRestaurants(supabase: any, warnings: string[]) {
  const full = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,table_count,contact_email,hotline,address,platform_status,suspended_at,suspended_reason,deleted_at,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!full.error) return (full.data ?? []) as RestaurantRow[];
  if (!isMissingSchemaError(full.error)) throw full.error;

  warnings.push("Cần chạy migration để có platform_status cho tenant.");
  const legacy = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,table_count,contact_email,hotline,address,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as RestaurantRow[];
}

async function readUsers(supabase: any, warnings: string[]) {
  const full = await supabase
    .from("users")
    .select("id,email,role,restaurant_id,account_status,blocked_at,blocked_reason")
    .limit(2000);

  if (!full.error) return (full.data ?? []) as UserRow[];
  if (!isMissingSchemaError(full.error)) throw full.error;

  warnings.push("Cần chạy migration để có trạng thái chặn user.");
  const legacy = await supabase.from("users").select("id,email,role,restaurant_id").limit(2000);
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as UserRow[];
}

async function readPlatformAdminSnapshot() {
  const startedAt = performance.now();
  const supabase = createAdminSupabaseClient() as any;
  const appUrl = getAppUrl();
  const { url: supabaseUrl } = getSupabaseBrowserEnv();
  const warnings: string[] = [];

  const [
    restaurants,
    users,
    plans,
    subscriptions,
    payments,
    trialClaims,
    registrationIntents,
    settingRows,
    auditLogs,
    usersCount,
    platformAuthStatus
  ] =
    await Promise.all([
      readRestaurants(supabase, warnings),
      readUsers(supabase, warnings),
      safeData<PlanRow[]>(
        "saas_plans",
        supabase.from("saas_plans").select("*").order("sort_order", { ascending: true }),
        [fallbackPlan],
        warnings
      ),
      safeData<SubscriptionRow[]>(
        "restaurant_subscriptions",
        supabase
          .from("restaurant_subscriptions")
          .select("id,restaurant_id,plan_id,status,trial_ends_at,current_period_end,created_at,plan:saas_plans(code,name,monthly_price)")
          .order("created_at", { ascending: false })
          .limit(1000),
        [],
        warnings
      ),
      safeData<PaymentRow[]>(
        "subscription_payment_logs",
        supabase
          .from("subscription_payment_logs")
          .select("id,restaurant_id,plan_id,subscription_id,amount,months,method,status,transfer_content,created_at,confirmed_at,rejected_at,rejected_reason,restaurant:restaurants(name,slug),plan:saas_plans(code,name,monthly_price)")
          .order("created_at", { ascending: false })
          .limit(120),
        [],
        warnings
      ),
      safeData<TrialClaimRow[]>(
        "trial_claims",
        supabase.from("trial_claims").select("id,restaurant_id,owner_email,claimed_at").order("claimed_at", { ascending: false }).limit(500),
        [],
        warnings
      ),
      safeData<RegistrationIntentRow[]>(
        "registration_intents",
        supabase.from("registration_intents").select("id,email,created_at,expires_at,consumed_at").order("created_at", { ascending: false }).limit(40),
        [],
        warnings
      ),
      safeData<SettingRow[]>(
        "platform_settings",
        supabase.from("platform_settings").select("key,value,updated_at,updated_by").in("key", ["brand", "landing", "billing"]),
        [],
        warnings
      ),
      safeData<AuditLogRow[]>(
        "platform_audit_logs",
        supabase
          .from("platform_audit_logs")
          .select("id,actor,action,target_type,target_id,metadata,created_at")
          .order("created_at", { ascending: false })
          .limit(80),
        [],
        warnings
      ),
      countRows(supabase, "users", warnings),
      getPlatformAdminAuthStatus()
    ]);

  const settings = normalizeSettingRows(settingRows);
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const usersByRestaurant = new Map<string, UserRow[]>();
  users.forEach((user) => {
    usersByRestaurant.set(user.restaurant_id, [...(usersByRestaurant.get(user.restaurant_id) ?? []), user]);
  });

  const subscriptionByRestaurant = new Map<string, SubscriptionRow>();
  subscriptions.forEach((subscription) => {
    if (!subscriptionByRestaurant.has(subscription.restaurant_id)) {
      subscriptionByRestaurant.set(subscription.restaurant_id, subscription);
    }
  });

  const trialClaimCountsByEmail = trialClaims.reduce((map, claim) => {
    const email = claim.owner_email.toLowerCase();
    map.set(email, (map.get(email) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const abuseSignals = Array.from(trialClaimCountsByEmail.entries())
    .filter(([, count]) => count > 1)
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const tenants = restaurants.map((restaurant) => {
    const restaurantUsers = usersByRestaurant.get(restaurant.id) ?? [];
    const owners = restaurantUsers.filter((user) => user.role === "ADMIN");
    const subscription = subscriptionByRestaurant.get(restaurant.id) ?? null;
    const plan = subscription ? plansById.get(subscription.plan_id) ?? firstOrNull(subscription.plan) : null;
    const periodEnd = subscription?.current_period_end || subscription?.trial_ends_at || null;
    const status = restaurant.platform_status ?? "active";
    const riskFlags = [
      !subscription ? "Chưa có subscription" : null,
      subscription?.status === "trialing" && daysUntil(subscription.trial_ends_at) <= 3 ? "Trial sắp hết" : null,
      subscription?.status === "past_due" || subscription?.status === "pending_payment" ? "Cần thanh toán gói" : null,
      subscription && !subscriptionIsCurrentlyUsable(subscription) ? "Gói không còn khả dụng" : null,
      status !== "active" ? "Tenant đang bị hạn chế" : null,
      restaurantUsers.some((user) => user.account_status === "blocked") ? "Có user bị chặn" : null
    ].filter(Boolean) as string[];

    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      businessType: restaurant.business_type,
      domain: `${restaurant.slug}.${ROOT_DOMAIN}`,
      dashboardUrl: `https://${restaurant.slug}.${ROOT_DOMAIN}/dashboard`,
      createdAt: restaurant.created_at,
      contactEmail: restaurant.contact_email,
      hotline: restaurant.hotline,
      address: restaurant.address,
      tableCount: restaurant.table_count ?? 0,
      platformStatus: status,
      suspendedAt: restaurant.suspended_at ?? null,
      suspendedReason: restaurant.suspended_reason ?? null,
      deletedAt: restaurant.deleted_at ?? null,
      ownerEmails: owners.map((owner) => owner.email),
      userCount: restaurantUsers.length,
      subscriptionStatus: subscription?.status ?? null,
      planName: plan?.name ?? "Chưa có gói",
      planPrice: plan?.monthly_price ?? 0,
      periodEnd,
      daysLeft: daysUntil(periodEnd),
      riskFlags
    };
  });

  const pendingPayments = payments.filter((payment) => payment.status === "waiting_confirm");
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === "active" && subscriptionIsCurrentlyUsable(subscription));
  const trialingSubscriptions = subscriptions.filter((subscription) => subscription.status === "trialing" && subscriptionIsCurrentlyUsable(subscription));
  const suspendedTenants = tenants.filter((tenant) => tenant.platformStatus !== "active");
  const mrr = activeSubscriptions.reduce((sum, subscription) => {
    const plan = plansById.get(subscription.plan_id);
    return sum + Number(plan?.monthly_price ?? 0);
  }, 0);

  const env = [
    envStatus("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"),
    envStatus("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"),
    envStatus("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role"),
    envStatus("NEXT_PUBLIC_APP_URL", "App URL"),
    {
      ...envStatus("PLATFORM_ADMIN_PASSWORD", "Mật khẩu /admin", process.env.NODE_ENV === "production"),
      configured: platformAuthStatus.configured,
      status: platformAuthStatus.configured
        ? platformAuthStatus.requiresFirstPasswordChange
          ? "Cần đổi lần đầu"
          : "OK"
        : process.env.NODE_ENV === "production"
          ? "Thiếu"
          : "Tuỳ chọn"
    },
    envStatus("PLATFORM_ADMIN_SESSION_SECRET", "Session secret /admin", false),
    envStatus("RESEND_API_KEY", "Resend email", false),
    envStatus("CRON_SECRET", "Cron secret", false),
    envStatus("MAPBOX_ACCESS_TOKEN", "Mapbox ship/route", false),
    {
      ...envStatus("QWEN_API_KEY", "Alibaba Qwen AI", false),
      configured: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)
    },
    envStatus("XAI_API_KEY", "xAI Grok/Voice/Image", false)
  ];
  const securityControls = [
    {
      layer: "Auth / session",
      status: platformAuthStatus.configured ? (platformAuthStatus.requiresFirstPasswordChange ? "Cần đổi lần đầu" : "OK") : "Cần cấu hình",
      note: "Dashboard quán dùng Supabase Auth; /admin dùng cookie HTTP-only ký HMAC và mật khẩu được hash sau lần đổi đầu tiên."
    },
    {
      layer: "Tenant isolation",
      status: warnings.some((item) => item.includes("platform_status")) ? "Cần migration" : "OK",
      note: "Mọi dữ liệu vận hành lọc theo restaurant_id và RLS bảo vệ truy cập tenant."
    },
    {
      layer: "Billing entitlement",
      status: warnings.some((item) => item.includes("restaurant_subscriptions")) ? "Cần migration" : "OK",
      note: "Các thao tác vận hành phải đi qua subscription active/trial còn hạn."
    },
    {
      layer: "Trial abuse",
      status: abuseSignals.length ? "Cần rà soát" : "OK",
      note: "Theo dõi email/IP hash đã dùng trial để giảm spam ưu đãi."
    },
    {
      layer: "Public API rate limit",
      status: "OK",
      note: "Đăng nhập, đăng ký, order, booking và gọi nhân viên đều có rate limit theo IP."
    },
    {
      layer: "Storage / upload",
      status: "OK",
      note: "Ảnh menu và brand kiểm mime/size, lưu bucket riêng, không cho upload tuỳ ý lên server."
    },
    {
      layer: "Vercel headers",
      status: "OK",
      note: "CSP, HSTS, X-Frame-Options, nosniff và Referrer-Policy cấu hình ở next.config.ts."
    },
    {
      layer: "Audit trail",
      status: warnings.some((item) => item.includes("platform_audit_logs")) ? "Cần migration" : "OK",
      note: "Các thao tác dev control plane ghi log phục vụ audit."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    queryLatencyMs: Math.round(performance.now() - startedAt),
    environment: {
      appUrl,
      rootDomain: ROOT_DOMAIN,
      supabaseHost: new URL(supabaseUrl).host,
      vercelEnv: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      nodeEnv: process.env.NODE_ENV ?? "development"
    },
    metrics: {
      tenants: restaurants.length,
      users: usersCount,
      activeTenants: tenants.filter((tenant) => tenant.platformStatus === "active").length,
      suspendedTenants: suspendedTenants.length,
      activeSubscriptions: activeSubscriptions.length,
      trialingSubscriptions: trialingSubscriptions.length,
      pendingPayments: pendingPayments.length,
      mrr,
      abuseSignals: abuseSignals.length,
      migrationWarnings: warnings.length
    },
    settings,
    plans: plans.map((plan) => ({ ...plan, features: asStringList(plan.features) })),
    tenants,
    users: users.map((user) => {
      const restaurant = restaurants.find((item) => item.id === user.restaurant_id);
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        accountStatus: user.account_status ?? "active",
        blockedAt: user.blocked_at ?? null,
        blockedReason: user.blocked_reason ?? null,
        restaurantId: user.restaurant_id,
        restaurantName: restaurant?.name ?? "Không rõ quán",
        restaurantSlug: restaurant?.slug ?? ""
      };
    }),
    payments: payments.map((payment) => {
      const restaurant = firstOrNull(payment.restaurant);
      const plan = firstOrNull(payment.plan);
      return {
        id: payment.id,
        restaurantId: payment.restaurant_id,
        restaurantName: restaurant?.name ?? tenants.find((tenant) => tenant.id === payment.restaurant_id)?.name ?? "Không rõ quán",
        restaurantSlug: restaurant?.slug ?? tenants.find((tenant) => tenant.id === payment.restaurant_id)?.slug ?? "",
        planName: plan?.name ?? "Gói SaaS",
        amount: payment.amount,
        months: payment.months,
        method: payment.method,
        status: payment.status,
        transferContent: payment.transfer_content,
        createdAt: payment.created_at,
        confirmedAt: payment.confirmed_at,
        rejectedAt: payment.rejected_at,
        rejectedReason: payment.rejected_reason
      };
    }),
    registrationIntents: registrationIntents.map((intent) => ({
      id: intent.id,
      email: intent.email,
      createdAt: intent.created_at,
      expiresAt: intent.expires_at,
      consumed: Boolean(intent.consumed_at)
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      actor: log.actor,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      metadata: log.metadata,
      createdAt: log.created_at
    })),
    abuseSignals,
    warnings: Array.from(new Set(warnings)),
    env,
    securityControls,
    modules: [
      { key: "cms", name: "CMS landing & brand", status: "live", owner: "Platform", note: "Sửa nội dung website, logo, banner và thông tin công ty tại /admin." },
      { key: "billing", name: "Billing SaaS", status: warnings.some((item) => item.includes("saas")) ? "needs_config" : "live", owner: "Platform", note: "Gói Pro 99k/tháng, trial 30 ngày, VietQR manual confirm." },
      { key: "tenant", name: "Tenant lifecycle", status: "live", owner: "Platform", note: "Chỉ quản lý metadata, tạm dừng hoặc xoá mềm quán, không đọc doanh thu/đơn hàng riêng tư." },
      { key: "security", name: "Security guardrails", status: env.some((item) => item.required && !item.configured) ? "needs_config" : "live", owner: "Security", note: "HTTP-only /admin session, service-role chỉ ở server, RLS cho tenant data." },
      { key: "growth", name: "Trial governance", status: abuseSignals.length ? "needs_review" : "live", owner: "Growth", note: "Theo dõi email trial trùng để giảm spam/lạm dụng ưu đãi." }
    ]
  };
}

export async function getPlatformAdminSnapshot() {
  if (platformAdminSnapshotCache && platformAdminSnapshotCache.expiresAt > Date.now()) {
    return platformAdminSnapshotCache.value;
  }

  const snapshot = await readPlatformAdminSnapshot();
  platformAdminSnapshotCache = {
    value: snapshot,
    expiresAt: Date.now() + platformAdminSnapshotTtlMs
  };
  return snapshot;
}
