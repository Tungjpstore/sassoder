import { getCustomerOrderLifecycle } from "@/lib/customer/order-lifecycle";
import type { OrderDto } from "@/types/domain";

export const CUSTOMER_ORDER_POLL_FAST_MS = 8_000;
export const CUSTOMER_ORDER_POLL_PAYMENT_MS = 12_000;

type SyncOrder = Pick<
  OrderDto,
  | "status"
  | "paymentStatus"
  | "paymentMethod"
  | "fulfillmentType"
  | "deliveryStatus"
  | "total"
  | "paidAt"
  | "updatedAt"
  | "deliveryDistanceKm"
  | "deliveryFee"
  | "serviceFee"
  | "deliveryRouteDurationMinutes"
  | "deliveryTrackingUpdatedAt"
  | "deliveryCourierLocation"
>;

function locationFingerprint(order?: Pick<SyncOrder, "deliveryCourierLocation"> | null) {
  const location = order?.deliveryCourierLocation;
  if (!location) return "";
  return [
    location.lat,
    location.lng,
    location.accuracyMeters ?? "",
    location.headingDegrees ?? "",
    location.speedMps ?? "",
    location.capturedAt ?? ""
  ].join(":");
}

export function hasCustomerOrderSnapshotChanged(previous?: SyncOrder | null, next?: SyncOrder | null) {
  if (!previous || !next) return Boolean(previous || next);

  return (
    previous.status !== next.status ||
    previous.paymentStatus !== next.paymentStatus ||
    previous.paymentMethod !== next.paymentMethod ||
    previous.deliveryStatus !== next.deliveryStatus ||
    previous.total !== next.total ||
    previous.paidAt !== next.paidAt ||
    previous.updatedAt !== next.updatedAt ||
    previous.deliveryDistanceKm !== next.deliveryDistanceKm ||
    previous.deliveryFee !== next.deliveryFee ||
    previous.serviceFee !== next.serviceFee ||
    previous.deliveryRouteDurationMinutes !== next.deliveryRouteDurationMinutes ||
    previous.deliveryTrackingUpdatedAt !== next.deliveryTrackingUpdatedAt ||
    locationFingerprint(previous) !== locationFingerprint(next)
  );
}

export function getCustomerOrderPollingInterval(order?: SyncOrder | null, options?: { networkOnline?: boolean; pageVisible?: boolean }) {
  if (!order || options?.networkOnline === false || options?.pageVisible === false) return null;

  const lifecycle = getCustomerOrderLifecycle(order);
  if (lifecycle.isClosed) return null;
  if (lifecycle.state === "awaiting_payment" || lifecycle.state === "awaiting_payment_confirmation") {
    return CUSTOMER_ORDER_POLL_PAYMENT_MS;
  }

  return CUSTOMER_ORDER_POLL_FAST_MS;
}
