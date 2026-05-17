import assert from "node:assert/strict";
import test from "node:test";
import {
  getAllowedDeliveryStatusTransitions,
  getRestaurantOrderActionCopy,
  resolveDeliveryStatusTransition,
  resolveMerchantAcceptTransition,
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
