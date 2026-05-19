import {
  fetchJson,
  getGeocodingCountryParam,
  getGeocodingLanguage,
  getMapboxAccessToken,
  normalizeLabel,
  toCoordinate
} from "@/services/maps/provider-runtime";
import type { Coordinate, GeocodingResult, MapRequestContext, RouteResult } from "@/services/maps/types";
import type { GeocoderProviderClient, RoutingProviderClient } from "@/services/maps/providers/types";

function parseGeocodingResults(
  features: Array<{
    id?: string;
    properties?: {
      full_address?: string;
      coordinates?: { latitude?: number; longitude?: number };
      place_formatted?: string;
      name?: string;
    };
    geometry?: { coordinates?: number[] };
    name?: string;
  }>
) {
  return features
    .map((feature) => {
      const coordinate = toCoordinate(
        feature.properties?.coordinates?.latitude ?? feature.geometry?.coordinates?.[1],
        feature.properties?.coordinates?.longitude ?? feature.geometry?.coordinates?.[0]
      );
      if (!coordinate) return null;

      return {
        id: feature.id ?? `mapbox-${coordinate.lat}-${coordinate.lng}`,
        provider: "mapbox" as const,
        address: feature.properties?.full_address ?? feature.properties?.place_formatted ?? feature.name ?? "",
        label: feature.properties?.full_address ?? feature.properties?.place_formatted ?? feature.name ?? "",
        shortLabel: normalizeLabel([feature.properties?.name ?? feature.name, feature.properties?.place_formatted]),
        ...coordinate
      };
    })
    .filter(Boolean) as GeocodingResult[];
}

async function search(query: string, limit: number, context?: MapRequestContext) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) return [];

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  const countryParam = getGeocodingCountryParam();
  if (countryParam) url.searchParams.set("country", countryParam);
  url.searchParams.set("language", getGeocodingLanguage());
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("access_token", accessToken);

  const data = await fetchJson<{ features?: Array<unknown> }>(url, {
    telemetry: { operation: "geocode", provider: "mapbox", context }
  });
  return parseGeocodingResults((data?.features ?? []) as Parameters<typeof parseGeocodingResults>[0]);
}

async function reverse(point: Coordinate, context?: MapRequestContext) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) return null;

  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("language", getGeocodingLanguage());
  url.searchParams.set("access_token", accessToken);

  const data = await fetchJson<{ features?: Array<unknown> }>(url, {
    telemetry: { operation: "reverse", provider: "mapbox", context }
  });
  return parseGeocodingResults((data?.features ?? []) as Parameters<typeof parseGeocodingResults>[0])[0] ?? null;
}

function parseRouteGeometry(geometry: { coordinates?: number[][]; type?: string } | undefined | null) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  return {
    type: "LineString" as const,
    coordinates: geometry.coordinates
  };
}

async function route(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) return null;

  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("language", "vi");

  const data = await fetchJson<{
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { type?: string; coordinates?: number[][] };
    }>;
  }>(url, {
    telemetry: { operation: "route", provider: "mapbox", context }
  });

  const routeResult = data?.routes?.[0];
  if (typeof routeResult?.distance !== "number") return null;

  return {
    provider: "mapbox" as const,
    distanceKm: Math.round((routeResult.distance / 1000) * 100) / 100,
    durationMinutes: typeof routeResult.duration === "number" ? Math.max(1, Math.round(routeResult.duration / 60)) : null,
    geometry: parseRouteGeometry(routeResult.geometry),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["mapbox" as const]
  } satisfies RouteResult;
}

export const mapboxProvider: GeocoderProviderClient & RoutingProviderClient = {
  id: "mapbox",
  search,
  reverse,
  route
};
