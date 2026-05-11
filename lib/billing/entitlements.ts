import { featureCatalog, planCatalog } from "@/lib/billing/catalog";
import type {
  BillingFeatureKey,
  BillingPlanCode,
  QuotaSnapshot,
  ResolvedEntitlementSnapshot,
  ResolvedFeatureAccess
} from "@/lib/billing/types";
import { isQuotaExceeded } from "@/lib/billing/quotas";

type BillingSnapshotInput = {
  planCode: BillingPlanCode;
  planName?: string;
  daysLeft: number;
  status: "active" | "grace" | "expired" | "pending_payment";
  usage?: Partial<Record<string, Omit<QuotaSnapshot, "used"> & { used?: number }>>;
  trialsUsed?: Partial<Record<BillingFeatureKey, boolean>>;
};

export function resolveFeatureAccess(
  planCode: BillingPlanCode,
  featureKey: BillingFeatureKey,
  usage?: Partial<Record<string, Omit<QuotaSnapshot, "used"> & { used?: number }>>,
  trialsUsed?: Partial<Record<BillingFeatureKey, boolean>>
): ResolvedFeatureAccess {
  const descriptor = featureCatalog[featureKey];
  const spec = planCatalog[planCode].entitlements[featureKey];
  const usageSnapshot = spec.quota ? usage?.[spec.quota.key] ?? usage?.[featureKey] : undefined;
  const quota = spec.quota
    ? {
        ...spec.quota,
        used: usageSnapshot?.used ?? spec.quota.used ?? 0,
        resetLabel: usageSnapshot?.resetLabel ?? spec.quota.resetLabel
      }
    : undefined;

  let state: ResolvedFeatureAccess["state"] = "active";
  if (!spec.included && spec.accessMode === "locked_plan") state = "locked_plan";
  if (quota && isQuotaExceeded(quota)) state = "quota_exceeded";
  if (!spec.included && spec.accessMode === "trial" && (trialsUsed?.[featureKey] || (quota && isQuotaExceeded(quota)))) {
    state = "trial_used";
  }

  return {
    key: featureKey,
    label: descriptor.label,
    description: descriptor.description,
    state,
    planCode,
    badge: descriptor.badge,
    includedInPlan: spec.included,
    limit: spec.limit ?? quota?.limit ?? null,
    unit: spec.unit ?? quota?.unit,
    usage: quota,
    preview: spec.preview,
    upgradeHeadline: descriptor.upgradeHeadline,
    upgradeBullets: descriptor.upgradeBullets
  };
}

export function buildResolvedEntitlementSnapshot(input: BillingSnapshotInput): ResolvedEntitlementSnapshot {
  const plan = planCatalog[input.planCode];
  const features = Object.keys(featureCatalog).reduce(
    (acc, key) => {
      const featureKey = key as BillingFeatureKey;
      acc[featureKey] = resolveFeatureAccess(input.planCode, featureKey, input.usage, input.trialsUsed);
      return acc;
    },
    {} as Record<BillingFeatureKey, ResolvedFeatureAccess>
  );

  const quotas = Object.values(features).reduce(
    (acc, feature) => {
      if (feature.usage) acc[feature.usage.key] = feature.usage;
      return acc;
    },
    {} as Record<string, QuotaSnapshot>
  );

  return {
    planCode: input.planCode,
    planName: input.planName ?? plan.name,
    status: input.status,
    daysLeft: input.daysLeft,
    features,
    quotas
  };
}

export function getUpgradeTargetPlan(planCode: BillingPlanCode) {
  return planCode === "premium" ? planCatalog.premium : planCatalog.premium;
}
