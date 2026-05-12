import "server-only";

import { buildResolvedEntitlementSnapshot } from "@/lib/billing/entitlements";
import { buildPaymentPolicySummary, isSubscriptionUsable } from "@/lib/billing/subscription-transitions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { asFeatures, asRecord, daysUntil, normalizeBillingPlanCode, vietQrUrl } from "./billing-utils";
import { readBillingV2Bridge } from "./billing-v2-bridge";
import type { PaymentRow } from "./billing-types";
import { readLegacyUsageBridge } from "./legacy-usage-bridge";
import {
  getActivePlans,
  getBillingSettings,
  getDefaultPlan,
  getOrCreateSubscription,
  getRestaurant,
  getSubscriptionAccessEnd,
  repairRequestedOnboardingPlanIfNeeded
} from "./subscription-core";

export async function getRestaurantBillingPortal({
  restaurantId,
  ownerEmail
}: {
  restaurantId: string;
  ownerEmail?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const [restaurant, initialSubscription, plans, billing, v2Billing] = await Promise.all([
    getRestaurant(restaurantId),
    getOrCreateSubscription(restaurantId, ownerEmail),
    getActivePlans(),
    getBillingSettings(),
    readBillingV2Bridge(restaurantId)
  ]);

  let subscription = initialSubscription;
  let currentPlan = plans.find((plan) => plan.id === subscription.plan_id) ?? (await getDefaultPlan());
  const repair = await repairRequestedOnboardingPlanIfNeeded({
    supabase,
    subscription,
    currentPlan
  });
  subscription = repair.subscription;
  currentPlan = repair.plan ?? currentPlan;
  let paymentRequests: Array<PaymentRow & { qrUrl: string }> = [];
  let pendingPayment: (PaymentRow & { qrUrl: string }) | null = null;
  const periodEnd = getSubscriptionAccessEnd(subscription);
  const daysLeft = daysUntil(periodEnd);
  const usable = isSubscriptionUsable(subscription);

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (paymentsError) throw paymentsError;
  paymentRequests = ((paymentRows ?? []) as PaymentRow[]).map((payment) => ({
    ...payment,
    qrUrl: vietQrUrl({
      bank: billing.bankCode,
      account: billing.bankAccount,
      amount: payment.amount,
      transferContent: payment.transfer_content
    })
  }));

  if (paymentRequests.length === 0 && v2Billing?.payments.length) {
    paymentRequests = v2Billing.payments.map((payment) => ({
      id: payment.id,
      restaurant_id: payment.restaurant_id,
      subscription_id: payment.subscription_id,
      plan_id: v2Billing.plan?.id ?? subscription.plan_id,
      amount: payment.amount,
      months: Number((v2Billing.plan?.metadata as Record<string, unknown> | undefined)?.months ?? 1),
      method: "VIETQR",
      status:
        payment.status === "confirmed"
          ? "confirmed"
          : payment.status === "failed" || payment.status === "cancelled" || payment.status === "refunded"
            ? "rejected"
            : payment.status === "expired"
              ? "expired"
              : "waiting_confirm",
      transfer_content: payment.transfer_code,
      raw_data: {
        source: "billing_v2"
      },
      created_at: payment.created_at,
      confirmed_at: payment.confirmed_at,
      confirmed_by: null,
      rejected_at: null,
      rejected_reason: null,
      qrUrl: vietQrUrl({
        bank: billing.bankCode,
        account: billing.bankAccount,
        amount: payment.amount,
        transferContent: payment.transfer_code
      })
    }));
  }

  pendingPayment = paymentRequests.find((payment) => payment.status === "waiting_confirm") ?? null;

  const { usage, trialsUsed } = await readLegacyUsageBridge(restaurantId);
  const resolvedSnapshot = buildResolvedEntitlementSnapshot({
    planCode: normalizeBillingPlanCode(currentPlan.code),
    planName: currentPlan.name,
    daysLeft,
    status: !usable ? "expired" : pendingPayment ? "pending_payment" : "active",
    usage,
    trialsUsed
  });

  const pendingPaymentMeta = asRecord(pendingPayment?.raw_data);
  const pendingPlanFromPayment = pendingPayment?.plan_id ? plans.find((plan) => plan.id === pendingPayment.plan_id) ?? null : null;
  const pendingTargetPlanCode = typeof pendingPaymentMeta.planCode === "string" ? pendingPaymentMeta.planCode : null;
  const pendingTargetPlan = (pendingTargetPlanCode ? plans.find((plan) => plan.code === pendingTargetPlanCode) : null) ?? pendingPlanFromPayment ?? currentPlan;
  const pendingPolicy = pendingPayment
    ? buildPaymentPolicySummary({
        subscription: {
          ...subscription,
          metadata: asRecord(subscription.metadata)
        },
        currentPlan,
        targetPlan: pendingTargetPlan,
        months: pendingPayment.months
      })
    : null;

  return {
    restaurant,
    plans,
    billing,
    subscription,
    currentPlan: {
      ...currentPlan,
      features: asFeatures(currentPlan.features)
    },
    paymentRequests,
    pendingPayment,
    pendingChange:
      pendingPayment && pendingPolicy
        ? {
            action: pendingPolicy.billingAction,
            targetPlanCode: pendingTargetPlan.code,
            targetPlanName: pendingTargetPlan.name,
            effectiveAt: pendingPolicy.effectiveAt,
            policyKey: pendingPolicy.policyKey,
            summary: pendingPolicy.summary,
            isImmediate: pendingPolicy.isImmediate
          }
        : null,
    daysLeft,
    usable,
    hasPendingPayment: Boolean(pendingPayment),
    needsPayment: !usable,
    resolvedSnapshot
  };
}
