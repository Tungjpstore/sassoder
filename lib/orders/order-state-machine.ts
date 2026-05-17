import type { DeliveryStatus, FulfillmentType, OrderDto, OrderStatus, PaymentStatus } from "@/types/domain";

export type DeliveryActionStatus = Exclude<DeliveryStatus, "none" | "requested">;

export type OrderStateInput = {
  status: OrderStatus;
  fulfillmentType?: FulfillmentType | null;
  deliveryStatus?: DeliveryStatus | null;
  paymentStatus?: PaymentStatus | null;
  paidAt?: string | null;
  billId?: string | null;
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

function isOnlineOrder(order: Pick<OrderStateInput, "fulfillmentType">) {
  return order.fulfillmentType === "DELIVERY" || order.fulfillmentType === "PICKUP";
}

function normalizeDeliveryStatus(status?: DeliveryStatus | null): DeliveryStatus {
  return status ?? "none";
}

export function getRestaurantOrderActionCopy(order: Pick<OrderDto, "fulfillmentType">): OrderActionCopy {
  if (isOnlineOrder(order)) {
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
  if (!isOnlineOrder(order)) return false;
  return (
    order.status === "waiting_confirm" ||
    order.status === "waiting_payment" ||
    order.paymentStatus === "waiting_confirm" ||
    order.paymentStatus === "waiting_payment"
  );
}
