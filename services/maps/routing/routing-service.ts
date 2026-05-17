import { readSharedCache, writeSharedCache } from "@/services/maps/cache-service";
import { calculateDistance, estimateTravelTime } from "@/services/maps/distance-service";
import { recordMapCacheEvent } from "@/services/maps/observability-service";
import { getRoutingFallbackChain, getRoutingProviders } from "@/services/maps/provider-factory";
import { shouldUseProvider } from "@/services/maps/provider-policy-service";
import { isCircuitOpen, recordProviderResult, withRequestDedupe } from "@/services/maps/provider-runtime";
import { getRouteGeometryCacheScope, simplifyRouteGeometry } from "@/services/maps/route-geometry-service";
import type {
  Coordinate,
  MapRequestContext,
  ResolvedRouteResult,
  RouteResult,
  RoutingProvider
} from "@/services/maps/types";

export async function getRoute(
  origin: Coordinate,
  destination: Coordinate,
  options: { provider?: RoutingProvider; context?: MapRequestContext } = {}
) {
  const providers = getRoutingProviders(options.provider);
  const providerIds = providers.map((provider) => provider.id);
  const cacheKey = `route:${getRouteGeometryCacheScope()}:${providerIds.join(">")}:${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)}:${destination.lng.toFixed(5)}`;
  const cached = await readSharedCache<RouteResult | null>("route", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "route", namespace: "route", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const route = await withRequestDedupe(cacheKey, async () => {
    const attempted: RoutingProvider[] = [];

    for (const provider of providers) {
      if (!shouldUseProvider(provider.id, "route")) continue;
      if (isCircuitOpen(provider.id, "route")) continue;
      attempted.push(provider.id);
      const providerRoute = await provider.route(origin, destination, options.context);
      if (providerRoute) {
        recordProviderResult(provider.id, "route", true);
        return {
          ...providerRoute,
          geometry: simplifyRouteGeometry(providerRoute.geometry),
          confidence: provider.id === "goong" ? "high" as const : "medium" as const,
          fallbackChain: attempted
        } satisfies RouteResult;
      }
      recordProviderResult(provider.id, "route", false);
    }

    return null;
  });

  await writeSharedCache("route", cacheKey, route, route ? (route.confidence === "high" ? 6 * 60 * 60_000 : 15 * 60_000) : 60_000);
  return route;
}

export async function resolveDistanceAndEta(
  origin: Coordinate,
  destination: Coordinate,
  options: { provider?: RoutingProvider; context?: MapRequestContext } = {}
): Promise<ResolvedRouteResult> {
  const route = await getRoute(origin, destination, options);
  if (route) return route;

  const distanceKm = calculateDistance(origin, destination);
  return {
    provider: "haversine" as const,
    distanceKm,
    durationMinutes: estimateTravelTime(distanceKm),
    geometry: null,
    confidence: "low" as const,
    isEstimated: true,
    fallbackChain: [...getRoutingFallbackChain(options.provider), "haversine" as const]
  };
}
