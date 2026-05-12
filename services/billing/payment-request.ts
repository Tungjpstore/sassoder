import "server-only";

import { buildPaymentPolicySummary, isSubscriptionUsable } from "@/lib/billing/subscription-transitions";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { asRecord, vietQrUrl } from "./billing-utils";
import { mirrorLegacyPaymentFinalStateToBillingV2, mirrorLegacyPaymentRequestToBillingV2 } from "./billing-v2-bridge";
import type { PaymentRow, PlanRow } from "./billing-types";
import { getActivePlanByCode, getBillingSettings, getOrCreateSubscription, getRestaurant } from "./subscription-core";

export async function createSubscriptionPaymentRequest({
  restaurantId,
  ownerEmail,
  months = 1,
  planCode
}: {
  restaurantId: string;
  ownerEmail?: string | null;
  months?: number;
  planCode?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const restaurant = await getRestaurant(restaurantId);
  const subscription = await getOrCreateSubscription(restaurantId, ownerEmail);
  const currentPlanResult = await supabase.from("saas_plans").select("*").eq("id", subscription.plan_id).maybeSingle();
  if (currentPlanResult.error) throw currentPlanResult.error;
  if (!currentPlanResult.data) throw new AppError("Không tìm thấy gói hiện tại.", 404);

  const currentPlan = currentPlanResult.data as PlanRow;
  const targetPlan = planCode ? await getActivePlanByCode(planCode) : currentPlan;
  const billing = await getBillingSettings();
  const normalizedMonths = Math.min(24, Math.max(1, Number(months) || 1));
  const amount = targetPlan.monthly_price * normalizedMonths;
  const billingAction =
    targetPlan.id === currentPlan.id
      ? "renew"
      : targetPlan.monthly_price > currentPlan.monthly_price
        ? "upgrade"
        : "downgrade";
  const policy = buildPaymentPolicySummary({
    subscription: {
      ...subscription,
      metadata: asRecord(subscription.metadata)
    },
    currentPlan,
    targetPlan,
    months: normalizedMonths
  });

  if (billingAction === "downgrade" && isSubscriptionUsable(subscription)) {
    throw new AppError(policy.summary, 409);
  }

  const { data: existingPending, error: existingPendingError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("subscription_id", subscription.id)
    .eq("status", "waiting_confirm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPendingError) throw existingPendingError;
  if (existingPending) {
    const pending = existingPending as PaymentRow;
    if (pending.plan_id === targetPlan.id && pending.months === normalizedMonths) {
      return {
        ...pending,
        qrUrl: vietQrUrl({
          bank: billing.bankCode,
          account: billing.bankAccount,
          amount: pending.amount,
          transferContent: pending.transfer_content
        }),
        bank: billing.bankCode,
        account: billing.bankAccount,
        accountName: billing.bankAccountName
      };
    }

    const { error: expireError } = await supabase
      .from("subscription_payment_logs")
      .update({
        status: "expired",
        rejected_at: new Date().toISOString(),
        rejected_reason: "Chủ quán tạo yêu cầu gói/thời hạn mới nên QR cũ tự hết hiệu lực."
      })
      .eq("id", pending.id)
      .eq("status", "waiting_confirm");
    if (expireError) throw expireError;
    await mirrorLegacyPaymentFinalStateToBillingV2(pending.id);
  }

  const transferContent = `${billing.transferPrefix}-${restaurant.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now()
    .toString(36)
    .toUpperCase()}`;

  const { data, error } = await supabase
    .from("subscription_payment_logs")
    .insert({
      restaurant_id: restaurantId,
      subscription_id: subscription.id,
      plan_id: targetPlan.id,
      amount,
      months: normalizedMonths,
      method: "VIETQR",
      status: "waiting_confirm",
      transfer_content: transferContent,
      raw_data: {
        source: "restaurant_dashboard",
        billingAction,
        policyKey: policy.policyKey,
        effectiveAt: policy.effectiveAt,
        effectiveSummary: policy.summary,
        fromPlanCode: currentPlan.code,
        fromPlanName: currentPlan.name,
        planCode: targetPlan.code,
        planName: targetPlan.name
      }
    })
    .select()
    .single();

  if (error) throw error;

  await mirrorLegacyPaymentRequestToBillingV2({
    restaurant,
    subscription,
    currentPlanCode: currentPlan.code,
    targetPlanCode: targetPlan.code,
    amount,
    months: normalizedMonths,
    transferContent,
    billingAction,
    legacyPaymentId: (data as PaymentRow).id
  });

  const subscriptionStillUsable = isSubscriptionUsable(subscription);
  await supabase
    .from("restaurant_subscriptions")
    .update({
      status: subscriptionStillUsable ? subscription.status : "pending_payment",
      updated_at: new Date().toISOString()
    })
    .eq("id", subscription.id);

  return {
    ...(data as PaymentRow),
    qrUrl: vietQrUrl({
      bank: billing.bankCode,
      account: billing.bankAccount,
      amount,
      transferContent
    }),
    bank: billing.bankCode,
    account: billing.bankAccount,
    accountName: billing.bankAccountName
  };
}
