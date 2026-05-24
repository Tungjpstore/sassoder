import { readSharedCache, writeSharedCache } from "@/services/maps/cache-service";
import { recordMapCacheEvent } from "@/services/maps/observability-service";
import { getGeocoderProviders } from "@/services/maps/provider-factory";
import { shouldUseProvider } from "@/services/maps/provider-policy-service";
import {
  getGeocodingScopeKey,
  getNumberEnv,
  isCircuitOpen,
  recordProviderResult,
  withRequestDedupe
} from "@/services/maps/provider-runtime";
import { normalizeVietnameseAddressQuery } from "@/services/maps/vietnamese-address-service";
import type {
  AddressAutocompletePrediction,
  Coordinate,
  GeocodingProvider,
  GeocodingResult,
  MapRequestContext
} from "@/services/maps/types";
import type { GeocoderProviderClient, GeocoderAutocompleteOptions } from "@/services/maps/providers/types";

function geocodingResultsToPredictions(results: GeocodingResult[]): AddressAutocompletePrediction[] {
  return results.map((result) => ({
    id: result.id,
    placeId: result.id.startsWith("goong-") ? result.id.replace(/^goong-/, "") : null,
    label: result.label,
    shortLabel: result.shortLabel,
    secondaryLabel: result.address === result.shortLabel ? null : result.address,
    address: result.address,
    provider: result.provider,
    source: "geocode",
    countryCode: result.countryCode ?? null,
    lat: result.lat,
    lng: result.lng
  }));
}

async function searchPredictionsWithProvider(
  provider: GeocoderProviderClient,
  query: string,
  options: GeocoderAutocompleteOptions
) {
  if (provider.autocomplete) {
    const predictions = await provider.autocomplete(query, options);
    if (predictions.length > 0) return predictions;
  }

  const results = await provider.search(query, options.limit, options.context);
  return geocodingResultsToPredictions(results);
}

export async function searchAddressPredictions(
  query: string,
  options: {
    limit?: number;
    provider?: GeocodingProvider;
    sessionToken?: string | null;
    location?: Coordinate | null;
    context?: MapRequestContext;
  } = {}
) {
  const normalizedQuery = normalizeVietnameseAddressQuery(query);
  if (normalizedQuery.length < 3) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const providers = getGeocoderProviders(options.provider);
  const providerIds = providers.map((provider) => provider.id);
  const locationKey = options.location ? `${options.location.lat.toFixed(3)}:${options.location.lng.toFixed(3)}` : "vn";
  const cacheKey = `autocomplete:${providerIds.join(">")}:${getGeocodingScopeKey()}:${normalizedQuery.toLowerCase()}:${limit}:${locationKey}`;
  const cached = await readSharedCache<AddressAutocompletePrediction[]>("address_autocomplete", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "geocode", namespace: "address_autocomplete", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (!shouldUseProvider(provider.id, "geocode")) continue;
      if (isCircuitOpen(provider.id, "geocode")) continue;
      const providerResult = await searchPredictionsWithProvider(provider, normalizedQuery, {
        limit,
        sessionToken: options.sessionToken,
        location: options.location,
        context: options.context
      });
      if (providerResult.length > 0) {
        recordProviderResult(provider.id, "geocode", true);
        return providerResult.slice(0, limit);
      }
      recordProviderResult(provider.id, "geocode", false);
    }
    return [] satisfies AddressAutocompletePrediction[];
  });

  await writeSharedCache("address_autocomplete", cacheKey, result, getNumberEnv("MAPS_GOONG_PLACES_AUTOCOMPLETE_TTL_MS", 10 * 60_000));
  return result;
}

export async function getPlaceDetail(
  placeId: string,
  options: {
    sessionToken?: string | null;
    context?: MapRequestContext;
  } = {}
) {
  const normalizedPlaceId = placeId.trim();
  if (!normalizedPlaceId) return null;

  const cacheKey = `goong-place-detail:${normalizedPlaceId}`;
  const cached = await readSharedCache<GeocodingResult | null>("place_detail", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "geocode", namespace: "place_detail", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of getGeocoderProviders("goong")) {
      if (!shouldUseProvider(provider.id, "geocode")) continue;
      if (!provider.placeDetail || isCircuitOpen(provider.id, "geocode")) continue;
      const detail = await provider.placeDetail(normalizedPlaceId, options);
      recordProviderResult(provider.id, "geocode", Boolean(detail));
      if (detail) return detail;
    }
    return null;
  });

  await writeSharedCache("place_detail", cacheKey, result, getNumberEnv("MAPS_GOONG_PLACE_DETAIL_TTL_MS", 30 * 24 * 60 * 60_000));
  return result;
}

export async function searchAddress(
  query: string,
  options: { limit?: number; provider?: GeocodingProvider; context?: MapRequestContext } = {}
) {
  const normalizedQuery = normalizeVietnameseAddressQuery(query);
  if (normalizedQuery.length < 3) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const providers = getGeocoderProviders(options.provider);
  const providerIds = providers.map((provider) => provider.id);
  const cacheKey = `search:${providerIds.join(">")}:${getGeocodingScopeKey()}:${normalizedQuery.toLowerCase()}:${limit}`;
  const cached = await readSharedCache<GeocodingResult[]>("address_search", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "geocode", namespace: "address_search", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (!shouldUseProvider(provider.id, "geocode")) continue;
      if (isCircuitOpen(provider.id, "geocode")) continue;
      const providerResult = await provider.search(normalizedQuery, limit, options.context);
      if (providerResult.length > 0) {
        recordProviderResult(provider.id, "geocode", true);
        return providerResult;
      }
    }
    return [] satisfies GeocodingResult[];
  });

  await writeSharedCache("address_search", cacheKey, result, 30 * 60_000);
  return result;
}

export async function reverseGeocode(
  point: Coordinate,
  options: { provider?: GeocodingProvider; context?: MapRequestContext } = {}
) {
  const providers = getGeocoderProviders(options.provider);
  const providerIds = providers.map((provider) => provider.id);
  const cacheKey = `reverse:${providerIds.join(">")}:${getGeocodingScopeKey()}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
  const cached = await readSharedCache<GeocodingResult | null>("reverse_geocode", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "reverse", namespace: "reverse_geocode", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (!shouldUseProvider(provider.id, "reverse")) continue;
      if (isCircuitOpen(provider.id, "reverse")) continue;
      const providerResult = await provider.reverse(point, options.context);
      if (providerResult) {
        recordProviderResult(provider.id, "reverse", true);
        return providerResult;
      }
    }
    return null;
  });

  await writeSharedCache("reverse_geocode", cacheKey, result, 6 * 60 * 60_000);
  return result;
}
