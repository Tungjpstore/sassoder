import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscriptionExpiryWarning, SUBSCRIPTION_EXPIRY_NOTICE_DAYS } from "@/lib/billing/subscription-warning";

test("subscription expiry warning starts only at the configured renewal window", () => {
  assert.equal(
    buildSubscriptionExpiryWarning({
      allowed: true,
      pendingButStillUsable: false,
      daysLeft: SUBSCRIPTION_EXPIRY_NOTICE_DAYS + 1
    }),
    null
  );

  const warning = buildSubscriptionExpiryWarning({
    allowed: true,
    pendingButStillUsable: false,
    daysLeft: SUBSCRIPTION_EXPIRY_NOTICE_DAYS
  });

  assert.equal(warning?.severity, "warning");
  assert.match(warning?.message ?? "", /3 ngày/);
});

test("subscription expiry warning stays hidden for pending usable subscriptions", () => {
  assert.equal(
    buildSubscriptionExpiryWarning({
      allowed: true,
      pendingButStillUsable: true,
      daysLeft: 1
    }),
    null
  );
});

test("subscription expiry warning escalates when the period is ending now", () => {
  const warning = buildSubscriptionExpiryWarning({
    allowed: true,
    pendingButStillUsable: false,
    daysLeft: 0
  });

  assert.equal(warning?.severity, "danger");
  assert.match(warning?.message ?? "", /hết hạn hôm nay/);
});
