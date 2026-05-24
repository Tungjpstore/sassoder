import {
  fetchJson,
  getEnv,
  getGeocodingCountryParam,
  getGeocodingLanguage,
  normalizeLabel,
  toCoordinate
} from "@/services/maps/provider-runtime";
import type { Coordinate, GeocodingResult, MapRequestContext } from "@/services/maps/types";
import type { GeocoderProviderClient } from "@/services/maps/providers/types";

async function search(query: string, limit: number, context?: MapRequestContext) {
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

async function reverse(point: Coordinate, context?: MapRequestContext) {
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

export const nominatimProvider: GeocoderProviderClient = {
  id: "nominatim",
  search,
  reverse
};
