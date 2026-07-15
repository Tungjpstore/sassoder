import type { DeliveryStatus, FulfillmentType, OrderDto, OrderStatus, PaymentStatus, TableBillStatus } from "@/types/domain";

export type DeliveryActionStatus = Exclude<DeliveryStatus, "none" | "requested">;
export type OrderProgressState =
  | "awaiting_payment"
  | "awaiting_payment_confirmation"
  | "awaiting_confirmation"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled"
  | "refunded";

export type OrderStateInput = {
  status: OrderStatus;
  fulfillmentType?: FulfillmentType | null;
  deliveryStatus?: DeliveryStatus | null;
  paymentStatus?: PaymentStatus | null;
  paidAt?: string | null;
  billId?: string | null;
  bill?: {
    status?: TableBillStatus | null;
    paidAt?: string | null;
  } | null;
};

export type OrderActionCopy = {
  acceptLabel: string;
  acceptTitle: string;
  rejectLabel: string;
  pendingBadge: string;
  priorityActionLabel: string;
};

export type StateDecision<TNext = unknown> = {
  allowed: boolean;
  reason?: string;
  next?: TNext;
};

const deliveryTransitionLabels: Record<DeliveryActionStatus, string> = {
  accepted: "nhận giao",
  out_for_delivery: "bắt đầu giao",
  delivered: "đã giao",
  rejected: "từ chối giao"
};

export function isOnlineFulfillment(order: Pick<OrderStateInput, "fulfillmentType">) {
  return order.fulfillmentType === "DELIVERY" || order.fulfillmentType === "PICKUP";
}

function normalizeDeliveryStatus(status?: DeliveryStatus | null): DeliveryStatus {
  return status ?? "none";
}

export function resolveOrderPaymentStatus(order: Pick<OrderStateInput, "status" | "paymentStatus" | "paidAt" | "bill">): PaymentStatus {
  const billStatus = order.bill?.status;
  if (order.paymentStatus === "refunded" || order.paymentStatus === "failed") return order.paymentStatus;
  if (order.paymentStatus === "paid" || order.status === "paid" || order.paidAt || billStatus === "paid" || order.bill?.paidAt) return "paid";
  if (order.paymentStatus === "waiting_confirm" || order.status === "waiting_confirm" || billStatus === "waiting_confirm") {
    return "waiting_confirm";
  }
  if (order.paymentStatus === "waiting_payment" || order.status === "waiting_payment" || billStatus === "waiting_payment") {
    return "waiting_payment";
  }
  return order.paymentStatus ?? "unpaid";
}

export function resolveOrderProgressState(order: OrderStateInput): OrderProgressState {
  const paymentStatus = resolveOrderPaymentStatus(order);
  const deliveryStatus = normalizeDeliveryStatus(order.deliveryStatus);

  if (paymentStatus === "refunded") return "refunded";
  if (order.status === "cancelled" || deliveryStatus === "rejected") return "cancelled";
  if (paymentStatus === "waiting_payment") return "awaiting_payment";
  if (paymentStatus === "waiting_confirm") return "awaiting_payment_confirmation";
  if (paymentStatus === "failed") return "awaiting_payment";

  // Terminal: money settled on order row, or delivery finished.
  // Do NOT treat paymentStatus=paid alone as complete — prepaid online returns to kitchen as pending/ordering.
  if (deliveryStatus === "delivered" || order.status === "paid") return "completed";

  // Kitchen "completed" = ready/served. Only fully complete when also paid (or no further pay step needed).
  if (order.status === "completed") {
    return paymentStatus === "paid" ? "completed" : "ready";
  }

  if (order.fulfillmentType === "DELIVERY" && deliveryStatus === "out_for_delivery") return "delivering";
  if (order.status === "ordering") return "preparing";
  return "awaiting_confirmation";
}

export function isClosedOrderProgress(state: OrderProgressState) {
  return state === "completed" || state === "cancelled" || state === "refunded";
}

export function orderNeedsPaymentAttention(order: Pick<OrderStateInput, "status" | "paymentStatus" | "paidAt" | "bill">) {
  const paymentStatus = resolveOrderPaymentStatus(order);
  return paymentStatus === "waiting_payment" || paymentStatus === "waiting_confirm";
}

export function getRestaurantOrderActionCopy(order: Pick<OrderDto, "fulfillmentType">): OrderActionCopy {
  if (isOnlineFulfillment(order)) {
    return {
      acceptLabel: "Xác nhận đơn",
      acceptTitle: "Xác nhận đơn online",
      rejectLabel: "Từ chối đơn",
      pendingBadge: "Chờ xác nhận",
      priorityActionLabel: "Xác nhận"
    };
  }

  return {
    acceptLabel: "Nhận đơn",
    acceptTitle: "Nhận đơn nhanh",
    rejectLabel: "Từ chối",
    pendingBadge: "Chờ nhận",
    priorityActionLabel: "Nhận đơn"
  };
}

export function resolveMerchantAcceptTransition(order: OrderStateInput): StateDecision<DeliveryStatus | null> {
  if (order.status === "cancelled") {
    return { allowed: false, reason: "Không thể xác nhận đơn đã huỷ" };
  }

  if (order.status !== "pending" && order.status !== "ordering") {
    return { allowed: false, reason: "Chỉ đơn mới hoặc đang ra món mới có thể xác nhận" };
  }

  if (order.deliveryStatus === "rejected") {
    return { allowed: false, reason: "Đơn giao hàng đã bị từ chối, không thể xác nhận lại" };
  }

  if (order.fulfillmentType !== "DELIVERY") {
    return { allowed: true, next: null };
  }

  const currentDeliveryStatus = normalizeDeliveryStatus(order.deliveryStatus);
  if (currentDeliveryStatus === "accepted" || currentDeliveryStatus === "out_for_delivery" || currentDeliveryStatus === "delivered") {
    return { allowed: true, next: currentDeliveryStatus };
  }

  return { allowed: true, next: "accepted" };
}

export function getAllowedDeliveryStatusTransitions(currentStatus?: DeliveryStatus | null): DeliveryActionStatus[] {
  const current = normalizeDeliveryStatus(currentStatus);

  if (current === "accepted") return ["accepted", "out_for_delivery", "rejected"];
  if (current === "out_for_delivery") return ["out_for_delivery", "delivered"];
  if (current === "delivered") return ["delivered"];
  if (current === "rejected") return ["rejected"];
  return ["accepted", "rejected"];
}

export function resolveDeliveryStatusTransition(
  currentStatus: DeliveryStatus | null | undefined,
  nextStatus: DeliveryActionStatus
): StateDecision<DeliveryActionStatus> {
  if (getAllowedDeliveryStatusTransitions(currentStatus).includes(nextStatus)) {
    return { allowed: true, next: nextStatus };
  }

  const current = normalizeDeliveryStatus(currentStatus);
  const nextLabel = deliveryTransitionLabels[nextStatus];
  if (current === "requested" || current === "none") {
    return { allowed: false, reason: `Đơn giao cần được nhận giao trước khi ${nextLabel}.` };
  }
  if (current === "out_for_delivery") {
    return { allowed: false, reason: "Đơn đã rời quán, chỉ có thể đánh dấu đã giao." };
  }
  if (current === "delivered") {
    return { allowed: false, reason: "Đơn đã giao xong, không thể đổi trạng thái vận chuyển." };
  }
  if (current === "rejected") {
    return { allowed: false, reason: "Đơn giao đã bị từ chối, không thể đổi trạng thái vận chuyển." };
  }

  return { allowed: false, reason: "Chuyển trạng thái giao hàng không hợp lệ." };
}

export function shouldReturnOnlineOrderToKitchenAfterPayment(
  order: Pick<OrderStateInput, "billId" | "fulfillmentType" | "paymentStatus" | "status">
) {
  if (order.billId) return false;
  if (!isOnlineFulfillment(order)) return false;
  return (
    order.status === "waiting_confirm" ||
    order.status === "waiting_payment" ||
    order.paymentStatus === "waiting_confirm" ||
    order.paymentStatus === "waiting_payment"
  );
}

export function resolveMerchantPaymentConfirmationTransition(
  order: Pick<OrderStateInput, "billId" | "fulfillmentType" | "paymentStatus" | "status">
): StateDecision<{ status: OrderStatus; paymentStatus: PaymentStatus }> {
  if (order.status === "cancelled") {
    return { allowed: false, reason: "Không thể xác nhận thanh toán cho đơn đã huỷ" };
  }

  if (order.status === "paid" || order.paymentStatus === "paid") {
    return { allowed: true, next: { status: order.status, paymentStatus: "paid" } };
  }

  const canConfirmPayment =
    order.status === "waiting_confirm" ||
    order.status === "waiting_payment" ||
    order.status === "completed" ||
    order.paymentStatus === "waiting_confirm" ||
    order.paymentStatus === "waiting_payment";

  if (!canConfirmPayment) {
    return { allowed: false, reason: "Đơn hàng chưa ở trạng thái chờ xác nhận thanh toán" };
  }

  return {
    allowed: true,
    next: {
      status: shouldReturnOnlineOrderToKitchenAfterPayment(order) ? "pending" : "paid",
      paymentStatus: "paid"
    }
  };
}
