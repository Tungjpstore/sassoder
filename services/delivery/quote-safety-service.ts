import { normalizeCoordinatePair } from "@/lib/geolocation/coordinates";
import type { Coordinate, RouteConfidence } from "@/services/maps/types";

export type DeliveryQuoteSafetyIssue =
  | "missing_distance"
  | "negative_distance"
  | "negative_fee"
  | "negative_service_fee"
  | "invalid_eta"
  | "eta_below_route_duration"
  | "invalid_origin"
  | "invalid_destination"
  | "invalid_route_duration"
  | "invalid_nearest_store"
  | "invalid_route_confidence";

export type DeliveryQuoteSafetyInput = {
  distanceKm: number | null;
  fee: number;
  serviceFee: number;
  etaMinutes: number;
  origin?: Partial<Coordinate> | null;
  destination?: Partial<Coordinate> | null;
  routeDurationMinutes?: number | null;
  nearestStore?: {
    id?: string | null;
    distanceKm?: number | null;
    durationMinutes?: number | null;
  } | null;
  confidence?: RouteConfidence;
};

const routeConfidences = new Set<RouteConfidence>(["high", "medium", "low"]);

function isNonNegativeFinite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasValidPoint(point: Partial<Coordinate> | null | undefined) {
  return Boolean(point && normalizeCoordinatePair(point.lat, point.lng));
}

function hasValidNearestStore(input: DeliveryQuoteSafetyInput["nearestStore"]) {
  if (!input) return true;
  return Boolean(
    input.id &&
      isNonNegativeFinite(input.distanceKm ?? null) &&
      isPositiveFinite(input.durationMinutes ?? null)
  );
}

export function getAcceptedDeliveryQuoteSafetyIssues(input: DeliveryQuoteSafetyInput) {
  const issues: DeliveryQuoteSafetyIssue[] = [];

  if (typeof input.distanceKm !== "number" || !Number.isFinite(input.distanceKm)) issues.push("missing_distance");
  else if (input.distanceKm < 0) issues.push("negative_distance");

  if (!isNonNegativeFinite(input.fee)) issues.push("negative_fee");
  if (!isNonNegativeFinite(input.serviceFee)) issues.push("negative_service_fee");
  if (!isPositiveFinite(input.etaMinutes)) issues.push("invalid_eta");
  if (!hasValidPoint(input.origin)) issues.push("invalid_origin");
  if (!hasValidPoint(input.destination)) issues.push("invalid_destination");

  if (input.routeDurationMinutes !== null && input.routeDurationMinutes !== undefined) {
    if (!isPositiveFinite(input.routeDurationMinutes)) issues.push("invalid_route_duration");
    else if (isPositiveFinite(input.etaMinutes) && input.etaMinutes < input.routeDurationMinutes) issues.push("eta_below_route_duration");
  }

  if (!hasValidNearestStore(input.nearestStore)) issues.push("invalid_nearest_store");
  if (input.confidence && !routeConfidences.has(input.confidence)) issues.push("invalid_route_confidence");

  return issues;
}

export function isAcceptedDeliveryQuoteSafe(input: DeliveryQuoteSafetyInput) {
  return getAcceptedDeliveryQuoteSafetyIssues(input).length === 0;
}
