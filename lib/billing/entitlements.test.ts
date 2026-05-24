import assert from "node:assert/strict";
import test from "node:test";
import { assertServerFeatureAccess } from "@/lib/billing/feature-gates";
import { buildResolvedEntitlementSnapshot, resolveFeatureAccess } from "@/lib/billing/entitlements";
import type { QuotaSnapshot } from "@/lib/billing/types";

function quota(key: string, used: number, limit: number): QuotaSnapshot {
  return {
    key,
    label: key,
    used,
    limit,
    unit: "lượt",
    window: "monthly"
  };
}

test("pro plan keeps core ordering features active", () => {
  const access = resolveFeatureAccess("pro", "qr_ordering");

  assert.equal(access.state, "active");
  assert.equal(access.includedInPlan, true);
});

test("pro trial features become unavailable after trial use", () => {
  const firstUse = resolveFeatureAccess("pro", "ai_image_generation", {
    ai_image_generation_trial: quota("ai_image_generation_trial", 0, 1)
  });
  const usedTrial = resolveFeatureAccess(
    "pro",
    "ai_image_generation",
    {
      ai_image_generation_trial: quota("ai_image_generation_trial", 1, 1)
    },
    { ai_image_generation: true }
  );

  assert.equal(firstUse.state, "active");
  assert.equal(firstUse.includedInPlan, false);
  assert.equal(usedTrial.state, "trial_used");
});

test("trial quotas can be resolved from legacy feature keys during migration", () => {
  const access = resolveFeatureAccess("pro", "ai_analytics", {
    ai_analytics: quota("ai_analytics", 1, 1)
  });

  assert.equal(access.state, "trial_used");
  assert.equal(access.usage?.key, "ai_analytics_trial");
  assert.equal(access.usage?.used, 1);
});

test("quota-backed features become unavailable when usage reaches the plan limit", () => {
  const access = resolveFeatureAccess("pro", "ai_chatbot", {
    ai_chatbot: quota("ai_chatbot", 500, 500)
  });

  assert.equal(access.state, "quota_exceeded");
  assert.equal(access.usage?.used, 500);
  assert.equal(access.usage?.limit, 500);
});

test("premium-only features are locked on pro and active on premium", () => {
  assert.equal(resolveFeatureAccess("pro", "advanced_reports").state, "locked_plan");
  assert.equal(resolveFeatureAccess("premium", "advanced_reports").state, "active");
});

test("server feature gate allows active access and rejects locked or exhausted access", () => {
  const snapshot = buildResolvedEntitlementSnapshot({
    planCode: "pro",
    status: "active",
    daysLeft: 12,
    usage: {
      ai_chatbot: quota("ai_chatbot", 500, 500),
      ai_image_generation_trial: quota("ai_image_generation_trial", 1, 1)
    },
    trialsUsed: {
      ai_image_generation: true
    }
  });

  assert.equal(assertServerFeatureAccess(snapshot, "qr_ordering").state, "active");
  assert.throws(() => assertServerFeatureAccess(snapshot, "advanced_reports"), /Premium/);
  assert.throws(() => assertServerFeatureAccess(snapshot, "ai_chatbot"), /hết quota/);
  assert.throws(() => assertServerFeatureAccess(snapshot, "ai_image_generation"), /dùng thử/);
});

test("server feature gate rejects active-looking features when the subscription is expired", () => {
  const snapshot = buildResolvedEntitlementSnapshot({
    planCode: "premium",
    status: "expired",
    daysLeft: 0
  });

  assert.throws(() => assertServerFeatureAccess(snapshot, "qr_ordering"), /hết hạn/);
});
