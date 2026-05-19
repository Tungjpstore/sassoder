import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerOrderLifecycle, getCustomerOrderTimeline, getOrderProgressLabels } from "./order-lifecycle";

type TestLifecycleOrder = Parameters<typeof getCustomerOrderLifecycle>[0];

function order(input: Partial<TestLifecycleOrder>) {
  return {
    status: input.status ?? "pending",
    paymentStatus: input.paymentStatus ?? "unpaid",
    fulfillmentType: input.fulfillmentType ?? "DELIVERY",
    deliveryStatus: input.deliveryStatus ?? "none",
    paymentMethod: input.paymentMethod ?? null
  } satisfies TestLifecycleOrder;
}

test("customer lifecycle keeps pending orders in the first progress step", () => {
  const lifecycle = getCustomerOrderLifecycle(order({ status: "pending" }));

  assert.equal(lifecycle.state, "awaiting_confirmation");
  assert.equal(lifecycle.stepIndex, 0);
  assert.equal(lifecycle.isClosed, false);
});

test("customer lifecycle separates payment wait states from kitchen preparation", () => {
  const waitingPayment = getCustomerOrderLifecycle(order({ status: "waiting_payment", paymentStatus: "waiting_payment" }));
  const waitingConfirm = getCustomerOrderLifecycle(order({ status: "waiting_confirm", paymentStatus: "waiting_confirm" }));

  assert.equal(waitingPayment.state, "awaiting_payment");
  assert.equal(waitingPayment.stepIndex, 0);
  assert.equal(waitingConfirm.state, "awaiting_payment_confirmation");
  assert.equal(waitingConfirm.stepIndex, 0);
});

test("customer lifecycle maps preparation, delivery, and completion", () => {
  assert.equal(getCustomerOrderLifecycle(order({ status: "ordering" })).state, "preparing");
  assert.equal(getCustomerOrderLifecycle(order({ status: "ordering", deliveryStatus: "out_for_delivery" })).state, "delivering");
  assert.equal(getCustomerOrderLifecycle(order({ status: "completed", paymentStatus: "paid" })).isClosed, true);
});

test("customer lifecycle keeps completed dine-in orders open until payment settles", () => {
  const unpaid = getCustomerOrderLifecycle(order({ status: "completed", fulfillmentType: "DINE_IN", paymentStatus: "unpaid" }));
  const failed = getCustomerOrderLifecycle(order({ status: "completed", fulfillmentType: "DINE_IN", paymentStatus: "failed" }));
  const paid = getCustomerOrderLifecycle(order({ status: "completed", fulfillmentType: "DINE_IN", paymentStatus: "paid" }));

  assert.equal(unpaid.state, "completed");
  assert.equal(unpaid.isClosed, false);
  assert.equal(failed.state, "awaiting_payment");
  assert.equal(failed.isClosed, false);
  assert.equal(paid.isClosed, true);
});

test("customer lifecycle uses pickup-specific progress labels", () => {
  assert.deepEqual(getOrderProgressLabels("PICKUP"), ["Đặt món", "Đang chuẩn bị", "Sẵn sàng lấy", "Hoàn thành"]);
});

test("customer timeline highlights QR prepaid orders waiting for transfer", () => {
  const timeline = getCustomerOrderTimeline(
    order({ status: "waiting_payment", paymentStatus: "waiting_payment", paymentMethod: "QR" })
  );

  assert.equal(timeline[0]?.key, "payment");
  assert.equal(timeline[0]?.current, true);
  assert.equal(timeline[1]?.key, "payment_confirmation");
  assert.equal(timeline[1]?.status, "pending");
  assert.match(timeline[0]?.description ?? "", /Chuyển khoản/);
});

test("customer timeline separates transfer sent from restaurant payment confirmation", () => {
  const timeline = getCustomerOrderTimeline(
    order({ status: "waiting_confirm", paymentStatus: "waiting_confirm", paymentMethod: "QR" })
  );

  assert.equal(timeline[0]?.done, true);
  assert.equal(timeline[1]?.key, "payment_confirmation");
  assert.equal(timeline[1]?.current, true);
  assert.equal(timeline[2]?.key, "restaurant_confirmation");
  assert.equal(timeline[2]?.status, "pending");
});

test("customer timeline uses pickup handoff labels", () => {
  const timeline = getCustomerOrderTimeline(order({ status: "ordering", fulfillmentType: "PICKUP" }));
  const preparing = timeline.find((item) => item.key === "preparing");
  const handoff = timeline.find((item) => item.key === "handoff");

  assert.equal(preparing?.current, true);
  assert.equal(handoff?.label, "Sẵn sàng lấy tại quán");
});

test("customer timeline marks delivery handoff as current when order is out for delivery", () => {
  const timeline = getCustomerOrderTimeline(order({ status: "ordering", deliveryStatus: "out_for_delivery" }));
  const handoff = timeline.find((item) => item.key === "handoff");

  assert.equal(getCustomerOrderLifecycle(order({ status: "ordering", deliveryStatus: "out_for_delivery" })).state, "delivering");
  assert.equal(handoff?.current, true);
  assert.equal(handoff?.label, "Giao hàng tận nơi");
});

test("customer timeline collapses cancelled, rejected, and refunded orders into blocked terminal states", () => {
  const cancelled = getCustomerOrderTimeline(order({ status: "cancelled" }));
  const rejected = getCustomerOrderTimeline(order({ deliveryStatus: "rejected" }));
  const refunded = getCustomerOrderTimeline(order({ paymentStatus: "refunded", paymentMethod: "QR" }));

  assert.deepEqual(cancelled.map((item) => item.key), ["closed"]);
  assert.equal(cancelled[0]?.blocked, true);
  assert.equal(rejected[0]?.blocked, true);
  assert.match(rejected[0]?.description ?? "", /giao hàng/);
  assert.equal(refunded[0]?.label, "Đơn đã hoàn tiền");
  assert.equal(refunded[0]?.current, true);
});
