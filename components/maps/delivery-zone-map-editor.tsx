"use client";

import "@/components/maps/maplibre-gl-styles";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MousePointer2, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  estimateDeliveryAreaStats,
  makeDefaultDeliveryPolygon,
  type DeliveryAreaPoint
} from "@/components/maps/delivery-area-editor";
import { MapLayerControl } from "@/components/maps/map-layer-control";
import { MapCanvas } from "@/components/maps/map-canvas";
import { MapLegend, MapMetricStrip, MapScaleBar, MapStatusPill } from "@/components/maps/map-ui-kit";
import { createLogiVNMarkerElement } from "@/components/maps/logivn-marker";
import { fitMapToPoints, toLngLat } from "@/components/maps/route-preview-layer";
import { applyClientMapLayer, getDefaultClientMapStyle, resolveClientMapStyle, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import { cn } from "@/lib/utils";
import type { GeoJSONSource, Map, Marker } from "maplibre-gl";

type MapLibreModule = typeof import("maplibre-gl");

type DeliveryZoneMapEditorProps = {
  centerLat: number;
  centerLng: number;
  points: DeliveryAreaPoint[];
  onChange: (points: DeliveryAreaPoint[]) => void;
  className?: string;
};

const fallbackCenter: DeliveryAreaPoint = {
  lat: 10.7769,
  lng: 106.7009
};

const maxPolygonPoints = 24;
const zoneSourceId = "logivn-delivery-zone";
const zoneFillLayerId = "logivn-delivery-zone-fill";
const zoneLineLayerId = "logivn-delivery-zone-line";

const fallbackMapStyle = getDefaultClientMapStyle();

function normalizePoint(point: DeliveryAreaPoint): DeliveryAreaPoint {
  return {
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6))
  };
}

function getSafeCenter(centerLat: number, centerLng: number): DeliveryAreaPoint {
  return {
    lat: Number.isFinite(centerLat) ? centerLat : fallbackCenter.lat,
    lng: Number.isFinite(centerLng) ? centerLng : fallbackCenter.lng
  };
}

function buildZoneFeatureCollection(points: DeliveryAreaPoint[]) {
  const validPoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (validPoints.length < 3) {
    return {
      type: "FeatureCollection" as const,
      features: []
    };
  }

  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [[...validPoints.map(toLngLat), toLngLat(validPoints[0])]]
        }
      }
    ]
  };
}

function ensureZoneLayers(map: Map) {
  if (!map.getSource(zoneSourceId)) {
    map.addSource(zoneSourceId, {
      type: "geojson",
      data: buildZoneFeatureCollection([])
    });
  }

  if (!map.getLayer(zoneFillLayerId)) {
    map.addLayer({
      id: zoneFillLayerId,
      type: "fill",
      source: zoneSourceId,
      paint: {
        "fill-color": "#0f6944",
        "fill-opacity": 0.19
      }
    });
  }

  if (!map.getLayer(zoneLineLayerId)) {
    map.addLayer({
      id: zoneLineLayerId,
      type: "line",
      source: zoneSourceId,
      paint: {
        "line-color": "#0f6944",
        "line-dasharray": [1.3, 0.8],
        "line-opacity": 0.95,
        "line-width": 3
      }
    });
  }
}

function updateZoneSource(map: Map, points: DeliveryAreaPoint[]) {
  const source = map.getSource(zoneSourceId) as GeoJSONSource | undefined;
  source?.setData(buildZoneFeatureCollection(points));
}

function createVertexMarkerElement(index: number) {
  const element = createLogiVNMarkerElement({ label: String(index + 1), tone: "gps", title: `Điểm vùng giao ${index + 1}` });
  element.className = `${element.className} cursor-grab active:cursor-grabbing`;
  return element;
}

function removeMarkers(markers: Marker[]) {
  markers.forEach((marker) => marker.remove());
}

export function DeliveryZoneMapEditor({
  centerLat,
  centerLng,
  points,
  onChange,
  className
}: DeliveryZoneMapEditorProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const storeMarkerRef = useRef<Marker | null>(null);
  const vertexMarkersRef = useRef<Marker[]>([]);
  const onChangeRef = useRef(onChange);
  const pointsRef = useRef(points);
  const addingPointRef = useRef(false);
  const appliedMapLayerRef = useRef<ClientMapLayerMode>("streets");
  const centerRef = useRef(getSafeCenter(centerLat, centerLng));

  const [mapReady, setMapReady] = useState(false);
  const [addingPoint, setAddingPoint] = useState(false);
  const [mapLayer, setMapLayer] = useState<ClientMapLayerMode>("streets");
  const [styleRevision, setStyleRevision] = useState(0);

  const center = useMemo(() => getSafeCenter(centerLat, centerLng), [centerLat, centerLng]);
  const areaStats = useMemo(() => estimateDeliveryAreaStats(points, center), [points, center]);
  const canSavePolygon = points.length >= 3;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;

      maplibreRef.current = maplibre;
      const initialCenter = centerRef.current;
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: resolveClientMapStyle(fallbackMapStyle, appliedMapLayerRef.current),
        center: toLngLat(initialCenter),
        zoom: 12.8,
        attributionControl: {}
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      storeMarkerRef.current = new maplibre.Marker({ element: createLogiVNMarkerElement({ label: "Q", tone: "store", title: "Vị trí quán" }) })
        .setLngLat(toLngLat(initialCenter))
        .addTo(map);

      map.on("click", (event) => {
        if (!addingPointRef.current) return;
        const current = pointsRef.current;
        if (current.length >= maxPolygonPoints) return;
        onChangeRef.current([...current, normalizePoint({ lat: event.lngLat.lat, lng: event.lngLat.lng })]);
      });

      map.on("load", () => {
        if (disposed) return;
        ensureZoneLayers(map);
        updateZoneSource(map, pointsRef.current);
        setMapReady(true);
      });

      mapRef.current = map;
    }

    void mountMap();

    return () => {
      disposed = true;
      removeMarkers(vertexMarkersRef.current);
      vertexMarkersRef.current = [];
      storeMarkerRef.current?.remove();
      mapRef.current?.remove();
      storeMarkerRef.current = null;
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, []);

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
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !mapReady) return;
    if (!map.isStyleLoaded()) return;

    ensureZoneLayers(map);
    updateZoneSource(map, points);
    removeMarkers(vertexMarkersRef.current);

    vertexMarkersRef.current = points.map((point, index) => {
      const marker = new maplibre.Marker({
        element: createVertexMarkerElement(index),
        draggable: true
      })
        .setLngLat(toLngLat(point))
        .addTo(map);

      marker.on("drag", () => {
        const current = [...pointsRef.current];
        const nextPoint = marker.getLngLat();
        current[index] = normalizePoint({ lat: nextPoint.lat, lng: nextPoint.lng });
        updateZoneSource(map, current);
      });

      marker.on("dragend", () => {
        const current = [...pointsRef.current];
        const nextPoint = marker.getLngLat();
        current[index] = normalizePoint({ lat: nextPoint.lat, lng: nextPoint.lng });
        onChangeRef.current(current);
      });

      return marker;
    });
  }, [mapReady, points, styleRevision]);

  useEffect(() => {
    if (!mapReady) return;
    storeMarkerRef.current?.setLngLat(toLngLat(center));
  }, [center, mapReady]);

  function toggleAddPointMode() {
    setAddingPoint((current) => {
      const next = !current;
      addingPointRef.current = next;
      return next;
    });
  }

  function finishAddPointMode() {
    addingPointRef.current = false;
    setAddingPoint(false);
  }

  function resetPolygon() {
    onChange(makeDefaultDeliveryPolygon(center.lat, center.lng));
    finishAddPointMode();
  }

  function removeLastPoint() {
    onChange(points.slice(0, -1));
    if (points.length <= 1) finishAddPointMode();
  }

  function fitToZone() {
    const map = mapRef.current;
    const maplibre = maplibreRef.current;
    const boundsPoints = points.length ? [...points, center] : [center];
    if (!map || !maplibre || boundsPoints.length === 0) return;

    fitMapToPoints(maplibre, map, boundsPoints, { duration: 520, maxZoom: 15, padding: 58 });
  }

  return (
    <div
      className={cn(
        "dashboard-map-surface dashboard-zone-map-editor overflow-hidden rounded-[28px] border border-[#dfe8dc] bg-[#f7f2e8] shadow-[0_22px_70px_rgba(15,77,58,0.14)]",
        className
      )}
    >
      <div className="relative">
        <MapCanvas ref={mapContainerRef} className="dashboard-map-canvas h-[420px] lg:h-[500px]" />
        <MapLayerControl compact value={mapLayer} onChange={setMapLayer} className="dashboard-map-layer-control absolute right-3 top-[64px]" />

        <div className="dashboard-map-top-overlay pointer-events-none absolute left-3 top-3 max-w-[72%] rounded-[20px] border border-white/75 bg-white/90 px-3 py-2 text-xs font-bold text-[#145a40] shadow-[0_14px_34px_rgba(15,77,58,0.14)] backdrop-blur-xl">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-[#6a7b6f]">Delivery Zone Studio</span>
          <span className="mt-0.5 block">{addingPoint ? "Chạm bản đồ để thêm đỉnh vùng giao hàng" : "Kéo các điểm để chỉnh vùng giao hàng thật"}</span>
        </div>

        <MapStatusPill label="Zone" value={mapReady ? `${points.length} điểm` : "Loading"} tone={canSavePolygon ? "ready" : "warning"} className="pointer-events-none absolute right-3 top-3" />

        <div className="pointer-events-none absolute bottom-[142px] left-3 hidden gap-2 sm:grid">
          <MapLegend items={[{ label: "Quán", tone: "store" }, { label: "Vùng giao", tone: "zone" }, { label: "Điểm kéo", tone: "gps" }]} />
          <MapScaleBar label="1 km" />
        </div>

        <div className="dashboard-map-control-dock absolute inset-x-3 bottom-3 rounded-2xl border border-white/75 bg-white/90 p-2 shadow-[0_18px_48px_rgba(15,77,58,0.16)] backdrop-blur sm:inset-x-auto sm:left-3 sm:w-[360px]">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleAddPointMode}
              className={cn(
                "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition",
                addingPoint ? "bg-[#0f6944] text-white" : "border border-[#d7e5d9] bg-white text-[#0f6944]"
              )}
            >
              <Plus size={15} aria-hidden="true" />
              Thêm điểm
            </button>
            <button
              type="button"
              onClick={finishAddPointMode}
              disabled={!addingPoint}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-[#d7e5d9] bg-white px-3 text-xs font-black text-[#0f6944] disabled:opacity-45"
            >
              <Check size={15} aria-hidden="true" />
              Hoàn tất
            </button>
            <button
              type="button"
              onClick={resetPolygon}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-[#f2d6af] bg-[#fff7eb] px-3 text-xs font-black text-[#bb5f12]"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Tạo lại
            </button>
            <button
              type="button"
              onClick={removeLastPoint}
              disabled={points.length === 0}
              className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-[#f5c8c8] bg-white px-3 text-xs font-black text-[#c53535] disabled:opacity-45"
            >
              <Trash2 size={15} aria-hidden="true" />
              Xóa điểm cuối
            </button>
          </div>

          <button
            type="button"
            onClick={fitToZone}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[#d7e5d9] bg-[#f4faf2] px-3 text-xs font-black text-[#145a40]"
          >
            <MousePointer2 size={14} aria-hidden="true" />
            Căn khung vùng giao hàng
          </button>
        </div>
      </div>

      <div className="border-t border-[#e7e2d8] bg-white px-3 py-3">
        <MapMetricStrip
          items={[
            { label: "Trạng thái", value: canSavePolygon ? "Hợp lệ" : "Cần 3 điểm", tone: canSavePolygon ? "green" : "orange" },
            { label: "Diện tích", value: `${areaStats.areaKm2.toFixed(1)} km²`, tone: "neutral" },
            { label: "Xa nhất", value: `${areaStats.maxDistanceKm.toFixed(1)} km`, tone: "neutral" }
          ]}
        />
      </div>
    </div>
  );
}
