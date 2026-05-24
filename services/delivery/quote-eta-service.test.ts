import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeliveryQuoteEtaMinutes } from "@/services/delivery/quote-eta-service";

test("resolveDeliveryQuoteEtaMinutes never exposes a route-only ETA below the configured delivery ETA", () => {
  assert.equal(
    resolveDeliveryQuoteEtaMinutes({
      showRouteEta: true,
      routeDurationMinutes: 6,
      configuredEtaMinutes: 25
    }),
    25
  );
});

test("resolveDeliveryQuoteEtaMinutes uses the longer routed duration for far deliveries", () => {
  assert.equal(
    resolveDeliveryQuoteEtaMinutes({
      showRouteEta: true,
      routeDurationMinutes: 44,
      configuredEtaMinutes: 25
    }),
    44
  );
});

test("resolveDeliveryQuoteEtaMinutes falls back to configured ETA when route ETA is hidden or missing", () => {
  assert.equal(
    resolveDeliveryQuoteEtaMinutes({
      showRouteEta: false,
      routeDurationMinutes: 44,
      configuredEtaMinutes: 25
    }),
    25
  );
  assert.equal(
    resolveDeliveryQuoteEtaMinutes({
      showRouteEta: true,
      routeDurationMinutes: null,
      configuredEtaMinutes: 25
    }),
    25
  );
});
