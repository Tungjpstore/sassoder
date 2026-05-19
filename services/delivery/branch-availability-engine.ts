import { resolveRestaurantAvailability } from "@/services/delivery/availability-engine";

export type DeliveryStoreAvailabilityMetadata = {
  acceptingDelivery?: boolean;
  deliveryPaused?: boolean;
  temporarilyClosed?: boolean;
  openingTime?: string | null;
  closingTime?: string | null;
  availabilityNote?: string | null;
};

export type DeliveryStoreAvailability = {
  isAvailable: boolean;
  reason?: string;
};

export function resolveDeliveryStoreAvailability(
  storeName: string,
  metadata?: DeliveryStoreAvailabilityMetadata | null
): DeliveryStoreAvailability {
  if (metadata?.acceptingDelivery === false || metadata?.deliveryPaused || metadata?.temporarilyClosed) {
    return {
      isAvailable: false,
      reason: metadata.availabilityNote || `${storeName} đang tạm dừng nhận đơn giao hàng.`
    };
  }

  if (metadata?.openingTime && metadata?.closingTime) {
    const availability = resolveRestaurantAvailability({
      openingTime: metadata.openingTime,
      closingTime: metadata.closingTime
    });
    if (!availability.isOpen) {
      return {
        isAvailable: false,
        reason: metadata.availabilityNote || availability.reason
      };
    }
  }

  return { isAvailable: true };
}
