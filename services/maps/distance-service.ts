import type { Coordinate, DistanceEstimate } from "@/services/maps/types";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function isCoordinate(value: Partial<Coordinate> | null | undefined): value is Coordinate {
  return (
    typeof value?.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value?.lng === "number" &&
    Number.isFinite(value.lng)
  );
}

export function calculateDistance(origin: Coordinate, destination: Coordinate) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 100) / 100;
}

export function estimateTravelTime(
  distanceKm: number,
  options: {
    urbanSpeedKph?: number;
    preparationMinutes?: number;
    minimumMinutes?: number;
  } = {}
): number {
  const urbanSpeedKph = options.urbanSpeedKph ?? 18;
  const preparationMinutes = options.preparationMinutes ?? 0;
  const minimumMinutes = options.minimumMinutes ?? 8;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return minimumMinutes + preparationMinutes;
  const minutes = Math.round((distanceKm / urbanSpeedKph) * 60);
  return Math.max(minimumMinutes, minutes) + preparationMinutes;
}

export function buildDistanceEstimate(origin: Coordinate, destination: Coordinate): DistanceEstimate {
  const distanceKm = calculateDistance(origin, destination);
  return {
    distanceKm,
    durationMinutes: estimateTravelTime(distanceKm)
  };
}
