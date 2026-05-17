import type { PaymentMethod } from "@/types/domain";

export type PaymentEntitlementFeature = "vietqr_payments" | "cash_payments";

export function paymentMethodToEntitlementFeature(method: PaymentMethod): PaymentEntitlementFeature {
  switch (method) {
    case "QR":
      return "vietqr_payments";
    case "CASH":
      return "cash_payments";
    default: {
      const exhaustive: never = method;
      return exhaustive;
    }
  }
}
