import assert from "node:assert/strict";
import test from "node:test";
import { rankDispatchCandidates, type DispatchCourierCandidate } from "@/services/delivery/dispatch-ranking-engine";
import type { DistanceMatrixCell } from "@/services/maps/types";

const now = new Date("2026-05-17T10:00:00.000Z");
const job = {
  pickup: { lat: 10.7769, lng: 106.7009 },
  dropoff: { lat: 10.79, lng: 106.71 }
};

const candidates: DispatchCourierCandidate[] = [
  {
    id: "far",
    name: "Bình",
    status: "available",
    lastLocationAt: "2026-05-17T09:58:00.000Z",
    location: { lat: 10.81, lng: 106.73, capturedAt: "2026-05-17T09:58:00.000Z" }
  },
  {
    id: "near",
    name: "An",
    status: "available",
    lastLocationAt: "2026-05-17T09:59:00.000Z",
    location: { lat: 10.777, lng: 106.701, capturedAt: "2026-05-17T09:59:00.000Z" }
  },
  {
    id: "offline",
    name: "Chi",
    status: "offline",
    lastLocationAt: "2026-05-17T09:59:00.000Z",
    location: { lat: 10.777, lng: 106.701, capturedAt: "2026-05-17T09:59:00.000Z" }
  }
];

test("rankDispatchCandidates recommends the nearest available courier first", async () => {
  const ranked = await rankDispatchCandidates(job, candidates, {
    now,
    matrixResolver: async (origins): Promise<DistanceMatrixCell[]> =>
      origins.map((origin) => ({
        originId: origin.id,
        destinationId: "pickup",
        distanceKm: origin.id === "near" ? 0.3 : 4.8,
        durationMinutes: origin.id === "near" ? 3 : 22,
        provider: "goong",
        confidence: "high",
        isEstimated: false
      }))
  });

  assert.equal(ranked[0].id, "near");
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].eligible, true);
  assert.equal(ranked.at(-1)?.id, "offline");
  assert.equal(ranked.at(-1)?.eligible, false);
});

test("rankDispatchCandidates penalizes missing GPS even when courier is available", async () => {
  const ranked = await rankDispatchCandidates(
    job,
    [
      { id: "no-gps", name: "Không GPS", status: "available" },
      {
        id: "busy-with-gps",
        name: "Đang giao",
        status: "busy",
        activeOrderCount: 1,
        location: { lat: 10.777, lng: 106.701, capturedAt: "2026-05-17T09:59:00.000Z" }
      }
    ],
    {
      now,
      matrixResolver: async (origins): Promise<DistanceMatrixCell[]> =>
        origins.map((origin) => ({
          originId: origin.id,
          destinationId: "pickup",
          distanceKm: 0.4,
          durationMinutes: 4,
          provider: "haversine",
          confidence: "low",
          isEstimated: true
        }))
    }
  );

  assert.equal(ranked[0].id, "busy-with-gps");
  assert.equal(ranked[0].eligible, true);
  assert.equal(ranked[1].id, "no-gps");
  assert.equal(ranked[1].eligible, false);
});
