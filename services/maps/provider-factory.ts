import { getGoongMapStyleUrl } from "@/lib/geolocation/map-style";
import { goongProvider } from "./providers/goong-provider";
import { mapboxProvider } from "./providers/mapbox-provider";
import { nominatimProvider } from "./providers/nominatim-provider";
import { osrmProvider } from "./providers/osrm-provider";
import { vietmapProvider } from "./providers/vietmap-provider";
import {
  getEnv,
  getGoongApiKey,
  getMapboxAccessToken,
  parseProviderList,
  uniqueProviders
} from "@/services/maps/provider-runtime";
import { isProviderEnabledForOperation } from "@/services/maps/provider-policy-service";
import type { GeocodingProvider, MapRuntimeConfig, RoutingProvider } from "@/services/maps/types";
import type { GeocoderProviderClient, RoutingProviderClient } from "@/services/maps/providers/types";

const geocodingProviders: Record<GeocodingProvider, GeocoderProviderClient> = {
  goong: goongProvider,
  vietmap: vietmapProvider,
  mapbox: mapboxProvider,
  nominatim: nominatimProvider
};

const routingProviders: Record<RoutingProvider, RoutingProviderClient> = {
  goong: goongProvider,
  vietmap: vietmapProvider,
  mapbox: mapboxProvider,
  osrm: osrmProvider
};

const allowedGeocodingProviders: GeocodingProvider[] = ["goong", "vietmap", "mapbox", "nominatim"];
const allowedRoutingProviders: RoutingProvider[] = ["goong", "vietmap", "mapbox", "osrm"];

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

function hasGeocodingPolicy(provider: GeocodingProvider) {
  return isProviderEnabledForOperation(provider, "geocode") || isProviderEnabledForOperation(provider, "reverse");
}

function hasRoutingPolicy(provider: RoutingProvider) {
  return isProviderEnabledForOperation(provider, "route");
}

export function preferredGeocodingProvider(): GeocodingProvider {
  const configured = getEnv("MAPS_GEOCODER_PROVIDER");
  if (allowedGeocodingProviders.includes(configured as GeocodingProvider)) return configured as GeocodingProvider;
  if (getGoongApiKey()) return "goong";
  if (getEnv("VIETMAP_API_KEY")) return "vietmap";
  if (getMapboxAccessToken()) return "mapbox";
  return "nominatim";
}

export function preferredRoutingProvider(): RoutingProvider {
  const configured = getEnv("MAPS_ROUTING_PROVIDER");
  if (allowedRoutingProviders.includes(configured as RoutingProvider)) return configured as RoutingProvider;
  if (getGoongApiKey()) return "goong";
  if (getEnv("VIETMAP_API_KEY")) return "vietmap";
  if (getMapboxAccessToken()) return "mapbox";
  return "osrm";
}

export function getGeocodingFallbackChain(primary = preferredGeocodingProvider()) {
  const configured = parseProviderList<GeocodingProvider>(getEnv("MAPS_GEOCODER_FALLBACKS"), allowedGeocodingProviders);
  const defaultChain: GeocodingProvider[] = [primary, "goong", "vietmap", "mapbox", "nominatim"];
  return uniqueProviders(configured.length > 0 ? [primary, ...configured] : defaultChain)
    .filter(hasProviderCredentials)
    .filter(hasGeocodingPolicy);
}

export function getRoutingFallbackChain(primary = preferredRoutingProvider()) {
  const configured = parseProviderList<RoutingProvider>(getEnv("MAPS_ROUTING_FALLBACKS"), allowedRoutingProviders);
  const defaultChain: RoutingProvider[] = [primary, "goong", "vietmap", "mapbox", "osrm"];
  return uniqueProviders(configured.length > 0 ? [primary, ...configured] : defaultChain)
    .filter(hasProviderCredentials)
    .filter(hasRoutingPolicy);
}

export function getGeocoderProviders(primary?: GeocodingProvider) {
  return getGeocodingFallbackChain(primary).map((provider) => geocodingProviders[provider]);
}

export function getRoutingProviders(primary?: RoutingProvider) {
  return getRoutingFallbackChain(primary).map((provider) => routingProviders[provider]);
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
