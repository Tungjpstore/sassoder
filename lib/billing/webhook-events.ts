import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingWebhookStatus = "detected" | "confirmed" | "failed" | "expired" | "cancelled";

export type BillingWebhookPaymentStatus =
  | "pending"
  | "detected"
  | "waiting_confirmation"
  | "confirmed"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export type BillingWebhookEvent = {
  eventId: string | null;
  provider: string;
  providerReference: string | null;
  transferCode: string | null;
  status: BillingWebhookStatus;
  amount: number | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};

const allowedStatuses = new Set<BillingWebhookStatus>(["detected", "confirmed", "failed", "expired", "cancelled"]);
const immutablePaymentStatuses = new Set<BillingWebhookPaymentStatus>(["confirmed", "refunded"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStatus(value: unknown): BillingWebhookStatus {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized || !allowedStatuses.has(normalized as BillingWebhookStatus)) {
    throw new Error("Unsupported billing webhook status.");
  }
  return normalized as BillingWebhookStatus;
}

export function normalizeBillingWebhookEvent(payload: unknown): BillingWebhookEvent {
  const record = asRecord(payload);
  const provider = optionalString(record.provider) ?? "manual";
  const providerReference = optionalString(record.providerReference ?? record.provider_reference);
  const transferCode = optionalString(record.transferCode ?? record.transfer_code);
  if (!providerReference && !transferCode) {
    throw new Error("Billing webhook requires providerReference or transferCode.");
  }

  const amount = Number(record.amount);
  const occurredAt = optionalString(record.occurredAt ?? record.occurred_at) ?? new Date().toISOString();
  return {
    eventId: optionalString(record.eventId ?? record.event_id ?? record.id),
    provider,
    providerReference,
    transferCode,
    status: normalizeStatus(record.status),
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    occurredAt,
    payload: record
  };
}

export function createBillingWebhookSignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyBillingWebhookSignature(rawBody: string, headerValue: string | null, secret: string) {
  const received = optionalString(headerValue)?.replace(/^sha256=/i, "") ?? "";
  const expected = createBillingWebhookSignature(rawBody, secret);
  const left = Buffer.from(received, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getBillingWebhookEventKey(event: BillingWebhookEvent, signatureHeader: string | null) {
  return event.eventId ?? event.providerReference ?? event.transferCode ?? optionalString(signatureHeader) ?? createBillingWebhookSignature(JSON.stringify(event.payload), event.provider);
}

export function mapBillingWebhookPaymentStatus(status: BillingWebhookStatus): BillingWebhookPaymentStatus {
  if (status === "confirmed") return "confirmed";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  if (status === "cancelled") return "cancelled";
  return "detected";
}

export function resolveBillingWebhookPaymentStatus({
  currentStatus,
  webhookStatus
}: {
  currentStatus: BillingWebhookPaymentStatus;
  webhookStatus: BillingWebhookStatus;
}) {
  if (immutablePaymentStatuses.has(currentStatus) && webhookStatus !== "confirmed") return currentStatus;
  if (currentStatus === "refunded") return currentStatus;
  return mapBillingWebhookPaymentStatus(webhookStatus);
}
