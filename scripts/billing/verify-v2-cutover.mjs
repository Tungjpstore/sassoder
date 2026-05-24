import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      values[key] = value;
    }
  }
  return values;
}

function loadLocalEnv() {
  const cwd = process.cwd();
  for (const filename of [".env.local", ".env"]) {
    const fullPath = path.join(cwd, filename);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }
  }
}

function statusIcon(status) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

async function countRows(supabase, table, build) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (build) query = build(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return Number(count ?? 0);
}

async function selectRows(supabase, table, columns, build) {
  let query = supabase.from(table).select(columns);
  if (build) query = build(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function compareCoverage(legacyValues, nextValues) {
  const nextSet = new Set(nextValues.filter(Boolean));
  return legacyValues.filter((value) => value && !nextSet.has(value));
}

async function main() {
  loadLocalEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong env.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const [
    legacyPlans,
    legacySubscriptions,
    legacyPayments,
    legacyPendingPayments,
    legacyAiUsageSuccess,
    v2Plans,
    v2Entitlements,
    v2Subscriptions,
    v2Invoices,
    v2Payments,
    v2PendingPayments,
    v2PaymentLogs,
    v2UsageQuotas,
    v2FeatureUsageLogs,
    v2TrialUsage,
    v2UpgradeEvents
  ] = await Promise.all([
    countRows(supabase, "saas_plans"),
    countRows(supabase, "restaurant_subscriptions"),
    countRows(supabase, "subscription_payment_logs"),
    countRows(supabase, "subscription_payment_logs", (query) => query.eq("status", "waiting_confirm")),
    countRows(supabase, "ai_usage_logs", (query) => query.eq("status", "success")),
    countRows(supabase, "subscription_plans", (query) => query.is("deleted_at", null)),
    countRows(supabase, "plan_entitlements", (query) => query.is("deleted_at", null)),
    countRows(supabase, "subscriptions", (query) => query.is("deleted_at", null)),
    countRows(supabase, "invoices", (query) => query.is("deleted_at", null)),
    countRows(supabase, "payments", (query) => query.is("deleted_at", null)),
    countRows(supabase, "payments", (query) => query.is("deleted_at", null).in("status", ["pending", "detected", "waiting_confirmation"])),
    countRows(supabase, "billing_payment_logs"),
    countRows(supabase, "usage_quotas"),
    countRows(supabase, "feature_usage_logs"),
    countRows(supabase, "trial_usage"),
    countRows(supabase, "upgrade_events")
  ]);

  const [legacySubscriptionRows, v2SubscriptionRows, legacyPaymentRows, v2PaymentRows] = await Promise.all([
    selectRows(supabase, "restaurant_subscriptions", "restaurant_id", (query) => query.limit(5000)),
    selectRows(supabase, "subscriptions", "restaurant_id", (query) => query.is("deleted_at", null).limit(5000)),
    selectRows(supabase, "subscription_payment_logs", "transfer_content", (query) => query.limit(5000)),
    selectRows(supabase, "payments", "transfer_code", (query) => query.is("deleted_at", null).limit(5000))
  ]);

  const missingSubscriptionRestaurants = compareCoverage(
    legacySubscriptionRows.map((row) => row.restaurant_id),
    v2SubscriptionRows.map((row) => row.restaurant_id)
  );
  const missingPaymentTransfers = compareCoverage(
    legacyPaymentRows.map((row) => row.transfer_content),
    v2PaymentRows.map((row) => row.transfer_code)
  );

  const checks = [
    {
      key: "plans",
      label: "Plan catalog",
      status: v2Plans >= 2 && v2Entitlements >= 10 ? "pass" : v2Plans >= 2 ? "warn" : "fail",
      detail: `${v2Plans} plans, ${v2Entitlements} entitlements`
    },
    {
      key: "subscriptions",
      label: "Subscription backfill",
      status: missingSubscriptionRestaurants.length === 0 && v2Subscriptions >= legacySubscriptions ? "pass" : v2Subscriptions > 0 ? "warn" : "fail",
      detail: `${v2Subscriptions}/${legacySubscriptions} rows, ${missingSubscriptionRestaurants.length} restaurants chưa thấy ở v2`
    },
    {
      key: "payments",
      label: "Payment backfill",
      status: missingPaymentTransfers.length === 0 && v2Payments >= legacyPayments ? "pass" : v2Payments > 0 ? "warn" : "fail",
      detail: `${v2Payments}/${legacyPayments} rows, ${missingPaymentTransfers.length} transfer codes chưa mirror`
    },
    {
      key: "pending",
      label: "Pending payment mirror",
      status: legacyPendingPayments === 0 || v2PendingPayments >= legacyPendingPayments ? "pass" : v2PendingPayments > 0 ? "warn" : "fail",
      detail: `${v2PendingPayments}/${legacyPendingPayments} pending payments`
    },
    {
      key: "usage",
      label: "Usage ledger bridge",
      status: legacyAiUsageSuccess === 0 || v2FeatureUsageLogs > 0 ? "pass" : "fail",
      detail: `${legacyAiUsageSuccess} legacy AI successes, ${v2FeatureUsageLogs} feature usage logs, ${v2UsageQuotas} quota snapshots`
    }
  ];

  const summary = {
    verifiedAt: new Date().toISOString(),
    source: v2Subscriptions >= legacySubscriptions && v2Payments >= legacyPayments ? "v2-ready" : "mixed",
    counts: {
      legacy: {
        plans: legacyPlans,
        subscriptions: legacySubscriptions,
        payments: legacyPayments,
        pendingPayments: legacyPendingPayments,
        aiUsageSuccess: legacyAiUsageSuccess
      },
      v2: {
        plans: v2Plans,
        entitlements: v2Entitlements,
        subscriptions: v2Subscriptions,
        invoices: v2Invoices,
        payments: v2Payments,
        pendingPayments: v2PendingPayments,
        paymentLogs: v2PaymentLogs,
        usageQuotas: v2UsageQuotas,
        featureUsageLogs: v2FeatureUsageLogs,
        trialUsage: v2TrialUsage,
        upgradeEvents: v2UpgradeEvents
      }
    },
    missing: {
      subscriptionRestaurants: missingSubscriptionRestaurants.slice(0, 10),
      paymentTransferCodes: missingPaymentTransfers.slice(0, 10)
    },
    checks
  };

  console.log("LogiVN billing v2 verification");
  console.log(JSON.stringify(summary.counts, null, 2));
  console.log("");
  for (const check of checks) {
    console.log(`${statusIcon(check.status)} ${check.label}: ${check.detail}`);
  }
  if (summary.missing.subscriptionRestaurants.length || summary.missing.paymentTransferCodes.length) {
    console.log("");
    console.log("Missing samples:");
    if (summary.missing.subscriptionRestaurants.length) {
      console.log(`- restaurants: ${summary.missing.subscriptionRestaurants.join(", ")}`);
    }
    if (summary.missing.paymentTransferCodes.length) {
      console.log(`- transfers: ${summary.missing.paymentTransferCodes.join(", ")}`);
    }
  }

  const blockingChecks = checks.filter((check) => check.status !== "pass");
  if (blockingChecks.length > 0) {
    console.error("");
    console.error(`billing:verify blocked by ${blockingChecks.length} non-pass check(s).`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`billing:verify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
