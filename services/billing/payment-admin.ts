import { computeConfirmedSubscriptionTransition } from "@/lib/billing/subscription-transitions";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { asRecord, isMissingSchemaError } from "./billing-utils";
import { mirrorLegacyPaymentFinalStateToBillingV2 } from "./billing-v2-bridge";
import type { PaymentRow, PlanRow, SubscriptionRow } from "./billing-types";

export async function confirmSubscriptionPayment({
  paymentId,
  confirmedBy = "platform-admin",
  invalidateRestaurantEntitlementCache
}: {
  paymentId: string;
  confirmedBy?: string;
  invalidateRestaurantEntitlementCache: (restaurantId?: string) => void;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { data: payment, error: paymentError } = await supabase
    .from("subscription_payment_logs")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment) throw new AppError("Không tìm thấy giao dịch gói.", 404);
  if (payment.status !== "waiting_confirm") throw new AppError("Giao dịch này không còn chờ xác nhận.", 409);

  const paymentRow = payment as PaymentRow;
  const { data: subscription, error: subError } = await supabase
    .from("restaurant_subscriptions")
    .select("*")
    .eq("id", paymentRow.subscription_id)
    .maybeSingle();

  if (subError) throw subError;
  if (!subscription) throw new AppError("Không tìm thấy subscription của giao dịch.", 404);

  const sub = subscription as SubscriptionRow;
  const currentPlanResult = await supabase.from("saas_plans").select("*").eq("id", sub.plan_id).maybeSingle();
  if (currentPlanResult.error) throw currentPlanResult.error;
  if (!currentPlanResult.data) throw new AppError("Không tìm thấy gói hiện tại.", 404);

  const targetPlanId = paymentRow.plan_id ?? sub.plan_id;
  const targetPlanResult = await supabase.from("saas_plans").select("*").eq("id", targetPlanId).maybeSingle();
  if (targetPlanResult.error) throw targetPlanResult.error;
  if (!targetPlanResult.data) throw new AppError("Không tìm thấy gói đích của giao dịch.", 404);

  let transition;
  try {
    transition = computeConfirmedSubscriptionTransition({
      subscription: {
        ...sub,
        metadata: asRecord(sub.metadata)
      },
      payment: paymentRow,
      currentPlan: currentPlanResult.data as PlanRow,
      targetPlan: targetPlanResult.data as PlanRow
    });
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Không thể xác nhận giao dịch gói với trạng thái hiện tại.", 409);
  }

  const { error: applyError } = await supabase.rpc("apply_subscription_payment_confirmation", {
    p_payment_id: paymentRow.id,
    p_confirmed_by: confirmedBy,
    p_next_plan_id: transition.planId,
    p_current_period_start: transition.currentPeriodStart,
    p_current_period_end: transition.currentPeriodEnd,
    p_subscription_metadata: transition.metadata
  });

  if (applyError) {
    const status = applyError.code === "P0002" ? 404 : applyError.code === "P0001" ? 409 : 400;
    throw new AppError(applyError.message || "Không thể áp dụng xác nhận thanh toán gói.", status);
  }

  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    actor: confirmedBy,
    action: "subscription_payment_confirmed_runtime",
    target_type: "subscription_payment",
    target_id: paymentRow.id,
    metadata: {
      restaurantId: paymentRow.restaurant_id,
      subscriptionId: sub.id,
      previousPlanId: sub.plan_id,
      nextPlanId: transition.planId,
      currentPeriodEnd: transition.currentPeriodEnd
    }
  });
  if (auditError && !isMissingSchemaError(auditError)) {
    console.error("[subscription-service] Failed to write subscription confirmation audit log", auditError);
  }
  invalidateRestaurantEntitlementCache(paymentRow.restaurant_id);
  await mirrorLegacyPaymentFinalStateToBillingV2(paymentId);
}

export async function rejectSubscriptionPayment({
  paymentId,
  reason,
  rejectedBy = "platform-admin",
  invalidateRestaurantEntitlementCache
}: {
  paymentId: string;
  reason?: string;
  rejectedBy?: string;
  invalidateRestaurantEntitlementCache: (restaurantId?: string) => void;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("subscription_payment_logs")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_reason: reason || `Từ chối bởi ${rejectedBy}`
    })
    .eq("id", paymentId)
    .eq("status", "waiting_confirm")
    .select("restaurant_id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("Giao dịch này không còn chờ xác minh.", 409);
  invalidateRestaurantEntitlementCache(data.restaurant_id);
  await mirrorLegacyPaymentFinalStateToBillingV2(paymentId);
}
