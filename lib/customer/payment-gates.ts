/**
 * Shared customer payment readiness gates (dine-in + remote).
 * Keep FE and AI action handlers aligned with backend checkout/paid rules.
 */

export type PaymentGateOrder = {
  status?: string | null;
  paymentStatus?: string | null;
  bill?: { status?: string | null } | null;
};

/** True when the diner may open checkout (not while still pending merchant accept). */
export function canStartDineInPayment(order: PaymentGateOrder | null | undefined) {
  if (!order?.status) return false;
  if (order.status === "cancelled" || order.status === "pending") return false;
  return (
    ["ordering", "completed", "waiting_payment", "waiting_confirm", "paid"].includes(order.status) ||
    Boolean(order.bill)
  );
}

/** True when "Tôi đã chuyển khoản" is valid (already in QR payment flow). */
export function canMarkCustomerPaid(order: PaymentGateOrder | null | undefined) {
  if (!order) return false;
  return (
    order.status === "waiting_payment" ||
    order.paymentStatus === "waiting_payment" ||
    order.status === "waiting_confirm" ||
    order.paymentStatus === "waiting_confirm" ||
    order.bill?.status === "waiting_payment" ||
    order.bill?.status === "waiting_confirm"
  );
}
