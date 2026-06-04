import "server-only";

import { AppError } from "@/lib/response";
import { getAppUrl } from "@/lib/app-url";
import { buildPaymentPolicySummary } from "@/lib/billing/subscription-transitions";
import { BLOG_POSTS } from "@/lib/seo/blog";
import { getPlatformAdminAuthStatus } from "@/lib/platform-admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";
import { getBackupHealth } from "@/services/backup-service";
import { listPlatformAiProviderConfigs, type PlatformAiProviderConfigSummary } from "@/services/platform-ai-provider-config-service";
import { invalidateMenuCache } from "@/services/menu-service";

type PlatformStatus = "active" | "suspended" | "deleted";
type UserAccountStatus = "active" | "blocked";
type SubscriptionStatus = "trialing" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
type PaymentStatus = "waiting_confirm" | "confirmed" | "rejected" | "expired";

type PlatformSettingsKey = "brand" | "landing" | "billing";
type ControlPlaneStatus = "live" | "configured" | "partial" | "static" | "planned" | "blocked" | "needs_review" | "needs_config";

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
  raw_data?: unknown;
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  restaurant?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  plan?: Pick<PlanRow, "code" | "name" | "monthly_price"> | Pick<PlanRow, "code" | "name" | "monthly_price">[] | null;
};

type BillingV2PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  metadata?: unknown;
};

type BillingV2SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "grace" | "pending_payment" | "cancelled" | "expired" | "suspended";
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  plan?: Pick<BillingV2PlanRow, "code" | "name" | "monthly_price"> | Pick<BillingV2PlanRow, "code" | "name" | "monthly_price">[] | null;
};

type BillingV2PaymentRow = {
  id: string;
  restaurant_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "detected" | "waiting_confirmation" | "confirmed" | "failed" | "expired" | "cancelled" | "refunded";
  transfer_code: string;
  created_at: string;
  confirmed_at: string | null;
  restaurant?: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type BillingCutoverCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

type BillingAnomaly = {
  key: BillingAnomalyKey;
  severity: "warning" | "danger";
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  detail: string;
};

type BillingAnomalyKey =
  | "premium_trial_subscription"
  | "pending_without_payment"
  | "pending_payment_missing_policy";

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

type AiUsageSnapshotRow = {
  provider: string;
  model: string;
  status: "success" | "failed" | "blocked";
  request_kind: string;
  feature_key: string;
  input_tokens: number | null;
  output_tokens: number | null;
  image_count: number | null;
  cost_units: number | null;
  created_at: string;
};

type AiMorningBriefSnapshotRow = {
  restaurant_id: string;
  restaurant_name: string;
  brief_date: string;
  channel: "dashboard" | "email";
  status: "generated" | "sent" | "skipped" | "failed";
  health_score: number;
  summary: string;
  insight_count: number;
  critical_count: number;
  warning_count: number;
  opportunity_count: number;
  recipient_emails: string[];
  action_items: unknown;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

type AiBranchInsightSnapshotRow = {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  kind: string;
  severity: "critical" | "warning" | "opportunity" | "info";
  status: "active" | "seen" | "dismissed" | "resolved" | "expired";
  title: string;
  action: string;
  metric_label: string | null;
  metric_value: string | null;
  last_seen_at: string | null;
  created_at: string;
  restaurant?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  branch?: { name: string } | { name: string }[] | null;
};

type MapProviderSnapshotRow = {
  provider: string;
  operation: string;
  outcome: string;
  latency_ms: number;
  estimated_cost_vnd: number;
  created_at: string;
};

type MapCacheSnapshotRow = {
  operation: string;
  hit: boolean;
  created_at: string;
};

type DeliveryQuoteSnapshotRow = {
  accepted: boolean;
  provider: string;
  route_provider: string | null;
  confidence: string | null;
  is_estimated: boolean | null;
  distance_km: number | null;
  fee: number | null;
  latency_ms: number;
  created_at: string;
};

type CronRunStatus = "success" | "warn" | "error";

type CronRunLogRow = {
  job_key: string;
  status: CronRunStatus;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  result_summary: unknown;
  error_message: string | null;
};

type CronRunHistory = {
  status: CronRunStatus;
  startedAt: string;
  durationMs: number;
  summary: Record<string, unknown>;
  error: string | null;
};

type ContentSurface = {
  key: string;
  name: string;
  route: string;
  source: string;
  status: ControlPlaneStatus;
  editable: "direct" | "partial" | "code_only" | "planned";
  items: number;
  lastUpdated: string | null;
  owner: string;
  note: string;
};

type IntegrationHealth = {
  key: string;
  name: string;
  category: "core" | "ai" | "maps" | "storage" | "email" | "ops";
  status: ControlPlaneStatus;
  required: boolean;
  configured: number;
  total: number;
  envNames: string[];
  secretHandling: string;
  note: string;
};

type CronJobHealth = {
  key: string;
  name: string;
  path: string;
  schedule: string;
  status: ControlPlaneStatus;
  guard: string;
  owner: string;
  note: string;
  lastRunAt?: string | null;
  lastRunStatus?: CronRunStatus | null;
  lastDurationMs?: number | null;
  lastSummary?: Record<string, unknown>;
  lastError?: string | null;
  nextRunAt?: string | null;
  lastRunAgeHours?: number | null;
  failureStreak?: number;
  attentionStreak?: number;
  recentRuns?: CronRunHistory[];
};

type AdminCapability = {
  key: string;
  name: string;
  section: string;
  owner: string;
  status: ControlPlaneStatus;
  observe: "live" | "partial" | "planned";
  adjust: "live" | "partial" | "planned" | "blocked";
  audit: "live" | "partial" | "planned";
  rollback: "live" | "partial" | "planned";
  note: string;
  nextStep: string;
};

type AdminMutation = {
  key: string;
  name: string;
  surface: string;
  risk: "low" | "medium" | "high";
  status: ControlPlaneStatus;
  guard: string;
  auditAction: string;
  rollback: string;
};

type AdminRoleReadiness = {
  key: string;
  role: string;
  scope: string;
  status: ControlPlaneStatus;
  note: string;
};

type ProjectSurfaceKind = "frontend" | "backend" | "data" | "automation" | "integration";
type ProjectSurface = {
  key: string;
  name: string;
  kind: ProjectSurfaceKind;
  owner: string;
  criticality: "critical" | "high" | "medium";
  status: ControlPlaneStatus;
  observe: "live" | "partial" | "planned";
  control: "live" | "partial" | "planned" | "blocked";
  audit: "live" | "partial" | "planned";
  routes: string[];
  dependencies: string[];
  note: string;
  nextStep: string;
};

type SettingRow = {
  key: PlatformSettingsKey;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
};

const DEFAULT_LANDING_BANNER_URL = "/brand/logivn/01-banner-overview-hero-v2.png";
const PREVIOUS_LANDING_BANNER_URL = "/brand/logivn/01-banner-overview-hero.png";
const LEGACY_LANDING_BANNER_URL = "/brand/logivn/landing-hero.webp";

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
  bannerUrl: DEFAULT_LANDING_BANNER_URL
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
  description: "Gói thương mại mặc định. Cần chạy migration để chỉnh sửa trong Control Center.",
  monthly_price: 99000,
  trial_days: 30,
  features: ["QR menu theo bàn", "Quản lý đơn realtime", "VietQR thủ công", "Báo cáo email"],
  is_active: true,
  sort_order: 10
};

const missionControlCronJobs: CronJobHealth[] = [
  {
    key: "reports",
    name: "Scheduled reports",
    path: "/api/cron/reports",
    schedule: "0 1 * * *",
    status: "needs_config",
    guard: "CRON_SECRET",
    owner: "Ops",
    note: "Gửi báo cáo định kỳ cho quán theo report_schedules."
  },
  {
    key: "ai-ops",
    name: "AI Ops insights",
    path: "/api/cron/ai-ops",
    schedule: "30 1 * * *",
    status: "needs_config",
    guard: "CRON_SECRET",
    owner: "AI Ops",
    note: "Tạo thẻ vận hành thông minh hằng ngày cho các quán active."
  },
  {
    key: "reservations-expire",
    name: "Reservation lifecycle cleanup",
    path: "/api/cron/reservations/expire",
    schedule: "*/15 * * * *",
    status: "needs_config",
    guard: "CRON_SECRET",
    owner: "Ops",
    note: "Dọn giữ bàn hết hạn và tự đánh dấu no-show sau thời gian trễ hẹn."
  },
  {
    key: "subscriptions",
    name: "Subscription lifecycle",
    path: "/api/cron/subscriptions",
    schedule: "15 2 * * *",
    status: "needs_config",
    guard: "CRON_SECRET",
    owner: "Billing",
    note: "Đánh dấu trial/subscription hết hạn và ghi audit."
  }
];

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

function average(values: number[]) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (safeValues.length === 0) return 0;
  return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 100) / 100;
}

function latestCronRunMap(rows: CronRunLogRow[]) {
  const map = new Map<string, CronRunLogRow>();
  rows.forEach((row) => {
    if (!map.has(row.job_key)) map.set(row.job_key, row);
  });
  return map;
}

function cronRunsByJob(rows: CronRunLogRow[]) {
  return rows.reduce<Map<string, CronRunLogRow[]>>((map, row) => {
    map.set(row.job_key, [...(map.get(row.job_key) ?? []), row]);
    return map;
  }, new Map());
}

function cronRunHistory(rows: CronRunLogRow[], limit = 5): CronRunHistory[] {
  return rows.slice(0, limit).map((row) => ({
    status: row.status,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    summary: asObject(row.result_summary, {}),
    error: row.error_message
  }));
}

function cronStatusStreak(rows: CronRunLogRow[], predicate: (status: CronRunStatus) => boolean) {
  let streak = 0;
  for (const row of rows) {
    if (!predicate(row.status)) break;
    streak += 1;
  }
  return streak;
}

function nextDailyCronRunAt(schedule: string, now = new Date()) {
  const match = schedule.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (!match) return null;

  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function hoursSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.round(Math.max(0, now - timestamp) / 36_000) / 100;
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function configuredEnvCount(names: string[]) {
  return names.filter((name) => Boolean(process.env[name]?.trim())).length;
}

function buildIntegrationHealth({
  key,
  name,
  category,
  envNames,
  required = false,
  secretHandling,
  note
}: Omit<IntegrationHealth, "status" | "configured" | "total">): IntegrationHealth {
  const configured = configuredEnvCount(envNames);
  const status: ControlPlaneStatus =
    configured === envNames.length
      ? "configured"
      : configured > 0
        ? "partial"
        : required
          ? "needs_config"
          : "needs_review";

  return {
    key,
    name,
    category,
    status,
    required,
    configured,
    total: envNames.length,
    envNames,
    secretHandling,
    note
  };
}

function normalizeLandingBannerUrl(value: unknown) {
  if (typeof value !== "string") return DEFAULT_LANDING_BANNER_URL;
  const bannerUrl = value.trim();
  if (!bannerUrl || bannerUrl === LEGACY_LANDING_BANNER_URL || bannerUrl === PREVIOUS_LANDING_BANNER_URL) {
    return DEFAULT_LANDING_BANNER_URL;
  }
  return bannerUrl;
}

function normalizeLandingSettings(value: unknown) {
  const landing = asObject(value, fallbackLandingSettings);
  return {
    ...landing,
    bannerUrl: normalizeLandingBannerUrl(landing.bannerUrl)
  };
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

function billingV2SubscriptionIsCurrentlyUsable(subscription: BillingV2SubscriptionRow) {
  const periodEnd = subscription.current_period_end || subscription.trial_ends_at;
  const notExpired = !periodEnd || new Date(periodEnd).getTime() >= Date.now();
  return (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "grace") && notExpired;
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

function safeMorningBriefActionItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "Action item",
      severity: typeof item.severity === "string" ? item.severity : "info",
      action: typeof item.action === "string" ? item.action : ""
    }))
    .slice(0, 3);
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
      value: normalizeLandingSettings(byKey.get("landing")?.value),
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

function buildContentSurfaces({
  settings,
  effectivePlans,
  billingV2Available,
  appUrl
}: {
  settings: ReturnType<typeof normalizeSettingRows>;
  effectivePlans: PlanRow[];
  billingV2Available: boolean;
  appUrl: string;
}): ContentSurface[] {
  return [
    {
      key: "landing",
      name: "Landing page",
      route: "/",
      source: "platform_settings.landing",
      status: settings.landing.updatedAt ? "live" : "needs_review",
      editable: "direct",
      items: 1,
      lastUpdated: settings.landing.updatedAt,
      owner: "Growth",
      note: "Headline, CTA, trust block, dashboard section, final CTA và hero banner đang chỉnh trực tiếp trên admin.logivn.com/site."
    },
    {
      key: "pricing",
      name: "Pricing page",
      route: "/pricing",
      source: billingV2Available ? "subscription_plans + saas_plans bridge" : "saas_plans",
      status: effectivePlans.length ? "live" : "needs_config",
      editable: "partial",
      items: effectivePlans.length,
      lastUpdated: null,
      owner: "Billing",
      note: "Giá/gói chỉnh từ admin.logivn.com/plans; nội dung FAQ và layout pricing vẫn ở code để giảm rủi ro SEO."
    },
    {
      key: "blog",
      name: "Blog SEO",
      route: "/blog",
      source: "lib/seo/blog.ts",
      status: "static",
      editable: "code_only",
      items: BLOG_POSTS.length,
      lastUpdated: BLOG_POSTS.reduce<string | null>((latest, post) => {
        if (!latest) return post.updatedAt;
        return post.updatedAt > latest ? post.updatedAt : latest;
      }, null),
      owner: "SEO",
      note: "Blog đang là content-as-code. Bước nâng cấp nên thêm draft/preview/publish/rollback trước khi cho chỉnh trên UI."
    },
    {
      key: "customer-menu",
      name: "Customer QR menu",
      route: "/r/[restaurantSlug]",
      source: "tenant dashboard data",
      status: "live",
      editable: "partial",
      items: 1,
      lastUpdated: null,
      owner: "Tenant Ops",
      note: "Nội dung menu thuộc từng quán; platform chỉ nên quan sát sức khoẻ và hỗ trợ debug, không sửa thay chủ quán nếu chưa có support mode."
    },
    {
      key: "feed",
      name: "SEO feed/sitemap/llms",
      route: `${appUrl}/sitemap.xml`,
      source: "app/sitemap.ts + app/feed.xml + app/llms.txt",
      status: "live",
      editable: "planned",
      items: 3,
      lastUpdated: null,
      owner: "SEO",
      note: "Nên thêm SEO checks trên admin.logivn.com để phát hiện indexability, canonical, schema và internal link trước khi publish."
    }
  ];
}

function summarizeAiControl(
  rows: AiUsageSnapshotRow[],
  morningBriefRows: AiMorningBriefSnapshotRow[] = [],
  branchInsightRows: AiBranchInsightSnapshotRow[] = [],
  providerConfigs: PlatformAiProviderConfigSummary[] = []
) {
  const successes = rows.filter((row) => row.status === "success").length;
  const failures = rows.filter((row) => row.status === "failed").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  const tokens = rows.reduce(
    (sum, row) => sum + (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0),
    0
  );
  const imageCount = rows.reduce((sum, row) => sum + (Number(row.image_count) || 0), 0);
  const costUnits = rows.reduce((sum, row) => sum + (Number(row.cost_units) || 0), 0);
  const providerGroups = new Map<string, { provider: string; requests: number; failures: number; tokens: number; models: Set<string> }>();

  for (const row of rows) {
    const current = providerGroups.get(row.provider) ?? {
      provider: row.provider,
      requests: 0,
      failures: 0,
      tokens: 0,
      models: new Set<string>()
    };
    current.requests += 1;
    if (row.status !== "success") current.failures += 1;
    current.tokens += (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0);
    if (row.model) current.models.add(row.model);
    providerGroups.set(row.provider, current);
  }

  return {
    windowHours: 24,
    requests: rows.length,
    successes,
    failures,
    blocked,
    successRate: percentage(successes, rows.length),
    tokens,
    imageCount,
    costUnits: Math.round(costUnits * 100) / 100,
    providers: [...providerGroups.values()].map((group) => ({
      provider: group.provider,
      requests: group.requests,
      failures: group.failures,
      failureRate: percentage(group.failures, group.requests),
      tokens: group.tokens,
      models: [...group.models].slice(0, 4)
    })),
    morningBriefs: {
      windowDays: 7,
      runs: morningBriefRows.length,
      generated: morningBriefRows.filter((row) => row.channel === "dashboard" && row.status === "generated").length,
      sent: morningBriefRows.filter((row) => row.status === "sent").length,
      skipped: morningBriefRows.filter((row) => row.status === "skipped").length,
      failed: morningBriefRows.filter((row) => row.status === "failed").length,
      averageHealth: average(morningBriefRows.map((row) => row.health_score)),
      latestAt: morningBriefRows[0]?.created_at ?? null,
      recent: morningBriefRows.slice(0, 8).map((row) => ({
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        briefDate: row.brief_date,
        channel: row.channel,
        status: row.status,
        healthScore: row.health_score,
        summary: row.summary,
        insights: row.insight_count,
        critical: row.critical_count,
        warning: row.warning_count,
        opportunity: row.opportunity_count,
        recipients: row.recipient_emails ?? [],
        actions: safeMorningBriefActionItems(row.action_items),
        error: row.error_message,
        createdAt: row.created_at,
        sentAt: row.sent_at
      }))
    },
    branchInsights: {
      windowDays: 7,
      insights: branchInsightRows.length,
      active: branchInsightRows.filter((row) => row.status === "active" || row.status === "seen").length,
      critical: branchInsightRows.filter((row) => row.severity === "critical").length,
      warning: branchInsightRows.filter((row) => row.severity === "warning").length,
      restaurants: new Set(branchInsightRows.map((row) => row.restaurant_id)).size,
      branches: new Set(branchInsightRows.map((row) => row.branch_id).filter(Boolean)).size,
      latestAt: branchInsightRows[0]?.last_seen_at ?? branchInsightRows[0]?.created_at ?? null,
      recent: branchInsightRows.slice(0, 8).map((row) => {
        const restaurant = firstOrNull(row.restaurant);
        const branch = firstOrNull(row.branch);
        return {
          id: row.id,
          restaurantId: row.restaurant_id,
          restaurantName: restaurant?.name ?? "Unknown restaurant",
          restaurantSlug: restaurant?.slug ?? "",
          branchId: row.branch_id,
          branchName: branch?.name ?? "Chi nhánh",
          kind: row.kind,
          severity: row.severity,
          status: row.status,
          title: row.title,
          action: row.action,
          metric: row.metric_label || row.metric_value ? `${row.metric_label ?? "Metric"}: ${row.metric_value ?? "--"}` : null,
          lastSeenAt: row.last_seen_at ?? row.created_at
        };
      })
    },
    providerConfigs,
    runtimeConfig: {
      configuredProviders: providerConfigs.filter((provider) => provider.configured).length,
      managedProviders: providerConfigs.filter((provider) => provider.managed).length,
      databaseKeys: providerConfigs.filter((provider) => provider.keySource === "database").length,
      disabledProviders: providerConfigs.filter((provider) => !provider.enabled).length
    },
    routing: {
      ownerProvider: process.env.AI_OWNER_PROVIDER || process.env.COPILOTKIT_PROVIDER || "qwen",
      customerProvider: process.env.AI_CUSTOMER_PROVIDER || "qwen",
      imageProvider: process.env.AI_IMAGE_PROVIDER || "xai",
      ownerModel: providerConfigs.find((provider) => provider.provider === "qwen")?.chatModel || process.env.QWEN_CHAT_MODEL || process.env.QWEN_MODEL || process.env.COPILOTKIT_MODEL || "qwen-plus",
      imageModel:
        providerConfigs.find((provider) => provider.provider === "xai")?.imageModel ||
        providerConfigs.find((provider) => provider.provider === "qwen")?.imageModel ||
        process.env.XAI_IMAGE_MODEL ||
        process.env.QWEN_IMAGE_MODEL ||
        "provider-default"
    }
  };
}

function summarizeMapControl({
  providerLogs,
  cacheLogs,
  quoteLogs
}: {
  providerLogs: MapProviderSnapshotRow[];
  cacheLogs: MapCacheSnapshotRow[];
  quoteLogs: DeliveryQuoteSnapshotRow[];
}) {
  const providerFailures = providerLogs.filter((row) => row.outcome !== "success").length;
  const cacheHits = cacheLogs.filter((row) => row.hit).length;
  const acceptedQuotes = quoteLogs.filter((row) => row.accepted).length;
  const estimatedQuotes = quoteLogs.filter((row) => row.is_estimated).length;
  const providerGroups = new Map<string, { provider: string; requests: number; failures: number; cost: number; latencies: number[] }>();

  for (const row of providerLogs) {
    const current = providerGroups.get(row.provider) ?? {
      provider: row.provider,
      requests: 0,
      failures: 0,
      cost: 0,
      latencies: []
    };
    current.requests += 1;
    if (row.outcome !== "success") current.failures += 1;
    current.cost += Number(row.estimated_cost_vnd) || 0;
    current.latencies.push(Number(row.latency_ms) || 0);
    providerGroups.set(row.provider, current);
  }

  return {
    windowHours: 24,
    provider: {
      requests: providerLogs.length,
      failures: providerFailures,
      failureRate: percentage(providerFailures, providerLogs.length),
      avgLatencyMs: average(providerLogs.map((row) => Number(row.latency_ms) || 0)),
      estimatedCostVnd: Math.round(providerLogs.reduce((sum, row) => sum + (Number(row.estimated_cost_vnd) || 0), 0)),
      breakdown: [...providerGroups.values()].map((group) => ({
        provider: group.provider,
        requests: group.requests,
        failures: group.failures,
        failureRate: percentage(group.failures, group.requests),
        avgLatencyMs: average(group.latencies),
        estimatedCostVnd: Math.round(group.cost)
      }))
    },
    cache: {
      events: cacheLogs.length,
      hits: cacheHits,
      misses: cacheLogs.length - cacheHits,
      hitRate: percentage(cacheHits, cacheLogs.length)
    },
    quotes: {
      requests: quoteLogs.length,
      accepted: acceptedQuotes,
      acceptanceRate: percentage(acceptedQuotes, quoteLogs.length),
      estimated: estimatedQuotes,
      estimatedRate: percentage(estimatedQuotes, quoteLogs.length),
      avgDistanceKm: average(quoteLogs.map((row) => Number(row.distance_km) || 0)),
      avgFee: Math.round(average(quoteLogs.map((row) => Number(row.fee) || 0))),
      avgLatencyMs: average(quoteLogs.map((row) => Number(row.latency_ms) || 0))
    },
    routing: {
      geocoder: process.env.MAPS_GEOCODER_PROVIDER || "goong",
      geocoderFallbacks: process.env.MAPS_GEOCODER_FALLBACKS || "goong,vietmap,mapbox,nominatim",
      router: process.env.MAPS_ROUTING_PROVIDER || "goong",
      routerFallbacks: process.env.MAPS_ROUTING_FALLBACKS || "goong,vietmap,osrm",
      cacheNamespace: process.env.MAPS_CACHE_NAMESPACE || "logivn:maps:v1"
    }
  };
}

function applyManagedProviderHealth(base: IntegrationHealth, providerConfig?: PlatformAiProviderConfigSummary): IntegrationHealth {
  if (!providerConfig) return base;
  const configured = providerConfig.configured ? base.total : base.configured;
  return {
    ...base,
    configured,
    status: providerConfig.configured ? "configured" : providerConfig.enabled ? base.status : "needs_config",
    secretHandling:
      providerConfig.keySource === "database"
        ? "Key đang mã hoá trong platform_ai_provider_configs; UI chỉ thấy fingerprint và 4 ký tự cuối."
        : base.secretHandling,
    note:
      providerConfig.keySource === "database"
        ? `${base.note} Runtime ưu tiên key đã lưu trong admin.logivn.com, fallback env khi xoá key DB.`
        : base.note
  };
}

function buildIntegrationHealthList(platformAuthConfigured: boolean, aiProviderConfigs: PlatformAiProviderConfigSummary[] = []): IntegrationHealth[] {
  const platformAdmin = buildIntegrationHealth({
    key: "platform-admin",
    name: "Platform admin session",
    category: "core",
    envNames: ["PLATFORM_ADMIN_PASSWORD", "PLATFORM_ADMIN_SESSION_SECRET"],
    required: process.env.NODE_ENV === "production",
    secretHandling: "Mật khẩu bootstrap ở Vercel env, sau lần đổi đầu hash vào platform_admin_credentials.",
    note: "Nên nâng lên multi-admin RBAC trước khi cho chỉnh content/ops sâu."
  });

  const qwenConfig = aiProviderConfigs.find((provider) => provider.provider === "qwen");
  const xaiConfig = aiProviderConfigs.find((provider) => provider.provider === "xai");

  return [
    buildIntegrationHealth({
      key: "supabase",
      name: "Supabase core",
      category: "core",
      envNames: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      required: true,
      secretHandling: "Service role chỉ dùng server-side, không bao giờ expose ra client bundle.",
      note: "Nguồn dữ liệu chính cho tenants, billing, audit, maps và AI usage."
    }),
    {
      ...platformAdmin,
      status: platformAuthConfigured ? "configured" : platformAdmin.status,
      configured: platformAuthConfigured ? platformAdmin.total : platformAdmin.configured
    },
    buildIntegrationHealth({
      key: "email",
      name: "Transactional email",
      category: "email",
      envNames: ["RESEND_API_KEY", "RESEND_FROM", "AUTH_EMAIL_FROM", "REPORT_EMAIL_FROM", "BILLING_EMAIL_FROM"],
      required: false,
      secretHandling: "API key server-side; sender domains phải verify ở Resend/Supabase Auth.",
      note: "Dùng cho auth, báo cáo định kỳ và nhắc billing."
    }),
    buildIntegrationHealth({
      key: "cron",
      name: "Vercel Cron",
      category: "ops",
      envNames: ["CRON_SECRET"],
      required: false,
      secretHandling: "Cron routes bắt buộc Authorization Bearer CRON_SECRET.",
      note: "Không có secret thì cron bị chặn chủ động."
    }),
    applyManagedProviderHealth(
      buildIntegrationHealth({
        key: "ai-qwen",
        name: "Qwen/DashScope AI",
        category: "ai",
        envNames: ["QWEN_API_KEY", "QWEN_BASE_URL", "QWEN_MODEL"],
        required: false,
        secretHandling: "Key chỉ server-side; model routing đọc từ env hoặc cấu hình admin mã hoá.",
        note: "Provider chính cho owner/customer assistant theo cấu hình hiện tại."
      }),
      qwenConfig
    ),
    applyManagedProviderHealth(
      buildIntegrationHealth({
        key: "ai-xai",
        name: "xAI image/voice",
        category: "ai",
        envNames: ["XAI_API_KEY", "XAI_BASE_URL", "XAI_MODEL"],
        required: false,
        secretHandling: "Key chỉ server-side; không đưa vào NEXT_PUBLIC_*.",
        note: "Provider dự phòng/ảnh theo AI_IMAGE_PROVIDER."
      }),
      xaiConfig
    ),
    buildIntegrationHealth({
      key: "maps",
      name: "Maps providers",
      category: "maps",
      envNames: ["GOONG_API_KEY", "VIETMAP_API_KEY", "MAPBOX_ACCESS_TOKEN"],
      required: false,
      secretHandling: "Server keys dùng cho geocode/route; public map tile key tách riêng.",
      note: "Luồng hiện hỗ trợ fallback Goong, Vietmap, Mapbox, Nominatim và OSRM."
    }),
    buildIntegrationHealth({
      key: "persistent-cache",
      name: "Persistent runtime cache",
      category: "ops",
      envNames: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      required: false,
      secretHandling: "Token server-side; nếu thiếu sẽ fallback in-memory theo instance.",
      note: "Nên bật cho maps/delivery để giảm chi phí API khi scale serverless."
    }),
    buildIntegrationHealth({
      key: "cloudflare-r2",
      name: "Cloudflare R2 storage",
      category: "storage",
      envNames: ["BACKUP_R2_GATEWAY_URL", "BACKUP_R2_GATEWAY_TOKEN", "R2_BUCKET", "BACKUP_R2_PREFIX"],
      required: false,
      secretHandling: "Secret nằm ở Vercel/Cloudflare; admin.logivn.com chỉ hiển thị masked metadata và trạng thái.",
      note: "Production backup đi qua Cloudflare Worker gateway vào R2; S3-compatible access keys chỉ là adapter mở rộng sau này."
    }),
    buildIntegrationHealth({
      key: "backup-dr",
      name: "Backup & DR",
      category: "ops",
      envNames: ["BACKUP_STORAGE_ADAPTER", "BACKUP_ENCRYPTION_KEY", "BACKUP_METADATA_SIGNING_KEY", "DEV_TELEGRAM_CHAT_ID"],
      required: process.env.NODE_ENV === "production",
      secretHandling: "Encryption/signing keys chỉ ở env/VPS, không lưu trong R2 và không hiển thị trong Control Center.",
      note: "VPS backup worker tạo pg_dump custom, Redis/config archives, metadata có chữ ký, R2 upload và Telegram report."
    })
  ];
}

function buildAdminCapabilities({
  contentSurfaces,
  integrations,
  cronJobs
}: {
  contentSurfaces: ContentSurface[];
  integrations: IntegrationHealth[];
  cronJobs: CronJobHealth[];
}): AdminCapability[] {
  const hasConfiguredAi = integrations.some((item) => item.category === "ai" && item.status === "configured");
  const hasConfiguredMaps = integrations.some((item) => item.key === "maps" && item.status !== "needs_config");
  const allCronConfigured = cronJobs.every((job) => job.status === "configured");
  const directContent = contentSurfaces.filter((surface) => surface.editable === "direct").length;

  return [
    {
      key: "overview",
      name: "Platform overview",
      section: "/",
      owner: "Platform",
      status: "live",
      observe: "live",
      adjust: "blocked",
      audit: "partial",
      rollback: "planned",
      note: "Tổng quan tenant, billing, warnings và module health.",
      nextStep: "Thêm alert threshold và incident state."
    },
    {
      key: "site-settings",
      name: "Brand & landing settings",
      section: "/site",
      owner: "Growth",
      status: directContent > 0 ? "live" : "needs_config",
      observe: "live",
      adjust: "live",
      audit: "live",
      rollback: "partial",
      note: "Đang chỉnh brand, landing và billing bank config bằng server action.",
      nextStep: "Thêm revision history để rollback không cần SQL."
    },
    {
      key: "content-cms",
      name: "Content CMS",
      section: "/content",
      owner: "SEO",
      status: contentSurfaces.some((surface) => surface.editable === "code_only") ? "needs_review" : "live",
      observe: "live",
      adjust: "partial",
      audit: "planned",
      rollback: "planned",
      note: "Đã nhìn được landing/pricing/blog/feed; blog vẫn là content-as-code.",
      nextStep: "Thêm draft, preview, publish và immutable content revisions."
    },
    {
      key: "plans-billing",
      name: "Plans & billing",
      section: "/billing",
      owner: "Finance",
      status: "live",
      observe: "live",
      adjust: "live",
      audit: "live",
      rollback: "partial",
      note: "Có plan edit, payment confirm/reject và billing anomaly reconcile.",
      nextStep: "Thêm two-person approval cho payment/anomaly rủi ro cao."
    },
    {
      key: "tenant-lifecycle",
      name: "Tenant lifecycle",
      section: "/tenants",
      owner: "Support",
      status: "live",
      observe: "live",
      adjust: "live",
      audit: "live",
      rollback: "partial",
      note: "Tạm dừng, mở lại, xoá mềm quán và quản lý user state.",
      nextStep: "Thêm support mode read-only với session reason và expiry."
    },
    {
      key: "ai-ops",
      name: "AI operations",
      section: "/ai",
      owner: "AI Ops",
      status: hasConfiguredAi ? "live" : "needs_config",
      observe: "live",
      adjust: "planned",
      audit: "partial",
      rollback: "planned",
      note: "Đã quan sát routing, providers, usage, failures và token/image volume.",
      nextStep: "Thêm model routing config versioned, budget limits và kill switch."
    },
    {
      key: "maps-delivery",
      name: "Maps & delivery ops",
      section: "/maps",
      owner: "Delivery Ops",
      status: hasConfiguredMaps ? "live" : "needs_config",
      observe: "live",
      adjust: "planned",
      audit: "partial",
      rollback: "planned",
      note: "Đã quan sát provider calls, failure rate, cache và delivery quote acceptance.",
      nextStep: "Thêm provider failover toggle và coordinate repair queue."
    },
    {
      key: "infra-ops",
      name: "Infra, cron & storage",
      section: "/ops",
      owner: "DevOps",
      status: allCronConfigured ? "live" : "needs_config",
      observe: "live",
      adjust: "planned",
      audit: "partial",
      rollback: "planned",
      note: "Theo dõi env/integration readiness, cron guard và R2 readiness.",
      nextStep: "Thêm cron run log, env drift check và rollback target."
    },
    {
      key: "backup-dr",
      name: "Backup & DR",
      section: "/services",
      owner: "DevOps/Security",
      status: integrations.find((item) => item.key === "backup-dr")?.status === "configured" ? "live" : "needs_config",
      observe: "live",
      adjust: "partial",
      audit: "live",
      rollback: "live",
      note: "Quan sát backup_jobs, backup_artifacts, backup_alerts và manual trigger queue.",
      nextStep: "Bật restore full vào staging DB hàng tháng và rehearsal khẩn cấp theo runbook."
    },
    {
      key: "security-governance",
      name: "Security governance",
      section: "/governance",
      owner: "Security",
      status: "needs_review",
      observe: "live",
      adjust: "planned",
      audit: "partial",
      rollback: "planned",
      note: "Đã có mutation registry và role readiness, chưa có RBAC runtime.",
      nextStep: "Thêm platform_admin_users, roles, permissions và session revocation."
    }
  ];
}

function buildAdminMutations(): AdminMutation[] {
  return [
    {
      key: "update_brand_setting",
      name: "Cập nhật brand",
      surface: "/site",
      risk: "medium",
      status: "live",
      guard: "platform auth + zod validation + image mime/size checks",
      auditAction: "platform_setting_updated",
      rollback: "Manual restore từ Supabase/audit hiện tại; cần content revisions."
    },
    {
      key: "update_landing_setting",
      name: "Cập nhật landing",
      surface: "/site",
      risk: "medium",
      status: "live",
      guard: "platform auth + zod validation + cache revalidation",
      auditAction: "platform_setting_updated",
      rollback: "Partial: fallback defaults + manual restore; cần one-click rollback."
    },
    {
      key: "update_billing_setting",
      name: "Cập nhật tài khoản thu phí",
      surface: "/site",
      risk: "high",
      status: "live",
      guard: "platform auth + strict bank/account schema",
      auditAction: "platform_setting_updated",
      rollback: "Manual restore; nên yêu cầu approval vì ảnh hưởng dòng tiền."
    },
    {
      key: "update_saas_plan",
      name: "Cập nhật gói SaaS",
      surface: "/plans",
      risk: "high",
      status: "live",
      guard: "platform auth + numeric bounds + active flag",
      auditAction: "saas_plan_updated",
      rollback: "Partial: sửa lại plan; cần plan versioning trước publish."
    },
    {
      key: "confirm_subscription_payment",
      name: "Xác minh thanh toán gói",
      surface: "/billing",
      risk: "high",
      status: "live",
      guard: "platform auth + subscription service state machine",
      auditAction: "subscription_payment_confirmed",
      rollback: "Không rollback tự động; cần refund/reversal workflow riêng."
    },
    {
      key: "reject_subscription_payment",
      name: "Từ chối thanh toán gói",
      surface: "/billing",
      risk: "high",
      status: "live",
      guard: "platform auth + reason field + service state machine",
      auditAction: "subscription_payment_rejected",
      rollback: "Tạo lại/confirm payment mới nếu nhầm; cần approval cho giao dịch lớn."
    },
    {
      key: "resolve_billing_anomaly",
      name: "Reconcile billing anomaly",
      surface: "/billing",
      risk: "high",
      status: "live",
      guard: "server-side anomaly key whitelist + conflict checks",
      auditAction: "billing_anomaly_resolved",
      rollback: "Manual SQL/service reconciliation; nên có dry-run trước apply."
    },
    {
      key: "update_tenant_status",
      name: "Tạm dừng/mở/xoá mềm quán",
      surface: "/tenants",
      risk: "high",
      status: "live",
      guard: "platform auth + UUID/status whitelist + optional reason",
      auditAction: "tenant_status_updated",
      rollback: "Partial: chuyển lại active; subscription suspension cần rà soát."
    },
    {
      key: "update_platform_user_status",
      name: "Chặn/mở user quán",
      surface: "/users",
      risk: "medium",
      status: "live",
      guard: "platform auth + UUID/status whitelist",
      auditAction: "platform_user_status_updated",
      rollback: "Live: đổi lại active/blocked."
    },
    {
      key: "platform_admin_password_change",
      name: "Đổi mật khẩu Control Center",
      surface: "/security",
      risk: "high",
      status: "live",
      guard: "current password verify + scrypt hash + HTTP-only session",
      auditAction: "platform_admin_password_changed",
      rollback: "Reset credential row bằng Supabase admin/CLI."
    },
    {
      key: "request_manual_backup",
      name: "Yêu cầu backup thủ công",
      surface: "/services",
      risk: "high",
      status: "live",
      guard: "platform.refresh + internal backup API + platform audit log",
      auditAction: "manual_backup_requested",
      rollback: "Không xoá backup cũ; nếu queue nhầm thì đánh dấu cancelled trước khi VPS worker claim."
    }
  ];
}

function buildAdminRoleReadiness(): AdminRoleReadiness[] {
  return [
    {
      key: "owner",
      role: "Owner",
      scope: "Toàn quyền platform, approval cuối cùng",
      status: "planned",
      note: "Chưa có runtime RBAC đầy đủ; hiện mọi authenticated session trên admin.logivn.com tương đương owner."
    },
    {
      key: "devops",
      role: "DevOps",
      scope: "Env, cron, deployment, storage, rollback",
      status: "planned",
      note: "Nên được phép xem secrets metadata nhưng không xem raw secret."
    },
    {
      key: "finance",
      role: "Finance",
      scope: "Billing, payment confirmation, plans",
      status: "planned",
      note: "Cần approval hoặc dual-control với giao dịch/plan giá trị cao."
    },
    {
      key: "support",
      role: "Support",
      scope: "Tenant lifecycle, user support, support mode",
      status: "planned",
      note: "Chỉ nên có support mode theo lý do, thời hạn và audit."
    },
    {
      key: "content",
      role: "Content",
      scope: "Landing, pricing copy, blog, SEO metadata",
      status: "planned",
      note: "Cần draft/preview/publish thay vì sửa production trực tiếp."
    },
    {
      key: "security",
      role: "Security",
      scope: "Audit logs, auth guardrails, abuse signals",
      status: "planned",
      note: "Cần quyền read audit toàn cục và revoke sessions."
    },
    {
      key: "readonly",
      role: "Readonly",
      scope: "Quan sát toàn bộ Mission Control",
      status: "planned",
      note: "Vai trò an toàn cho vận hành/NOC, không có mutation."
    }
  ];
}

function buildProjectAtlas({
  contentSurfaces,
  integrations,
  cronJobs
}: {
  contentSurfaces: ContentSurface[];
  integrations: IntegrationHealth[];
  cronJobs: CronJobHealth[];
}) {
  const aiReady = integrations.some((item) => item.category === "ai" && item.status === "configured");
  const mapsReady = integrations.some((item) => item.key === "maps" && item.status !== "needs_config");
  const cronReady = cronJobs.every((job) => job.status === "configured");
  const contentHasCodeOnly = contentSurfaces.some((surface) => surface.editable === "code_only");

  const surfaces: ProjectSurface[] = [
    {
      key: "public-growth-frontend",
      name: "Public growth frontend",
      kind: "frontend",
      owner: "Growth/SEO",
      criticality: "high",
      status: contentHasCodeOnly ? "needs_review" : "live",
      observe: "live",
      control: "partial",
      audit: "partial",
      routes: ["/", "/pricing", "/blog", "/blog/[slug]", "/feed.xml", "/sitemap.xml", "/llms.txt", "/robots.txt"],
      dependencies: ["platform_settings", "saas_plans", "lib/seo/blog.ts", "SEO scripts"],
      note: "Landing/pricing/blog/feed là bề mặt acquisition chính; blog vẫn content-as-code.",
      nextStep: "Đưa blog/pricing copy vào revisioned CMS với preview/publish/rollback."
    },
    {
      key: "customer-ordering-frontend",
      name: "Customer ordering frontend",
      kind: "frontend",
      owner: "Product",
      criticality: "critical",
      status: "live",
      observe: "partial",
      control: "blocked",
      audit: "partial",
      routes: ["/r/[restaurantSlug]", "/r/[restaurantSlug]/table/[tableId]", "/r/[restaurantSlug]/reserve"],
      dependencies: ["restaurants", "menu_items", "orders", "reservations", "payments", "maps"],
      note: "Customer QR, remote order, reservation và payment receipt thuộc tenant/customer flow.",
      nextStep: "Thêm synthetic journey checks cho QR order, checkout, reservation và delivery quote."
    },
    {
      key: "owner-dashboard-frontend",
      name: "Owner dashboard frontend",
      kind: "frontend",
      owner: "Tenant Ops",
      criticality: "critical",
      status: "live",
      observe: "partial",
      control: "partial",
      audit: "partial",
      routes: ["/dashboard", "/dashboard/menu", "/dashboard/orders", "/dashboard/kitchen", "/dashboard/online", "/dashboard/payments", "/dashboard/reservations", "/dashboard/settings", "/dashboard/staff", "/dashboard/tables"],
      dependencies: ["Supabase Auth", "restaurant entitlement", "RLS", "dashboard API session"],
      note: "Dashboard quán là control plane của owner/staff, tách quyền với admin.logivn.com.",
      nextStep: "Thêm support-mode read-only từ platform với reason, expiry và audit."
    },
    {
      key: "auth-onboarding-frontend",
      name: "Auth & onboarding frontend",
      kind: "frontend",
      owner: "Growth/Auth",
      criticality: "high",
      status: "live",
      observe: "partial",
      control: "partial",
      audit: "partial",
      routes: ["/dashboard/login", "/dashboard/register", "/dashboard/forgot-password", "/dashboard/reset-password", "/dashboard/onboarding", "/dashboard/setup", "/auth/callback", "/auth/google", "/verify-email"],
      dependencies: ["Supabase Auth", "registration_intents", "trial_claims", "email provider"],
      note: "Registration, OTP/email confirm, Google OAuth và trial onboarding quyết định activation.",
      nextStep: "Hiển thị funnel conversion và auth error buckets trên admin.logivn.com."
    },
    {
      key: "platform-admin-backend",
      name: "Platform admin backend",
      kind: "backend",
      owner: "Platform",
      criticality: "critical",
      status: "live",
      observe: "live",
      control: "live",
      audit: "live",
      routes: ["admin.logivn.com/*", "app/platform-control/[[...path]]/page.tsx", "features/platform-admin/actions.ts", "services/platform-admin-service.ts"],
      dependencies: ["platform_admin_credentials", "platform_settings", "platform_audit_logs", "service role"],
      note: "Internal control plane cho LogiVN, server-only snapshot và mutation guardrails.",
      nextStep: "Nâng singleton password thành RBAC runtime với revoke sessions."
    },
    {
      key: "restaurant-ops-apis",
      name: "Restaurant ops APIs",
      kind: "backend",
      owner: "Tenant Ops",
      criticality: "critical",
      status: "live",
      observe: "partial",
      control: "partial",
      audit: "partial",
      routes: ["/api/admin/orders/*", "/api/admin/kitchen", "/api/admin/reservations/*", "/api/admin/service-requests/*", "/api/admin/delivery/couriers"],
      dependencies: ["requireOperationalDashboardApiSession", "entitlements", "orders", "reservations", "delivery_couriers"],
      note: "APIs vận hành quán dùng dashboard session, không dùng platform admin session.",
      nextStep: "Thêm per-route latency/error dashboard và operation audit coverage."
    },
    {
      key: "customer-public-apis",
      name: "Customer public APIs",
      kind: "backend",
      owner: "Product",
      criticality: "critical",
      status: "live",
      observe: "partial",
      control: "blocked",
      audit: "partial",
      routes: ["/api/orders/*", "/api/remote-orders/*", "/api/reservations/*", "/api/service-requests", "/api/restaurants/[restaurantSlug]/delivery-quote"],
      dependencies: ["rate limits", "idempotency keys", "orders", "payments", "reservations", "maps"],
      note: "Public customer actions phải ưu tiên idempotency, rate limit và tenant isolation.",
      nextStep: "Thêm public API abuse dashboard và failed checkout/reservation diagnostics."
    },
    {
      key: "ai-backend",
      name: "AI backend",
      kind: "backend",
      owner: "AI Ops",
      criticality: "high",
      status: aiReady ? "live" : "needs_config",
      observe: "live",
      control: "planned",
      audit: "partial",
      routes: ["/api/copilotkit", "/api/admin/ai/*", "/api/ai/customer-assistant", "/api/ai/customer-history", "/api/onboarding/ai/*"],
      dependencies: ["Qwen", "xAI", "ai_usage_logs", "feature entitlements", "AI memory"],
      note: "AI owner/customer/onboarding flows đã có usage logs và provider readiness.",
      nextStep: "Thêm budget limits, prompt version registry, provider kill switch."
    },
    {
      key: "maps-delivery-backend",
      name: "Maps & delivery backend",
      kind: "backend",
      owner: "Delivery Ops",
      criticality: "high",
      status: mapsReady ? "live" : "needs_config",
      observe: "live",
      control: "planned",
      audit: "partial",
      routes: ["/api/maps/search", "/api/maps/autocomplete", "/api/maps/place-detail", "/api/maps/reverse", "/api/maps/route", "/api/location/*", "/api/delivery/fee"],
      dependencies: ["Goong", "Vietmap", "Mapbox", "Nominatim", "OSRM", "map observability logs"],
      note: "Maps provider fallback và delivery quote đã có operational metrics.",
      nextStep: "Thêm provider toggle, coordinate repair queue và cost budget alert."
    },
    {
      key: "supabase-data-plane",
      name: "Supabase data plane",
      kind: "data",
      owner: "Data/Platform",
      criticality: "critical",
      status: "live",
      observe: "partial",
      control: "partial",
      audit: "partial",
      routes: ["supabase/migrations/*", "supabase/schema.sql", "types/supabase.ts"],
      dependencies: ["Postgres", "RLS", "service role", "Supabase Auth", "Storage"],
      note: "Core tables cover tenants, menu, orders, bills, reservations, billing, maps, AI logs.",
      nextStep: "Show migration drift, RLS policy health and table growth/cost trên admin.logivn.com."
    },
    {
      key: "billing-data-plane",
      name: "Billing data plane",
      kind: "data",
      owner: "Finance",
      criticality: "critical",
      status: "live",
      observe: "live",
      control: "live",
      audit: "live",
      routes: ["saas_plans", "restaurant_subscriptions", "subscription_plans", "subscriptions", "invoices", "payments", "usage_quotas"],
      dependencies: ["billing v2 bridge", "payment logs", "feature usage", "trial usage"],
      note: "Billing v2 cutover, anomalies và usage ledger đang hiển thị trên admin.logivn.com/billing.",
      nextStep: "Thêm billing rollback/reversal workflow và finance approval."
    },
    {
      key: "storage-assets-plane",
      name: "Storage & assets plane",
      kind: "data",
      owner: "Platform",
      criticality: "medium",
      status: integrations.find((item) => item.key === "cloudflare-r2")?.status === "configured" ? "live" : "planned",
      observe: "partial",
      control: "partial",
      audit: "partial",
      routes: ["Supabase Storage: platform-assets", "menu images", "Cloudflare R2 planned"],
      dependencies: ["Supabase Storage", "R2 env", "image mime/size checks"],
      note: "Assets hiện dùng Supabase Storage; R2 readiness được theo dõi nhưng chưa migration.",
      nextStep: "Dual-read Supabase/R2, migration verifier và rollback to Supabase Storage."
    },
    {
      key: "cron-automation-plane",
      name: "Cron & automation plane",
      kind: "automation",
      owner: "DevOps",
      criticality: "high",
      status: cronReady ? "live" : "needs_config",
      observe: "partial",
      control: "planned",
      audit: "partial",
      routes: ["/api/cron/reports", "/api/cron/ai-ops", "/api/cron/reservations/expire", "/api/cron/subscriptions"],
      dependencies: ["Vercel Cron", "CRON_SECRET", "report schedules", "AI Ops insights", "subscription lifecycle"],
      note: "Cron routes được bảo vệ bằng bearer secret và khai báo trong vercel.json.",
      nextStep: "Thêm push/email alert khi cron lỗi liên tiếp và run detail theo execution id."
    },
    {
      key: "backup-dr-plane",
      name: "Backup & disaster recovery plane",
      kind: "automation",
      owner: "DevOps/Security",
      criticality: "critical",
      status: integrations.find((item) => item.key === "backup-dr")?.status === "configured" && integrations.find((item) => item.key === "cloudflare-r2")?.status === "configured" ? "live" : "needs_config",
      observe: "live",
      control: "partial",
      audit: "live",
      routes: ["infra/vps/scripts/backup.sh", "/api/internal/backup/health", "/api/internal/backup/trigger", "backup_jobs", "backup_artifacts", "backup_restore_tests"],
      dependencies: ["pg_dump -F c", "Redis AOF/RDB", "Cloudflare R2", "OpenSSL encryption", "platform Telegram", "backup_* tables"],
      note: "Daily/weekly/monthly backup executor encrypts before upload, verifies R2 metadata and sends DevOps Telegram reports.",
      nextStep: "Run monthly full staging restore and graduate manual trigger from queued poll to private VPS executor endpoint if needed."
    },
    {
      key: "deployment-ci-plane",
      name: "Deployment & CI plane",
      kind: "automation",
      owner: "DevOps",
      criticality: "critical",
      status: "partial",
      observe: "partial",
      control: "planned",
      audit: "partial",
      routes: ["Vercel production", "GitHub Actions SEO CI", "scripts/infra/check.mjs", "npm test", "npm run build"],
      dependencies: ["Vercel", "GitHub", "env contract", "source hygiene"],
      note: "Build/test/infra checks đã chạy được; admin.logivn.com chưa có deploy history UI đầy đủ.",
      nextStep: "Thêm deployment ledger, rollback link và smoke check history trong admin.logivn.com/release."
    },
    {
      key: "external-integrations-plane",
      name: "External integrations",
      kind: "integration",
      owner: "Platform",
      criticality: "high",
      status: integrations.some((item) => item.status === "needs_config") ? "needs_review" : "live",
      observe: "live",
      control: "planned",
      audit: "partial",
      routes: ["Supabase", "Vercel", "Resend", "Qwen", "xAI", "Goong", "Vietmap", "Mapbox", "Upstash/KV", "Cloudflare R2"],
      dependencies: integrations.map((item) => item.key),
      note: "Integrations readiness đã hiển thị masked; raw secrets không được lưu/hiển thị.",
      nextStep: "Thêm rotation metadata, owner, expiry và drift check giữa preview/production."
    }
  ];

  const byKind = surfaces.reduce<Record<ProjectSurfaceKind, number>>(
    (acc, surface) => {
      acc[surface.kind] += 1;
      return acc;
    },
    { frontend: 0, backend: 0, data: 0, automation: 0, integration: 0 }
  );

  return {
    surfaces,
    summary: {
      surfaces: surfaces.length,
      frontend: byKind.frontend,
      backend: byKind.backend,
      data: byKind.data,
      automation: byKind.automation,
      integration: byKind.integration,
      critical: surfaces.filter((surface) => surface.criticality === "critical").length,
      liveObserve: surfaces.filter((surface) => surface.observe === "live").length,
      liveControl: surfaces.filter((surface) => surface.control === "live").length,
      plannedControl: surfaces.filter((surface) => surface.control === "planned" || surface.control === "blocked").length,
      needsReview: surfaces.filter((surface) => surface.status === "needs_review" || surface.status === "needs_config").length
    }
  };
}

export async function writePlatformAuditLog({
  actor = "platform-admin",
  action,
  targetType,
  targetId,
  metadata = {},
  required = false
}: {
  actor?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  required?: boolean;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("platform_audit_logs").insert({
    actor,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata
  });

  if (!error) return;
  if (required) throw new AppError("Không ghi được platform audit log bắt buộc.", 500);
  if (!isMissingSchemaError(error)) throw error;
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
  isActive,
  updatedBy = "platform-admin"
}: {
  planId: string;
  name: string;
  description: string;
  monthlyPrice: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  updatedBy?: string;
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
    actor: updatedBy,
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
  reason,
  updatedBy = "platform-admin"
}: {
  restaurantId: string;
  status: PlatformStatus;
  reason?: string;
  updatedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const update =
    status === "active"
      ? { platform_status: "active", suspended_at: null, suspended_reason: null, deleted_at: null }
      : status === "suspended"
        ? { platform_status: "suspended", suspended_at: now, suspended_reason: reason || "Tạm dừng bởi LogiVN" }
        : { platform_status: "deleted", deleted_at: now, suspended_reason: reason || "Xóa mềm bởi LogiVN" };

  await writePlatformAuditLog({
    actor: updatedBy,
    action: "tenant_status_update_requested",
    targetType: "restaurant",
    targetId: restaurantId,
    metadata: { status, reason: reason || null },
    required: true
  });

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
    actor: updatedBy,
    action: "tenant_status_updated",
    targetType: "restaurant",
    targetId: restaurantId,
    metadata: { status, reason: reason || null }
  });
  invalidateMenuCache();
  invalidatePlatformAdminSnapshotCache();
}

export async function updatePlatformUserStatus({
  userId,
  status,
  reason,
  updatedBy = "platform-admin"
}: {
  userId: string;
  status: UserAccountStatus;
  reason?: string;
  updatedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const update =
    status === "active"
      ? { account_status: "active", blocked_at: null, blocked_reason: null }
      : { account_status: "blocked", blocked_at: new Date().toISOString(), blocked_reason: reason || "Blocked by platform admin" };

  await writePlatformAuditLog({
    actor: updatedBy,
    action: "platform_user_status_update_requested",
    targetType: "user",
    targetId: userId,
    metadata: { status, reason: reason || null },
    required: true
  });

  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) throw error;
  await writePlatformAuditLog({
    actor: updatedBy,
    action: "platform_user_status_updated",
    targetType: "user",
    targetId: userId,
    metadata: { status, reason: reason || null }
  });
  invalidatePlatformAdminSnapshotCache();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function mirrorAnomalySubscriptionStateToBillingV2({
  supabase,
  restaurantId,
  legacySubscriptionId,
  planCode,
  status,
  currentPeriodStart,
  currentPeriodEnd,
  trialEndsAt,
  metadata
}: {
  supabase: any;
  restaurantId: string;
  legacySubscriptionId: string;
  planCode?: string | null;
  status?: "trialing" | "active" | "expired" | "pending_payment";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data: v2Subscription, error: v2SubscriptionError } = await supabase
    .from("subscriptions")
    .select("id,metadata")
    .eq("restaurant_id", restaurantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (v2SubscriptionError) {
    if (isMissingSchemaError(v2SubscriptionError)) return;
    throw v2SubscriptionError;
  }

  if (!v2Subscription?.id) return;

  let v2PlanId: string | null = null;
  if (planCode) {
    const { data: v2Plan, error: v2PlanError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("code", planCode)
      .maybeSingle();

    if (v2PlanError) {
      if (isMissingSchemaError(v2PlanError)) return;
      throw v2PlanError;
    }

    v2PlanId = v2Plan?.id ?? null;
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    metadata: {
      ...asRecord(v2Subscription.metadata),
      source: "legacy_admin_reconciliation",
      legacySubscriptionId,
      ...(metadata ?? {})
    }
  };

  if (v2PlanId) update.plan_id = v2PlanId;
  if (status) update.status = status;
  if (currentPeriodStart !== undefined) update.current_period_start = currentPeriodStart;
  if (currentPeriodEnd !== undefined) update.current_period_end = currentPeriodEnd;
  if (trialEndsAt !== undefined) update.trial_ends_at = trialEndsAt;

  const { error } = await supabase.from("subscriptions").update(update).eq("id", v2Subscription.id);
  if (error && !isMissingSchemaError(error)) throw error;
}

export async function resolveBillingAnomaly({
  key,
  subscriptionId,
  paymentId,
  resolvedBy = "platform-admin"
}: {
  key: BillingAnomalyKey;
  subscriptionId?: string;
  paymentId?: string;
  resolvedBy?: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date();
  const nowIso = now.toISOString();

  if (key === "premium_trial_subscription") {
    if (!subscriptionId) throw new AppError("Thiếu subscription cần chuẩn hóa.", 400);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("restaurant_subscriptions")
      .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,metadata,plan:saas_plans(code,name,monthly_price)")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) throw new AppError("Không tìm thấy subscription cần xử lý.", 404);

    const currentPlan = firstOrNull(subscription.plan);
    if (subscription.status !== "trialing" || currentPlan?.code !== "premium") {
      throw new AppError("Anomaly này đã được xử lý hoặc không còn là Premium trial.", 409);
    }

    const { data: proPlan, error: proPlanError } = await supabase
      .from("saas_plans")
      .select("id,code,name")
      .eq("code", "pro")
      .maybeSingle();
    if (proPlanError) throw proPlanError;
    if (!proPlan?.id) throw new AppError("Chưa tìm thấy gói Pro để chuẩn hóa trial.", 409);

    const metadata = {
      ...asRecord(subscription.metadata),
      requestedPlanCode: "premium",
      normalizedBy: resolvedBy,
      normalizedAt: nowIso,
      normalizedReason: "premium_trial_subscription"
    };

    const { error: updateError } = await supabase
      .from("restaurant_subscriptions")
      .update({
        plan_id: proPlan.id,
        metadata,
        updated_at: nowIso
      })
      .eq("id", subscription.id);
    if (updateError) throw updateError;

    await mirrorAnomalySubscriptionStateToBillingV2({
      supabase,
      restaurantId: subscription.restaurant_id,
      legacySubscriptionId: subscription.id,
      planCode: "pro",
      status: "trialing",
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      trialEndsAt: subscription.trial_ends_at,
      metadata
    });

    await writePlatformAuditLog({
      actor: resolvedBy,
      action: "billing_anomaly_resolved",
      targetType: "restaurant_subscription",
      targetId: subscription.id,
      metadata: { key, fromPlanCode: "premium", toPlanCode: "pro" }
    });
    invalidatePlatformAdminSnapshotCache();
    return;
  }

  if (key === "pending_without_payment") {
    if (!subscriptionId) throw new AppError("Thiếu subscription cần chuẩn hóa.", 400);

    const { data: subscription, error: subscriptionError } = await supabase
      .from("restaurant_subscriptions")
      .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,metadata,plan:saas_plans(code,name,monthly_price)")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) throw new AppError("Không tìm thấy subscription cần xử lý.", 404);
    if (subscription.status !== "pending_payment") {
      throw new AppError("Subscription này không còn ở trạng thái pending_payment.", 409);
    }

    const { count, error: paymentCountError } = await supabase
      .from("subscription_payment_logs")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", subscription.id)
      .eq("status", "waiting_confirm");
    if (paymentCountError) throw paymentCountError;
    if ((count ?? 0) > 0) {
      throw new AppError("Subscription đã có payment chờ xác minh, không tự động đổi trạng thái.", 409);
    }

    const accessEnd = subscription.current_period_end || subscription.trial_ends_at;
    const nextStatus: "active" | "expired" = accessEnd && new Date(accessEnd).getTime() >= now.getTime() ? "active" : "expired";
    const metadata = {
      ...asRecord(subscription.metadata),
      normalizedBy: resolvedBy,
      normalizedAt: nowIso,
      normalizedReason: "pending_without_payment",
      previousStatus: "pending_payment"
    };

    const { error: updateError } = await supabase
      .from("restaurant_subscriptions")
      .update({
        status: nextStatus,
        metadata,
        updated_at: nowIso
      })
      .eq("id", subscription.id);
    if (updateError) throw updateError;

    const plan = firstOrNull(subscription.plan);
    await mirrorAnomalySubscriptionStateToBillingV2({
      supabase,
      restaurantId: subscription.restaurant_id,
      legacySubscriptionId: subscription.id,
      planCode: plan?.code ?? null,
      status: nextStatus,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      trialEndsAt: subscription.trial_ends_at,
      metadata
    });

    await writePlatformAuditLog({
      actor: resolvedBy,
      action: "billing_anomaly_resolved",
      targetType: "restaurant_subscription",
      targetId: subscription.id,
      metadata: { key, nextStatus }
    });
    invalidatePlatformAdminSnapshotCache();
    return;
  }

  if (key === "pending_payment_missing_policy") {
    if (!paymentId) throw new AppError("Thiếu payment cần bổ sung policy.", 400);

    const { data: payment, error: paymentError } = await supabase
      .from("subscription_payment_logs")
      .select("id,restaurant_id,subscription_id,plan_id,status,months,raw_data")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) throw new AppError("Không tìm thấy payment cần xử lý.", 404);
    if (payment.status !== "waiting_confirm") {
      throw new AppError("Payment này không còn chờ xác minh.", 409);
    }
    if (!payment.subscription_id || !payment.plan_id) {
      throw new AppError("Payment thiếu subscription hoặc target plan, cần rà soát thủ công.", 409);
    }

    const [{ data: subscription, error: subscriptionError }, { data: targetPlan, error: targetPlanError }] = await Promise.all([
      supabase
        .from("restaurant_subscriptions")
        .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,metadata,plan:saas_plans(code,name,monthly_price)")
        .eq("id", payment.subscription_id)
        .maybeSingle(),
      supabase
        .from("saas_plans")
        .select("id,code,name,monthly_price")
        .eq("id", payment.plan_id)
        .maybeSingle()
    ]);
    if (subscriptionError) throw subscriptionError;
    if (targetPlanError) throw targetPlanError;
    if (!subscription) throw new AppError("Không tìm thấy subscription của payment.", 404);
    if (!targetPlan) throw new AppError("Không tìm thấy target plan của payment.", 404);

    const currentPlan = firstOrNull(subscription.plan);
    if (!currentPlan) throw new AppError("Không xác định được gói hiện tại của subscription.", 409);

    const policy = buildPaymentPolicySummary({
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        trial_ends_at: subscription.trial_ends_at,
        metadata: asRecord(subscription.metadata)
      },
      currentPlan: {
        id: subscription.plan_id,
        code: currentPlan.code,
        name: currentPlan.name,
        monthly_price: currentPlan.monthly_price
      },
      targetPlan: {
        id: targetPlan.id,
        code: targetPlan.code,
        name: targetPlan.name,
        monthly_price: targetPlan.monthly_price
      },
      months: Math.max(1, Number(payment.months) || 1),
      now
    });

    const rawData = {
      ...asRecord(payment.raw_data),
      billingAction: policy.billingAction,
      policyKey: policy.policyKey,
      effectiveAt: policy.effectiveAt,
      effectiveSummary: policy.summary,
      fromPlanCode: currentPlan.code,
      fromPlanName: currentPlan.name,
      planCode: targetPlan.code,
      planName: targetPlan.name,
      normalizedBy: resolvedBy,
      normalizedAt: nowIso
    };

    const { error: updateError } = await supabase
      .from("subscription_payment_logs")
      .update({
        raw_data: rawData
      })
      .eq("id", payment.id);
    if (updateError) throw updateError;

    await writePlatformAuditLog({
      actor: resolvedBy,
      action: "billing_anomaly_resolved",
      targetType: "subscription_payment",
      targetId: payment.id,
      metadata: { key, billingAction: policy.billingAction, policyKey: policy.policyKey }
    });
    invalidatePlatformAdminSnapshotCache();
  }
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
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
    platformAuthStatus,
    aiProviderConfigs
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
          .select("id,restaurant_id,plan_id,subscription_id,amount,months,method,status,transfer_content,raw_data,created_at,confirmed_at,rejected_at,rejected_reason,restaurant:restaurants(name,slug),plan:saas_plans(code,name,monthly_price)")
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
      getPlatformAdminAuthStatus(),
      listPlatformAiProviderConfigs()
    ]);

  const backupHealth = await getBackupHealth().catch((error) => {
    warnings.push(`Không đọc được backup health: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });

  const [v2PlansResult, v2SubscriptionsResult, v2PaymentsResult] = await Promise.all([
    supabase.from("subscription_plans").select("id,code,name,description,monthly_price,metadata").is("deleted_at", null).order("display_order", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("id,restaurant_id,plan_id,status,trial_ends_at,current_period_end,created_at,plan:subscription_plans(code,name,monthly_price)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("payments")
      .select("id,restaurant_id,invoice_id,subscription_id,amount,currency,status,transfer_code,created_at,confirmed_at,restaurant:restaurants(name,slug)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120)
  ]);

  const [
    legacyPlanCount,
    legacySubscriptionCount,
    legacyPaymentCount,
    legacyPendingPaymentCount,
    legacyAiUsageSuccessCount,
    v2PlanCount,
    v2EntitlementCount,
    v2SubscriptionCount,
    v2InvoiceCount,
    v2PaymentCount,
    v2PendingPaymentCount,
    v2PaymentLogCount,
    v2UsageQuotaCount,
    v2FeatureUsageCount,
    v2TrialUsageCount,
    v2UpgradeEventCount
  ] = await Promise.all([
    countRows(supabase, "saas_plans", warnings),
    countRows(supabase, "restaurant_subscriptions", warnings),
    countRows(supabase, "subscription_payment_logs", warnings),
    countRows(supabase, "subscription_payment_logs", warnings, (query) => query.eq("status", "waiting_confirm")),
    countRows(supabase, "ai_usage_logs", warnings, (query) => query.eq("status", "success")),
    countRows(supabase, "subscription_plans", warnings, (query) => query.is("deleted_at", null)),
    countRows(supabase, "plan_entitlements", warnings, (query) => query.is("deleted_at", null)),
    countRows(supabase, "subscriptions", warnings, (query) => query.is("deleted_at", null)),
    countRows(supabase, "invoices", warnings, (query) => query.is("deleted_at", null)),
    countRows(supabase, "payments", warnings, (query) => query.is("deleted_at", null)),
    countRows(supabase, "payments", warnings, (query) => query.is("deleted_at", null).in("status", ["pending", "detected", "waiting_confirmation"])),
    countRows(supabase, "billing_payment_logs", warnings),
    countRows(supabase, "usage_quotas", warnings),
    countRows(supabase, "feature_usage_logs", warnings),
    countRows(supabase, "trial_usage", warnings),
    countRows(supabase, "upgrade_events", warnings)
  ]);

  const [aiUsageRows, morningBriefRows, branchInsightRows, mapProviderLogs, mapCacheLogs, deliveryQuoteLogs, cronRunRows] = await Promise.all([
    safeData<AiUsageSnapshotRow[]>(
      "ai_usage_logs_recent",
      supabase
        .from("ai_usage_logs")
        .select("provider,model,status,request_kind,feature_key,input_tokens,output_tokens,image_count,cost_units,created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(2000),
      [],
      warnings
    ),
    safeData<AiMorningBriefSnapshotRow[]>(
      "ai_morning_brief_runs_recent",
      supabase
        .from("ai_morning_brief_runs")
        .select("restaurant_id,restaurant_name,brief_date,channel,status,health_score,summary,insight_count,critical_count,warning_count,opportunity_count,recipient_emails,action_items,error_message,sent_at,created_at")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(500),
      [],
      warnings
    ),
    safeData<AiBranchInsightSnapshotRow[]>(
      "ai_operation_insights_branch_recent",
      supabase
        .from("ai_operation_insights")
        .select("id,restaurant_id,branch_id,kind,severity,status,title,action,metric_label,metric_value,last_seen_at,created_at,restaurant:restaurants(name,slug),branch:store_branches(name)")
        .eq("source", "ai_ops")
        .not("branch_id", "is", null)
        .gte("last_seen_at", since7d)
        .order("last_seen_at", { ascending: false })
        .limit(500),
      [],
      warnings
    ),
    safeData<MapProviderSnapshotRow[]>(
      "map_provider_request_logs_recent",
      supabase
        .from("map_provider_request_logs")
        .select("provider,operation,outcome,latency_ms,estimated_cost_vnd,created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(5000),
      [],
      warnings
    ),
    safeData<MapCacheSnapshotRow[]>(
      "map_cache_event_logs_recent",
      supabase
        .from("map_cache_event_logs")
        .select("operation,hit,created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(5000),
      [],
      warnings
    ),
    safeData<DeliveryQuoteSnapshotRow[]>(
      "delivery_quote_metric_logs_recent",
      supabase
        .from("delivery_quote_metric_logs")
        .select("accepted,provider,route_provider,confidence,is_estimated,distance_km,fee,latency_ms,created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(5000),
      [],
      warnings
    ),
    safeData<CronRunLogRow[]>(
      "cron_run_logs_recent",
      supabase
        .from("cron_run_logs")
        .select("job_key,status,started_at,finished_at,duration_ms,result_summary,error_message")
        .order("started_at", { ascending: false })
        .limit(100),
      [],
      warnings
    )
  ]);

  const billingV2Available = !isMissingSchemaError(v2PlansResult.error) && !isMissingSchemaError(v2SubscriptionsResult.error) && !isMissingSchemaError(v2PaymentsResult.error);
  const effectivePlans: PlanRow[] = billingV2Available && !v2PlansResult.error && (v2PlansResult.data?.length ?? 0) > 0
    ? ((v2PlansResult.data ?? []) as BillingV2PlanRow[]).map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        trial_days: 30,
        features: [],
        is_active: true,
        sort_order: 0
      }))
    : plans;
  const effectiveSubscriptions: SubscriptionRow[] = billingV2Available && !v2SubscriptionsResult.error && (v2SubscriptionsResult.data?.length ?? 0) > 0
    ? ((v2SubscriptionsResult.data ?? []) as BillingV2SubscriptionRow[]).map((subscription) => ({
        id: subscription.id,
        restaurant_id: subscription.restaurant_id,
        plan_id: subscription.plan_id,
        status: (subscription.status === "grace" ? "past_due" : subscription.status) as SubscriptionStatus,
        trial_ends_at: subscription.trial_ends_at,
        current_period_end: subscription.current_period_end,
        created_at: subscription.created_at,
        plan: subscription.plan as SubscriptionRow["plan"]
      }))
    : subscriptions;
  const effectivePayments: PaymentRow[] = billingV2Available && !v2PaymentsResult.error && (v2PaymentsResult.data?.length ?? 0) > 0
    ? ((v2PaymentsResult.data ?? []) as BillingV2PaymentRow[]).map((payment) => ({
        id: payment.id,
        restaurant_id: payment.restaurant_id,
        plan_id: null,
        subscription_id: payment.subscription_id,
        amount: payment.amount,
        months: 1,
        method: "VIETQR",
        status:
          payment.status === "confirmed"
            ? "confirmed"
            : payment.status === "expired"
              ? "expired"
              : payment.status === "failed" || payment.status === "cancelled" || payment.status === "refunded"
                ? "rejected"
                : "waiting_confirm",
        transfer_content: payment.transfer_code,
        created_at: payment.created_at,
        confirmed_at: payment.confirmed_at,
        rejected_at: null,
        rejected_reason: null,
        restaurant: payment.restaurant
      }))
    : payments;

  const settings = normalizeSettingRows(settingRows);
  const contentSurfaces = buildContentSurfaces({ settings, effectivePlans, billingV2Available, appUrl });
  const aiControl = summarizeAiControl(aiUsageRows, morningBriefRows, branchInsightRows, aiProviderConfigs);
  const mapControl = summarizeMapControl({ providerLogs: mapProviderLogs, cacheLogs: mapCacheLogs, quoteLogs: deliveryQuoteLogs });
  const integrations = buildIntegrationHealthList(platformAuthStatus.configured, aiProviderConfigs);
  const latestCronRuns = latestCronRunMap(cronRunRows);
  const cronRunGroups = cronRunsByJob(cronRunRows);
  const cronJobs = missionControlCronJobs.map((job) => ({
    ...job,
    status: process.env.CRON_SECRET?.trim() ? "configured" as ControlPlaneStatus : "needs_config" as ControlPlaneStatus,
    lastRunAt: latestCronRuns.get(job.key)?.started_at ?? null,
    lastRunStatus: latestCronRuns.get(job.key)?.status ?? null,
    lastDurationMs: latestCronRuns.get(job.key)?.duration_ms ?? null,
    lastSummary: asObject(latestCronRuns.get(job.key)?.result_summary, {}),
    lastError: latestCronRuns.get(job.key)?.error_message ?? null,
    nextRunAt: nextDailyCronRunAt(job.schedule),
    lastRunAgeHours: hoursSince(latestCronRuns.get(job.key)?.started_at),
    failureStreak: cronStatusStreak(cronRunGroups.get(job.key) ?? [], (status) => status === "error"),
    attentionStreak: cronStatusStreak(cronRunGroups.get(job.key) ?? [], (status) => status !== "success"),
    recentRuns: cronRunHistory(cronRunGroups.get(job.key) ?? [])
  }));
  const adminCapabilities = buildAdminCapabilities({ contentSurfaces, integrations, cronJobs });
  const adminMutations = buildAdminMutations();
  const adminRoleReadiness = buildAdminRoleReadiness();
  const projectAtlas = buildProjectAtlas({ contentSurfaces, integrations, cronJobs });
  const plansById = new Map(effectivePlans.map((plan) => [plan.id, plan]));
  const usersByRestaurant = new Map<string, UserRow[]>();
  users.forEach((user) => {
    usersByRestaurant.set(user.restaurant_id, [...(usersByRestaurant.get(user.restaurant_id) ?? []), user]);
  });

  const subscriptionByRestaurant = new Map<string, SubscriptionRow>();
  effectiveSubscriptions.forEach((subscription) => {
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
    const plan: Pick<PlanRow, "code" | "name" | "monthly_price"> | null = subscription ? plansById.get(subscription.plan_id) ?? firstOrNull(subscription.plan) ?? null : null;
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

  const pendingPayments = effectivePayments.filter((payment) => payment.status === "waiting_confirm");
  const activeSubscriptions = effectiveSubscriptions.filter((subscription) => subscription.status === "active" && subscriptionIsCurrentlyUsable(subscription));
  const trialingSubscriptions = effectiveSubscriptions.filter((subscription) => subscription.status === "trialing" && subscriptionIsCurrentlyUsable(subscription));
  const suspendedTenants = tenants.filter((tenant) => tenant.platformStatus !== "active");
  const mrr = activeSubscriptions.reduce((sum, subscription) => {
    const plan = plansById.get(subscription.plan_id);
    return sum + Number(plan?.monthly_price ?? 0);
  }, 0);
  const pendingPaymentsBySubscriptionId = new Map(
    payments
      .filter((payment) => payment.status === "waiting_confirm" && payment.subscription_id)
      .map((payment) => [payment.subscription_id as string, payment])
  );
  const billingAnomalies: BillingAnomaly[] = [];

  subscriptions.forEach((subscription) => {
    const restaurant = restaurants.find((item) => item.id === subscription.restaurant_id);
    const plan = plansById.get(subscription.plan_id) ?? firstOrNull(subscription.plan) ?? null;

    if (subscription.status === "trialing" && plan?.code === "premium") {
      billingAnomalies.push({
        key: "premium_trial_subscription",
        severity: "danger",
        restaurantId: subscription.restaurant_id,
        restaurantName: restaurant?.name ?? "Không rõ quán",
        restaurantSlug: restaurant?.slug ?? "",
        subscriptionId: subscription.id,
        detail: "Trial hiện đang gắn trực tiếp với Premium, lệch policy trial Pro an toàn."
      });
    }

    if (subscription.status === "pending_payment" && !pendingPaymentsBySubscriptionId.has(subscription.id)) {
      billingAnomalies.push({
        key: "pending_without_payment",
        severity: "warning",
        restaurantId: subscription.restaurant_id,
        restaurantName: restaurant?.name ?? "Không rõ quán",
        restaurantSlug: restaurant?.slug ?? "",
        subscriptionId: subscription.id,
        detail: "Subscription đang ở pending_payment nhưng không còn giao dịch chờ xác minh."
      });
    }
  });

  payments.forEach((payment) => {
    if (payment.status !== "waiting_confirm") return;
    const rawData = payment.raw_data && typeof payment.raw_data === "object" && !Array.isArray(payment.raw_data)
      ? (payment.raw_data as Record<string, unknown>)
      : {};
    const restaurant = firstOrNull(payment.restaurant);

    if (!rawData.billingAction || !rawData.planCode || !rawData.effectiveSummary) {
      billingAnomalies.push({
        key: "pending_payment_missing_policy",
        severity: "warning",
        restaurantId: payment.restaurant_id,
        restaurantName: restaurant?.name ?? tenants.find((tenant) => tenant.id === payment.restaurant_id)?.name ?? "Không rõ quán",
        restaurantSlug: restaurant?.slug ?? tenants.find((tenant) => tenant.id === payment.restaurant_id)?.slug ?? "",
        paymentId: payment.id,
        subscriptionId: payment.subscription_id,
        detail: "Payment chờ xác minh thiếu metadata policy của state machine mới."
      });
    }
  });

  const billingCutoverChecks: BillingCutoverCheck[] = [
    {
      key: "schema",
      label: "Billing v2 schema",
      status: billingV2Available ? "pass" : "fail",
      detail: billingV2Available ? "subscription_plans, subscriptions và payments đã sẵn sàng." : "Project vẫn đang rơi về legacy schema."
    },
    {
      key: "plans",
      label: "Plan catalog",
      status: v2PlanCount >= 2 && v2EntitlementCount >= 10 ? "pass" : v2PlanCount >= 2 ? "warn" : "fail",
      detail: `${v2PlanCount} plans, ${v2EntitlementCount} entitlements`
    },
    {
      key: "subscriptions",
      label: "Subscription coverage",
      status: v2SubscriptionCount >= legacySubscriptionCount ? "pass" : v2SubscriptionCount > 0 ? "warn" : "fail",
      detail: `${v2SubscriptionCount}/${legacySubscriptionCount} subscriptions đã có ở v2`
    },
    {
      key: "payments",
      label: "Payment coverage",
      status: v2PaymentCount >= legacyPaymentCount ? "pass" : v2PaymentCount > 0 ? "warn" : "fail",
      detail: `${v2PaymentCount}/${legacyPaymentCount} payments đã có ở v2`
    },
    {
      key: "pending",
      label: "Pending payment mirror",
      status: legacyPendingPaymentCount === 0 || v2PendingPaymentCount >= legacyPendingPaymentCount ? "pass" : v2PendingPaymentCount > 0 ? "warn" : "fail",
      detail: `${v2PendingPaymentCount}/${legacyPendingPaymentCount} pending payments`
    },
    {
      key: "usage",
      label: "Usage ledger bridge",
      status: legacyAiUsageSuccessCount === 0 || v2FeatureUsageCount > 0 ? "pass" : "fail",
      detail: `${legacyAiUsageSuccessCount} legacy AI successes, ${v2FeatureUsageCount} feature usage logs, ${v2UsageQuotaCount} quota rows`
    }
  ];
  const billingCutoverStatus =
    billingCutoverChecks.some((check) => check.status === "fail")
      ? "needs_attention"
      : billingCutoverChecks.some((check) => check.status === "warn")
        ? "partial"
        : "healthy";
  const billingCutoverSource =
    !billingV2Available
      ? "legacy"
      : v2SubscriptionCount >= legacySubscriptionCount && v2PaymentCount >= legacyPaymentCount
        ? "v2"
        : "mixed";

  const env = [
    envStatus("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"),
    envStatus("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"),
    envStatus("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role"),
    envStatus("NEXT_PUBLIC_APP_URL", "App URL"),
    {
      ...envStatus("PLATFORM_ADMIN_PASSWORD", "Mật khẩu admin.logivn.com", process.env.NODE_ENV === "production"),
      configured: platformAuthStatus.configured,
      status: platformAuthStatus.configured
        ? platformAuthStatus.requiresFirstPasswordChange
          ? "Cần đổi lần đầu"
          : "OK"
        : process.env.NODE_ENV === "production"
          ? "Thiếu"
          : "Tuỳ chọn"
    },
    envStatus("PLATFORM_ADMIN_SESSION_SECRET", "Session secret admin.logivn.com", false),
    envStatus("PLATFORM_TELEGRAM_BOT_USERNAME", "DevOps Telegram username", false),
    envStatus("PLATFORM_TELEGRAM_CONNECT_TOKEN_SECRET", "DevOps Telegram connect secret", process.env.NODE_ENV === "production"),
    envStatus("PLATFORM_AI_SECRET_KEY", "Khoá mã hoá AI trong admin.logivn.com", false),
    envStatus("RESEND_API_KEY", "Resend email", false),
    envStatus("CRON_SECRET", "Cron secret", false),
    envStatus("BACKUP_ENCRYPTION_KEY", "Backup encryption key", process.env.NODE_ENV === "production"),
    envStatus("BACKUP_METADATA_SIGNING_KEY", "Backup metadata signing key", process.env.NODE_ENV === "production"),
    envStatus("R2_ENDPOINT", "Cloudflare R2 endpoint", false),
    envStatus("R2_BUCKET", "Cloudflare R2 backup bucket", false),
    envStatus("DEV_TELEGRAM_CHAT_ID", "Dev Telegram backup chat", false),
    envStatus("MAPBOX_ACCESS_TOKEN", "Mapbox ship/route", false),
    {
      ...envStatus("QWEN_API_KEY", "Alibaba Qwen AI", false),
      configured: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || aiProviderConfigs.find((provider) => provider.provider === "qwen")?.configured),
      status: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || aiProviderConfigs.find((provider) => provider.provider === "qwen")?.configured ? "OK" : "Tuỳ chọn"
    },
    {
      ...envStatus("XAI_API_KEY", "xAI Grok/Voice/Image", false),
      configured: Boolean(process.env.XAI_API_KEY || aiProviderConfigs.find((provider) => provider.provider === "xai")?.configured),
      status: process.env.XAI_API_KEY || aiProviderConfigs.find((provider) => provider.provider === "xai")?.configured ? "OK" : "Tuỳ chọn"
    }
  ];
  const securityControls = [
    {
      layer: "Auth / session",
      status: platformAuthStatus.configured ? (platformAuthStatus.requiresFirstPasswordChange ? "Cần đổi lần đầu" : "OK") : "Cần cấu hình",
      note: "Dashboard quán dùng Supabase Auth; admin.logivn.com dùng cookie HTTP-only ký HMAC và mật khẩu được hash sau lần đổi đầu tiên."
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
      migrationWarnings: warnings.length,
      aiRequests24h: aiControl.requests,
      mapRequests24h: mapControl.provider.requests,
      contentSurfaces: contentSurfaces.length,
      integrationWarnings: integrations.filter((item) => item.status !== "configured").length,
      backupOpenAlerts: backupHealth?.openAlerts.length ?? 0,
      backupRpoRisk: backupHealth?.rpoRisk ?? "high",
      adminCapabilities: adminCapabilities.length,
      guardedMutations: adminMutations.filter((item) => item.status === "live").length,
      highRiskMutations: adminMutations.filter((item) => item.risk === "high").length,
      projectSurfaces: projectAtlas.summary.surfaces,
      projectCriticalSurfaces: projectAtlas.summary.critical,
      projectControlGaps: projectAtlas.summary.plannedControl
    },
    billingCutover: {
      source: billingCutoverSource,
      status: billingCutoverStatus,
      legacy: {
        plans: legacyPlanCount,
        subscriptions: legacySubscriptionCount,
        payments: legacyPaymentCount,
        pendingPayments: legacyPendingPaymentCount,
        aiUsageSuccess: legacyAiUsageSuccessCount
      },
      v2: {
        plans: v2PlanCount,
        entitlements: v2EntitlementCount,
        subscriptions: v2SubscriptionCount,
        invoices: v2InvoiceCount,
        payments: v2PaymentCount,
        pendingPayments: v2PendingPaymentCount,
        paymentLogs: v2PaymentLogCount,
        usageQuotas: v2UsageQuotaCount,
        featureUsageLogs: v2FeatureUsageCount,
        trialUsage: v2TrialUsageCount,
        upgradeEvents: v2UpgradeEventCount
      },
      checks: billingCutoverChecks,
      anomalies: billingAnomalies.slice(0, 20)
    },
    contentSurfaces,
    aiControl,
    mapControl,
    backup: backupHealth,
    integrations,
    cronJobs,
    projectAtlas,
    governance: {
      capabilities: adminCapabilities,
      mutations: adminMutations,
      roles: adminRoleReadiness,
      summary: {
        capabilities: adminCapabilities.length,
        liveObserve: adminCapabilities.filter((item) => item.observe === "live").length,
        liveAdjust: adminCapabilities.filter((item) => item.adjust === "live").length,
        partialOrPlannedRollback: adminCapabilities.filter((item) => item.rollback !== "live").length,
        highRiskMutations: adminMutations.filter((item) => item.risk === "high").length,
        rolesReady: adminRoleReadiness.filter((item) => item.status === "live").length,
        rolesPlanned: adminRoleReadiness.filter((item) => item.status !== "live").length
      }
    },
    settings,
    plans: effectivePlans.map((plan) => ({ ...plan, features: asStringList(plan.features) })),
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
      { key: "cms", name: "CMS landing & brand", status: "live", owner: "Platform", note: "Sửa nội dung website, logo, banner và thông tin công ty tại admin.logivn.com." },
      {
        key: "content",
        name: "Content surfaces",
        status: contentSurfaces.some((item) => item.status === "needs_config") ? "needs_config" : contentSurfaces.some((item) => item.status !== "live") ? "needs_review" : "live",
        owner: "Growth/SEO",
        note: "Bao quát landing, pricing, blog, sitemap/feed/llms và customer QR surfaces với trạng thái nguồn dữ liệu rõ ràng."
      },
      {
        key: "billing",
        name: "Billing SaaS",
        status: billingCutoverStatus === "healthy" ? "live" : billingCutoverStatus === "partial" ? "needs_review" : "needs_config",
        owner: "Platform",
        note:
          billingCutoverSource === "v2"
            ? "Billing v2 đang là nguồn dữ liệu chính, có bridge cho quota, usage và payment mirror."
            : billingCutoverSource === "mixed"
              ? "Billing đang ở trạng thái mixed: v2 đã chạy nhưng vẫn cần dọn nốt coverage legacy."
              : "Billing vẫn đang rơi về legacy schema hoặc thiếu dữ liệu v2."
      },
      { key: "tenant", name: "Tenant lifecycle", status: "live", owner: "Platform", note: "Chỉ quản lý metadata, tạm dừng hoặc xoá mềm quán, không đọc doanh thu/đơn hàng riêng tư." },
      {
        key: "ai",
        name: "AI control center",
        status: integrations.some((item) => item.category === "ai" && item.status === "configured") ? "live" : "needs_config",
        owner: "AI Ops",
        note: `${aiControl.requests} AI requests trong 24h, ${aiControl.branchInsights.active} branch insights đang mở, routing owner=${aiControl.routing.ownerProvider}, image=${aiControl.routing.imageProvider}.`
      },
      {
        key: "maps",
        name: "Maps & delivery ops",
        status: mapControl.provider.failureRate > 10 ? "needs_review" : integrations.some((item) => item.key === "maps" && item.status !== "needs_config") ? "live" : "needs_config",
        owner: "Delivery Ops",
        note: `${mapControl.provider.requests} provider calls trong 24h, cache hit ${mapControl.cache.hitRate}%, quote accept ${mapControl.quotes.acceptanceRate}%.`
      },
      {
        key: "atlas",
        name: "Project Atlas",
        status: projectAtlas.summary.needsReview ? "needs_review" : "live",
        owner: "Platform",
        note: `${projectAtlas.summary.surfaces} surfaces mapped across frontend, backend, data, automation and integrations.`
      },
      {
        key: "ops",
        name: "Infra, cron & storage",
        status: backupHealth?.rpoRisk === "high" ? "needs_review" : cronJobs.every((job) => job.status === "configured") ? "live" : "needs_config",
        owner: "DevOps",
        note: `Theo dõi env, Vercel Cron, R2 readiness, backup RPO ${backupHealth?.rpoRisk ?? "unknown"}, persistent cache và rollback/deploy guardrails.`
      },
      {
        key: "governance",
        name: "Governance & change control",
        status: adminRoleReadiness.some((role) => role.status !== "live") ? "needs_review" : "live",
        owner: "Security",
        note: `${adminMutations.length} mutations mapped, ${adminMutations.filter((item) => item.risk === "high").length} high-risk actions need approval path.`
      },
      { key: "security", name: "Security guardrails", status: env.some((item) => item.required && !item.configured) ? "needs_config" : "live", owner: "Security", note: "HTTP-only admin.logivn.com session, service-role chỉ ở server, RLS cho tenant data." },
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
