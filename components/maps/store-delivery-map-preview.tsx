"use client";

import "@/components/maps/maplibre-gl-styles";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { createLogiVNMarkerElement } from "@/components/maps/logivn-marker";
import { MapLayerControl } from "@/components/maps/map-layer-control";
import { MapCanvas } from "@/components/maps/map-canvas";
import { MapLegend, MapMetricStrip, MapScaleBar, MapStatusPill } from "@/components/maps/map-ui-kit";
import { applyClientMapLayer, getDefaultClientMapStyle, resolveClientMapStyle, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import type { GeoJSONSource, Map } from "maplibre-gl";
import type { Coordinate } from "@/services/maps/types";

type StoreDeliveryMapPreviewProps = {
  latitude?: number | null;
  longitude?: number | null;
  radiusKm: number;
  address?: string | null;
};

const defaultCenter: Coordinate = {
  lat: 10.7769,
  lng: 106.7009
};

const fallbackMapStyle = getDefaultClientMapStyle();

function parsePoint(latitude?: number | null, longitude?: number | null) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    lat: Number(latitude),
    lng: Number(longitude)
  };
}

function buildCircleFeature(center: Coordinate, radiusKm: number) {
  const earthRadiusKm = 6371;
  const coordinates: number[][] = [];
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const distance = radiusKm / earthRadiusKm;

  for (let bearingIndex = 0; bearingIndex <= 72; bearingIndex += 1) {
    const bearing = ((bearingIndex * 5) * Math.PI) / 180;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const nextLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
        Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat)
      );
    coordinates.push([(nextLng * 180) / Math.PI, (nextLat * 180) / Math.PI]);
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates]
    }
  };
}

function syncRadiusLayer(map: Map, center: Coordinate, radiusKm: number) {
  const source = map.getSource("store-delivery-radius") as GeoJSONSource | undefined;
  if (source) {
    source.setData(buildCircleFeature(center, radiusKm));
    return;
  }

  map.addSource("store-delivery-radius", {
    type: "geojson",
    data: buildCircleFeature(center, radiusKm)
  });
  map.addLayer({
    id: "store-delivery-radius-fill",
    type: "fill",
    source: "store-delivery-radius",
    paint: {
      "fill-color": "#F28C28",
      "fill-opacity": 0.16
    }
  });
  map.addLayer({
    id: "store-delivery-radius-line",
    type: "line",
    source: "store-delivery-radius",
    paint: {
      "line-color": "#F28C28",
      "line-width": 2,
      "line-opacity": 0.72
    }
  });
}

export function StoreDeliveryMapPreview({
  latitude,
  longitude,
  radiusKm,
  address
}: StoreDeliveryMapPreviewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const appliedMapLayerRef = useRef<ClientMapLayerMode>("streets");
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<ClientMapLayerMode>("streets");
  const [styleRevision, setStyleRevision] = useState(0);
  const point = parsePoint(latitude, longitude);
  const pointLat = point?.lat ?? null;
  const pointLng = point?.lng ?? null;

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;
      const mountPoint = parsePoint(pointLat, pointLng);
      const center = mountPoint ?? defaultCenter;

      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: resolveClientMapStyle(fallbackMapStyle, appliedMapLayerRef.current),
        center: [center.lng, center.lat],
        zoom: mountPoint ? 12 : 10,
        attributionControl: {}
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      if (mountPoint) {
        const markerElement = createLogiVNMarkerElement({ label: "Q", tone: "store", title: "Vị trí quán" });
        markerRef.current = new maplibre.Marker({ element: markerElement }).setLngLat([mountPoint.lng, mountPoint.lat]).addTo(map);
      }

      map.on("load", () => {
        if (mountPoint && radiusKm > 0) {
          syncRadiusLayer(map, mountPoint, radiusKm);
        }
        setMapReady(true);
      });

      mapRef.current = map;
    }

    void mountMap();
    return () => {
      disposed = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [pointLat, pointLng, radiusKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || appliedMapLayerRef.current === mapLayer) return;
    appliedMapLayerRef.current = mapLayer;
    return applyClientMapLayer({
      map,
      fallbackStyle: fallbackMapStyle,
      mode: mapLayer,
      onStyleReady: () => setStyleRevision((revision) => revision + 1)
    });
  }, [mapLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !point || radiusKm <= 0 || !map.isStyleLoaded()) return;
    syncRadiusLayer(map, point, radiusKm);
  }, [mapReady, point, radiusKm, styleRevision]);

  return (
    <section className="dashboard-panel dashboard-map-surface overflow-hidden rounded-[28px] p-0 shadow-[0_18px_55px_rgba(15,77,58,0.11)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-white/80 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Delivery Coverage</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Vùng giao hiện tại</h2>
        </div>
        <MapStatusPill label="Bán kính" value={mapReady ? `${radiusKm} km` : "Loading"} tone={mapReady ? "ready" : "loading"} />
      </div>
      <div className="relative">
        <MapCanvas ref={mapContainerRef} className="dashboard-map-canvas dashboard-map-canvas--preview h-[300px]" />
        <MapLayerControl compact value={mapLayer} onChange={setMapLayer} className="dashboard-map-layer-control absolute right-3 top-3" />
        <div className="pointer-events-none absolute left-3 top-3 hidden sm:block">
          <MapLegend compact items={[{ label: "Quán", tone: "store" }, { label: "Bán kính", tone: "radius" }]} />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3">
          <MapScaleBar label="1 km" />
        </div>
        <div className="dashboard-map-bottom-label pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl border border-white/70 bg-white/88 px-3 py-2 text-xs font-bold text-[var(--muted-foreground)] shadow-[0_14px_34px_rgba(15,77,58,0.12)] backdrop-blur-xl sm:inset-x-auto sm:left-[92px] sm:right-3">
          <span className="flex items-center gap-2">
            <MapPin size={13} className="text-[var(--accent)]" />
            {point ? address || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : "Chưa có tọa độ quán"}
          </span>
        </div>
      </div>
      <div className="border-t border-[var(--border)] p-3">
        <MapMetricStrip
          items={[
            { label: "Trạng thái", value: point ? "Đã ghim" : "Thiếu tọa độ", tone: point ? "green" : "orange" },
            { label: "Bán kính giao", value: `${radiusKm} km`, tone: "orange" },
            { label: "Lớp bản đồ", value: mapLayer === "streets" ? "Đường" : mapLayer === "satellite" ? "Vệ tinh" : "Hybrid", tone: "neutral" }
          ]}
        />
      </div>
    </section>
  );
}
