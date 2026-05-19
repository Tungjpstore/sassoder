import type { DeliveryPricingConfig } from "@/services/maps/types";

export type ShippingFeeQuote = {
  fee: number;
  isCustom: boolean;
  matchedTierLabel?: string;
};

function nonNegativeNumber(value: number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function calculateShippingFee(distanceKm: number, config: DeliveryPricingConfig): ShippingFeeQuote {
  const safeDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const freeRadiusKm = nonNegativeNumber(config.freeRadiusKm);
  const baseFee = nonNegativeNumber(config.baseFee);
  const feePerKm = nonNegativeNumber(config.feePerKm);
  const customThresholdKm = nonNegativeNumber(config.customThresholdKm);

  if (config.tiers?.length) {
    const tier = [...config.tiers]
      .map((item) => ({
        ...item,
        upToKm: nonNegativeNumber(item.upToKm),
        fee: nonNegativeNumber(item.fee)
      }))
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

  if (customThresholdKm > 0 && safeDistance > customThresholdKm) {
    return {
      fee: 0,
      isCustom: true,
      matchedTierLabel: "custom"
    };
  }

  if (safeDistance <= freeRadiusKm) {
    return {
      fee: 0,
      isCustom: false,
      matchedTierLabel: "free"
    };
  }

  const paidDistance = Math.max(0, safeDistance - freeRadiusKm);
  const fee = Math.round(baseFee + Math.ceil(paidDistance) * feePerKm);
  return {
    fee,
    isCustom: false
  };
}
