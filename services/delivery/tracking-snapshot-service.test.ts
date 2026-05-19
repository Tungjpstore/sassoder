import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveryTrackingSnapshot } from "@/services/delivery/tracking-snapshot-service";

const now = new Date("2026-05-17T10:00:00.000Z");

test("buildDeliveryTrackingSnapshot reports missing courier GPS", () => {
  const snapshot = buildDeliveryTrackingSnapshot({
    deliveryStatus: "out_for_delivery",
    destination: { lat: 10.78, lng: 106.7 },
    now
  });

  assert.equal(snapshot.state, "assigned");
  assert.equal(snapshot.courierEtaMinutes, null);
});

test("buildDeliveryTrackingSnapshot estimates active courier distance", () => {
  const snapshot = buildDeliveryTrackingSnapshot({
    deliveryStatus: "out_for_delivery",
    destination: { lat: 10.78, lng: 106.7 },
    courierLocation: { lat: 10.77, lng: 106.69 },
    capturedAt: "2026-05-17T09:59:00.000Z",
    now
  });

  assert.equal(snapshot.state, "moving");
  assert.equal(snapshot.locationIsStale, false);
  assert.equal(typeof snapshot.courierDistanceToCustomerKm, "number");
});

test("buildDeliveryTrackingSnapshot flags stale courier GPS", () => {
  const snapshot = buildDeliveryTrackingSnapshot({
    deliveryStatus: "out_for_delivery",
    destination: { lat: 10.78, lng: 106.7 },
    courierLocation: { lat: 10.77, lng: 106.69 },
    capturedAt: "2026-05-17T09:30:00.000Z",
    now
  });

  assert.equal(snapshot.state, "stale");
  assert.equal(snapshot.locationAgeMinutes, 30);
});
