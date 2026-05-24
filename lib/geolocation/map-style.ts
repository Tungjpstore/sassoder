import type { Map, StyleSpecification } from "maplibre-gl";

const goongStreetStyleUrl = "https://tiles.goong.io/assets/goong_map_web.json";
const osmStreetTileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const esriWorldImageryTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const esriWorldTransportationTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const esriWorldBoundariesTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export type ClientMapLayerMode = "streets" | "satellite" | "hybrid";

export const clientMapLayerModes: Array<{ id: ClientMapLayerMode; label: string; shortLabel: string }> = [
  { id: "streets", label: "Bản đồ đường", shortLabel: "Đường" },
  { id: "satellite", label: "Vệ tinh", shortLabel: "Vệ tinh" },
  { id: "hybrid", label: "Vệ tinh + đường", shortLabel: "Hybrid" }
];

type MapStyleResult = string | StyleSpecification;

export function getGoongMapStyleUrl(maptilesKey?: string | null) {
  const key = maptilesKey?.trim();
  if (!key) return "";
  const url = new URL(goongStreetStyleUrl);
  url.searchParams.set("api_key", key);
  return url.toString();
}

function getEnvUrl(key: string) {
  return process.env[key]?.trim() || "";
}

function buildStreetRasterStyle(): StyleSpecification {
  const tileUrl = getEnvUrl("NEXT_PUBLIC_MAP_STREETS_TILE_URL") || osmStreetTileUrl;
  const attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() || "© OpenStreetMap contributors";

  return {
    version: 8,
    sources: {
      "logivn-streets-raster": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution
      }
    },
    layers: [
      {
        id: "logivn-streets-raster",
        type: "raster",
        source: "logivn-streets-raster"
      }
    ]
  };
}

function buildSatelliteRasterStyle(): StyleSpecification {
  const tileUrl = getEnvUrl("NEXT_PUBLIC_MAP_SATELLITE_TILE_URL") || esriWorldImageryTileUrl;
  const attribution =
    process.env.NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION?.trim() ||
    "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

  return {
    version: 8,
    sources: {
      "logivn-satellite-raster": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution
      }
    },
    layers: [
      {
        id: "logivn-satellite-raster",
        type: "raster",
        source: "logivn-satellite-raster"
      }
    ]
  };
}

function buildHybridRasterStyle(): StyleSpecification {
  const satellite = buildSatelliteRasterStyle();
  const transportationTileUrl = getEnvUrl("NEXT_PUBLIC_MAP_HYBRID_TRANSPORT_TILE_URL") || esriWorldTransportationTileUrl;
  const labelTileUrl = getEnvUrl("NEXT_PUBLIC_MAP_HYBRID_LABEL_TILE_URL") || esriWorldBoundariesTileUrl;

  return {
    version: 8,
    sources: {
      ...satellite.sources,
      "logivn-hybrid-transport-raster": {
        type: "raster",
        tiles: [transportationTileUrl],
        tileSize: 256,
        attribution: "Source: Esri"
      },
      "logivn-hybrid-label-raster": {
        type: "raster",
        tiles: [labelTileUrl],
        tileSize: 256,
        attribution: "Source: Esri"
      }
    },
    layers: [
      ...satellite.layers,
      {
        id: "logivn-hybrid-transport-raster",
        type: "raster",
        source: "logivn-hybrid-transport-raster",
        paint: {
          "raster-opacity": 0.86
        }
      },
      {
        id: "logivn-hybrid-label-raster",
        type: "raster",
        source: "logivn-hybrid-label-raster",
        paint: {
          "raster-opacity": 0.92
        }
      }
    ]
  };
}

export function getDefaultClientMapStyle(): StyleSpecification {
  return buildStreetRasterStyle();
}

function resolveStreetStyle(fallbackStyle: StyleSpecification): MapStyleResult {
  return getEnvUrl("NEXT_PUBLIC_MAP_STYLE_URL") || getGoongMapStyleUrl(process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY) || fallbackStyle;
}

function resolveSatelliteStyle(): MapStyleResult {
  return getEnvUrl("NEXT_PUBLIC_MAP_SATELLITE_STYLE_URL") || buildSatelliteRasterStyle();
}

function resolveHybridStyle(): MapStyleResult {
  return getEnvUrl("NEXT_PUBLIC_MAP_HYBRID_STYLE_URL") || buildHybridRasterStyle();
}

export function resolveClientMapStyle(
  fallbackStyle: StyleSpecification = getDefaultClientMapStyle(),
  mode: ClientMapLayerMode = "streets"
): MapStyleResult {
  if (mode === "satellite") return resolveSatelliteStyle();
  if (mode === "hybrid") return resolveHybridStyle();
  return resolveStreetStyle(fallbackStyle);
}

export function applyClientMapLayer({
  map,
  fallbackStyle = getDefaultClientMapStyle(),
  mode,
  onStyleReady,
  onStyleError
}: {
  map: Map;
  fallbackStyle?: StyleSpecification;
  mode: ClientMapLayerMode;
  onStyleReady?: () => void;
  onStyleError?: (error: unknown) => void;
}) {
  let settled = false;
  let timeoutId: number | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    onStyleReady?.();
  };

  const fail = (error: unknown) => {
    if (settled) return;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    onStyleError?.(error);
    try {
      map.once("style.load", finish);
      map.setStyle(fallbackStyle, { diff: false });
    } catch {
      finish();
    }
  };

  try {
    map.once("style.load", finish);
    map.setStyle(resolveClientMapStyle(fallbackStyle, mode), { diff: false });
    timeoutId = window.setTimeout(() => {
      if (map.isStyleLoaded()) finish();
    }, 1800);
  } catch (error) {
    fail(error);
  }

  return () => {
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}
