import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import type { PaymentLogStatus, PaymentMethod, TableBillStatus } from "@/types/domain";
import type { Database, Json } from "@/types/supabase";

type TypedSupabaseClient = SupabaseClient<Database>;
type AuditMetadata = Record<string, Json | undefined>;

type PaymentLogEventInput = {
  orderId: string;
  method: PaymentMethod;
  status: PaymentLogStatus;
  amount: number;
  source: string;
  transitionKey: string;
  billId?: string | null;
  rawData?: AuditMetadata;
};

type ReservationDepositLogEventInput = {
  reservationId: string;
  restaurantId: string;
  method: PaymentMethod;
  status: PaymentLogStatus;
  amount: number;
  source: string;
  transitionKey: string;
  rawData?: AuditMetadata;
};

function auditPayload(source: string, transitionKey: string, rawData?: AuditMetadata): Json {
  return {
    source,
    transitionKey,
    ...(rawData ?? {})
  };
}

export function paymentTransitionKey({
  orderId,
  billId,
  stage
}: {
  orderId?: string;
  billId?: string | null;
  stage: string;
}) {
  if (billId) return `bill:${billId}:${stage}`;
  if (orderId) return `order:${orderId}:${stage}`;
  throw new Error("paymentTransitionKey requires either orderId or billId");
}

export function reservationDepositTransitionKey(reservationId: string, stage: string) {
  return `reservation:${reservationId}:${stage}`;
}

export function billStatusToOrderPaymentState(status: Extract<TableBillStatus, "waiting_payment" | "waiting_confirm" | "paid">) {
  return {
    orderStatus: status,
    paymentStatus: status
  } as const;
}

export async function ensurePaymentLogEvent(supabase: TypedSupabaseClient, input: PaymentLogEventInput) {
  const { error } = await supabase.from("payment_logs").insert({
    order_id: input.orderId,
    bill_id: input.billId ?? null,
    method: input.method,
    status: input.status,
    amount: input.amount,
    transition_key: input.transitionKey,
    raw_data: auditPayload(input.source, input.transitionKey, input.rawData)
  });

  if ((error as { code?: string } | null)?.code === "23505") return;
  throwIfSupabaseError(error);
}

export async function ensureReservationDepositLogEvent(supabase: TypedSupabaseClient, input: ReservationDepositLogEventInput) {
  const { error } = await supabase.from("reservation_deposit_logs").insert({
    reservation_id: input.reservationId,
    restaurant_id: input.restaurantId,
    method: input.method,
    status: input.status,
    amount: input.amount,
    transition_key: input.transitionKey,
    raw_data: auditPayload(input.source, input.transitionKey, input.rawData)
  });

  if ((error as { code?: string } | null)?.code === "23505") return;
  throwIfSupabaseError(error);
}
