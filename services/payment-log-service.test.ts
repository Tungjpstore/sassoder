import assert from "node:assert/strict";
import test from "node:test";
import {
  billStatusToOrderPaymentState,
  ensurePaymentLogEvent,
  ensureReservationDepositLogEvent,
  paymentTransitionKey,
  reservationDepositTransitionKey
} from "./payment-log-service";

type InsertCall = {
  table: string;
  payload: unknown;
};

function createInsertOnlySupabase(error: unknown = null) {
  const calls: InsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, payload });
          return Promise.resolve({ error });
        }
      };
    }
  } as unknown as Parameters<typeof ensurePaymentLogEvent>[0];

  return { calls, client };
}

test("paymentTransitionKey prefers bill scope when present", () => {
  assert.equal(
    paymentTransitionKey({ orderId: "order-1", billId: "bill-1", stage: "confirmed" }),
    "bill:bill-1:confirmed"
  );
});

test("paymentTransitionKey falls back to order scope", () => {
  assert.equal(
    paymentTransitionKey({ orderId: "order-1", stage: "customer-submitted-qr" }),
    "order:order-1:customer-submitted-qr"
  );
});

test("reservationDepositTransitionKey is stable", () => {
  assert.equal(
    reservationDepositTransitionKey("reservation-1", "deposit-confirmed"),
    "reservation:reservation-1:deposit-confirmed"
  );
});

test("billStatusToOrderPaymentState keeps order and payment state aligned", () => {
  assert.deepEqual(billStatusToOrderPaymentState("waiting_payment"), {
    orderStatus: "waiting_payment",
    paymentStatus: "waiting_payment"
  });
  assert.deepEqual(billStatusToOrderPaymentState("waiting_confirm"), {
    orderStatus: "waiting_confirm",
    paymentStatus: "waiting_confirm"
  });
  assert.deepEqual(billStatusToOrderPaymentState("paid"), {
    orderStatus: "paid",
    paymentStatus: "paid"
  });
});

test("ensurePaymentLogEvent writes a scoped idempotent audit payload", async () => {
  const { calls, client } = createInsertOnlySupabase();

  await ensurePaymentLogEvent(client, {
    orderId: "order-1",
    billId: "bill-1",
    method: "QR",
    status: "waiting_confirm",
    amount: 120_000,
    source: "customer-checkout",
    transitionKey: "bill:bill-1:waiting-confirm",
    rawData: {
      bankCode: "VCB",
      detectedAmount: 120_000
    }
  });

  assert.deepEqual(calls, [
    {
      table: "payment_logs",
      payload: {
        order_id: "order-1",
        bill_id: "bill-1",
        method: "QR",
        status: "waiting_confirm",
        amount: 120_000,
        transition_key: "bill:bill-1:waiting-confirm",
        raw_data: {
          source: "customer-checkout",
          transitionKey: "bill:bill-1:waiting-confirm",
          bankCode: "VCB",
          detectedAmount: 120_000
        }
      }
    }
  ]);
});

test("ensurePaymentLogEvent treats duplicate transition keys as already applied", async () => {
  const { calls, client } = createInsertOnlySupabase({ code: "23505", message: "duplicate key" });

  await ensurePaymentLogEvent(client, {
    orderId: "order-1",
    method: "QR",
    status: "confirmed",
    amount: 120_000,
    source: "admin-confirm-payment",
    transitionKey: "order:order-1:confirmed"
  });

  assert.equal(calls.length, 1);
});

test("ensurePaymentLogEvent surfaces non-idempotency insert failures", async () => {
  const { client } = createInsertOnlySupabase({ code: "42501", message: "permission denied" });

  await assert.rejects(
    () =>
      ensurePaymentLogEvent(client, {
        orderId: "order-1",
        method: "QR",
        status: "confirmed",
        amount: 120_000,
        source: "admin-confirm-payment",
        transitionKey: "order:order-1:confirmed"
      }),
    /permission denied/
  );
});

test("ensureReservationDepositLogEvent writes tenant-scoped deposit audit payload", async () => {
  const { calls, client } = createInsertOnlySupabase();

  await ensureReservationDepositLogEvent(client, {
    reservationId: "reservation-1",
    restaurantId: "restaurant-1",
    method: "QR",
    status: "confirmed",
    amount: 50_000,
    source: "admin-confirm-deposit",
    transitionKey: "reservation:reservation-1:deposit-confirmed"
  });

  assert.deepEqual(calls, [
    {
      table: "reservation_deposit_logs",
      payload: {
        reservation_id: "reservation-1",
        restaurant_id: "restaurant-1",
        method: "QR",
        status: "confirmed",
        amount: 50_000,
        transition_key: "reservation:reservation-1:deposit-confirmed",
        raw_data: {
          source: "admin-confirm-deposit",
          transitionKey: "reservation:reservation-1:deposit-confirmed"
        }
      }
    }
  ]);
});
