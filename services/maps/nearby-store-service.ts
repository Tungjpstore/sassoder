import { buildDistanceEstimate } from "@/services/maps/distance-service";
import type { Coordinate, NearbyStoreCandidate, NearbyStoreResult } from "@/services/maps/types";

export function findNearestStore<TMeta = Record<string, unknown>>(
  origin: Coordinate,
  stores: NearbyStoreCandidate<TMeta>[]
): NearbyStoreResult<TMeta> | null {
  let best: NearbyStoreResult<TMeta> | null = null;

  for (const store of stores) {
    const estimate = buildDistanceEstimate(origin, { lat: store.lat, lng: store.lng });
    if (!best || estimate.distanceKm < best.distanceKm || (estimate.distanceKm === best.distanceKm && store.isPrimary)) {
      best = {
        store,
        distanceKm: estimate.distanceKm,
        durationMinutes: estimate.durationMinutes
      };
    }
  }

  return best;
}
