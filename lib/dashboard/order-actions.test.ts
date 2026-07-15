import assert from "node:assert/strict";
import test from "node:test";
import { applyDashboardOrderOptimistic, resolveDashboardActionToast, resolveDashboardOrderAction, resolveDashboardPaymentConfirmationBody } from "./order-actions";

test("dashboard order action prioritizes payment confirmation over accepting pending prepaid orders", () => {
  assert.deepEqual(
    resolveDashboardOrderAction({
      status: "pending",
      paymentStatus: "waiting_confirm",
      fulfillmentType: "DELIVERY",
      billId: null
    }),
    {
      action: "confirm-payment",
      label: "Xác nhận thanh toán",
      successMessage: "Đã xác nhận thanh toán"
    }
  );
});

test("dashboard order action moves paid prepaid online orders back to merchant confirmation", () => {
  assert.deepEqual(
    resolveDashboardOrderAction({
      status: "pending",
      paymentStatus: "paid",
      fulfillmentType: "PICKUP",
      billId: null
    }),
    {
      action: "accept",
      label: "Xác nhận đơn",
      successMessage: "Đã xác nhận đơn"
    }
  );
});

test("dashboard order action uses fulfillment-specific completion copy", () => {
  assert.equal(resolveDashboardOrderAction({ status: "ordering", paymentStatus: "unpaid", fulfillmentType: "DINE_IN" })?.label, "Báo ra món");
  assert.equal(resolveDashboardOrderAction({ status: "ordering", paymentStatus: "unpaid", fulfillmentType: "PICKUP" })?.label, "Sẵn sàng lấy");
  assert.equal(resolveDashboardOrderAction({ status: "ordering", paymentStatus: "unpaid", fulfillmentType: "DELIVERY" })?.label, "Sẵn sàng giao");
});

test("dashboard order action closes completed orders with payment copy", () => {
  assert.deepEqual(
    resolveDashboardOrderAction({
      status: "completed",
      paymentStatus: "unpaid",
      fulfillmentType: "DINE_IN",
      billId: null
    }),
    {
      action: "confirm-payment",
      label: "Thu tiền mặt",
      successMessage: "Đã xác nhận thanh toán"
    }
  );
});

test("dashboard order action hides terminal orders", () => {
  assert.equal(resolveDashboardOrderAction({ status: "paid", paymentStatus: "paid", fulfillmentType: "DINE_IN" }), null);
  assert.equal(resolveDashboardOrderAction({ status: "cancelled", paymentStatus: "unpaid", fulfillmentType: "DELIVERY" }), null);
});

test("dashboard optimistic accept moves an order to kitchen with due time", () => {
  const now = new Date("2026-06-21T07:00:00.000Z");
  const due = "2026-06-21T07:15:00.000Z";

  assert.deepEqual(
    applyDashboardOrderOptimistic(
      { status: "pending", paymentStatus: "unpaid", fulfillmentType: "DINE_IN", acceptedAt: null, serviceDueAt: null },
      "accept",
      { now, serviceDueAt: due }
    ),
    {
      status: "ordering",
      paymentStatus: "unpaid",
      fulfillmentType: "DINE_IN",
      acceptedAt: now.toISOString(),
      serviceDueAt: due
    }
  );
});

test("dashboard optimistic payment confirmation preserves online prepaid kitchen flow", () => {
  const now = new Date("2026-06-21T07:00:00.000Z");

  assert.deepEqual(
    applyDashboardOrderOptimistic(
      { status: "pending", paymentStatus: "waiting_confirm", fulfillmentType: "DELIVERY", billId: null, paidAt: null },
      "confirm-payment",
      { now }
    ),
    {
      status: "pending",
      paymentStatus: "paid",
      fulfillmentType: "DELIVERY",
      billId: null,
      paidAt: now.toISOString()
    }
  );
});

test("dashboard optimistic complete cancel and timer update only their intended fields", () => {
  const now = new Date("2026-06-21T07:00:00.000Z");
  const due = "2026-06-21T07:10:00.000Z";

  assert.equal(applyDashboardOrderOptimistic({ status: "ordering", paymentStatus: "unpaid" }, "complete", { now }).status, "completed");
  assert.equal(applyDashboardOrderOptimistic({ status: "ordering", paymentStatus: "unpaid" }, "cancel").status, "cancelled");
  assert.equal(applyDashboardOrderOptimistic({ status: "ordering", paymentStatus: "unpaid", serviceDueAt: null }, "timer", { serviceDueAt: due }).serviceDueAt, due);
});

test("dashboard payment confirmation body recovers missing cash and QR methods", () => {
  assert.deepEqual(resolveDashboardPaymentConfirmationBody({ status: "waiting_confirm", paymentStatus: "waiting_confirm", fulfillmentType: "DELIVERY" }), { paymentMethod: "CASH" });
  assert.deepEqual(resolveDashboardPaymentConfirmationBody({ status: "waiting_payment", paymentStatus: "waiting_payment", fulfillmentType: "PICKUP" }), { paymentMethod: "QR" });
  assert.deepEqual(resolveDashboardPaymentConfirmationBody({ status: "completed", paymentStatus: "unpaid", fulfillmentType: "DINE_IN" }), { paymentMethod: "CASH" });
  assert.deepEqual(resolveDashboardPaymentConfirmationBody({ status: "waiting_payment", paymentStatus: "waiting_payment", fulfillmentType: "DINE_IN", bill: { status: "waiting_confirm", paymentMethod: "CASH" } }), { paymentMethod: "CASH" });
  assert.equal(resolveDashboardPaymentConfirmationBody({ status: "pending", paymentStatus: "unpaid", fulfillmentType: "DELIVERY" }), undefined);
});

test("dashboard action toast copy covers order lifecycle actions", () => {
  assert.deepEqual(resolveDashboardActionToast("confirm-payment"), {
    title: "Đã thu tiền",
    message: "Thanh toán đã được chốt và đồng bộ về đơn hàng."
  });
  assert.deepEqual(resolveDashboardActionToast("timer", { minutes: 15 }), {
    title: "Đã gia hạn bếp",
    message: "Cộng thêm 15 phút cho đơn này."
  });
  assert.equal(resolveDashboardActionToast("resolve-request").title, "Đã xử lý yêu cầu");
});
