import { fetchJson, getEnv } from "@/services/maps/provider-runtime";
import type { Coordinate, MapRequestContext, RouteResult } from "@/services/maps/types";
import type { RoutingProviderClient } from "@/services/maps/providers/types";

function parseRouteGeometry(geometry: { coordinates?: number[][]; type?: string } | undefined | null) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  return {
    type: "LineString" as const,
    coordinates: geometry.coordinates
  };
}

async function route(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
  const baseUrl = getEnv("MAPS_OSRM_URL") || "https://router.project-osrm.org";
  const url = new URL(
    `/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const data = await fetchJson<{
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { type?: string; coordinates?: number[][] };
    }>;
  }>(url, {
    telemetry: { operation: "route", provider: "osrm", context }
  });

  const routeResult = data?.routes?.[0];
  if (data?.code !== "Ok" || typeof routeResult?.distance !== "number") return null;

  return {
    provider: "osrm" as const,
    distanceKm: Math.round((routeResult.distance / 1000) * 100) / 100,
    durationMinutes: typeof routeResult.duration === "number" ? Math.max(1, Math.round(routeResult.duration / 60)) : null,
    geometry: parseRouteGeometry(routeResult.geometry),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["osrm" as const]
  } satisfies RouteResult;
}

export const osrmProvider: RoutingProviderClient = {
  id: "osrm",
  route
};
