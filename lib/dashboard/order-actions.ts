import { orderNeedsPaymentAttention, resolveMerchantPaymentConfirmationTransition } from "@/lib/orders/order-state-machine";
import { inferManualConfirmationMethod } from "@/lib/payments/manual-confirmation";
import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";

export type DashboardOrderAction = "accept" | "complete" | "confirm-payment";
export type DashboardOrderOptimisticAction = DashboardOrderAction | "cancel" | "timer";
export type DashboardOrderToastAction = DashboardOrderOptimisticAction | "delete-test" | "delivery-status" | "resolve-request";

export type DashboardOrderActionInput = {
  billId?: string | null;
  bill?: {
    status?: TableBillStatus | null;
    paymentMethod?: PaymentMethod | null;
  } | null;
  fulfillmentType?: FulfillmentType | null;
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus | null;
  status: OrderStatus;
};

export type DashboardOrderOptimisticInput = DashboardOrderActionInput & {
  acceptedAt?: string | null;
  paidAt?: string | null;
  servedAt?: string | null;
  serviceDueAt?: string | null;
};

export type DashboardOrderActionDecision = {
  action: DashboardOrderAction;
  label: string;
  successMessage: string;
};

export type DashboardActionToast = {
  title: string;
  message?: string;
};

export function resolveDashboardOrderAction(order: DashboardOrderActionInput): DashboardOrderActionDecision | null {
  if (order.status === "cancelled" || order.status === "paid") return null;

  const paymentTransition = resolveMerchantPaymentConfirmationTransition(order);
  if (paymentTransition.allowed && (orderNeedsPaymentAttention(order) || order.status === "completed")) {
    return {
      action: "confirm-payment",
      label: orderNeedsPaymentAttention(order) ? "Xác nhận thanh toán" : confirmPaymentLabel(order.fulfillmentType),
      successMessage: "Đã xác nhận thanh toán"
    };
  }

  if (order.status === "pending") {
    return {
      action: "accept",
      label: order.fulfillmentType === "DINE_IN" ? "Nhận đơn" : "Xác nhận đơn",
      successMessage: "Đã xác nhận đơn"
    };
  }

  if (order.status === "ordering") {
    return {
      action: "complete",
      label: completeOrderLabel(order.fulfillmentType),
      successMessage: "Đã cập nhật món sẵn sàng"
    };
  }

  return null;
}

export function resolveDashboardPaymentConfirmationBody(order?: DashboardOrderActionInput | null) {
  if (!order) return undefined;
  const paymentMethod = inferManualConfirmationMethod({
    currentMethod: order.bill?.paymentMethod ?? order.paymentMethod,
    status: order.status,
    paymentStatus: order.paymentStatus ?? null,
    billStatus: order.bill?.status ?? null
  });

  return paymentMethod ? { paymentMethod } : undefined;
}

export function applyDashboardOrderOptimistic<T extends DashboardOrderOptimisticInput>(
  order: T,
  action: DashboardOrderOptimisticAction,
  options: { now?: Date; serviceDueAt?: string | null } = {}
): T {
  const nowIso = (options.now ?? new Date()).toISOString();

  if (action === "accept") {
    return {
      ...order,
      acceptedAt: order.acceptedAt ?? nowIso,
      ...(options.serviceDueAt !== undefined ? { serviceDueAt: options.serviceDueAt } : {}),
      status: "ordering"
    };
  }

  if (action === "complete") {
    return {
      ...order,
      servedAt: nowIso,
      status: "completed"
    };
  }

  if (action === "confirm-payment") {
    const transition = resolveMerchantPaymentConfirmationTransition(order);
    const next = transition.next ?? { status: "paid" as const, paymentStatus: "paid" as const };
    return {
      ...order,
      paidAt: nowIso,
      paymentStatus: next.paymentStatus,
      status: next.status
    };
  }

  if (action === "cancel") {
    return {
      ...order,
      status: "cancelled"
    };
  }

  if (action === "timer") {
    return {
      ...order,
      ...(options.serviceDueAt !== undefined ? { serviceDueAt: options.serviceDueAt } : {})
    };
  }

  return order;
}

export function resolveDashboardActionToast(action: DashboardOrderToastAction, options: { minutes?: number } = {}): DashboardActionToast {
  if (action === "accept") {
    return {
      title: "Đã nhận đơn",
      message: "Đơn đã chuyển vào bếp để xử lý."
    };
  }

  if (action === "complete") {
    return {
      title: "Đã báo món sẵn sàng",
      message: "Đơn đã chuyển sang bước giao món hoặc thu tiền."
    };
  }

  if (action === "confirm-payment") {
    return {
      title: "Đã thu tiền",
      message: "Thanh toán đã được chốt và đồng bộ về đơn hàng."
    };
  }

  if (action === "timer") {
    const minutes = options.minutes ?? 10;
    return {
      title: "Đã gia hạn bếp",
      message: `Cộng thêm ${minutes} phút cho đơn này.`
    };
  }

  if (action === "cancel") {
    return {
      title: "Đã huỷ đơn",
      message: "Đơn đã được đóng và lưu lại trong lịch sử."
    };
  }

  if (action === "delete-test") {
    return {
      title: "Đã xoá đơn test",
      message: "Dữ liệu thử nghiệm đã được dọn khỏi danh sách vận hành."
    };
  }

  if (action === "delivery-status") {
    return {
      title: "Đã cập nhật giao hàng",
      message: "Trạng thái giao hàng đã được đồng bộ cho đơn."
    };
  }

  return {
    title: "Đã xử lý yêu cầu",
    message: "Việc cần xử lý đã được đóng khỏi luồng vận hành."
  };
}

export function getDashboardActionErrorToast(error: unknown, fallback = "Thao tác thất bại"): DashboardActionToast {
  return {
    title: fallback,
    message: error instanceof Error ? error.message : "Vui lòng thử lại hoặc làm mới màn hình."
  };
}

function completeOrderLabel(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return "Sẵn sàng lấy";
  if (fulfillmentType === "DELIVERY") return "Sẵn sàng giao";
  return "Báo ra món";
}

function confirmPaymentLabel(fulfillmentType?: FulfillmentType | null) {
  if (fulfillmentType === "PICKUP") return "Hoàn tất pickup";
  if (fulfillmentType === "DELIVERY") return "Xác nhận thu";
  return "Thu tiền";
}
