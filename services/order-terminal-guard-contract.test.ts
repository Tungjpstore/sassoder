import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const orderSource = readFileSync("services/order-service.ts", "utf8");
const paymentSource = readFileSync("services/payment-service.ts", "utf8");
const cancellationMigrationSource = readFileSync("supabase/migrations/20260723110000_phase1_canonical_cancellation.sql", "utf8");
const preparedItemSource = orderSource.match(
  /export async function markOrderItemPrepared[\s\S]*?export async function updateOrderDeliveryStatus/
)?.[0] ?? "";

test("order mutation guards preserve refunded terminal state", () => {
  assert.match(orderSource, /payment_status === "refunded"/);
  assert.match(orderSource, /order\.payment_status === "paid"[\s\S]*order\.payment_status === "refunded"/);
  assert.match(paymentSource, /payment_status === "refunded"/);
});

test("paid bills do not block kitchen work while the order is still operational", () => {
  assert.match(preparedItemSource, /order\.status === "paid"/);
  assert.match(preparedItemSource, /bill\?\.status === "cancelled"/);
  assert.doesNotMatch(preparedItemSource, /bill\?\.status === "paid"/);
});

test("prepaid delivery stays operational until courier delivery completes", () => {
  assert.match(orderSource, /order\.fulfillment_type === "DELIVERY"[\s\S]*?\? "completed"/);
  assert.match(orderSource, /deliveryStatus === "delivered"[\s\S]*?order\.payment_status === "paid"[\s\S]*?\? "paid"/);
  assert.match(orderSource, /order\.status === "paid" && order\.payment_status === "paid" && order\.served_at/);
  assert.match(orderSource, /order\.delivery_status === deliveryStatus[\s\S]*?if \(order\.status !== "ordering"/);
});

test("test-order deletion fails closed when the atomic RPC is unavailable", () => {
  assert.match(orderSource, /delete_test_order_atomic/);
  assert.match(orderSource, /order\.status !== "pending" \|\| order\.payment_status !== "unpaid"/);
  assert.match(orderSource, /Luồng xoá test nguyên tử chưa sẵn sàng/);
  assert.doesNotMatch(orderSource, /\.from\("orders"\)\s*\n\s*\.delete\(\)/);
});

test("cancel retries retain bill linkage and the durable cancellation event", () => {
  assert.match(cancellationMigrationSource, /locked_bill_id/);
  assert.match(cancellationMigrationSource, /'eventId', 'order\.cancelled:' \|\| p_order_id::text/);
  assert.match(cancellationMigrationSource, /on conflict \(restaurant_id, event_id\) do update/i);
});
