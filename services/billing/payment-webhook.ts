import "server-only";

import { AppError } from "@/lib/response";
import {
  getBillingWebhookEventKey,
  normalizeBillingWebhookEvent,
  resolveBillingWebhookPaymentStatus,
  verifyBillingWebhookSignature,
  type BillingWebhookEvent,
  type BillingWebhookPaymentStatus,
  type BillingWebhookStatus
} from "@/lib/billing/webhook-events";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { asRecord } from "./billing-utils";
import { confirmSubscriptionPayment } from "./payment-admin";
import { invalidateRestaurantEntitlementCache } from "../subscription-service";

type BillingWebhookPaymentRow = {
  id: string;
  restaurant_id: string;
  invoice_id: string | null;
  amount: number;
  currency: string;
  status: BillingWebhookPaymentStatus;
  metadata: unknown;
};

function mapWebhookInvoiceStatus(status: BillingWebhookStatus) {
  if (status === "confirmed") return "paid";
  if (status === "failed" || status === "expired" || status === "cancelled") return "failed";
  return "pending";
}

async function readPaymentForWebhook(event: BillingWebhookEvent) {
  const supabase = createAdminSupabaseClient() as any;
  let query = supabase
    .from("payments")
    .select("id,restaurant_id,invoice_id,amount,currency,status,metadata")
    .is("deleted_at", null)
    .limit(1);

  query = event.transferCode ? query.eq("transfer_code", event.transferCode) : query.eq("provider_reference", event.providerReference);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as BillingWebhookPaymentRow | null;
}

function assertConfirmedWebhookAmountMatchesPayment(payment: BillingWebhookPaymentRow, event: BillingWebhookEvent) {
  if (event.status !== "confirmed") return;
  if (event.amount === null || event.amount !== payment.amount) {
    throw new AppError("Billing webhook amount does not match the expected payment amount.", 422);
  }
  if (event.currency && event.currency !== payment.currency.toUpperCase()) {
    throw new AppError("Billing webhook currency does not match the expected payment currency.", 422);
  }
}

async function hasProcessedWebhook(paymentId: string, eventKey: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("billing_payment_logs")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("request_signature", eventKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function claimWebhookLog({
  paymentId,
  event,
  eventKey
}: {
  paymentId: string;
  event: BillingWebhookEvent;
  eventKey: string;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("billing_payment_logs").insert({
    payment_id: paymentId,
    event_type: `webhook_${event.status}_claimed`,
    actor_type: "provider",
    actor_id: event.provider,
    request_signature: eventKey,
    payload: event.payload
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function finalizeWebhookLog({
  paymentId,
  eventKey,
  status
}: {
  paymentId: string;
  eventKey: string;
  status: BillingWebhookStatus;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("billing_payment_logs")
    .update({ event_type: `webhook_${status}` })
    .eq("payment_id", paymentId)
    .eq("request_signature", eventKey);
  if (error) throw error;
}

async function releaseWebhookClaim(paymentId: string, eventKey: string) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("billing_payment_logs")
    .delete()
    .eq("payment_id", paymentId)
    .eq("request_signature", eventKey)
    .like("event_type", "%_claimed");
  if (error) throw error;
}

async function updateV2PaymentFromWebhook(payment: BillingWebhookPaymentRow, event: BillingWebhookEvent) {
  const supabase = createAdminSupabaseClient() as any;
  const nextStatus = resolveBillingWebhookPaymentStatus({
    currentStatus: payment.status,
    webhookStatus: event.status
  });

  if (nextStatus === payment.status) return nextStatus;

  const nextConfirmedAt = nextStatus === "confirmed" ? event.occurredAt : undefined;
  const { data: updatedPayments, error: paymentError } = await supabase
    .from("payments")
    .update({
      status: nextStatus,
      provider_reference: event.providerReference ?? undefined,
      detected_at: event.status === "detected" || event.status === "confirmed" ? event.occurredAt : undefined,
      confirmed_at: nextConfirmedAt,
      metadata: {
        ...asRecord(payment.metadata),
        lastWebhookProvider: event.provider,
        lastWebhookStatus: event.status,
        lastWebhookAt: event.occurredAt
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.id)
    .eq("status", payment.status)
    .select("id,status");
  if (paymentError) throw paymentError;
  if ((updatedPayments ?? []).length === 0) {
    const { data: currentPayment, error: currentError } = await supabase
      .from("payments")
      .select("id,restaurant_id,invoice_id,amount,currency,status,metadata")
      .eq("id", payment.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentPayment) throw new AppError("Billing payment was not found while applying webhook.", 404);
    return updateV2PaymentFromWebhook(currentPayment as BillingWebhookPaymentRow, event);
  }

  if (!payment.invoice_id) return nextStatus;
  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({
      status: nextStatus === "confirmed" ? "paid" : mapWebhookInvoiceStatus(event.status),
      paid_at: nextStatus === "confirmed" ? event.occurredAt : undefined,
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.invoice_id);
  if (invoiceError) throw invoiceError;
  return nextStatus;
}

async function closeLegacyPaymentFromWebhook(payment: BillingWebhookPaymentRow, event: BillingWebhookEvent) {
  const legacyPaymentId = asRecord(payment.metadata).legacyPaymentId;
  if (typeof legacyPaymentId !== "string") return;

  const supabase = createAdminSupabaseClient() as any;
  if (event.status === "confirmed") {
    const { data } = await supabase.from("subscription_payment_logs").select("status").eq("id", legacyPaymentId).maybeSingle();
    if (data?.status === "waiting_confirm") {
      await confirmSubscriptionPayment({
        paymentId: legacyPaymentId,
        confirmedBy: `webhook:${event.provider}`,
        invalidateRestaurantEntitlementCache
      });
    }
    return;
  }

  if (event.status !== "failed" && event.status !== "expired" && event.status !== "cancelled") return;
  const { error } = await supabase
    .from("subscription_payment_logs")
    .update({
      status: event.status === "expired" ? "expired" : "rejected",
      rejected_at: event.occurredAt,
      rejected_reason: `Provider webhook marked payment ${event.status}.`
    })
    .eq("id", legacyPaymentId)
    .eq("status", "waiting_confirm");
  if (error) throw error;
}

export async function applyBillingPaymentWebhook({
  rawBody,
  signatureHeader,
  secret
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret?: string | null;
}) {
  if (!secret) throw new AppError("Billing webhook secret is not configured.", 500);
  if (!verifyBillingWebhookSignature(rawBody, signatureHeader, secret)) {
    throw new AppError("Invalid billing webhook signature.", 401);
  }

  const event = normalizeBillingWebhookEvent(JSON.parse(rawBody) as unknown);
  const payment = await readPaymentForWebhook(event);
  if (!payment) throw new AppError("Billing payment was not found for webhook.", 404);

  const eventKey = getBillingWebhookEventKey(event, signatureHeader);
  if (await hasProcessedWebhook(payment.id, eventKey)) {
    return { duplicate: true, paymentId: payment.id, status: payment.status };
  }
  assertConfirmedWebhookAmountMatchesPayment(payment, event);

  const claimed = await claimWebhookLog({ paymentId: payment.id, event, eventKey });
  if (!claimed) return { duplicate: true, paymentId: payment.id, status: payment.status };

  try {
    const nextStatus = await updateV2PaymentFromWebhook(payment, event);
    await closeLegacyPaymentFromWebhook(payment, event);
    await finalizeWebhookLog({ paymentId: payment.id, eventKey, status: event.status });
    return {
      duplicate: false,
      paymentId: payment.id,
      status: nextStatus
    };
  } catch (error) {
    await releaseWebhookClaim(payment.id, eventKey);
    throw error;
  }
}
