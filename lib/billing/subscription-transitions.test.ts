import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentPolicySummary,
  computeConfirmedSubscriptionTransition,
  getSubscriptionAccessStatus,
  getSubscriptionGraceEnd,
  isSubscriptionUsable,
  type LegacyPlanSnapshot,
  type LegacySubscriptionSnapshot
} from "@/lib/billing/subscription-transitions";

const pro = {
  id: "plan-pro",
  code: "pro",
  name: "LogiVN Pro",
  monthly_price: 99_000
} satisfies LegacyPlanSnapshot;

const premium = {
  id: "plan-premium",
  code: "premium",
  name: "LogiVN Premium",
  monthly_price: 199_000
} satisfies LegacyPlanSnapshot;

const fixedNow = new Date("2026-05-10T12:00:00.000Z");

function iso(date: string) {
  return new Date(date).toISOString();
}

function activeSubscription(planId = pro.id): LegacySubscriptionSnapshot {
  return {
    id: "sub-active",
    plan_id: planId,
    status: "active",
    current_period_start: iso("2026-05-01T00:00:00.000Z"),
    current_period_end: iso("2026-05-30T00:00:00.000Z"),
    trial_ends_at: null,
    metadata: {}
  };
}

test("active and pending subscriptions are usable only inside a valid access window", () => {
  const active = activeSubscription();
  assert.equal(isSubscriptionUsable(active, fixedNow), true);

  assert.equal(
    isSubscriptionUsable(
      {
        ...active,
        status: "pending_payment"
      },
      fixedNow
    ),
    true
  );

  assert.equal(
    isSubscriptionUsable(
      {
        ...active,
        status: "pending_payment",
        current_period_end: iso("2026-04-01T00:00:00.000Z")
      },
      fixedNow
    ),
    false
  );
});

test("past due subscriptions stay usable only during the grace period", () => {
  const subscription = {
    ...activeSubscription(),
    status: "past_due",
    current_period_end: iso("2026-05-08T12:00:00.000Z")
  } satisfies LegacySubscriptionSnapshot;

  assert.equal(getSubscriptionGraceEnd(subscription), iso("2026-05-15T12:00:00.000Z"));
  assert.equal(isSubscriptionUsable(subscription, fixedNow), true);
  assert.equal(getSubscriptionAccessStatus(subscription, fixedNow), "grace");

  const afterGrace = new Date("2026-05-16T12:00:00.000Z");
  assert.equal(isSubscriptionUsable(subscription, afterGrace), false);
  assert.equal(getSubscriptionAccessStatus(subscription, afterGrace), "expired");
});

test("renewals extend from the existing period end without losing paid days", () => {
  const subscription = activeSubscription();
  const policy = buildPaymentPolicySummary({
    subscription,
    currentPlan: pro,
    targetPlan: pro,
    months: 1,
    now: fixedNow
  });

  assert.equal(policy.billingAction, "renew");
  assert.equal(policy.policyKey, "renew_extend_window");
  assert.equal(policy.isImmediate, false);

  const transition = computeConfirmedSubscriptionTransition({
    subscription,
    payment: { id: "pay-renew", plan_id: pro.id, months: 1 },
    currentPlan: pro,
    targetPlan: pro,
    now: fixedNow
  });

  assert.equal(transition.planId, pro.id);
  assert.equal(transition.currentPeriodStart, subscription.current_period_start);
  assert.ok(new Date(transition.currentPeriodEnd).getTime() > new Date(subscription.current_period_end ?? "").getTime());
});

test("active upgrades switch immediately and preserve proportional credit", () => {
  const subscription = activeSubscription();
  const policy = buildPaymentPolicySummary({
    subscription,
    currentPlan: pro,
    targetPlan: premium,
    months: 1,
    now: fixedNow
  });

  assert.equal(policy.billingAction, "upgrade");
  assert.equal(policy.policyKey, "upgrade_immediate_credit");
  assert.equal(policy.isImmediate, true);

  const transition = computeConfirmedSubscriptionTransition({
    subscription,
    payment: { id: "pay-upgrade", plan_id: premium.id, months: 1 },
    currentPlan: pro,
    targetPlan: premium,
    now: fixedNow
  });

  assert.equal(transition.planId, premium.id);
  assert.equal(transition.currentPeriodStart, fixedNow.toISOString());
  assert.ok(Number(transition.metadata.convertedCreditDays) > 0);
});

test("trial upgrades convert immediately into a paid premium period", () => {
  const subscription = {
    ...activeSubscription(),
    id: "sub-trial",
    status: "trialing",
    current_period_start: iso("2026-05-08T00:00:00.000Z"),
    current_period_end: iso("2026-06-07T00:00:00.000Z"),
    trial_ends_at: iso("2026-06-07T00:00:00.000Z")
  } satisfies LegacySubscriptionSnapshot;

  const transition = computeConfirmedSubscriptionTransition({
    subscription,
    payment: { id: "pay-trial-upgrade", plan_id: premium.id, months: 1 },
    currentPlan: pro,
    targetPlan: premium,
    now: fixedNow
  });

  assert.equal(transition.planId, premium.id);
  assert.equal(transition.currentPeriodStart, fixedNow.toISOString());
  assert.equal(transition.metadata.trialConvertedAt, fixedNow.toISOString());
});

test("expired subscriptions switch immediately from the payment confirmation time", () => {
  const subscription = {
    ...activeSubscription(),
    id: "sub-expired",
    status: "expired",
    current_period_start: iso("2026-03-01T00:00:00.000Z"),
    current_period_end: iso("2026-04-01T00:00:00.000Z")
  } satisfies LegacySubscriptionSnapshot;

  const transition = computeConfirmedSubscriptionTransition({
    subscription,
    payment: { id: "pay-expired", plan_id: premium.id, months: 1 },
    currentPlan: pro,
    targetPlan: premium,
    now: fixedNow
  });

  assert.equal(transition.planId, premium.id);
  assert.equal(transition.currentPeriodStart, fixedNow.toISOString());
});

test("active downgrades are rejected until the current paid cycle ends", () => {
  assert.throws(
    () =>
      computeConfirmedSubscriptionTransition({
        subscription: activeSubscription(premium.id),
        payment: { id: "pay-downgrade", plan_id: pro.id, months: 1 },
        currentPlan: premium,
        targetPlan: pro,
        now: fixedNow
      }),
    /Downgrade while the current cycle is still active/
  );
});
