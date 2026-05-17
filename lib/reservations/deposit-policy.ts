import type { PaymentLogStatus, ReservationDepositStatus } from "@/types/domain";

type ReservationDepositLogStatus = Exclude<PaymentLogStatus, "refunded">;

export type ReservationDepositPolicyInput = {
  depositRequiredAmount: number;
  depositPaidAmount: number;
  depositStatus: ReservationDepositStatus;
};

export type ReservationDepositDisposition = {
  nextDepositStatus: ReservationDepositStatus;
  logStatus: ReservationDepositLogStatus;
  riskEventType: "deposit_forfeited" | "refund_due" | "deposit_cancelled" | null;
  label: string;
};

export function hasCapturedReservationDeposit(reservation: ReservationDepositPolicyInput) {
  return reservation.depositPaidAmount > 0 || ["paid", "refundable", "forfeited", "refunded"].includes(reservation.depositStatus);
}

export function resolveReservationClosureDepositDisposition(
  reservation: ReservationDepositPolicyInput,
  closure: "merchant_cancel" | "customer_cancel" | "reject" | "no_show" | "expired"
): ReservationDepositDisposition | null {
  if (reservation.depositRequiredAmount <= 0 && reservation.depositPaidAmount <= 0 && reservation.depositStatus === "none") return null;

  if (closure === "no_show" && hasCapturedReservationDeposit(reservation)) {
    return {
      nextDepositStatus: "forfeited",
      logStatus: "cancelled",
      riskEventType: "deposit_forfeited",
      label: "Giữ cọc do khách không đến"
    };
  }

  if ((closure === "merchant_cancel" || closure === "reject") && hasCapturedReservationDeposit(reservation)) {
    return {
      nextDepositStatus: "refundable",
      logStatus: "cancelled",
      riskEventType: "refund_due",
      label: "Cần hoàn cọc thủ công"
    };
  }

  if (closure === "customer_cancel" && hasCapturedReservationDeposit(reservation)) {
    return {
      nextDepositStatus: "refundable",
      logStatus: "cancelled",
      riskEventType: "refund_due",
      label: "Khách huỷ sau khi đã cọc"
    };
  }

  return {
    nextDepositStatus: reservation.depositStatus,
    logStatus: "cancelled",
    riskEventType: "deposit_cancelled",
    label: "Huỷ yêu cầu cọc"
  };
}
