import { fetchJson, getEnv, toCoordinate } from "@/services/maps/provider-runtime";
import type { Coordinate, GeocodingResult, MapRequestContext, RouteResult } from "@/services/maps/types";
import type { GeocoderProviderClient, RoutingProviderClient } from "@/services/maps/providers/types";

async function search(query: string, limit: number, context?: MapRequestContext) {
  const apiKey = getEnv("VIETMAP_API_KEY");
  if (!apiKey) return [];

  const url = new URL("https://maps.vietmap.vn/api/search/v3");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("text", query);
  url.searchParams.set("limit", String(limit));

  const data = await fetchJson<{
    data?: Array<{
      ref_id?: string;
      name?: string;
      address?: string;
      display?: string;
      lat?: number;
      lng?: number;
    }>;
  }>(url, {
    telemetry: { operation: "geocode", provider: "vietmap", context }
  });

  return (data?.data ?? [])
    .map((item) => {
      const coordinate = toCoordinate(item.lat, item.lng);
      if (!coordinate) return null;
      const label = item.display || item.address || item.name || "";
      return {
        id: item.ref_id ?? `vietmap-${coordinate.lat}-${coordinate.lng}`,
        provider: "vietmap" as const,
        address: label,
        label,
        shortLabel: item.name || label,
        ...coordinate
      };
    })
    .filter(Boolean) as GeocodingResult[];
}

async function reverse(point: Coordinate, context?: MapRequestContext) {
  const apiKey = getEnv("VIETMAP_API_KEY");
  if (!apiKey) return null;

  const url = new URL("https://maps.vietmap.vn/api/reverse/v3");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lng", String(point.lng));

  const data = await fetchJson<{
    display?: string;
    address?: string;
    name?: string;
  }>(url, {
    telemetry: { operation: "reverse", provider: "vietmap", context }
  });

  if (!data) return null;
  const label = data.display || data.address || data.name || `${point.lat}, ${point.lng}`;
  return {
    id: `vietmap-${point.lat}-${point.lng}`,
    provider: "vietmap" as const,
    address: label,
    label,
    shortLabel: data.name || label,
    ...point
  } satisfies GeocodingResult;
}

function parseRouteGeometry(geometry: { coordinates?: number[][]; type?: string } | undefined | null) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  return {
    type: "LineString" as const,
    coordinates: geometry.coordinates
  };
}

async function route(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
  const apiKey = getEnv("VIETMAP_API_KEY");
  if (!apiKey) return null;

  const url = new URL("https://maps.vietmap.vn/api/route");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("point", `${origin.lat},${origin.lng}`);
  url.searchParams.append("point", `${destination.lat},${destination.lng}`);
  url.searchParams.set("vehicle", "car");
  url.searchParams.set("points_encoded", "false");

  const data = await fetchJson<{
    paths?: Array<{
      distance?: number;
      time?: number;
      points?: { coordinates?: number[][]; type?: string };
    }>;
  }>(url, {
    telemetry: { operation: "route", provider: "vietmap", context }
  });

  const routeResult = data?.paths?.[0];
  if (typeof routeResult?.distance !== "number") return null;

  return {
    provider: "vietmap" as const,
    distanceKm: Math.round((routeResult.distance / 1000) * 100) / 100,
    durationMinutes: typeof routeResult.time === "number" ? Math.max(1, Math.round(routeResult.time / 1000 / 60)) : null,
    geometry: parseRouteGeometry(routeResult.points),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["vietmap" as const]
  } satisfies RouteResult;
}

export const vietmapProvider: GeocoderProviderClient & RoutingProviderClient = {
  id: "vietmap",
  search,
  reverse,
  route
};
