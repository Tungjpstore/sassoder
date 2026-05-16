import type { DeliveryStatus, OrderStatus, PaymentMethod, PaymentStatus, ReservationDepositStatus, ReservationStatus } from "@/types/domain";

export function orderStatusLabel(status: string) {
  const labels: Record<OrderStatus, string> = {
    pending: "Chờ quán xác nhận",
    ordering: "Đang ra món",
    waiting_payment: "Chờ thanh toán",
    waiting_confirm: "Chờ xác nhận",
    paid: "Đã thanh toán",
    completed: "Đã phục vụ",
    cancelled: "Đã huỷ"
  };

  return labels[status as OrderStatus] ?? status;
}

export function paymentMethodLabel(method: PaymentMethod | null | undefined) {
  if (!method) return "Chưa chọn";
  return method === "QR" ? "VietQR" : "Tiền mặt";
}

export function paymentStatusLabel(status: PaymentStatus | string | null | undefined) {
  const labels: Record<PaymentStatus, string> = {
    unpaid: "Chưa thanh toán",
    waiting_payment: "Chờ chuyển khoản",
    waiting_confirm: "Chờ quán xác nhận",
    paid: "Đã thanh toán",
    failed: "Thanh toán lỗi",
    refunded: "Đã hoàn tiền"
  };

  return status ? labels[status as PaymentStatus] ?? status : "Chưa thanh toán";
}

export function deliveryStatusLabel(status: DeliveryStatus | string | null | undefined) {
  const labels: Record<DeliveryStatus, string> = {
    none: "Không giao hàng",
    requested: "Chờ nhận giao",
    accepted: "Đã nhận giao",
    out_for_delivery: "Đang giao",
    delivered: "Đã giao",
    rejected: "Từ chối giao"
  };

  return status ? labels[status as DeliveryStatus] ?? status : "Không giao hàng";
}

export function reservationStatusLabel(status: ReservationStatus | string | null | undefined) {
  const labels: Record<ReservationStatus, string> = {
    draft: "Nháp",
    pending: "Chờ quán xác nhận",
    holding: "Đang giữ bàn",
    waiting_deposit_confirm: "Chờ xác nhận cọc",
    confirmed: "Đã xác nhận",
    checked_in: "Đã check-in",
    seated: "Khách đã đến",
    completed: "Đã hoàn tất",
    cancelled: "Đã huỷ",
    rejected: "Quán từ chối",
    expired: "Đã hết hạn",
    no_show: "Khách không đến"
  };

  return status ? labels[status as ReservationStatus] ?? status : "Không rõ";
}

export function reservationDepositStatusLabel(status: ReservationDepositStatus | string | null | undefined) {
  const labels: Record<ReservationDepositStatus, string> = {
    none: "Không cần cọc",
    required: "Cần cọc",
    waiting_payment: "Chờ chuyển cọc",
    waiting_confirm: "Chờ xác nhận cọc",
    paid: "Đã nhận cọc",
    refundable: "Có thể hoàn cọc",
    forfeited: "Đã giữ cọc",
    refunded: "Đã hoàn cọc"
  };

  return status ? labels[status as ReservationDepositStatus] ?? status : "Không cần cọc";
}
