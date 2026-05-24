import { calculateShippingFee } from "@/services/maps/delivery-fee-service";

export type DeliveryPricingTierInput = {
  upToKm: number | null;
  fee: number | null;
  label?: string;
  contact?: boolean;
};

export type DeliveryPricingEngineInput = {
  distanceKm: number;
  subtotal: number;
  deliveryFeeEnabled: boolean;
  freeRadiusKm: number;
  baseFee: number;
  feePerKm: number;
  customThresholdKm?: number;
  freeShippingThreshold?: number | null;
  peakHourMultiplier?: number;
  weatherMultiplier?: number;
  tiers?: DeliveryPricingTierInput[];
};

export type DeliveryPricingQuote = {
  fee: number;
  requiresContact: boolean;
  freeShippingApplied: boolean;
  matchedTierLabel?: string;
  pricingVersion: "delivery-pricing-v1";
  multipliers: {
    peakHour: number;
    weather: number;
    effective: number;
  };
};

function resolveTierDeliveryFee(distanceKm: number, tiers: DeliveryPricingTierInput[] = []) {
  const tier = [...tiers]
    .map((candidate) => ({
      ...candidate,
      upToKm: candidate.upToKm === null || !Number.isFinite(candidate.upToKm) ? null : Math.max(0, Number(candidate.upToKm)),
      fee: candidate.fee === null || !Number.isFinite(candidate.fee) ? null : Math.max(0, Number(candidate.fee))
    }))
    .sort((left, right) => {
      if (left.upToKm === null && right.upToKm === null) return 0;
      if (left.upToKm === null) return 1;
      if (right.upToKm === null) return -1;
      return left.upToKm - right.upToKm;
    })
    .find((candidate) => candidate.upToKm === null || distanceKm <= candidate.upToKm);
  if (!tier) return null;
  if (tier.contact) return { fee: 0, contact: true, label: tier.label ?? "contact" };
  return { fee: tier.fee ?? 0, contact: false, label: tier.label };
}

function normalizeMultiplier(value: number | undefined) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Number(value), 0), 5);
}

export function quoteDeliveryPricing(input: DeliveryPricingEngineInput): DeliveryPricingQuote {
  const peakHour = normalizeMultiplier(input.peakHourMultiplier);
  const weather = normalizeMultiplier(input.weatherMultiplier);
  const effectiveMultiplier = Math.round(peakHour * weather * 100) / 100;
  const freeShippingApplied = Boolean(input.freeShippingThreshold && input.subtotal >= input.freeShippingThreshold);
  const tierFee = resolveTierDeliveryFee(input.distanceKm, input.tiers);

  if (tierFee?.contact) {
    return {
      fee: 0,
      requiresContact: true,
      freeShippingApplied: false,
      matchedTierLabel: tierFee.label,
      pricingVersion: "delivery-pricing-v1",
      multipliers: { peakHour, weather, effective: effectiveMultiplier }
    };
  }

  if (!input.deliveryFeeEnabled || freeShippingApplied) {
    return {
      fee: 0,
      requiresContact: false,
      freeShippingApplied,
      matchedTierLabel: freeShippingApplied ? "free-shipping-threshold" : tierFee?.label,
      pricingVersion: "delivery-pricing-v1",
      multipliers: { peakHour, weather, effective: effectiveMultiplier }
    };
  }

  const baseFee = tierFee?.fee ?? calculateShippingFee(input.distanceKm, {
    freeRadiusKm: input.freeRadiusKm,
    baseFee: input.baseFee,
    feePerKm: input.feePerKm,
    customThresholdKm: input.customThresholdKm
  }).fee;

  return {
    fee: Math.round(baseFee * effectiveMultiplier),
    requiresContact: false,
    freeShippingApplied: false,
    matchedTierLabel: tierFee?.label,
    pricingVersion: "delivery-pricing-v1",
    multipliers: { peakHour, weather, effective: effectiveMultiplier }
  };
}
