import type { FulfillmentType, OrderDto, OrderStatus, PaymentStatus } from "@/types/domain";

export type CustomerOrderLifecycleState =
  | "awaiting_payment"
  | "awaiting_payment_confirmation"
  | "awaiting_confirmation"
  | "preparing"
  | "delivering"
  | "completed"
  | "cancelled"
  | "refunded";

export type CustomerOrderLifecycle = {
  state: CustomerOrderLifecycleState;
  label: string;
  stepIndex: number;
  isClosed: boolean;
};

type LifecycleOrder = Pick<OrderDto, "status" | "paymentStatus" | "fulfillmentType" | "deliveryStatus">;

function isPaid(status?: PaymentStatus | null) {
  return status === "paid";
}

function isWaitingForPayment(status?: OrderStatus | null, paymentStatus?: PaymentStatus | null) {
  return status === "waiting_payment" || paymentStatus === "waiting_payment";
}

function isWaitingForPaymentConfirmation(status?: OrderStatus | null, paymentStatus?: PaymentStatus | null) {
  return status === "waiting_confirm" || paymentStatus === "waiting_confirm";
}

function lifecycleState(order: LifecycleOrder): CustomerOrderLifecycleState {
  if (order.paymentStatus === "refunded") return "refunded";
  if (order.status === "cancelled" || order.deliveryStatus === "rejected") return "cancelled";
  if (isWaitingForPayment(order.status, order.paymentStatus)) return "awaiting_payment";
  if (isWaitingForPaymentConfirmation(order.status, order.paymentStatus)) return "awaiting_payment_confirmation";
  if (order.deliveryStatus === "delivered" || order.status === "paid") return "completed";
  if (order.fulfillmentType === "DELIVERY" && order.deliveryStatus === "out_for_delivery") return "delivering";
  if (order.status === "completed") return "completed";
  if (order.status === "ordering") return "preparing";
  return "awaiting_confirmation";
}

function lifecycleLabel(order: LifecycleOrder, state: CustomerOrderLifecycleState) {
  if (state === "awaiting_confirmation" && isPaid(order.paymentStatus)) {
    return "Đã thanh toán, chờ quán xác nhận";
  }

  const fulfillmentType = order.fulfillmentType;
  const pickupReadyLabel = fulfillmentType === "PICKUP" ? "Đơn đã sẵn sàng để lấy" : "Đơn đã hoàn tất";
  const labels: Record<CustomerOrderLifecycleState, string> = {
    awaiting_payment: "Vui lòng thanh toán để quán nhận đơn",
    awaiting_payment_confirmation: "Đã báo chuyển khoản, chờ quán xác nhận",
    awaiting_confirmation: "Đã gửi đơn, chờ quán xác nhận",
    preparing: "Quán đang chuẩn bị món",
    delivering: "Đơn đang được giao",
    completed: pickupReadyLabel,
    cancelled: "Đơn đã huỷ",
    refunded: "Đơn đã hoàn tiền"
  };
  return labels[state];
}

function lifecycleStepIndex(state: CustomerOrderLifecycleState) {
  if (state === "completed" || state === "refunded") return 3;
  if (state === "delivering") return 2;
  if (state === "preparing") return 1;
  return 0;
}

export function getCustomerOrderLifecycle(order: LifecycleOrder): CustomerOrderLifecycle {
  const state = lifecycleState(order);
  return {
    state,
    label: lifecycleLabel(order, state),
    stepIndex: lifecycleStepIndex(state),
    isClosed: state === "completed" || state === "cancelled" || state === "refunded"
  };
}

export function getOrderProgressLabels(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return ["Đặt món", "Đang chuẩn bị", "Sẵn sàng lấy", "Hoàn thành"];
  return ["Đặt món", "Đang chuẩn bị", "Đang giao", "Hoàn thành"];
}
