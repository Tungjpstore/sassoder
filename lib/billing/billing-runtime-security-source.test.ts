import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const subscriptionCronSource = readFileSync("services/billing/subscription-cron.ts", "utf8");
const paymentWebhookSource = readFileSync("services/billing/payment-webhook.ts", "utf8");
const hardeningMigration = readFileSync("supabase/migrations/20260602094500_harden_onboarding_plan_limits.sql", "utf8");

test("subscription cron expires past_due subscriptions after the grace window", () => {
  assert.match(subscriptionCronSource, /DEFAULT_GRACE_PERIOD_DAYS/);
  assert.match(subscriptionCronSource, /graceCutoff = addDays\(new Date\(\), -DEFAULT_GRACE_PERIOD_DAYS\)\.toISOString\(\)/);
  assert.match(subscriptionCronSource, /\.eq\("status", "past_due"\)[\s\S]*\.lt\("current_period_end", graceCutoff\)/);
  assert.match(subscriptionCronSource, /expiredPastDueSubscriptions/);
  assert.match(subscriptionCronSource, /expiredV2GraceSubscriptions/);
  assert.match(subscriptionCronSource, /\.eq\("status", "grace"\)[\s\S]*\.lt\("grace_ends_at", now\)/);
  assert.match(subscriptionCronSource, /\.is\("grace_ends_at", null\)[\s\S]*\.lt\("current_period_end", graceCutoff\)/);
});

test("billing webhook claims idempotency before mutating payment state", () => {
  assert.match(paymentWebhookSource, /async function claimWebhookLog/);
  assert.match(paymentWebhookSource, /event_type: `webhook_\$\{event\.status\}_claimed`/);
  assert.match(paymentWebhookSource, /if \(error\?\.code === "23505"\) return false/);
  assert.match(paymentWebhookSource, /const claimed = await claimWebhookLog/);
  assert.match(paymentWebhookSource, /if \(!claimed\) return \{ duplicate: true/);
  assert.match(paymentWebhookSource, /await updateV2PaymentFromWebhook\(payment, event\)[\s\S]*await closeLegacyPaymentFromWebhook\(payment, event\)[\s\S]*await finalizeWebhookLog/);
  assert.match(paymentWebhookSource, /await releaseWebhookClaim\(payment\.id, eventKey\)/);
});

test("billing webhook validates amount and prevents stale status overwrites", () => {
  assert.match(paymentWebhookSource, /amount,currency,status,metadata/);
  assert.match(paymentWebhookSource, /assertConfirmedWebhookAmountMatchesPayment/);
  assert.match(paymentWebhookSource, /event\.amount === null \|\| event\.amount !== payment\.amount/);
  assert.match(paymentWebhookSource, /event\.currency && event\.currency !== payment\.currency\.toUpperCase\(\)/);
  assert.match(paymentWebhookSource, /\.eq\("status", payment\.status\)[\s\S]*\.select\("id,status"\)/);
  assert.match(paymentWebhookSource, /return updateV2PaymentFromWebhook\(currentPayment as BillingWebhookPaymentRow, event\)/);
});

test("billing webhook idempotency is protected by a database unique index", () => {
  assert.match(hardeningMigration, /create unique index if not exists billing_payment_logs_request_signature_idx/);
  assert.match(hardeningMigration, /on public\.billing_payment_logs \(request_signature\)/);
  assert.match(hardeningMigration, /where request_signature is not null/);
});

test("database plan limit triggers serialize concurrent resource inserts", () => {
  assert.match(hardeningMigration, /pg_advisory_xact_lock\(hashtextextended\(new\.restaurant_id::text \|\| ':' \|\| tg_table_name, 0\)\)/);
});

test("database v2 grace subscriptions carry and enforce grace deadlines", () => {
  assert.match(hardeningMigration, /grace_ends_at/);
  assert.match(hardeningMigration, /current_period_end \+ interval '7 days'/);
  assert.match(hardeningMigration, /when s\.status = 'grace' then coalesce\(s\.grace_ends_at, s\.current_period_end \+ interval '7 days'/);
});
