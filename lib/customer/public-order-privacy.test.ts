import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSharedTableHistoryOrder } from "./public-order-privacy";
import type { OrderDto } from "@/types/domain";

function order(partial: Partial<OrderDto> = {}): OrderDto {
  return {
    id: "o1",
    status: "ordering",
    subtotal: 10000,
    discountAmount: 0,
    total: 10000,
    paymentMethod: null,
    paymentStatus: "unpaid",
    fulfillmentType: "DINE_IN",
    customerName: "An",
    customerPhone: "0901",
    customerNote: "ít đá",
    bill: null,
    createdAt: new Date().toISOString(),
    table: { name: "Bàn 1" },
    items: [],
    ...partial
  };
}

test("sanitizeSharedTableHistoryOrder keeps fields for the owner session", () => {
  const result = sanitizeSharedTableHistoryOrder(order(), "sess-a", "sess-a");
  assert.equal(result.customerName, "An");
  assert.equal(result.customerNote, "ít đá");
});

test("sanitizeSharedTableHistoryOrder redacts private fields for other diners", () => {
  const result = sanitizeSharedTableHistoryOrder(order(), "sess-a", "sess-b");
  assert.equal(result.customerName, null);
  assert.equal(result.customerPhone, null);
  assert.equal(result.customerNote, null);
  assert.equal(result.total, 10000);
});

test("sanitizeSharedTableHistoryOrder redacts private fields for QR-only viewers", () => {
  const result = sanitizeSharedTableHistoryOrder(order({ fulfillmentType: "DELIVERY" }), "sess-a", undefined);
  assert.equal(result.customerName, null);
  assert.equal(result.customerPhone, null);
  assert.equal(result.customerNote, null);
  assert.equal(result.deliveryAddress, null);
  assert.equal(result.deliveryLat, null);
  assert.equal(result.deliveryCourier, null);
  assert.equal(result.deliveryTrackingSnapshot, null);
});
