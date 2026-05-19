import { isLikelyCoordinateQuery, looksLikeCoordinateLabel } from "@/lib/geolocation/coordinate-quality";
import {
  fetchJson,
  getEnv,
  getGoongApiKey,
  normalizeLabel,
  toCoordinate
} from "@/services/maps/provider-runtime";
import type {
  AddressAutocompletePrediction,
  Coordinate,
  GeocodingResult,
  MapRequestContext,
  RouteResult
} from "@/services/maps/types";
import type { GeocoderAutocompleteOptions, GeocoderProviderClient, PlaceDetailOptions, RoutingProviderClient } from "@/services/maps/providers/types";

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

function placesEnabled() {
  return getEnv("MAPS_GOONG_PLACES_ENABLED") !== "false";
}

function normalizeSessionToken(value?: string | null) {
  const token = value?.trim() ?? "";
  if (!token || token.length > 120) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(token) ? token : null;
}

function isUsableGeocodeResult(result: GeocodingResult, query?: string) {
  if (looksLikeCoordinateLabel(result.address) || looksLikeCoordinateLabel(result.label)) {
    return isLikelyCoordinateQuery(query);
  }
  return true;
}

function parseGeocodeResults(items: GoongGeocodeItem[], query?: string): GeocodingResult[] {
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
    if (isUsableGeocodeResult(result, query)) results.push(result);
  });
  return results;
}

function parsePlacePredictions(items: GoongPlacePrediction[]) {
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

function parsePlaceDetail(item: GoongPlaceDetailResult | null | undefined) {
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

async function autocomplete(query: string, options: GeocoderAutocompleteOptions) {
  const apiKey = getGoongApiKey();
  if (!apiKey || !placesEnabled()) return [];

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

  return parsePlacePredictions(data?.predictions ?? []);
}

async function search(query: string, limit: number, context?: MapRequestContext) {
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

  return parseGeocodeResults(data?.results ?? [], query).slice(0, limit);
}

async function placeDetail(placeId: string, options: PlaceDetailOptions = {}) {
  const apiKey = getGoongApiKey();
  if (!apiKey || !placesEnabled()) return null;

  const url = new URL("https://rsapi.goong.io/Place/Detail");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("api_key", apiKey);

  const sessionToken = normalizeSessionToken(options.sessionToken);
  if (sessionToken) url.searchParams.set("sessiontoken", sessionToken);

  const data = await fetchJson<{
    result?: GoongPlaceDetailResult;
  }>(url, {
    telemetry: { operation: "geocode", provider: "goong", context: options.context }
  });

  return parsePlaceDetail(data?.result);
}

async function reverse(point: Coordinate, context?: MapRequestContext) {
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

  return parseGeocodeResults(data?.results ?? [])[0] ?? null;
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

async function route(origin: Coordinate, destination: Coordinate, context?: MapRequestContext) {
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

  const routeResult = data?.routes?.[0];
  const distanceMeters = routeResult?.legs?.reduce((sum, leg) => sum + (typeof leg.distance?.value === "number" ? leg.distance.value : 0), 0) ?? 0;
  if (!routeResult || distanceMeters <= 0) return null;
  const durationSeconds = routeResult.legs?.reduce((sum, leg) => sum + (typeof leg.duration?.value === "number" ? leg.duration.value : 0), 0) ?? 0;

  return {
    provider: "goong" as const,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationMinutes: durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null,
    geometry: parseEncodedRouteGeometry(routeResult.overview_polyline?.points),
    confidence: "high" as const,
    isEstimated: false as const,
    fallbackChain: ["goong" as const]
  } satisfies RouteResult;
}

export const goongProvider: GeocoderProviderClient & RoutingProviderClient = {
  id: "goong",
  search,
  reverse,
  autocomplete,
  placeDetail,
  route
};
