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
    .select("id,restaurant_id,invoice_id,status,metadata")
    .is("deleted_at", null)
    .limit(1);

  query = event.transferCode ? query.eq("transfer_code", event.transferCode) : query.eq("provider_reference", event.providerReference);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as BillingWebhookPaymentRow | null;
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

async function writeWebhookLog({
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
    event_type: `webhook_${event.status}`,
    actor_type: "provider",
    actor_id: event.provider,
    request_signature: eventKey,
    payload: event.payload
  });
  if (error && error.code !== "23505") throw error;
}

async function updateV2PaymentFromWebhook(payment: BillingWebhookPaymentRow, event: BillingWebhookEvent) {
  const supabase = createAdminSupabaseClient() as any;
  const nextStatus = resolveBillingWebhookPaymentStatus({
    currentStatus: payment.status,
    webhookStatus: event.status
  });
  const nextConfirmedAt = nextStatus === "confirmed" ? event.occurredAt : undefined;
  const { error: paymentError } = await supabase
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
    .eq("id", payment.id);
  if (paymentError) throw paymentError;

  if (!payment.invoice_id || nextStatus === payment.status) return;
  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({
      status: nextStatus === "confirmed" ? "paid" : mapWebhookInvoiceStatus(event.status),
      paid_at: nextStatus === "confirmed" ? event.occurredAt : undefined,
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.invoice_id);
  if (invoiceError) throw invoiceError;
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

  await updateV2PaymentFromWebhook(payment, event);
  await closeLegacyPaymentFromWebhook(payment, event);
  await writeWebhookLog({ paymentId: payment.id, event, eventKey });

  return {
    duplicate: false,
    paymentId: payment.id,
    status: resolveBillingWebhookPaymentStatus({
      currentStatus: payment.status,
      webhookStatus: event.status
    })
  };
}
