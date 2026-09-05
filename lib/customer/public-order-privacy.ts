import type { OrderDto } from "@/types/domain";

/**
 * Shared-table history: other diners may see open bill lines, but not private guest fields.
 */
export function sanitizeSharedTableHistoryOrder(
  order: OrderDto,
  ownerSessionId: string | null | undefined,
  viewerSessionId: string | null | undefined
): OrderDto {
  // A QR-only viewer has no durable identity proof, so treat missing session
  // context as untrusted unless it matches the order owner explicitly.
  if (viewerSessionId && ownerSessionId && ownerSessionId === viewerSessionId) {
    return order;
  }

  return {
    ...order,
    customerName: null,
    customerPhone: null,
    customerNote: null,
    deliveryAddress: null,
    deliveryLat: null,
    deliveryLng: null,
    deliveryCourierId: null,
    deliveryAssignedAt: null,
    deliveryCourier: null,
    deliveryCourierLocation: null,
    deliveryRouteGeometry: null,
    deliveryQuoteSnapshot: null,
    deliveryTrackingUpdatedAt: null,
    deliveryTrackingSnapshot: null
  };
}
