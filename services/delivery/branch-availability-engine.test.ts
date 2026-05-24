import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeliveryStoreAvailability } from "@/services/delivery/branch-availability-engine";

test("resolveDeliveryStoreAvailability blocks paused branches", () => {
  const availability = resolveDeliveryStoreAvailability("CN Q1", {
    deliveryPaused: true,
    availabilityNote: "Bếp quá tải"
  });

  assert.equal(availability.isAvailable, false);
  assert.equal(availability.reason, "Bếp quá tải");
});

test("resolveDeliveryStoreAvailability allows branches without availability metadata", () => {
  assert.equal(resolveDeliveryStoreAvailability("CN Q3").isAvailable, true);
});
