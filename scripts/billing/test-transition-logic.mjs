import assert from "node:assert/strict";
import {
  buildPaymentPolicySummary,
  computeConfirmedSubscriptionTransition,
  isSubscriptionUsable
} from "../../lib/billing/subscription-transitions.ts";

const pro = {
  id: "plan-pro",
  code: "pro",
  name: "LogiVN Pro",
  monthly_price: 99_000
};

const premium = {
  id: "plan-premium",
  code: "premium",
  name: "LogiVN Premium",
  monthly_price: 199_000
};

function iso(date) {
  return new Date(date).toISOString();
}

const fixedNow = new Date("2026-05-10T12:00:00.000Z");

const activePro = {
  id: "sub-1",
  plan_id: pro.id,
  status: "active",
  current_period_start: iso("2026-05-01T00:00:00.000Z"),
  current_period_end: iso("2026-05-30T00:00:00.000Z"),
  trial_ends_at: null,
  metadata: {}
};

assert.equal(isSubscriptionUsable(activePro, fixedNow), true);

const renewPolicy = buildPaymentPolicySummary({
  subscription: activePro,
  currentPlan: pro,
  targetPlan: pro,
  months: 1,
  now: fixedNow
});
assert.equal(renewPolicy.billingAction, "renew");
assert.equal(renewPolicy.isImmediate, false);

const renewTransition = computeConfirmedSubscriptionTransition({
  subscription: activePro,
  payment: { id: "pay-renew", plan_id: pro.id, months: 1 },
  currentPlan: pro,
  targetPlan: pro,
  now: fixedNow
});
assert.equal(renewTransition.planId, pro.id);
assert.equal(renewTransition.currentPeriodStart, activePro.current_period_start);
assert.ok(new Date(renewTransition.currentPeriodEnd).getTime() > new Date(activePro.current_period_end).getTime());

const upgradePolicy = buildPaymentPolicySummary({
  subscription: activePro,
  currentPlan: pro,
  targetPlan: premium,
  months: 1,
  now: fixedNow
});
assert.equal(upgradePolicy.billingAction, "upgrade");
assert.equal(upgradePolicy.policyKey, "upgrade_immediate_credit");
assert.equal(upgradePolicy.isImmediate, true);

const upgradeTransition = computeConfirmedSubscriptionTransition({
  subscription: activePro,
  payment: { id: "pay-upgrade", plan_id: premium.id, months: 1 },
  currentPlan: pro,
  targetPlan: premium,
  now: fixedNow
});
assert.equal(upgradeTransition.planId, premium.id);
assert.equal(upgradeTransition.currentPeriodStart, fixedNow.toISOString());
assert.ok(
  new Date(upgradeTransition.currentPeriodEnd).getTime() > new Date("2026-06-09T12:00:00.000Z").getTime(),
  "upgrade should preserve some converted credit from the remaining Pro cycle"
);

const trialPro = {
  id: "sub-trial",
  plan_id: pro.id,
  status: "trialing",
  current_period_start: iso("2026-05-08T00:00:00.000Z"),
  current_period_end: iso("2026-06-07T00:00:00.000Z"),
  trial_ends_at: iso("2026-06-07T00:00:00.000Z"),
  metadata: {}
};
const trialUpgrade = computeConfirmedSubscriptionTransition({
  subscription: trialPro,
  payment: { id: "pay-trial-up", plan_id: premium.id, months: 1 },
  currentPlan: pro,
  targetPlan: premium,
  now: fixedNow
});
assert.equal(trialUpgrade.planId, premium.id);
assert.equal(trialUpgrade.currentPeriodStart, fixedNow.toISOString());
assert.ok(trialUpgrade.metadata.trialConvertedAt);

const expiredSub = {
  id: "sub-expired",
  plan_id: pro.id,
  status: "expired",
  current_period_start: iso("2026-03-01T00:00:00.000Z"),
  current_period_end: iso("2026-04-01T00:00:00.000Z"),
  trial_ends_at: null,
  metadata: {}
};
const expiredUpgrade = computeConfirmedSubscriptionTransition({
  subscription: expiredSub,
  payment: { id: "pay-expired", plan_id: premium.id, months: 1 },
  currentPlan: pro,
  targetPlan: premium,
  now: fixedNow
});
assert.equal(expiredUpgrade.planId, premium.id);
assert.equal(expiredUpgrade.currentPeriodStart, fixedNow.toISOString());

assert.throws(
  () =>
    computeConfirmedSubscriptionTransition({
      subscription: {
        ...activePro,
        plan_id: premium.id
      },
      payment: { id: "pay-down", plan_id: pro.id, months: 1 },
      currentPlan: premium,
      targetPlan: pro,
      now: fixedNow
    }),
  /Downgrade while the current cycle is still active/
);

console.log("billing:test passed");
