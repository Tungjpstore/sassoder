import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { BillingFeatureKey, QuotaSnapshot } from "@/lib/billing/types";
import {
  dayStartIso,
  formatDateVi,
  isMissingSchemaError,
  monthStartIso,
  normalizeQuotaDimension,
  normalizeQuotaWindow
} from "./billing-utils";
import { legacyBillingFeatureMap, type PlanFeatureKey } from "./plan-features";

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

export async function readLegacyUsageBridge(restaurantId: string) {
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

    for (const row of (quotaRows ?? []) as UsageQuotaRow[]) {
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
