"use client";

import type { GeoJSONSource, Map } from "maplibre-gl";

export type MapPoint = { lat: number; lng: number };

export type RoutePreviewStyle = {
  sourceId?: string;
  layerId?: string;
  shadowLayerId?: string;
  color?: string;
  shadowColor?: string;
  width?: number;
  shadowWidth?: number;
  opacity?: number;
};

export function toLngLat(point: MapPoint): [number, number] {
  return [point.lng, point.lat];
}

export function isValidMapPoint(point: { lat: unknown; lng: unknown }): point is MapPoint {
  return typeof point.lat === "number" && Number.isFinite(point.lat) && typeof point.lng === "number" && Number.isFinite(point.lng);
}

export function normalizeRoutePoints({
  origin,
  destination,
  route
}: {
  origin?: { lat: number | null | undefined; lng: number | null | undefined } | null;
  destination?: { lat: number | null | undefined; lng: number | null | undefined } | null;
  route?: number[][] | null;
}) {
  const routePoints =
    route && route.length >= 2
      ? route
          .map((point) => ({ lng: Number(point[0]), lat: Number(point[1]) }))
          .filter(isValidMapPoint)
      : [];

  if (routePoints.length >= 2) return routePoints;
  if (origin && destination && isValidMapPoint(origin) && isValidMapPoint(destination)) {
    return [
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng }
    ];
  }
  return [];
}

export function buildRoutePreviewFeature(points: MapPoint[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map(toLngLat)
    }
  };
}

export function removeRoutePreviewLayer(map: Map, style: RoutePreviewStyle = {}) {
  const sourceId = style.sourceId ?? "logivn-route-preview";
  const shadowLayerId = style.shadowLayerId ?? `${sourceId}-shadow`;
  const layerId = style.layerId ?? `${sourceId}-line`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(shadowLayerId)) map.removeLayer(shadowLayerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function syncRoutePreviewLayer(map: Map, points: MapPoint[], style: RoutePreviewStyle = {}) {
  const sourceId = style.sourceId ?? "logivn-route-preview";
  const shadowLayerId = style.shadowLayerId ?? `${sourceId}-shadow`;
  const layerId = style.layerId ?? `${sourceId}-line`;
  const data = buildRoutePreviewFeature(points);
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(sourceId, { type: "geojson", data });
  map.addLayer({
    id: shadowLayerId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": style.shadowColor ?? "#ffffff",
      "line-opacity": 0.9,
      "line-width": style.shadowWidth ?? 7
    }
  });
  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": style.color ?? "#0F4D3A",
      "line-opacity": style.opacity ?? 0.95,
      "line-width": style.width ?? 3.4
    }
  });
}

export function fitMapToPoints(
  maplibre: typeof import("maplibre-gl"),
  map: Map,
  points: MapPoint[],
  options: { padding?: number; duration?: number; maxZoom?: number } = {}
) {
  if (points.length === 0) return;
  const first = toLngLat(points[0]);
  const bounds = points.reduce((nextBounds, point) => nextBounds.extend(toLngLat(point)), new maplibre.LngLatBounds(first, first));
  map.fitBounds(bounds, {
    padding: options.padding ?? 44,
    duration: options.duration ?? 520,
    maxZoom: options.maxZoom ?? 15
  });
}
