import type { OrderStatus, PaymentMethod, PaymentStatus, TableBillStatus } from "@/types/domain";

export function resolveManualConfirmationMethod({
  currentMethod,
  requestedMethod
}: {
  currentMethod?: PaymentMethod | null;
  requestedMethod?: PaymentMethod | null;
}) {
  return currentMethod ?? requestedMethod ?? null;
}

export function inferManualConfirmationMethod({
  currentMethod,
  requestedMethod,
  status,
  paymentStatus,
  billStatus
}: {
  currentMethod?: PaymentMethod | null;
  requestedMethod?: PaymentMethod | null;
  status?: OrderStatus | null;
  paymentStatus?: PaymentStatus | null;
  billStatus?: TableBillStatus | null;
}) {
  const explicitMethod = resolveManualConfirmationMethod({ currentMethod, requestedMethod });
  if (explicitMethod) return explicitMethod;

  if (billStatus === "waiting_payment" || status === "waiting_payment" || paymentStatus === "waiting_payment") {
    return "QR";
  }

  if (billStatus === "waiting_confirm" || status === "waiting_confirm" || paymentStatus === "waiting_confirm") {
    return "CASH";
  }

  // Kitchen-ready / served (status completed) must send an explicit paymentMethod
  // from the merchant UI ("Thu tiền mặt") — do not invent CASH silently.
  return null;
}
