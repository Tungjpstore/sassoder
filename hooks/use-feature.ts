"use client";

import type { BillingFeatureKey } from "@/lib/billing/types";
import { useEntitlementSnapshot } from "@/components/billing/entitlement-provider";
import { useUpgradeFlow } from "@/stores/use-upgrade-flow";

export function useFeature(featureKey: BillingFeatureKey) {
  const snapshot = useEntitlementSnapshot();
  const open = useUpgradeFlow((state) => state.open);
  const access = snapshot.features[featureKey];
  const subscriptionExpired = snapshot.status === "expired";

  return {
    access,
    blockState: subscriptionExpired ? "subscription_expired" : access.state,
    canUse: !subscriptionExpired && access.state === "active",
    openUpgrade: () => open({ featureKey, source: "feature_gate" })
  };
}
