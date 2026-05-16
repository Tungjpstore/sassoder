import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerOrderLifecycle, getOrderProgressLabels } from "./order-lifecycle";
import type { OrderDto } from "@/types/domain";

function order(input: Partial<Pick<OrderDto, "status" | "paymentStatus" | "fulfillmentType" | "deliveryStatus">>) {
  return {
    status: input.status ?? "pending",
    paymentStatus: input.paymentStatus ?? "unpaid",
    fulfillmentType: input.fulfillmentType ?? "DELIVERY",
    deliveryStatus: input.deliveryStatus ?? "none"
  } as Pick<OrderDto, "status" | "paymentStatus" | "fulfillmentType" | "deliveryStatus">;
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

test("customer lifecycle uses pickup-specific progress labels", () => {
  assert.deepEqual(getOrderProgressLabels("PICKUP"), ["Đặt món", "Đang chuẩn bị", "Sẵn sàng lấy", "Hoàn thành"]);
});
