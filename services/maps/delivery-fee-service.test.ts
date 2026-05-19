import assert from "node:assert/strict";
import test from "node:test";
import { calculateShippingFee } from "@/services/maps/delivery-fee-service";

test("calculateShippingFee clamps noisy fee config so quotes cannot become negative", () => {
  const quote = calculateShippingFee(3.2, {
    freeRadiusKm: -5,
    baseFee: -10_000,
    feePerKm: -4_000
  });

  assert.equal(quote.fee, 0);
  assert.equal(quote.isCustom, false);
});

test("calculateShippingFee sorts tiers and uses the first matching non-negative fee", () => {
  const quote = calculateShippingFee(2.4, {
    tiers: [
      { upToKm: 5, fee: 30_000, label: "5km" },
      { upToKm: 3, fee: 18_000, label: "3km" }
    ]
  });

  assert.equal(quote.fee, 18_000);
  assert.equal(quote.matchedTierLabel, "3km");
});

test("calculateShippingFee treats non-positive custom thresholds as disabled", () => {
  const quote = calculateShippingFee(6, {
    baseFee: 10_000,
    feePerKm: 5_000,
    customThresholdKm: -1
  });

  assert.equal(quote.isCustom, false);
  assert.equal(quote.fee, 40_000);
});
