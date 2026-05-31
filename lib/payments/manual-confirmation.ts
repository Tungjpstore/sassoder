import type { PaymentMethod } from "@/types/domain";

export function resolveManualConfirmationMethod({
  currentMethod,
  requestedMethod
}: {
  currentMethod?: PaymentMethod | null;
  requestedMethod?: PaymentMethod | null;
}) {
  return currentMethod ?? requestedMethod ?? null;
}
