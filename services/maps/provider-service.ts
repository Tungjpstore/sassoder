import { AppError } from "@/lib/response";
import { isLikelyCoordinateQuery, looksLikeCoordinateLabel } from "@/lib/geolocation/coordinate-quality";
import { rateLimit } from "@/lib/rate-limit";
import { getGoongMapStyleUrl } from "@/lib/geolocation/map-style";
import { readSharedCache, writeSharedCache } from "@/services/maps/cache-service";
import { calculateDistance, estimateTravelTime } from "@/services/maps/distance-service";
import { recordMapCacheEvent, recordMapProviderEvent } from "@/services/maps/observability-service";
import type {
  AddressAutocompletePrediction,
  Coordinate,
  GeocodingProvider,
  GeocodingResult,
  MapRequestContext,
  MapRuntimeConfig,
  ResolvedRouteResult,
  RouteResult,
  RoutingProvider
} from "@/services/maps/types";

const pendingRequests = new Map<string, Promise<unknown>>();
const providerCircuit = new Map<string, { failures: number; openUntil: number }>();

async function withRequestDedupe<T>(key: string, loader: () => Promise<T>) {
  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function getNumberEnv(name: string, fallback: number) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getGeocodingCountryCodes() {
  const configured = getEnv("MAPS_GEOCODER_COUNTRY_CODES") || getEnv("MAPS_COUNTRY_CODES") || "vn";
  const normalized = configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.includes("*")) return [];
  return normalized.filter((item) => /^[a-z]{2}$/.test(item));
}

function getGeocodingCountryParam() {
  const countries = getGeocodingCountryCodes();
  return countries.length > 0 ? countries.join(",") : "";
}

function getGeocodingLanguage() {
  return getEnv("MAPS_GEOCODER_LANGUAGE") || "vi";
}

function getGeocodingScopeKey() {
  return `${getGeocodingCountryParam() || "global"}:${getGeocodingLanguage()}`;
}

function getMapboxAccessToken() {
  return getEnv("MAPBOX_ACCESS_TOKEN") || getEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
}

function buildDevRasterStyle() {
  return JSON.stringify({
    version: 8,
    sources: {
      "logivn-osm-raster": {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors"
      }
    },
    layers: [
      {
        id: "logivn-osm-raster",
        type: "raster",
        source: "logivn-osm-raster"
      }
    ]
  });
}

function hasProviderCredentials(provider: GeocodingProvider | RoutingProvider) {
  if (provider === "goong") return Boolean(getGoongApiKey());
  if (provider === "vietmap") return Boolean(getEnv("VIETMAP_API_KEY"));
  if (provider === "mapbox") return Boolean(getMapboxAccessToken());
  return true;
}

function parseProviderList<TProvider extends string>(value: string, allowed: readonly TProvider[]) {
  const allowedSet = new Set<string>(allowed);
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is TProvider => allowedSet.has(item));
}

function uniqueProviders<TProvider extends string>(providers: TProvider[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

function preferredGeocodingProvider(): GeocodingProvider {
  const configured = getEnv("MAPS_GEOCODER_PROVIDER");
  if (configured) return configured as GeocodingProvider;
  if (getGoongApiKey()) return "goong";
  if (getEnv("VIETMAP_API_KEY")) return "vietmap";
  if (getMapboxAccessToken()) return "mapbox";
  return "nominatim";
}

function preferredRoutingProvider(): RoutingProvider {
  const configured = getEnv("MAPS_ROUTING_PROVIDER");
  if (configured) return configured as RoutingProvider;
  if (getGoongApiKey()) return "goong";
  if (getEnv("VIETMAP_API_KEY")) return "vietmap";
  return "osrm";
}

function getGeocodingFallbackChain(primary = preferredGeocodingProvider()) {
  const configured = parseProviderList<GeocodingProvider>(getEnv("MAPS_GEOCODER_FALLBACKS"), ["goong", "vietmap", "mapbox", "nominatim"]);
  const defaultChain: GeocodingProvider[] = [primary, "goong", "vietmap", "mapbox", "nominatim"];
  return uniqueProviders(configured.length > 0 ? [primary, ...configured] : defaultChain).filter(hasProviderCredentials);
}

function getRoutingFallbackChain(primary = preferredRoutingProvider()) {
  const configured = parseProviderList<RoutingProvider>(getEnv("MAPS_ROUTING_FALLBACKS"), ["goong", "vietmap", "mapbox", "osrm"]);
  const defaultChain: RoutingProvider[] = [primary, "goong", "vietmap", primary === "mapbox" ? "mapbox" : "osrm", "osrm"];
  return uniqueProviders(configured.length > 0 ? [primary, ...configured] : defaultChain).filter(hasProviderCredentials);
}

function circuitKey(provider: string, operation: "geocode" | "reverse" | "route") {
  return `${operation}:${provider}`;
}

function isCircuitOpen(provider: string, operation: "geocode" | "reverse" | "route") {
  const state = providerCircuit.get(circuitKey(provider, operation));
  return Boolean(state && state.openUntil > Date.now());
}

function recordProviderResult(provider: string, operation: "geocode" | "reverse" | "route", ok: boolean) {
  const key = circuitKey(provider, operation);
  if (ok) {
    providerCircuit.delete(key);
    return;
  }

  const current = providerCircuit.get(key);
  const failures = (current?.failures ?? 0) + 1;
  providerCircuit.set(key, {
    failures,
    openUntil: failures >= getNumberEnv("MAPS_CIRCUIT_FAILURE_THRESHOLD", 3)
      ? Date.now() + getNumberEnv("MAPS_CIRCUIT_COOLDOWN_MS", 30_000)
      : 0
  });
}

export function getMapRuntimeConfig(): MapRuntimeConfig {
  const geocodingProvider = preferredGeocodingProvider();
  const routingProvider = preferredRoutingProvider();
  const styleUrl = getEnv("NEXT_PUBLIC_MAP_STYLE_URL") || getGoongMapStyleUrl(getEnv("NEXT_PUBLIC_GOONG_MAPTILES_KEY"));

  return {
    mapStyleUrl: styleUrl || null,
    geocodingProvider,
    routingProvider,
    tileAttribution: getEnv("NEXT_PUBLIC_MAP_TILE_ATTRIBUTION") || "© OpenStreetMap contributors",
    supportsTypeahead: geocodingProvider === "mapbox" || geocodingProvider === "vietmap" || geocodingProvider === "goong",
    devFallbackTiles: !styleUrl
  };
}

export function getClientMapStyle() {
  const config = getMapRuntimeConfig();
  return config.mapStyleUrl || buildDevRasterStyle();
}

async function fetchJson<T>(
  url: URL | string,
  init?: RequestInit & {
    timeoutMs?: number;
    telemetry?: {
      operation: "geocode" | "reverse" | "route";
      provider: GeocodingProvider | RoutingProvider;
      context?: MapRequestContext;
    };
  }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 4000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init?.headers
      },
      cache: "no-store"
    });

    if (!response.ok) {
      if (init?.telemetry) {
        recordMapProviderEvent({
          type: "map_provider",
          ...init.telemetry,
          outcome: "http_error",
          status: response.status,
          latencyMs: Date.now() - startedAt
        });
      }
      return null;
    }
    if (init?.telemetry) {
      recordMapProviderEvent({
        type: "map_provider",
        ...init.telemetry,
        outcome: "success",
        status: response.status,
        latencyMs: Date.now() - startedAt
      });
    }
    return (await response.json()) as T;
  } catch (error) {
    if (init?.telemetry) {
      recordMapProviderEvent({
        type: "map_provider",
        ...init.telemetry,
        outcome: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "error",
        latencyMs: Date.now() - startedAt
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLabel(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function toCoordinate(lat: unknown, lng: unknown): Coordinate | null {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
  return { lat: nextLat, lng: nextLng };
}

async function searchWithNominatim(query: string, limit: number, context?: MapRequestContext) {
  const url = new URL(getEnv("MAPS_NOMINATIM_URL") || "https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));
  const countryParam = getGeocodingCountryParam();
  if (countryParam) url.searchParams.set("countrycodes", countryParam);
  url.searchParams.set("accept-language", getGeocodingLanguage());

  const data = await fetchJson<
    Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
      name?: string;
      address?: {
        road?: string;
        suburb?: string;
        quarter?: string;
        city?: string;
        town?: string;
        state?: string;
        country_code?: string;
      };
    }>
  >(url, {
    headers: {
      "User-Agent": getEnv("MAPS_USER_AGENT") || "LogiVN Maps/1.0 (+https://logivn.com)"
    },
    telemetry: { operation: "geocode", provider: "nominatim", context }
  });

  return (data ?? [])
    .map((item) => {
      const coordinate = toCoordinate(item.lat, item.lon);
      if (!coordinate) return null;
      const shortLabel = normalizeLabel([
        item.name,
        item.address?.road,
        item.address?.suburb || item.address?.quarter,
        item.address?.city || item.address?.town
      ]);

      return {
        id: `nominatim-${item.place_id}`,
        provider: "nominatim" as const,
        address: item.display_name,
        label: item.display_name,
        shortLabel: shortLabel || item.display_name,
        countryCode: item.address?.country_code ?? null,
        ...coordinate
      };
    })
    .filter(Boolean) as GeocodingResult[];
}

async function reverseWithNominatim(point: Coordinate, context?: MapRequestContext) {
  const url = new URL(getEnv("MAPS_NOMINATIM_URL")?.replace(/\/search$/, "/reverse") || "https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("accept-language", getGeocodingLanguage());

  const data = await fetchJson<{
    place_id?: number;
    lat?: string;
    lon?: string;
    display_name?: string;
    name?: string;
    address?: {
      road?: string;
      suburb?: string;
      quarter?: string;
      city?: string;
      town?: string;
      country_code?: string;
    };
  }>(url, {
    headers: {
      "User-Agent": getEnv("MAPS_USER_AGENT") || "LogiVN Maps/1.0 (+https://logivn.com)"
    },
    telemetry: { operation: "reverse", provider: "nominatim", context }
  });

  if (!data) return null;
  return {
    id: `nominatim-${data.place_id ?? `${point.lat}-${point.lng}`}`,
    provider: "nominatim" as const,
    address: data.display_name ?? `${point.lat}, ${point.lng}`,
    label: data.display_name ?? `${point.lat}, ${point.lng}`,
    shortLabel:
      normalizeLabel([data.name, data.address?.road, data.address?.suburb || data.address?.quarter, data.address?.city || data.address?.town]) ||
      data.display_name ||
      `${point.lat}, ${point.lng}`,
    countryCode: data.address?.country_code ?? null,
    lat: point.lat,
    lng: point.lng
  } satisfies GeocodingResult;
}

function parseMapboxResults(
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

async function searchWithMapbox(query: string, limit: number, context?: MapRequestContext) {
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
  return parseMapboxResults((data?.features ?? []) as Parameters<typeof parseMapboxResults>[0]);
}

async function reverseWithMapbox(point: Coordinate, context?: MapRequestContext) {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) return null;

  const url = new URL(`https://api.mapbox.com/search/geocode/v6/reverse`);
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("language", getGeocodingLanguage());
  url.searchParams.set("access_token", accessToken);

  const data = await fetchJson<{ features?: Array<unknown> }>(url, {
    telemetry: { operation: "reverse", provider: "mapbox", context }
  });
  return parseMapboxResults((data?.features ?? []) as Parameters<typeof parseMapboxResults>[0])[0] ?? null;
}

async function searchWithVietmap(query: string, limit: number, context?: MapRequestContext) {
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

async function reverseWithVietmap(point: Coordinate, context?: MapRequestContext) {
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

type GoongGeocodeItem = {
  formatted_address?: string;
  place_id?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
  }>;
};

function getGoongApiKey() {
  return getEnv("GOONG_API_KEY");
}

function goongPlacesEnabled() {
  return getEnv("MAPS_GOONG_PLACES_ENABLED") !== "false";
}

function normalizeSessionToken(value?: string | null) {
  const token = value?.trim() ?? "";
  if (!token || token.length > 120) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(token) ? token : null;
}

function isUsableGoongGeocodeResult(result: GeocodingResult, query?: string) {
  if (looksLikeCoordinateLabel(result.address) || looksLikeCoordinateLabel(result.label)) {
    return isLikelyCoordinateQuery(query);
  }
  return true;
}

function parseGoongGeocodeResults(items: GoongGeocodeItem[], query?: string): GeocodingResult[] {
  const results: GeocodingResult[] = [];
  items.forEach((item, index) => {
    const coordinate = toCoordinate(item.geometry?.location?.lat, item.geometry?.location?.lng);
    if (!coordinate) return;
    const componentLabel = normalizeLabel((item.address_components ?? []).slice(0, 3).map((component) => component.long_name ?? component.short_name));
    const label = item.formatted_address || componentLabel || `${coordinate.lat}, ${coordinate.lng}`;
    const result = {
      id: item.place_id ?? `goong-${index}-${coordinate.lat}-${coordinate.lng}`,
      provider: "goong" as const,
      address: label,
      label,
      shortLabel: componentLabel || label,
      countryCode: "vn",
      ...coordinate
    } satisfies GeocodingResult;
    if (isUsableGoongGeocodeResult(result, query)) results.push(result);
  });
  return results;
}

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

type GoongPlacePrediction = {
  description?: string;
  place_id?: string;
  reference?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  has_children?: boolean;
  score?: number;
};

function parseGoongPlacePredictions(items: GoongPlacePrediction[]) {
  return items
    .map((item, index) => {
      const address = item.description?.trim();
      if (!address) return null;

      return {
        id: item.place_id ?? item.reference ?? `goong-place-${index}-${address}`,
        placeId: item.place_id ?? null,
        reference: item.reference ?? null,
        provider: "goong" as const,
        source: "places" as const,
        address,
        label: address,
        shortLabel: item.structured_formatting?.main_text?.trim() || address,
        secondaryLabel: item.structured_formatting?.secondary_text?.trim() || null,
        countryCode: "vn",
        hasChildren: Boolean(item.has_children),
        score: typeof item.score === "number" ? item.score : null
      };
    })
    .filter(Boolean) as AddressAutocompletePrediction[];
}

async function searchGoongPlaces(
  query: string,
  options: {
    limit: number;
    sessionToken?: string | null;
    location?: Coordinate | null;
    context?: MapRequestContext;
  }
) {
  const apiKey = getGoongApiKey();
  if (!apiKey || !goongPlacesEnabled()) return [];

  const url = new URL("https://rsapi.goong.io/Place/AutoComplete");
  url.searchParams.set("input", query);
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("more_compound", "true");
  url.searchParams.set("api_key", apiKey);

  const sessionToken = normalizeSessionToken(options.sessionToken);
  if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);
  if (options.location) url.searchParams.set("location", `${options.location.lat},${options.location.lng}`);

  const data = await fetchJson<{
    predictions?: GoongPlacePrediction[];
  }>(url, {
    telemetry: { operation: "geocode", provider: "goong", context: options.context }
  });

  return parseGoongPlacePredictions(data?.predictions ?? []);
}

async function searchWithGoong(query: string, limit: number, context?: MapRequestContext) {
  const apiKey = getGoongApiKey();
  if (!apiKey) return [];

  const url = new URL("https://rsapi.goong.io/Geocode");
  url.searchParams.set("address", query);
  url.searchParams.set("api_key", apiKey);

  const data = await fetchJson<{
    results?: GoongGeocodeItem[];
  }>(url, {
    telemetry: { operation: "geocode", provider: "goong", context }
  });

  return parseGoongGeocodeResults(data?.results ?? [], query).slice(0, limit);
}

type GoongPlaceDetailResult = {
  place_id?: string;
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

function parseGoongPlaceDetail(item: GoongPlaceDetailResult | null | undefined) {
  const coordinate = toCoordinate(item?.geometry?.location?.lat, item?.geometry?.location?.lng);
  if (!item || !coordinate) return null;
  const address = item.formatted_address || item.name || `${coordinate.lat}, ${coordinate.lng}`;
  if (looksLikeCoordinateLabel(address)) return null;

  return {
    id: item.place_id ?? `goong-place-${coordinate.lat}-${coordinate.lng}`,
    provider: "goong" as const,
    address,
    label: address,
    shortLabel: item.name || address,
    countryCode: "vn",
    ...coordinate
  } satisfies GeocodingResult;
}

async function getGoongPlaceDetail(placeId: string, sessionToken?: string | null, context?: MapRequestContext) {
  const apiKey = getGoongApiKey();
  if (!apiKey || !goongPlacesEnabled()) return null;

  const url = new URL("https://rsapi.goong.io/Place/Detail");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("api_key", apiKey);

  const normalizedSessionToken = normalizeSessionToken(sessionToken);
  if (normalizedSessionToken) url.searchParams.set("sessiontoken", normalizedSessionToken);

  const data = await fetchJson<{
    result?: GoongPlaceDetailResult;
  }>(url, {
    telemetry: { operation: "geocode", provider: "goong", context }
  });

  return parseGoongPlaceDetail(data?.result);
}

async function reverseWithGoong(point: Coordinate, context?: MapRequestContext) {
  const apiKey = getGoongApiKey();
  if (!apiKey) return null;

  const url = new URL("https://rsapi.goong.io/Geocode");
  url.searchParams.set("latlng", `${point.lat},${point.lng}`);
  url.searchParams.set("api_key", apiKey);

  const data = await fetchJson<{
    results?: GoongGeocodeItem[];
  }>(url, {
    telemetry: { operation: "reverse", provider: "goong", context }
  });

  return parseGoongGeocodeResults(data?.results ?? [])[0] ?? null;
}

async function searchPredictionsWithProvider(
  provider: GeocodingProvider,
  query: string,
  options: {
    limit: number;
    sessionToken?: string | null;
    location?: Coordinate | null;
    context?: MapRequestContext;
  }
) {
  if (provider === "goong") {
    const places = await searchGoongPlaces(query, options);
    if (places.length > 0) return places;
  }

  const results = await searchWithProvider(provider, query, options.limit, options.context);
  return geocodingResultsToPredictions(results);
}

async function searchWithProvider(provider: GeocodingProvider, query: string, limit: number, context?: MapRequestContext) {
  if (provider === "mapbox") return searchWithMapbox(query, limit, context);
  if (provider === "vietmap") return searchWithVietmap(query, limit, context);
  if (provider === "goong") return searchWithGoong(query, limit, context);
  return searchWithNominatim(query, limit, context);
}

async function reverseWithProvider(provider: GeocodingProvider, point: Coordinate, context?: MapRequestContext) {
  if (provider === "mapbox") return reverseWithMapbox(point, context);
  if (provider === "vietmap") return reverseWithVietmap(point, context);
  if (provider === "goong") return reverseWithGoong(point, context);
  return reverseWithNominatim(point, context);
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
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const providers = getGeocodingFallbackChain(options.provider);
  const locationKey = options.location ? `${options.location.lat.toFixed(3)}:${options.location.lng.toFixed(3)}` : "vn";
  const cacheKey = `autocomplete:${providers.join(">")}:${getGeocodingScopeKey()}:${normalizedQuery.toLowerCase()}:${limit}:${locationKey}`;
  const cached = await readSharedCache<AddressAutocompletePrediction[]>("address_autocomplete", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "geocode", namespace: "address_autocomplete", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (isCircuitOpen(provider, "geocode")) continue;
      const providerResult = await searchPredictionsWithProvider(provider, normalizedQuery, {
        limit,
        sessionToken: options.sessionToken,
        location: options.location,
        context: options.context
      });
      if (providerResult.length > 0) {
        recordProviderResult(provider, "geocode", true);
        return providerResult.slice(0, limit);
      }
      recordProviderResult(provider, "geocode", false);
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
    if (isCircuitOpen("goong", "geocode")) return null;
    const detail = await getGoongPlaceDetail(normalizedPlaceId, options.sessionToken, options.context);
    recordProviderResult("goong", "geocode", Boolean(detail));
    return detail;
  });

  await writeSharedCache("place_detail", cacheKey, result, getNumberEnv("MAPS_GOONG_PLACE_DETAIL_TTL_MS", 30 * 24 * 60 * 60_000));
  return result;
}

export async function searchAddress(query: string, options: { limit?: number; provider?: GeocodingProvider; context?: MapRequestContext } = {}) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);
  const providers = getGeocodingFallbackChain(options.provider);
  const cacheKey = `search:${providers.join(">")}:${getGeocodingScopeKey()}:${normalizedQuery.toLowerCase()}:${limit}`;
  const cached = await readSharedCache<GeocodingResult[]>("address_search", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "geocode", namespace: "address_search", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (isCircuitOpen(provider, "geocode")) continue;
      const providerResult = await searchWithProvider(provider, normalizedQuery, limit, options.context);
      if (providerResult.length > 0) {
        recordProviderResult(provider, "geocode", true);
        return providerResult;
      }
    }
    return [] satisfies GeocodingResult[];
  });

  await writeSharedCache("address_search", cacheKey, result, 30 * 60_000);
  return result;
}

export async function reverseGeocode(point: Coordinate, options: { provider?: GeocodingProvider; context?: MapRequestContext } = {}) {
  const providers = getGeocodingFallbackChain(options.provider);
  const cacheKey = `reverse:${providers.join(">")}:${getGeocodingScopeKey()}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
  const cached = await readSharedCache<GeocodingResult | null>("reverse_geocode", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "reverse", namespace: "reverse_geocode", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const result = await withRequestDedupe(cacheKey, async () => {
    for (const provider of providers) {
      if (isCircuitOpen(provider, "reverse")) continue;
      const providerResult = await reverseWithProvider(provider, point, options.context);
      if (providerResult) {
        recordProviderResult(provider, "reverse", true);
        return providerResult;
      }
    }
    return null;
  });

  await writeSharedCache("reverse_geocode", cacheKey, result, 6 * 60 * 60_000);
  return result;
}

function parseRouteGeometry(geometry: { coordinates?: number[][]; type?: string } | undefined | null) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  return {
    type: "LineString" as const,
    coordinates: geometry.coordinates
  };
}

function decodePolyline(polyline: string) {
  const coordinates: number[][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < polyline.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < polyline.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 100000, lat / 100000]);
  }

  return coordinates;
}

function parseEncodedRouteGeometry(points?: string | null) {
  if (!points) return null;
  const coordinates = decodePolyline(points);
  if (coordinates.length < 2) return null;
  return {
    type: "LineString" as const,
    coordinates
  };
}

async function routeWithOsrm(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
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

  const route = data?.routes?.[0];
  if (data?.code !== "Ok" || typeof route?.distance !== "number") return null;

  return {
    provider: "osrm" as const,
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: typeof route.duration === "number" ? Math.max(1, Math.round(route.duration / 60)) : null,
    geometry: parseRouteGeometry(route.geometry),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["osrm" as const]
  } satisfies RouteResult;
}

async function routeWithMapbox(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
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

  const route = data?.routes?.[0];
  if (typeof route?.distance !== "number") return null;

  return {
    provider: "mapbox" as const,
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: typeof route.duration === "number" ? Math.max(1, Math.round(route.duration / 60)) : null,
    geometry: parseRouteGeometry(route.geometry),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["mapbox" as const]
  } satisfies RouteResult;
}

async function routeWithVietmap(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
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

  const route = data?.paths?.[0];
  if (typeof route?.distance !== "number") return null;

  return {
    provider: "vietmap" as const,
    distanceKm: Math.round((route.distance / 1000) * 100) / 100,
    durationMinutes: typeof route.time === "number" ? Math.max(1, Math.round(route.time / 1000 / 60)) : null,
    geometry: parseRouteGeometry(route.points),
    confidence: "medium" as const,
    isEstimated: false as const,
    fallbackChain: ["vietmap" as const]
  } satisfies RouteResult;
}

async function routeWithGoong(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
  const apiKey = getGoongApiKey();
  if (!apiKey) return null;

  const url = new URL("https://rsapi.goong.io/Direction");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("vehicle", "car");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("api_key", apiKey);

  const data = await fetchJson<{
    routes?: Array<{
      legs?: Array<{
        distance?: { value?: number };
        duration?: { value?: number };
      }>;
      overview_polyline?: { points?: string };
    }>;
  }>(url, {
    telemetry: { operation: "route", provider: "goong", context }
  });

  const route = data?.routes?.[0];
  const distanceMeters = route?.legs?.reduce((sum, leg) => sum + (typeof leg.distance?.value === "number" ? leg.distance.value : 0), 0) ?? 0;
  if (!route || distanceMeters <= 0) return null;
  const durationSeconds = route.legs?.reduce((sum, leg) => sum + (typeof leg.duration?.value === "number" ? leg.duration.value : 0), 0) ?? 0;

  return {
    provider: "goong" as const,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationMinutes: durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null,
    geometry: parseEncodedRouteGeometry(route.overview_polyline?.points),
    confidence: "high" as const,
    isEstimated: false as const,
    fallbackChain: ["goong" as const]
  } satisfies RouteResult;
}

async function routeWithProvider(provider: RoutingProvider, origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
  if (provider === "mapbox") return routeWithMapbox(origin, destination, context);
  if (provider === "vietmap") return routeWithVietmap(origin, destination, context);
  if (provider === "goong") return routeWithGoong(origin, destination, context);
  return routeWithOsrm(origin, destination, context);
}

export async function getRoute(
  origin: Coordinate,
  destination: Coordinate,
  options: { provider?: RoutingProvider; context?: MapRequestContext } = {}
) {
  const providers = getRoutingFallbackChain(options.provider);
  const cacheKey = `route:${providers.join(">")}:${origin.lat.toFixed(5)}:${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)}:${destination.lng.toFixed(5)}`;
  const cached = await readSharedCache<RouteResult | null>("route", cacheKey);
  recordMapCacheEvent({ type: "map_cache", operation: "route", namespace: "route", hit: cached.hit, context: options.context });
  if (cached.hit) return cached.value;

  const route = await withRequestDedupe(cacheKey, async () => {
    const attempted: RoutingProvider[] = [];

    for (const provider of providers) {
      if (isCircuitOpen(provider, "route")) continue;
      attempted.push(provider);
      const providerRoute = await routeWithProvider(provider, origin, destination, options.context);
      if (providerRoute) {
        recordProviderResult(provider, "route", true);
        return {
          ...providerRoute,
          confidence: provider === "goong" ? "high" as const : "medium" as const,
          fallbackChain: attempted
        } satisfies RouteResult;
      }
      recordProviderResult(provider, "route", false);
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

export function assertMapRateLimit(key: string, limit = 24, windowMs = 60_000) {
  if (!rateLimit(key, limit, windowMs)) {
    throw new AppError("Bạn đang thao tác bản đồ quá nhanh. Vui lòng thử lại sau vài giây.", 429);
  }
}
