import type { DeliveryPricingConfig } from "@/services/maps/types";

export type ShippingFeeQuote = {
  fee: number;
  isCustom: boolean;
  matchedTierLabel?: string;
};

export function calculateShippingFee(distanceKm: number, config: DeliveryPricingConfig): ShippingFeeQuote {
  const safeDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;

  if (config.tiers?.length) {
    const tier = [...config.tiers]
      .sort((left, right) => left.upToKm - right.upToKm)
      .find((item) => safeDistance <= item.upToKm);

    if (tier) {
      return {
        fee: tier.fee,
        isCustom: false,
        matchedTierLabel: tier.label
      };
    }

    return {
      fee: 0,
      isCustom: true,
      matchedTierLabel: "custom"
    };
  }

  if (config.customThresholdKm && safeDistance > config.customThresholdKm) {
    return {
      fee: 0,
      isCustom: true,
      matchedTierLabel: "custom"
    };
  }

  if (safeDistance <= (config.freeRadiusKm ?? 0)) {
    return {
      fee: 0,
      isCustom: false,
      matchedTierLabel: "free"
    };
  }

  const paidDistance = Math.max(0, safeDistance - (config.freeRadiusKm ?? 0));
  const fee = Math.round((config.baseFee ?? 0) + Math.ceil(paidDistance) * (config.feePerKm ?? 0));
  return {
    fee,
    isCustom: false
  };
}
