import type { OrderDto } from "@/types/domain";

/**
 * Shared-table history: other diners may see open bill lines, but not private guest fields.
 */
export function sanitizeSharedTableHistoryOrder(
  order: OrderDto,
  ownerSessionId: string | null | undefined,
  viewerSessionId: string | null | undefined
): OrderDto {
  if (!viewerSessionId || !ownerSessionId || ownerSessionId === viewerSessionId) {
    return order;
  }

  return {
    ...order,
    customerName: null,
    customerPhone: null,
    customerNote: null
  };
}
