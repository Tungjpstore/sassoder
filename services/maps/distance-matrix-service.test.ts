import assert from "node:assert/strict";
import test from "node:test";
import { resolveDistanceMatrix } from "@/services/maps/distance-matrix-service";
import type { DistanceMatrixPoint, ResolvedRouteResult } from "@/services/maps/types";

const origin: DistanceMatrixPoint = { id: "store", lat: 10.7769, lng: 106.7009 };
const destination: DistanceMatrixPoint = { id: "customer", lat: 10.79, lng: 106.71 };

test("resolveDistanceMatrix routes small matrices through the resolver", async () => {
  const cells = await resolveDistanceMatrix([origin], [destination], {
    resolver: async (): Promise<ResolvedRouteResult> => ({
      distanceKm: 2.4,
      durationMinutes: 12,
      geometry: null,
      provider: "goong",
      confidence: "high",
      isEstimated: false,
      fallbackChain: ["goong"]
    })
  });

  assert.equal(cells.length, 1);
  assert.equal(cells[0].distanceKm, 2.4);
  assert.equal(cells[0].provider, "goong");
  assert.equal(cells[0].isEstimated, false);
});

test("resolveDistanceMatrix falls back to estimated cells when matrix is too large", async () => {
  const cells = await resolveDistanceMatrix([origin, { ...origin, id: "store-2" }], [destination, { ...destination, id: "customer-2" }], {
    maxRoutedPairs: 2,
    resolver: async () => {
      throw new Error("resolver should not run");
    }
  });

  assert.equal(cells.length, 4);
  assert.equal(cells.every((cell) => cell.provider === "haversine"), true);
  assert.equal(cells.every((cell) => cell.isEstimated), true);
});

test("resolveDistanceMatrix downgrades one failed route without failing the batch", async () => {
  const cells = await resolveDistanceMatrix([origin], [destination], {
    resolver: async () => {
      throw new Error("provider timeout");
    }
  });

  assert.equal(cells.length, 1);
  assert.equal(cells[0].provider, "haversine");
  assert.equal(cells[0].confidence, "low");
});
