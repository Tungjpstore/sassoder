import type { BillingPlanCode } from "@/lib/billing/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { firstOrNull, isMissingSchemaError, monthEndIso, normalizeBillingPlanCode } from "./billing-utils";
import type { BillingV2PaymentRow, BillingV2SubscriptionRow, PaymentRow, RestaurantRow, SubscriptionRow } from "./billing-types";

export async function readBillingV2Bridge(restaurantId: string) {
  const supabase = createAdminSupabaseClient() as any;
  const [subscriptionResult, paymentResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,restaurant_id,plan_id,status,current_period_start,current_period_end,trial_started_at,trial_ends_at,plan:subscription_plans(id,code,name,description,monthly_price,metadata)")
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id,restaurant_id,subscription_id,invoice_id,amount,currency,status,transfer_code,created_at,confirmed_at,deleted_at")
      .eq("restaurant_id", restaurantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  if (subscriptionResult.error) {
    if (isMissingSchemaError(subscriptionResult.error)) return null;
    throw subscriptionResult.error;
  }
  if (paymentResult.error) {
    if (isMissingSchemaError(paymentResult.error)) return null;
    throw paymentResult.error;
  }

  const subscription = subscriptionResult.data as BillingV2SubscriptionRow | null;
  const payments = (paymentResult.data ?? []) as BillingV2PaymentRow[];
  if (!subscription && payments.length === 0) return null;

  return {
    subscription,
    plan: firstOrNull(subscription?.plan),
    payments
  };
}

function mapLegacySubscriptionStatusToBillingStatus(status: SubscriptionRow["status"]): "trialing" | "active" | "grace" | "pending_payment" | "cancelled" | "expired" | "suspended" {
  if (status === "trialing" || status === "active" || status === "pending_payment" || status === "cancelled" || status === "expired" || status === "suspended") {
    return status;
  }

  return status === "past_due" ? "grace" : "active";
}

export async function mirrorLegacySubscriptionToBillingV2({
  subscription,
  planCode
}: {
  subscription: SubscriptionRow;
  planCode: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  try {
    const { data: v2Plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id,code")
      .eq("code", normalizeBillingPlanCode(planCode))
      .is("deleted_at", null)
      .maybeSingle();
    if (planError) {
      if (isMissingSchemaError(planError)) return;
      throw planError;
    }
    if (!v2Plan?.id) return;

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id,metadata")
      .eq("restaurant_id", subscription.restaurant_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    const metadata = {
      ...((existingSubscription?.metadata && typeof existingSubscription.metadata === "object" && !Array.isArray(existingSubscription.metadata)
        ? existingSubscription.metadata
        : {}) as Record<string, unknown>),
      source: "legacy_bridge",
      legacySubscriptionId: subscription.id,
      legacyPlanId: subscription.plan_id
    };

    const payload = {
      plan_id: v2Plan.id,
      status: mapLegacySubscriptionStatusToBillingStatus(subscription.status),
      interval: "month",
      started_at: subscription.created_at,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_started_at: subscription.trial_started_at,
      trial_ends_at: subscription.trial_ends_at,
      metadata,
      updated_at: new Date().toISOString()
    };

    if (existingSubscription?.id) {
      const { error: updateError } = await supabase.from("subscriptions").update(payload).eq("id", existingSubscription.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase.from("subscriptions").insert({
      restaurant_id: subscription.restaurant_id,
      ...payload
    });
    if (insertError) throw insertError;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[subscription-service] Failed to mirror legacy subscription to billing v2", error);
      return;
    }
    throw error;
  }
}

export async function mirrorLegacyPaymentRequestToBillingV2({
  restaurant,
  subscription,
  currentPlanCode,
  targetPlanCode,
  amount,
  months,
  transferContent,
  billingAction,
  legacyPaymentId
}: {
  restaurant: RestaurantRow;
  subscription: SubscriptionRow;
  currentPlanCode: string;
  targetPlanCode: string;
  amount: number;
  months: number;
  transferContent: string;
  billingAction: "renew" | "upgrade" | "downgrade";
  legacyPaymentId: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  try {
    const { data: v2Plans, error: planError } = await supabase
      .from("subscription_plans")
      .select("id,code")
      .in("code", [normalizeBillingPlanCode(currentPlanCode), normalizeBillingPlanCode(targetPlanCode)]);
    if (planError) {
      if (isMissingSchemaError(planError)) return;
      throw planError;
    }

    const planByCode = new Map(((v2Plans ?? []) as Array<{ id: string; code: BillingPlanCode }>).map((plan) => [plan.code, plan.id]));
    const currentV2PlanId = planByCode.get(normalizeBillingPlanCode(currentPlanCode));
    const targetV2PlanId = planByCode.get(normalizeBillingPlanCode(targetPlanCode));
    if (!targetV2PlanId) return;

    const { data: existingSubscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    let v2SubscriptionId = existingSubscription?.id ?? null;
    if (!v2SubscriptionId) {
      const { data: createdSubscription, error: createSubscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          restaurant_id: restaurant.id,
          plan_id: currentV2PlanId ?? targetV2PlanId,
          status: mapLegacySubscriptionStatusToBillingStatus(subscription.status),
          interval: "month",
          started_at: subscription.created_at,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          trial_started_at: subscription.trial_started_at,
          trial_ends_at: subscription.trial_ends_at,
          metadata: {
            source: "legacy_bridge",
            legacySubscriptionId: subscription.id
          }
        })
        .select("id")
        .single();
      if (createSubscriptionError) throw createSubscriptionError;
      v2SubscriptionId = createdSubscription.id;
    }

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id")
      .eq("transfer_code", transferContent)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingPaymentError) throw existingPaymentError;
    if (existingPayment?.id) return;

    const invoiceNumber = `LGV-${restaurant.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-${transferContent
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(-14)}`;
    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from("invoices")
      .select("id")
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();
    if (existingInvoiceError) throw existingInvoiceError;

    let invoice = existingInvoice;
    if (!invoice?.id) {
      const { data: createdInvoice, error: invoiceError } = await supabase.from("invoices").insert({
        restaurant_id: restaurant.id,
        subscription_id: v2SubscriptionId,
        plan_id: targetV2PlanId,
        invoice_number: invoiceNumber,
        billing_reason: billingAction,
        status: "pending",
        subtotal: amount,
        total: amount,
        currency: "VND",
        issued_at: new Date().toISOString(),
        due_at: new Date().toISOString(),
        metadata: {
          source: "legacy_bridge",
          months,
          legacySubscriptionId: subscription.id,
          legacyPaymentId
        }
      })
      .select("id")
      .single();
      if (invoiceError) throw invoiceError;
      invoice = createdInvoice;
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        restaurant_id: restaurant.id,
        subscription_id: v2SubscriptionId,
        invoice_id: invoice.id,
        provider: "vietqr",
        amount,
        currency: "VND",
        status: "waiting_confirmation",
        transfer_code: transferContent,
        expires_at: monthEndIso(),
        metadata: {
          source: "legacy_bridge",
          billingAction,
          months,
          legacySubscriptionId: subscription.id,
          legacyPaymentId
        }
      })
      .select("id")
      .single();
    if (paymentError) throw paymentError;

    await supabase.from("billing_payment_logs").insert({
      payment_id: payment.id,
      event_type: "payment_requested",
      actor_type: "system",
      payload: {
        source: "legacy_bridge",
        legacyPaymentId,
        billingAction
      }
    });

    await supabase
      .from("subscriptions")
      .update({
        latest_invoice_id: invoice.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2SubscriptionId);

    await supabase.from("upgrade_events").insert({
      restaurant_id: restaurant.id,
      from_plan_id: currentV2PlanId ?? null,
      to_plan_id: targetV2PlanId,
      trigger: billingAction,
      source: "restaurant_dashboard",
      context: {
        source: "legacy_bridge",
        months,
        transferContent,
        legacyPaymentId
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[subscription-service] Failed to mirror legacy payment request to billing v2", error);
      return;
    }
    throw error;
  }
}

export async function mirrorLegacyPaymentFinalStateToBillingV2(paymentId: string) {
  const supabase = createAdminSupabaseClient() as any;
  try {
    const { data: payment, error: legacyPaymentError } = await supabase
      .from("subscription_payment_logs")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (legacyPaymentError) {
      if (isMissingSchemaError(legacyPaymentError)) return;
      throw legacyPaymentError;
    }
    if (!payment) return;

    const legacyPayment = payment as PaymentRow;
    const { data: legacySubscription, error: legacySubscriptionError } = await supabase
      .from("restaurant_subscriptions")
      .select("*,plan:saas_plans(code,name)")
      .eq("id", legacyPayment.subscription_id)
      .maybeSingle();
    if (legacySubscriptionError) throw legacySubscriptionError;
    if (!legacySubscription) return;

    const nextPlanCode =
      firstOrNull((legacySubscription as { plan?: { code: string } | Array<{ code: string }> | null }).plan)?.code ?? "pro";
    const { data: v2Subscription, error: v2SubscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("restaurant_id", legacyPayment.restaurant_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (v2SubscriptionError) throw v2SubscriptionError;
    if (!v2Subscription?.id) return;

    const { data: v2Plan, error: v2PlanError } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("code", normalizeBillingPlanCode(nextPlanCode))
      .maybeSingle();
    if (v2PlanError) throw v2PlanError;

    const { data: v2Payment, error: v2PaymentError } = await supabase
      .from("payments")
      .select("id,invoice_id")
      .eq("transfer_code", legacyPayment.transfer_content)
      .maybeSingle();
    if (v2PaymentError) throw v2PaymentError;
    if (!v2Payment?.id) return;

    const paymentStatus =
      legacyPayment.status === "confirmed"
        ? "confirmed"
        : legacyPayment.status === "rejected"
          ? "failed"
          : legacyPayment.status === "expired"
            ? "expired"
            : "waiting_confirmation";

    await supabase
      .from("payments")
      .update({
        status: paymentStatus,
        confirmed_at: legacyPayment.confirmed_at,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2Payment.id);

    await supabase.from("billing_payment_logs").insert({
      payment_id: v2Payment.id,
      event_type: paymentStatus === "confirmed" ? "payment_confirmed" : "payment_closed",
      actor_type: "system",
      payload: {
        source: "legacy_bridge",
        legacyPaymentId: legacyPayment.id,
        status: legacyPayment.status
      }
    });

    if (v2Payment.invoice_id) {
      await supabase
        .from("invoices")
        .update({
          status: paymentStatus === "confirmed" ? "paid" : paymentStatus === "expired" ? "failed" : "failed",
          paid_at: legacyPayment.confirmed_at,
          updated_at: new Date().toISOString()
        })
        .eq("id", v2Payment.invoice_id);
    }

    await supabase
      .from("subscriptions")
      .update({
        plan_id: v2Plan?.id ?? undefined,
        status: paymentStatus === "confirmed" ? "active" : undefined,
        current_period_start: (legacySubscription as SubscriptionRow).current_period_start,
        current_period_end: (legacySubscription as SubscriptionRow).current_period_end,
        updated_at: new Date().toISOString()
      })
      .eq("id", v2Subscription.id);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[subscription-service] Failed to mirror legacy payment final state to billing v2", error);
      return;
    }
    throw error;
  }
}
