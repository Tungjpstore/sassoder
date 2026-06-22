import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getFallbackCapabilityMap } from "@/services/billing/plan-features";

const migrationSource = readFileSync(
  "supabase/migrations/20260622083200_billing_delivery_realtime_entitlement_sync.sql",
  "utf8"
);
const subscriptionServiceSource = readFileSync("services/subscription-service.ts", "utf8");

describe("delivery realtime entitlement", () => {
  it("keeps delivery realtime tracking locked on Pro and active on Premium fallback", () => {
    assert.equal(getFallbackCapabilityMap("pro").delivery_realtime_tracking.enabled, false);
    assert.equal(getFallbackCapabilityMap("premium").delivery_realtime_tracking.enabled, true);
  });

  it("syncs delivery realtime tracking into legacy and Billing v2 plan rows", () => {
    assert.match(migrationSource, /'delivery_realtime_tracking', false, null::integer/);
    assert.match(migrationSource, /'delivery_realtime_tracking', true, null::integer/);
    assert.match(migrationSource, /'pro', 'delivery_realtime_tracking', 'locked_plan'/);
    assert.match(migrationSource, /'premium', 'delivery_realtime_tracking', 'active'/);
  });

  it("lets runtime entitlements prefer Billing v2 subscriptions over stale legacy plan rows", () => {
    assert.match(subscriptionServiceSource, /readBillingV2Bridge\(restaurantId\)/);
    assert.match(subscriptionServiceSource, /getEffectiveBillingV2Capabilities/);
    assert.match(subscriptionServiceSource, /applyPremiumFallbackGuarantees\(capabilities, planCode\)/);
  });
});
