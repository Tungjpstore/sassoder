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

export type CustomerOrderTimelineItemStatus = "done" | "current" | "pending" | "blocked";

export type CustomerOrderTimelineItemKey =
  | "payment"
  | "payment_confirmation"
  | "restaurant_confirmation"
  | "preparing"
  | "handoff"
  | "completed"
  | "closed";

export type CustomerOrderTimelineItem = {
  key: CustomerOrderTimelineItemKey;
  label: string;
  description: string;
  status: CustomerOrderTimelineItemStatus;
  done: boolean;
  current: boolean;
  blocked: boolean;
};

type TimelineTemplate = Pick<CustomerOrderTimelineItem, "key" | "label" | "description">;
type LifecycleOrder = Pick<OrderDto, "status" | "paymentStatus" | "fulfillmentType" | "deliveryStatus"> &
  Partial<Pick<OrderDto, "paymentMethod">>;

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

function shouldShowPaymentTimeline(order: LifecycleOrder) {
  if (order.paymentMethod) return true;
  if (order.status === "waiting_payment" || order.status === "waiting_confirm" || order.status === "paid") return true;
  return order.paymentStatus !== "unpaid";
}

function paymentLabel(order: LifecycleOrder) {
  if (order.paymentMethod === "CASH") return "Thanh toán tiền mặt";
  return "Thanh toán VietQR";
}

function paymentDescription(order: LifecycleOrder) {
  if (order.paymentStatus === "paid") return "Quán đã ghi nhận thanh toán cho đơn này.";
  if (order.paymentMethod === "CASH") return "Thanh toán trực tiếp khi nhận món hoặc theo hướng dẫn của quán.";
  return "Chuyển khoản đúng số tiền và nội dung để quán xử lý nhanh.";
}

function paymentConfirmationDescription(order: LifecycleOrder) {
  if (order.paymentStatus === "paid") return "Thanh toán đã được xác nhận.";
  return "Quán kiểm tra giao dịch trước khi nhận chế biến.";
}

function handoffLabel(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return "Sẵn sàng lấy tại quán";
  if (fulfillmentType === "DINE_IN") return "Phục vụ món";
  return "Giao hàng tận nơi";
}

function handoffDescription(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return "Bạn có thể đến quán lấy món khi bước này sáng lên.";
  if (fulfillmentType === "DINE_IN") return "Nhân viên sẽ phục vụ món tại bàn.";
  return "Tài xế hoặc nhân viên quán đang đưa đơn đến bạn.";
}

function completedDescription(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return "Đơn hoàn tất sau khi bạn nhận món tại quán.";
  if (fulfillmentType === "DINE_IN") return "Đơn đã được phục vụ xong.";
  return "Đơn đã giao xong. Cảm ơn bạn đã đặt món.";
}

function timelineTemplates(order: LifecycleOrder): TimelineTemplate[] {
  const templates: TimelineTemplate[] = [];

  if (shouldShowPaymentTimeline(order)) {
    templates.push({
      key: "payment",
      label: paymentLabel(order),
      description: paymentDescription(order)
    });
    templates.push({
      key: "payment_confirmation",
      label: "Quán xác nhận thanh toán",
      description: paymentConfirmationDescription(order)
    });
  }

  templates.push(
    {
      key: "restaurant_confirmation",
      label: "Quán xác nhận đơn",
      description: isPaid(order.paymentStatus)
        ? "Thanh toán đã xong, quán chỉ cần xác nhận món còn phục vụ."
        : "Quán kiểm tra món, địa chỉ và thời gian phục vụ."
    },
    {
      key: "preparing",
      label: "Chuẩn bị món",
      description: "Bếp bắt đầu làm món theo ghi chú của bạn."
    },
    {
      key: "handoff",
      label: handoffLabel(order.fulfillmentType),
      description: handoffDescription(order.fulfillmentType)
    },
    {
      key: "completed",
      label: "Hoàn tất",
      description: completedDescription(order.fulfillmentType)
    }
  );

  return templates;
}

function currentTimelineKey(state: CustomerOrderLifecycleState): CustomerOrderTimelineItemKey {
  const keys: Record<CustomerOrderLifecycleState, CustomerOrderTimelineItemKey> = {
    awaiting_payment: "payment",
    awaiting_payment_confirmation: "payment_confirmation",
    awaiting_confirmation: "restaurant_confirmation",
    preparing: "preparing",
    delivering: "handoff",
    completed: "completed",
    cancelled: "closed",
    refunded: "closed"
  };
  return keys[state];
}

function applyTimelineStatus(templates: TimelineTemplate[], currentKey: CustomerOrderTimelineItemKey) {
  const currentIndex = Math.max(0, templates.findIndex((item) => item.key === currentKey));

  return templates.map((item, index): CustomerOrderTimelineItem => {
    const status: CustomerOrderTimelineItemStatus =
      index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
    return {
      ...item,
      status,
      done: status === "done",
      current: status === "current",
      blocked: false
    };
  });
}

function closedTimeline(order: LifecycleOrder, lifecycle: CustomerOrderLifecycle): CustomerOrderTimelineItem[] {
  const isRefunded = lifecycle.state === "refunded";
  return [
    {
      key: "closed",
      label: lifecycle.label,
      description: isRefunded
        ? "Khoản thanh toán đã được đánh dấu hoàn tiền. Liên hệ quán nếu bạn cần đối soát thêm."
        : order.deliveryStatus === "rejected"
          ? "Đơn giao hàng chưa thể tiếp tục. Bạn có thể liên hệ quán để đổi phương án nhận món."
          : "Đơn đã dừng xử lý. Bạn có thể liên hệ quán hoặc đặt lại khi cần.",
      status: "blocked",
      done: false,
      current: true,
      blocked: true
    }
  ];
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

export function getCustomerOrderTimeline(order: LifecycleOrder): CustomerOrderTimelineItem[] {
  const lifecycle = getCustomerOrderLifecycle(order);
  if (lifecycle.state === "cancelled" || lifecycle.state === "refunded") {
    return closedTimeline(order, lifecycle);
  }

  return applyTimelineStatus(timelineTemplates(order), currentTimelineKey(lifecycle.state));
}

export function getOrderProgressLabels(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return ["Đặt món", "Đang chuẩn bị", "Sẵn sàng lấy", "Hoàn thành"];
  return ["Đặt món", "Đang chuẩn bị", "Đang giao", "Hoàn thành"];
}
