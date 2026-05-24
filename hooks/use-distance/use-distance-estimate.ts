"use client";

import { useMemo } from "react";
import { calculateDistance, estimateTravelTime } from "@/services/maps/distance-service";
import type { Coordinate } from "@/services/maps/types";

export function useDistanceEstimate(origin?: Coordinate | null, destination?: Coordinate | null) {
  return useMemo(() => {
    if (!origin || !destination) return null;
    const distanceKm = calculateDistance(origin, destination);
    return {
      distanceKm,
      durationMinutes: estimateTravelTime(distanceKm)
    };
  }, [destination, origin]);
}
