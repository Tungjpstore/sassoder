import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDeliveryZone, pointInDeliveryPolygon } from "@/services/delivery/delivery-zone-service";

const polygon = [
  { lat: 10, lng: 106 },
  { lat: 10, lng: 107 },
  { lat: 11, lng: 107 },
  { lat: 11, lng: 106 }
];

test("pointInDeliveryPolygon detects points inside custom delivery area", () => {
  assert.equal(pointInDeliveryPolygon({ lat: 10.5, lng: 106.5 }, polygon), true);
  assert.equal(pointInDeliveryPolygon({ lat: 12, lng: 106.5 }, polygon), false);
});

test("evaluateDeliveryZone blocks exclusion zones before custom area checks", () => {
  const result = evaluateDeliveryZone({
    destination: { lat: 10.5, lng: 106.5 },
    mode: "CUSTOM",
    polygon,
    exclusionZones: [{ name: "Khu cấm giao", polygon }],
    allowOutsideDeliveryArea: true,
    requireOutsideAreaConfirmation: false
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "excluded");
  assert.equal(result.matchedExclusionName, "Khu cấm giao");
});

test("evaluateDeliveryZone can require manual confirmation outside custom area", () => {
  const result = evaluateDeliveryZone({
    destination: { lat: 12, lng: 106.5 },
    mode: "CUSTOM",
    polygon,
    exclusionZones: [],
    allowOutsideDeliveryArea: true,
    requireOutsideAreaConfirmation: true
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "outside_requires_confirmation");
  assert.equal(result.outsideCustomArea, true);
});
