import assert from "node:assert/strict";
import test from "node:test";
import {
  getAcceptedDeliveryQuoteSafetyIssues,
  isAcceptedDeliveryQuoteSafe
} from "@/services/delivery/quote-safety-service";

const safeQuote = {
  distanceKm: 4.2,
  fee: 30_000,
  serviceFee: 2_000,
  etaMinutes: 25,
  origin: { lat: 10.7769, lng: 106.7009 },
  destination: { lat: 10.79, lng: 106.71 },
  routeDurationMinutes: 15,
  nearestStore: {
    id: "store-1",
    distanceKm: 4.2,
    durationMinutes: 15
  },
  confidence: "high" as const
};

test("isAcceptedDeliveryQuoteSafe accepts complete non-negative quote data", () => {
  assert.equal(isAcceptedDeliveryQuoteSafe(safeQuote), true);
});

test("getAcceptedDeliveryQuoteSafetyIssues blocks wrong fee and impossible coordinates", () => {
  const issues = getAcceptedDeliveryQuoteSafetyIssues({
    ...safeQuote,
    fee: -1,
    origin: { lat: 91, lng: 106.7009 }
  });

  assert.deepEqual(issues, ["negative_fee", "invalid_origin"]);
});

test("getAcceptedDeliveryQuoteSafetyIssues blocks accepted quotes without ETA or destination", () => {
  const issues = getAcceptedDeliveryQuoteSafetyIssues({
    ...safeQuote,
    etaMinutes: 0,
    destination: null
  });

  assert.deepEqual(issues, ["invalid_eta", "invalid_destination"]);
});

test("getAcceptedDeliveryQuoteSafetyIssues blocks impossible ETA below routed duration", () => {
  const issues = getAcceptedDeliveryQuoteSafetyIssues({
    ...safeQuote,
    etaMinutes: 10,
    routeDurationMinutes: 15
  });

  assert.deepEqual(issues, ["eta_below_route_duration"]);
});
