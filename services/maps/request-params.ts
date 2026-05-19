import { MapApiError } from "@/services/maps/errors";
import { normalizeCoordinateValue } from "@/lib/geolocation/coordinates";
import type { GeocodingProvider, MapRequestContext, RoutingProvider } from "@/services/maps/types";

const geocodingProviders = new Set<GeocodingProvider>(["goong", "mapbox", "vietmap", "nominatim"]);
const routingProviders = new Set<RoutingProvider>(["goong", "mapbox", "vietmap", "osrm"]);

export function parseMapLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), max);
}

export function parseCoordinateParam(value: string | null, label: string, min: number, max: number) {
  const parsed = normalizeCoordinateValue(value, min, max);
  if (parsed === null) {
    throw new MapApiError(`${label} không hợp lệ.`, 400, "MAP_INVALID_REQUEST");
  }
  return parsed;
}

export function parseOptionalGeocodingProvider(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && geocodingProviders.has(normalized as GeocodingProvider)
    ? normalized as GeocodingProvider
    : undefined;
}

export function parseOptionalRoutingProvider(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && routingProviders.has(normalized as RoutingProvider)
    ? normalized as RoutingProvider
    : undefined;
}

export function mapRequestContext(searchParams: URLSearchParams, source: MapRequestContext["source"]): MapRequestContext {
  return {
    restaurantId: searchParams.get("restaurantId"),
    restaurantSlug: searchParams.get("restaurantSlug"),
    source
  };
}
