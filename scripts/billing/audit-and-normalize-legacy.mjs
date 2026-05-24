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
    if (!(key in process.env)) values[key] = value;
  }
  return values;
}

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const fullPath = path.join(process.cwd(), filename);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
    }
  }
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePlanCode(value) {
  return value === "premium" ? "premium" : "pro";
}

function getWindowEnd(subscription) {
  return subscription.current_period_end || subscription.trial_ends_at || null;
}

function isUsable(subscription, now = new Date()) {
  const accessEnd = getWindowEnd(subscription);
  const hasWindow = accessEnd ? new Date(accessEnd).getTime() >= now.getTime() : true;
  if (subscription.status === "active" || subscription.status === "trialing") return hasWindow;
  if (subscription.status === "pending_payment") return Boolean(accessEnd && hasWindow);
  return false;
}

function getBillingAction(currentPlan, targetPlan) {
  if (targetPlan.id === currentPlan.id) return "renew";
  return Number(targetPlan.monthly_price ?? 0) > Number(currentPlan.monthly_price ?? 0) ? "upgrade" : "downgrade";
}

function buildPolicySummary({ subscription, currentPlan, targetPlan, now = new Date() }) {
  const billingAction = getBillingAction(currentPlan, targetPlan);
  const usableNow = isUsable(subscription, now);
  const windowEnd = getWindowEnd(subscription);

  if (billingAction === "renew") {
    return {
      billingAction,
      policyKey: "renew_extend_window",
      effectiveAt: windowEnd,
      summary: "Gia hạn sẽ nối tiếp ngay sau kỳ hiện tại, không làm mất số ngày còn lại.",
      isImmediate: false
    };
  }

  if (!usableNow) {
    return {
      billingAction,
      policyKey: "switch_immediate_expired",
      effectiveAt: now.toISOString(),
      summary: `Gói ${targetPlan.name} sẽ mở ngay sau khi LogiVN xác minh thanh toán.`,
      isImmediate: true
    };
  }

  if (billingAction === "upgrade") {
    if (subscription.status === "trialing") {
      return {
        billingAction,
        policyKey: "upgrade_from_trial",
        effectiveAt: now.toISOString(),
        summary: `Nâng cấp từ trial sẽ mở ${targetPlan.name} ngay sau xác minh và bắt đầu chu kỳ trả phí mới.`,
        isImmediate: true
      };
    }

    return {
      billingAction,
      policyKey: "upgrade_immediate_credit",
      effectiveAt: now.toISOString(),
      summary: `Nâng cấp sẽ mở ${targetPlan.name} ngay sau xác minh. Phần giá trị còn lại của gói cũ được quy đổi sang số ngày tương ứng của gói mới.`,
      isImmediate: true
    };
  }

  return {
    billingAction,
    policyKey: "downgrade_requires_end_of_cycle",
    effectiveAt: windowEnd,
    summary: "Chuyển xuống gói thấp hơn chỉ nên áp dụng khi kỳ hiện tại kết thúc để tránh mất quyền đang còn hiệu lực.",
    isImmediate: false
  };
}

function formatSupabaseError(error) {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}

async function syncLegacySubscriptionToBillingV2({
  supabase,
  subscription,
  v2Plan,
  metadata
}) {
  if (!v2Plan?.id) return;

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("id,metadata")
    .eq("restaurant_id", subscription.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    plan_id: v2Plan.id,
    status: subscription.status === "past_due" ? "grace" : subscription.status,
    interval: "month",
    started_at: subscription.current_period_start ?? subscription.created_at ?? new Date().toISOString(),
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    trial_started_at: subscription.trial_started_at ?? subscription.current_period_start,
    trial_ends_at: subscription.trial_ends_at,
    deleted_at: null,
    metadata: {
      ...asRecord(existing?.metadata),
      source: "legacy_audit_normalize",
      legacySubscriptionId: subscription.id,
      legacyPlanId: subscription.plan_id,
      ...metadata
    },
    updated_at: new Date().toISOString()
  };

  if (existing?.id) {
    const { error } = await supabase.from("subscriptions").update(payload).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("subscriptions").insert({
    restaurant_id: subscription.restaurant_id,
    ...payload,
    created_at: subscription.created_at ?? new Date().toISOString()
  });
  if (error) throw error;
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  }

  const apply = process.env.APPLY_CHANGES === "true";
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const [
    { data: plans, error: plansError },
    { data: v2Plans, error: v2PlansError },
    { data: subscriptions, error: subscriptionsError },
    { data: pendingPayments, error: paymentsError },
    { data: v2Payments, error: v2PaymentsError },
    { data: v2Subscriptions, error: v2SubscriptionsError }
  ] =
    await Promise.all([
      supabase.from("saas_plans").select("id,code,name,monthly_price"),
      supabase.from("subscription_plans").select("id,code,name,monthly_price").is("deleted_at", null),
      supabase
        .from("restaurant_subscriptions")
        .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_started_at,trial_ends_at,created_at,metadata,plan:saas_plans(code,name,monthly_price)")
        .in("status", ["trialing", "pending_payment", "active", "past_due", "expired"])
        .limit(5000),
      supabase
        .from("subscription_payment_logs")
        .select("id,restaurant_id,subscription_id,plan_id,months,status,transfer_content,raw_data,created_at")
        .eq("status", "waiting_confirm")
        .limit(5000),
      supabase.from("payments").select("id,transfer_code,metadata").is("deleted_at", null).limit(5000),
      supabase.from("subscriptions").select("id,restaurant_id,metadata").is("deleted_at", null).limit(5000)
    ]);

  if (plansError) throw plansError;
  if (v2PlansError && v2PlansError.code !== "42P01") throw v2PlansError;
  if (subscriptionsError) throw subscriptionsError;
  if (paymentsError) throw paymentsError;
  if (v2PaymentsError && v2PaymentsError.code !== "42P01") throw v2PaymentsError;
  if (v2SubscriptionsError && v2SubscriptionsError.code !== "42P01") throw v2SubscriptionsError;

  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));
  const subscriptionById = new Map((subscriptions ?? []).map((subscription) => [subscription.id, subscription]));
  const v2PaymentByTransferCode = new Map((v2Payments ?? []).map((payment) => [payment.transfer_code, payment]));
  const v2SubscriptionByRestaurantId = new Map((v2Subscriptions ?? []).map((subscription) => [subscription.restaurant_id, subscription]));
  const proPlan = (plans ?? []).find((plan) => plan.code === "pro");
  const v2PlanByCode = new Map((v2Plans ?? []).map((plan) => [plan.code, plan]));
  const v2ProPlan = (v2Plans ?? []).find((plan) => plan.code === "pro");

  const issues = [];
  const patchActions = [];

  for (const subscription of subscriptions ?? []) {
    const plan = Array.isArray(subscription.plan) ? subscription.plan[0] : subscription.plan;
    const metadata = asRecord(subscription.metadata);
    const requestedPlanCode = normalizePlanCode(metadata.requestedPlanCode);
    const hasV2Subscription = v2SubscriptionByRestaurantId.has(subscription.restaurant_id);

    if (subscription.status === "trialing" && plan?.code === "premium") {
      issues.push({
        type: "premium_trial_subscription",
        subscriptionId: subscription.id,
        restaurantId: subscription.restaurant_id,
        detail: "Trial đang gắn trực tiếp với Premium."
      });

      if (apply && proPlan) {
        patchActions.push(
          supabase
            .from("restaurant_subscriptions")
            .update({
              plan_id: proPlan.id,
              metadata: {
                ...metadata,
                requestedPlanCode: "premium",
                normalizedBy: "billing_audit_script",
                normalizedAt: new Date().toISOString(),
                normalizedReason: "premium_trial_subscription"
              },
              updated_at: new Date().toISOString()
            })
            .eq("id", subscription.id)
        );
        patchActions.push(
          supabase.from("platform_audit_logs").insert({
            actor: "billing-audit-script",
            action: "billing_anomaly_normalized",
            target_type: "restaurant_subscription",
            target_id: subscription.id,
            metadata: {
              type: "premium_trial_subscription",
              restaurantId: subscription.restaurant_id,
              fromPlanCode: "premium",
              toPlanCode: "pro"
            }
          })
        );

        if (hasV2Subscription) {
          patchActions.push(
            syncLegacySubscriptionToBillingV2({
              supabase,
              subscription,
              v2Plan: v2ProPlan,
              metadata: {
                requestedPlanCode: "premium",
                normalizedBy: "billing_audit_script",
                normalizedAt: new Date().toISOString(),
                normalizedReason: "premium_trial_subscription"
              }
            })
          );
        }
      }
    }

    if (!hasV2Subscription) {
      issues.push({
        type: "missing_v2_subscription",
        subscriptionId: subscription.id,
        restaurantId: subscription.restaurant_id,
        detail: "Legacy subscription chưa có subscription tương ứng ở billing v2."
      });

      if (apply) {
        const targetV2Plan =
          subscription.status === "trialing" && plan?.code === "premium"
            ? v2ProPlan
            : v2PlanByCode.get(normalizePlanCode(plan?.code));
        patchActions.push(
          syncLegacySubscriptionToBillingV2({
            supabase,
            subscription,
            v2Plan: targetV2Plan,
            metadata: {
              requestedPlanCode,
              normalizedBy: "billing_audit_script",
              normalizedAt: new Date().toISOString(),
              normalizedReason: "missing_v2_subscription"
            }
          })
        );
      }
    }

    if (subscription.status === "pending_payment") {
      const hasPending = (pendingPayments ?? []).some((payment) => payment.subscription_id === subscription.id);
      const accessEnd = subscription.current_period_end || subscription.trial_ends_at;
      const stillUsable = accessEnd ? new Date(accessEnd).getTime() >= Date.now() : false;
      if (!hasPending) {
        issues.push({
          type: "pending_without_payment",
          subscriptionId: subscription.id,
          restaurantId: subscription.restaurant_id,
          detail: "Subscription ở pending_payment nhưng không còn QR chờ xác minh."
        });
      }
      if (stillUsable && !hasPending) {
        issues.push({
          type: "usable_pending_without_payment",
          subscriptionId: subscription.id,
          restaurantId: subscription.restaurant_id,
          detail: "Subscription vẫn còn hạn nhưng bị treo pending_payment mà không có payment chờ."
        });

        if (apply) {
          patchActions.push(
            supabase
              .from("restaurant_subscriptions")
              .update({
                status: "active",
                updated_at: new Date().toISOString()
              })
              .eq("id", subscription.id)
          );
        }
      }
    }
  }

  for (const payment of pendingPayments ?? []) {
    const rawData = asRecord(payment.raw_data);
    const targetPlan = planById.get(payment.plan_id);
    const subscription = subscriptionById.get(payment.subscription_id);
    const currentPlan = subscription ? planById.get(subscription.plan_id) : null;

    if (!rawData.billingAction || !rawData.planCode || !rawData.effectiveSummary) {
      issues.push({
        type: "pending_payment_missing_policy",
        paymentId: payment.id,
        restaurantId: payment.restaurant_id,
        detail: "Payment chờ xác minh thiếu metadata policy của logic mới."
      });

      if (apply && targetPlan && subscription && currentPlan) {
        const policy = buildPolicySummary({ subscription, currentPlan, targetPlan });
        const nextRawData = {
          ...rawData,
          billingAction: policy.billingAction,
          policyKey: policy.policyKey,
          effectiveAt: policy.effectiveAt,
          effectiveSummary: policy.summary,
          fromPlanCode: currentPlan.code,
          fromPlanName: currentPlan.name,
          planCode: targetPlan.code,
          planName: targetPlan.name,
          normalizedBy: "billing_audit_script",
          normalizedAt: new Date().toISOString()
        };

        patchActions.push(
          supabase
            .from("subscription_payment_logs")
            .update({ raw_data: nextRawData })
            .eq("id", payment.id)
            .eq("status", "waiting_confirm")
        );
        patchActions.push(
          supabase.from("platform_audit_logs").insert({
            actor: "billing-audit-script",
            action: "billing_anomaly_normalized",
            target_type: "subscription_payment",
            target_id: payment.id,
            metadata: {
              type: "pending_payment_missing_policy",
              restaurantId: payment.restaurant_id,
              billingAction: policy.billingAction,
              policyKey: policy.policyKey
            }
          })
        );

        const v2Payment = v2PaymentByTransferCode.get(payment.transfer_content);
        if (v2Payment?.id) {
          patchActions.push(
            supabase
              .from("payments")
              .update({
                metadata: {
                  ...asRecord(v2Payment.metadata),
                  billingAction: policy.billingAction,
                  policyKey: policy.policyKey,
                  effectiveAt: policy.effectiveAt,
                  effectiveSummary: policy.summary,
                  fromPlanCode: currentPlan.code,
                  fromPlanName: currentPlan.name,
                  planCode: targetPlan.code,
                  planName: targetPlan.name,
                  normalizedBy: "billing_audit_script",
                  normalizedAt: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
              })
              .eq("id", v2Payment.id)
          );
        }
      }
    }

    if (!targetPlan) {
      issues.push({
        type: "pending_payment_missing_target_plan",
        paymentId: payment.id,
        restaurantId: payment.restaurant_id,
        detail: "Payment chờ xác minh không map được plan đích."
      });
    }
  }

  if (apply && patchActions.length) {
    const results = await Promise.all(patchActions);
    for (const result of results) {
      if (result?.error) throw result.error;
    }
  }

  console.log("LogiVN billing legacy audit");
  console.log(`mode=${apply ? "apply" : "dry-run"} issues=${issues.length}`);
  console.log(JSON.stringify(issues.slice(0, 80), null, 2));
}

main().catch((error) => {
  console.error(`billing:audit failed: ${formatSupabaseError(error)}`);
  process.exitCode = 1;
});
