import "server-only";

import { assertServerFeatureAccess } from "@/lib/billing/feature-gates";
import { buildSubscriptionExpiryWarning } from "@/lib/billing/subscription-warning";
import { isSubscriptionUsable } from "@/lib/billing/subscription-transitions";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BillingFeatureKey, QuotaDimension, QuotaWindow } from "@/lib/billing/types";
import type { BillingPlanCode } from "@/lib/billing/types";
import {
  daysUntil,
  firstOrNull,
  getQuotaPeriod,
  isMissingSchemaError,
  normalizeBillingPlanCode
} from "./billing/billing-utils";
import { readBillingV2Bridge } from "./billing/billing-v2-bridge";
import { getRestaurantBillingPortal as runGetRestaurantBillingPortal } from "./billing/billing-portal";
import type { BillingV2SubscriptionRow, PlanRow, SubscriptionRow } from "./billing/billing-types";
import { createSubscriptionPaymentRequest as runCreateSubscriptionPaymentRequest } from "./billing/payment-request";
import {
  confirmSubscriptionPayment as runConfirmSubscriptionPayment,
  rejectSubscriptionPayment as runRejectSubscriptionPayment
} from "./billing/payment-admin";
import {
  expireStaleRestaurantSubscriptions as runExpireStaleRestaurantSubscriptions,
  sendSubscriptionExpiryReminders as runSendSubscriptionExpiryReminders
} from "./billing/subscription-cron";
import {
  createInitialRestaurantSubscription as runCreateInitialRestaurantSubscription,
  getActivePlans as runGetActivePlans,
  getBillingSettings as runGetBillingSettings,
  getPublicActivePlans,
  getSubscriptionAccessEnd,
  repairRequestedOnboardingPlanIfNeeded
} from "./billing/subscription-core";
import {
  featureLabels,
  getFallbackCapabilityMap,
  normalizeFeatureKey,
  planFeatureKeys,
  planFeatureLabels,
  type PlanFeatureKey,
  type PlanFeatureState
} from "./billing/plan-features";
import { writeOperationalEvent } from "./operational-observability-service";

export { getPublicActivePlans, planFeatureLabels };
export type { PlanFeatureKey, PlanFeatureState };

type PlanCapabilityRow = {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

type RestaurantFeatureOverrideRow = PlanCapabilityRow & {
  expires_at: string | null;
};

type PlanEntitlementRow = {
  feature_key: string;
  access_mode: "active" | "locked_plan" | "quota" | "trial";
  limit_value: number | null;
};

const entitlementCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof readRestaurantEntitlement>> }>();
const entitlementCacheTtlMs = 15_000;

function applyPremiumFallbackGuarantees(
  capabilities: Record<PlanFeatureKey, PlanFeatureState>,
  planCode?: string | null
) {
  if (planCode !== "premium") return capabilities;
  const premiumFallback = getFallbackCapabilityMap("premium");

  for (const featureKey of planFeatureKeys) {
    const guaranteed = premiumFallback[featureKey];
    if (!guaranteed.enabled || capabilities[featureKey]?.enabled) continue;
    capabilities[featureKey] = {
      enabled: true,
      limitValue: capabilities[featureKey]?.limitValue ?? guaranteed.limitValue,
      source: "fallback"
    };
  }

  return capabilities;
}

function accessModeToEnabled(accessMode: PlanEntitlementRow["access_mode"]) {
  return accessMode !== "locked_plan";
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

    applyPremiumFallbackGuarantees(capabilities, planCode);

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

async function getEffectiveBillingV2Capabilities({
  planId,
  restaurantId,
  planCode
}: {
  planId: string;
  restaurantId: string;
  planCode: BillingPlanCode;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const capabilities = getFallbackCapabilityMap(planCode);

  try {
    const now = new Date().toISOString();
    const [entitlementResult, overrideResult] = await Promise.all([
      supabase
        .from("plan_entitlements")
        .select("feature_key,access_mode,limit_value")
        .eq("plan_id", planId)
        .is("deleted_at", null),
      supabase
        .from("restaurant_feature_overrides")
        .select("feature_key,enabled,limit_value,expires_at")
        .eq("restaurant_id", restaurantId)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
    ]);

    if (entitlementResult.error) {
      if (!isMissingSchemaError(entitlementResult.error)) throw entitlementResult.error;
      return applyPremiumFallbackGuarantees(capabilities, planCode);
    }

    for (const row of (entitlementResult.data ?? []) as PlanEntitlementRow[]) {
      const featureKey = normalizeFeatureKey(row.feature_key);
      if (!featureKey) continue;
      capabilities[featureKey] = {
        enabled: accessModeToEnabled(row.access_mode),
        limitValue: row.limit_value ?? capabilities[featureKey].limitValue,
        source: "plan"
      };
    }

    applyPremiumFallbackGuarantees(capabilities, planCode);

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

function getBillingV2AccessEnd(subscription: BillingV2SubscriptionRow) {
  return subscription.current_period_end || subscription.trial_ends_at || subscription.grace_ends_at || null;
}

function isBillingV2SubscriptionUsable(subscription: BillingV2SubscriptionRow, now = new Date()) {
  const accessEnd = getBillingV2AccessEnd(subscription);
  const hasCurrentWindow = accessEnd ? new Date(accessEnd).getTime() >= now.getTime() : true;

  if (subscription.status === "active" || subscription.status === "trialing") return hasCurrentWindow;
  if (subscription.status === "pending_payment") return Boolean(accessEnd) && hasCurrentWindow;
  if (subscription.status === "grace") {
    const graceEndsAt = subscription.grace_ends_at ?? null;
    return Boolean(graceEndsAt) && new Date(graceEndsAt as string).getTime() >= now.getTime();
  }
  return false;
}

function billingV2StatusCode(subscription: BillingV2SubscriptionRow) {
  return subscription.status === "suspended" ? 403 : 402;
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

async function readRestaurantEntitlement(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurantResult, subscriptionResult, billingV2] = await Promise.all([
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
      .maybeSingle(),
    readBillingV2Bridge(restaurantId)
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
  if (billingV2?.subscription?.id && billingV2.plan?.id) {
    const v2Subscription = billingV2.subscription;
    const v2Allowed = isBillingV2SubscriptionUsable(v2Subscription);
    const shouldPreferBillingV2 = v2Allowed || !subscription || v2Subscription.status === "suspended";
    if (shouldPreferBillingV2) {
      const v2PlanCode = normalizeBillingPlanCode(billingV2.plan.code);
      const periodEnd = getBillingV2AccessEnd(v2Subscription);
      const daysLeft = v2Allowed ? daysUntil(periodEnd) : 0;
      const features = await getEffectiveBillingV2Capabilities({
        planId: billingV2.plan.id,
        restaurantId,
        planCode: v2PlanCode
      });

      return {
        allowed: v2Allowed,
        statusCode: v2Allowed ? 200 : billingV2StatusCode(v2Subscription),
        reason: v2Allowed
          ? null
          : v2Subscription.status === "pending_payment"
            ? "Gói LogiVN đang chờ xác minh thanh toán và không còn kỳ sử dụng hợp lệ. Vui lòng hoàn tất gia hạn để tiếp tục vận hành."
            : v2Subscription.status === "suspended"
              ? "Gói LogiVN đang bị tạm dừng. Vui lòng liên hệ LogiVN để mở lại."
              : "Gói LogiVN đã hết hạn hoặc không còn khả dụng. Vui lòng gia hạn để tiếp tục dùng tính năng vận hành.",
        restaurantStatus,
        subscriptionStatus: v2Subscription.status === "grace" ? "past_due" as const : v2Subscription.status,
        subscriptionId: v2Subscription.id,
        planId: billingV2.plan.id,
        planCode: v2PlanCode,
        planName: billingV2.plan.name,
        currentPeriodEnd: v2Subscription.current_period_end,
        trialEndsAt: v2Subscription.trial_ends_at,
        periodEnd,
        daysLeft,
        features,
        warning: buildSubscriptionExpiryWarning({
          allowed: v2Allowed,
          pendingButStillUsable: v2Subscription.status === "pending_payment" && v2Allowed,
          daysLeft
        })
      };
    }
  }

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
  const daysLeft = allowed ? daysUntil(periodEnd) : 0;
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
    warning: buildSubscriptionExpiryWarning({
      allowed,
      pendingButStillUsable,
      daysLeft
    })
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
    writeOperationalEvent({
      area: "entitlement",
      event: "restaurant_entitlement_denied",
      restaurantId,
      status: "warn",
      metadata: {
        planCode: entitlement.planCode,
        reason: entitlement.reason,
        statusCode: entitlement.statusCode
      }
    });
    throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
  }

  return entitlement;
}

export async function assertFeatureEntitlement(restaurantId: string, featureKey: PlanFeatureKey) {
  const entitlement = await assertRestaurantEntitlement(restaurantId);
  const feature = entitlement.features[featureKey];
  if (!feature?.enabled) {
    writeOperationalEvent({
      area: "entitlement",
      event: "feature_entitlement_denied",
      restaurantId,
      status: "warn",
      metadata: {
        featureKey,
        planCode: entitlement.planCode,
        planName: entitlement.planName
      }
    });
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

export async function getActivePlans() {
  return runGetActivePlans();
}

export async function getBillingSettings() {
  return runGetBillingSettings();
}

export async function createInitialRestaurantSubscription(input: {
  restaurantId: string;
  ownerUserId?: string;
  ownerEmail: string;
  planCode?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return runCreateInitialRestaurantSubscription(input);
}

export async function getRestaurantBillingPortal({
  restaurantId,
  ownerEmail
}: {
  restaurantId: string;
  ownerEmail?: string | null;
}) {
  return runGetRestaurantBillingPortal({ restaurantId, ownerEmail });
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
  return runCreateSubscriptionPaymentRequest({ restaurantId, ownerEmail, months, planCode });
}

export async function confirmSubscriptionPayment({
  paymentId,
  confirmedBy = "platform-admin"
}: {
  paymentId: string;
  confirmedBy?: string;
}) {
  return runConfirmSubscriptionPayment({
    paymentId,
    confirmedBy,
    invalidateRestaurantEntitlementCache
  });
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
  return runRejectSubscriptionPayment({
    paymentId,
    reason,
    rejectedBy,
    invalidateRestaurantEntitlementCache
  });
}

export async function sendSubscriptionExpiryReminders() {
  return runSendSubscriptionExpiryReminders();
}

export async function expireStaleRestaurantSubscriptions() {
  return runExpireStaleRestaurantSubscriptions({
    invalidateRestaurantEntitlementCache
  });
}
