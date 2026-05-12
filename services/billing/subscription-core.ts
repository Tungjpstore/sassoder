import "server-only";

import { unstable_cache } from "next/cache";
import type { BillingPlanCode } from "@/lib/billing/types";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { addDays, asFeatures, asRecord, hashMaybe, normalizeBillingPlanCode, normalizeSettings } from "./billing-utils";
import type { PlanRow, RestaurantRow, SubscriptionRow } from "./billing-types";

export function getSubscriptionAccessEnd(subscription: SubscriptionRow) {
  return subscription.current_period_end || subscription.trial_ends_at;
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

export async function getDefaultPlan(planCode?: string) {
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

export async function getActivePlanByCode(planCode: string) {
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

export async function repairRequestedOnboardingPlanIfNeeded({
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

export async function getRestaurant(restaurantId: string) {
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

export async function getOrCreateSubscription(restaurantId: string, ownerEmail?: string | null) {
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
