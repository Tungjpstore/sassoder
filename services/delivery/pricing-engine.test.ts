import assert from "node:assert/strict";
import test from "node:test";
import { quoteDeliveryPricing } from "@/services/delivery/pricing-engine";

test("quoteDeliveryPricing keeps tier contact as a manual confirmation", () => {
  const quote = quoteDeliveryPricing({
    distanceKm: 8,
    subtotal: 100_000,
    deliveryFeeEnabled: true,
    freeRadiusKm: 0,
    baseFee: 15_000,
    feePerKm: 5_000,
    tiers: [{ upToKm: null, fee: null, contact: true, label: "Liên hệ" }]
  });

  assert.equal(quote.requiresContact, true);
  assert.equal(quote.fee, 0);
  assert.equal(quote.matchedTierLabel, "Liên hệ");
});

test("quoteDeliveryPricing applies free shipping threshold before fallback fees", () => {
  const quote = quoteDeliveryPricing({
    distanceKm: 4,
    subtotal: 250_000,
    deliveryFeeEnabled: true,
    freeRadiusKm: 0,
    baseFee: 15_000,
    feePerKm: 5_000,
    freeShippingThreshold: 200_000
  });

  assert.equal(quote.freeShippingApplied, true);
  assert.equal(quote.fee, 0);
});

test("quoteDeliveryPricing calculates fallback distance fees with future multipliers", () => {
  const quote = quoteDeliveryPricing({
    distanceKm: 2.2,
    subtotal: 100_000,
    deliveryFeeEnabled: true,
    freeRadiusKm: 1,
    baseFee: 10_000,
    feePerKm: 5_000,
    peakHourMultiplier: 1.2,
    weatherMultiplier: 1.5
  });

  assert.equal(quote.fee, 36_000);
  assert.equal(quote.multipliers.effective, 1.8);
});
