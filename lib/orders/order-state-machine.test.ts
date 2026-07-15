import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllowedDeliveryStatusTransitions,
  getRestaurantOrderActionCopy,
  orderNeedsPaymentAttention,
  resolveDeliveryStatusTransition,
  resolveMerchantPaymentConfirmationTransition,
  resolveMerchantAcceptTransition,
  resolveOrderPaymentStatus,
  resolveOrderProgressState,
  isClosedOrderProgress,
  shouldReturnOnlineOrderToKitchenAfterPayment
} from "./order-state-machine";

test("restaurant action copy separates online confirmation from dine-in receive", () => {
  assert.equal(getRestaurantOrderActionCopy({ fulfillmentType: "DELIVERY" }).acceptLabel, "Xác nhận đơn");
  assert.equal(getRestaurantOrderActionCopy({ fulfillmentType: "PICKUP" }).pendingBadge, "Chờ xác nhận");
  assert.equal(getRestaurantOrderActionCopy({ fulfillmentType: "DINE_IN" }).acceptLabel, "Nhận đơn");
});

test("merchant accept moves delivery orders into accepted delivery state", () => {
  const requested = resolveMerchantAcceptTransition({
    status: "pending",
    fulfillmentType: "DELIVERY",
    deliveryStatus: "requested"
  });
  const pickup = resolveMerchantAcceptTransition({
    status: "pending",
    fulfillmentType: "PICKUP",
    deliveryStatus: "none"
  });

  assert.equal(requested.allowed, true);
  assert.equal(requested.next, "accepted");
  assert.equal(pickup.allowed, true);
  assert.equal(pickup.next, null);
});

test("merchant accept retries keep the current delivery handoff state", () => {
  const accepted = resolveMerchantAcceptTransition({
    status: "ordering",
    fulfillmentType: "DELIVERY",
    deliveryStatus: "accepted"
  });
  const outForDelivery = resolveMerchantAcceptTransition({
    status: "ordering",
    fulfillmentType: "DELIVERY",
    deliveryStatus: "out_for_delivery"
  });

  assert.equal(accepted.allowed, true);
  assert.equal(accepted.next, "accepted");
  assert.equal(outForDelivery.allowed, true);
  assert.equal(outForDelivery.next, "out_for_delivery");
});

test("merchant accept blocks cancelled or rejected delivery orders", () => {
  assert.equal(resolveMerchantAcceptTransition({ status: "cancelled", fulfillmentType: "DELIVERY" }).allowed, false);
  assert.equal(
    resolveMerchantAcceptTransition({
      status: "pending",
      fulfillmentType: "DELIVERY",
      deliveryStatus: "rejected"
    }).allowed,
    false
  );
});

test("delivery transitions enforce restaurant handoff order", () => {
  assert.deepEqual(getAllowedDeliveryStatusTransitions("requested"), ["accepted", "rejected"]);
  assert.deepEqual(getAllowedDeliveryStatusTransitions("accepted"), ["accepted", "out_for_delivery", "rejected"]);
  assert.deepEqual(getAllowedDeliveryStatusTransitions("out_for_delivery"), ["out_for_delivery", "delivered"]);
  assert.equal(resolveDeliveryStatusTransition("requested", "out_for_delivery").allowed, false);
  assert.equal(resolveDeliveryStatusTransition("accepted", "out_for_delivery").allowed, true);
  assert.equal(resolveDeliveryStatusTransition("out_for_delivery", "delivered").allowed, true);
  assert.equal(resolveDeliveryStatusTransition("delivered", "accepted").allowed, false);
});

test("delivery transitions allow same-state retries without advancing workflow", () => {
  assert.equal(resolveDeliveryStatusTransition("accepted", "accepted").allowed, true);
  assert.equal(resolveDeliveryStatusTransition("out_for_delivery", "out_for_delivery").allowed, true);
  assert.equal(resolveDeliveryStatusTransition("delivered", "delivered").allowed, true);
});

test("canonical payment status prefers bill and paid markers over legacy order status", () => {
  assert.equal(resolveOrderPaymentStatus({ status: "pending", paymentStatus: "unpaid", bill: { status: "waiting_confirm" } }), "waiting_confirm");
  assert.equal(resolveOrderPaymentStatus({ status: "waiting_payment", paymentStatus: null }), "waiting_payment");
  assert.equal(resolveOrderPaymentStatus({ status: "pending", paymentStatus: "unpaid", paidAt: "2026-05-17T00:00:00.000Z" }), "paid");
  assert.equal(resolveOrderPaymentStatus({ status: "pending", paymentStatus: "refunded", bill: { status: "paid" } }), "refunded");
});

test("canonical progress state separates payment, confirmation, kitchen, delivery and terminal states", () => {
  assert.equal(resolveOrderProgressState({ status: "waiting_payment", paymentStatus: "waiting_payment" }), "awaiting_payment");
  assert.equal(resolveOrderProgressState({ status: "pending", paymentStatus: "waiting_confirm" }), "awaiting_payment_confirmation");
  assert.equal(resolveOrderProgressState({ status: "waiting_payment", paymentStatus: "failed" }), "awaiting_payment");
  assert.equal(resolveOrderProgressState({ status: "pending", paymentStatus: "paid" }), "awaiting_confirmation");
  assert.equal(resolveOrderProgressState({ status: "ordering", fulfillmentType: "PICKUP" }), "preparing");
  assert.equal(resolveOrderProgressState({ status: "ordering", fulfillmentType: "DELIVERY", deliveryStatus: "out_for_delivery" }), "delivering");
  assert.equal(resolveOrderProgressState({ status: "ordering", deliveryStatus: "rejected" }), "cancelled");
  // Kitchen-ready unpaid stays open as "ready" (not terminal completed).
  assert.equal(resolveOrderProgressState({ status: "completed", paymentStatus: "unpaid", fulfillmentType: "PICKUP" }), "ready");
  assert.equal(resolveOrderProgressState({ status: "completed", paymentStatus: "paid", fulfillmentType: "PICKUP" }), "completed");
  assert.equal(isClosedOrderProgress("ready"), false);
  assert.equal(isClosedOrderProgress("completed"), true);
});

test("payment attention helper recognizes legacy and normalized waiting payment states", () => {
  assert.equal(orderNeedsPaymentAttention({ status: "pending", paymentStatus: "waiting_confirm" }), true);
  assert.equal(orderNeedsPaymentAttention({ status: "waiting_payment", paymentStatus: "unpaid" }), true);
  assert.equal(orderNeedsPaymentAttention({ status: "pending", paymentStatus: "paid" }), false);
});

test("payment confirmation returns only bill-less online orders to kitchen queue", () => {
  assert.equal(
    shouldReturnOnlineOrderToKitchenAfterPayment({
      status: "pending",
      paymentStatus: "waiting_confirm",
      fulfillmentType: "DELIVERY",
      billId: null
    }),
    true
  );
  assert.equal(
    shouldReturnOnlineOrderToKitchenAfterPayment({
      status: "waiting_confirm",
      paymentStatus: "waiting_confirm",
      fulfillmentType: "PICKUP",
      billId: null
    }),
    true
  );
  assert.equal(
    shouldReturnOnlineOrderToKitchenAfterPayment({
      status: "waiting_confirm",
      paymentStatus: "waiting_confirm",
      fulfillmentType: "DELIVERY",
      billId: "bill-1"
    }),
    false
  );
  assert.equal(
    shouldReturnOnlineOrderToKitchenAfterPayment({
      status: "waiting_confirm",
      paymentStatus: "waiting_confirm",
      fulfillmentType: "DINE_IN",
      billId: null
    }),
    false
  );
});

test("merchant payment confirmation handles pending online prepaid orders waiting for money approval", () => {
  const transition = resolveMerchantPaymentConfirmationTransition({
    status: "pending",
    paymentStatus: "waiting_confirm",
    fulfillmentType: "DELIVERY",
    billId: null
  });

  assert.equal(transition.allowed, true);
  assert.deepEqual(transition.next, { status: "pending", paymentStatus: "paid" });
});

test("merchant payment confirmation closes served dine-in orders", () => {
  const transition = resolveMerchantPaymentConfirmationTransition({
    status: "completed",
    paymentStatus: "unpaid",
    fulfillmentType: "DINE_IN",
    billId: null
  });

  assert.equal(transition.allowed, true);
  assert.deepEqual(transition.next, { status: "paid", paymentStatus: "paid" });
});

test("merchant payment confirmation blocks orders that are not waiting for payment", () => {
  const transition = resolveMerchantPaymentConfirmationTransition({
    status: "pending",
    paymentStatus: "unpaid",
    fulfillmentType: "PICKUP",
    billId: null
  });

  assert.equal(transition.allowed, false);
  assert.match(transition.reason ?? "", /chưa ở trạng thái chờ xác nhận thanh toán/);
});
