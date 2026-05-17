import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_ORDER_POLL_FAST_MS,
  CUSTOMER_ORDER_POLL_PAYMENT_MS,
  getCustomerOrderPollingInterval,
  hasCustomerOrderSnapshotChanged
} from "./order-sync";
import type { OrderDto } from "@/types/domain";

type SyncOrder = Parameters<typeof hasCustomerOrderSnapshotChanged>[0];

function order(input: Partial<OrderDto> = {}): SyncOrder {
  return {
    status: input.status ?? "pending",
    paymentStatus: input.paymentStatus ?? "unpaid",
    paymentMethod: input.paymentMethod ?? null,
    fulfillmentType: input.fulfillmentType ?? "DELIVERY",
    deliveryStatus: input.deliveryStatus ?? "requested",
    total: input.total ?? 120_000,
    paidAt: input.paidAt ?? null,
    updatedAt: input.updatedAt ?? "2026-05-16T10:00:00.000Z",
    deliveryDistanceKm: input.deliveryDistanceKm ?? null,
    deliveryFee: input.deliveryFee ?? 0,
    serviceFee: input.serviceFee ?? 0,
    deliveryRouteDurationMinutes: input.deliveryRouteDurationMinutes ?? null,
    deliveryTrackingUpdatedAt: input.deliveryTrackingUpdatedAt ?? null,
    deliveryCourierLocation: input.deliveryCourierLocation ?? null
  };
}

test("customer order snapshot diff catches lifecycle and delivery changes", () => {
  assert.equal(hasCustomerOrderSnapshotChanged(order(), order()), false);
  assert.equal(hasCustomerOrderSnapshotChanged(order(), order({ status: "ordering" })), true);
  assert.equal(hasCustomerOrderSnapshotChanged(order(), order({ paymentStatus: "paid" })), true);
  assert.equal(hasCustomerOrderSnapshotChanged(order(), order({ deliveryStatus: "out_for_delivery" })), true);
});

test("customer order snapshot diff catches courier location movement", () => {
  const previous = order({
    deliveryCourierLocation: {
      lat: 10.77,
      lng: 106.7,
      accuracyMeters: 12,
      capturedAt: "2026-05-16T10:00:00.000Z"
    }
  });
  const next = order({
    deliveryCourierLocation: {
      lat: 10.78,
      lng: 106.71,
      accuracyMeters: 10,
      capturedAt: "2026-05-16T10:00:08.000Z"
    }
  });

  assert.equal(hasCustomerOrderSnapshotChanged(previous, next), true);
});

test("customer order polling backs off for payment and stops when unavailable", () => {
  assert.equal(getCustomerOrderPollingInterval(null), null);
  assert.equal(getCustomerOrderPollingInterval(order(), { networkOnline: false, pageVisible: true }), null);
  assert.equal(getCustomerOrderPollingInterval(order(), { networkOnline: true, pageVisible: false }), null);
  assert.equal(
    getCustomerOrderPollingInterval(order({ status: "waiting_payment", paymentStatus: "waiting_payment" })),
    CUSTOMER_ORDER_POLL_PAYMENT_MS
  );
  assert.equal(getCustomerOrderPollingInterval(order({ status: "ordering" })), CUSTOMER_ORDER_POLL_FAST_MS);
  assert.equal(getCustomerOrderPollingInterval(order({ status: "completed", paymentStatus: "paid" })), null);
});
