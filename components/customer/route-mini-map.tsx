"use client";

import "@/components/maps/maplibre-gl-styles";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation, Route, Store, Truck } from "lucide-react";
import { MapLayerControl } from "@/components/maps/map-layer-control";
import { MapLegend, MapMetricStrip, MapScaleBar, MapStatusPill } from "@/components/maps/map-ui-kit";
import { createLogiVNMarkerElement } from "@/components/maps/logivn-marker";
import { fitMapToPoints, normalizeRoutePoints, syncRoutePreviewLayer, toLngLat, type MapPoint } from "@/components/maps/route-preview-layer";
import { buildDirectionsHref } from "@/lib/geolocation/directions";
import { applyClientMapLayer, getDefaultClientMapStyle, resolveClientMapStyle, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import { deliveryStatusLabel } from "@/lib/labels";
import type { Map, Marker } from "maplibre-gl";

type Coordinate = { lat: number | null | undefined; lng: number | null | undefined };
type MapLibreModule = typeof import("maplibre-gl");

const fallbackMapStyle = getDefaultClientMapStyle();

function isValidCoordinate(point: Coordinate) {
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  );
}

function clearMarkers(markers: Marker[]) {
  markers.forEach((marker) => marker.remove());
}

export function buildDirectionsUrl(origin: Coordinate, destination: Coordinate) {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) return null;
  return buildDirectionsHref(
    { lat: Number(destination.lat), lng: Number(destination.lng) },
    {
      origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent
    }
  );
}

export function RouteMiniMap({
  origin,
  destination,
  route,
  distanceKm,
  durationMinutes,
  status,
  courierLocation,
  title = "Tuyến giao đang cập nhật",
  statusLabel,
  originLabel = "Quán",
  destinationLabel = "Khách",
  compact = false
}: {
  origin: Coordinate;
  destination: Coordinate;
  route?: number[][] | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  status?: string | null;
  courierLocation?: (Coordinate & { capturedAt?: string | null }) | null;
  title?: string;
  statusLabel?: string;
  originLabel?: string;
  destinationLabel?: string;
  compact?: boolean;
}) {
  const originLat = origin.lat;
  const originLng = origin.lng;
  const destinationLat = destination.lat;
  const destinationLng = destination.lng;
  const points = useMemo(
    () =>
      normalizeRoutePoints({
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destinationLat, lng: destinationLng },
        route
      }),
    [destinationLat, destinationLng, originLat, originLng, route]
  );
  const hasCourierLocation = courierLocation && isValidCoordinate(courierLocation);
  const mapUrl = buildDirectionsUrl(origin, destination);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const appliedMapLayerRef = useRef<ClientMapLayerMode>("streets");
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<ClientMapLayerMode>("streets");
  const [styleRevision, setStyleRevision] = useState(0);
  const routePointsKey = points.map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`).join("|");
  const courierKey = hasCourierLocation ? `${Number(courierLocation.lat).toFixed(6)},${Number(courierLocation.lng).toFixed(6)}` : "";

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current || points.length < 2) return;
      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;

      maplibreRef.current = maplibre;
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: resolveClientMapStyle(fallbackMapStyle, appliedMapLayerRef.current),
        center: toLngLat(points[0]),
        zoom: 13,
        attributionControl: {}
      });
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => setMapReady(true));
      mapRef.current = map;
    }

    void mountMap();
    return () => {
      disposed = true;
      clearMarkers(markerRefs.current);
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, [routePointsKey, points]);

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
    if (!map || !maplibre || !mapReady || points.length < 2 || !map.isStyleLoaded()) return;

    syncRoutePreviewLayer(map, points, { sourceId: "logivn-route-mini-line" });
    clearMarkers(markerRefs.current);

    const nextMarkers = [
      new maplibre.Marker({ element: createLogiVNMarkerElement({ label: "Q", tone: "store", title: originLabel }) }).setLngLat(toLngLat(points[0])).addTo(map),
      new maplibre.Marker({ element: createLogiVNMarkerElement({ label: "K", tone: "customer", title: destinationLabel }) }).setLngLat(toLngLat(points[points.length - 1])).addTo(map)
    ];

    if (hasCourierLocation) {
      nextMarkers.push(
        new maplibre.Marker({ element: createLogiVNMarkerElement({ label: "T", tone: "courier", title: "Tài xế" }) })
          .setLngLat([Number(courierLocation.lng), Number(courierLocation.lat)])
          .addTo(map)
      );
    }

    markerRefs.current = nextMarkers;
    const fitPoints: MapPoint[] = points.concat(hasCourierLocation ? [{ lat: Number(courierLocation.lat), lng: Number(courierLocation.lng) }] : []);
    fitMapToPoints(maplibre, map, fitPoints, { duration: 420, maxZoom: 15, padding: 42 });
  }, [courierKey, destinationLabel, hasCourierLocation, mapReady, originLabel, points, routePointsKey, styleRevision, courierLocation]);

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
        Chưa đủ tọa độ để hiển thị tuyến đường.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(15,77,58,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white/82 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Route size={16} />
          </span>
          <span>
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Xem trước tuyến</span>
            <span className="block">{title}</span>
          </span>
        </div>
        <MapStatusPill label="Trạng thái" value={statusLabel ?? deliveryStatusLabel(status)} tone="ready" />
      </div>

      <div className={`relative ${compact ? "h-56" : "h-72"} bg-[radial-gradient(circle_at_top,rgba(15,77,58,0.09),transparent_42%),linear-gradient(180deg,rgba(255,247,235,0.8),rgba(248,242,232,0.95))]`}>
        <div ref={mapContainerRef} className="h-full w-full" />
        <MapLayerControl compact value={mapLayer} onChange={setMapLayer} className="absolute right-3 top-3" />
        <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/88 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] shadow-sm backdrop-blur">
          <Store size={14} />
          {originLabel}
        </div>
        <div className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)]/92 px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)] shadow-sm backdrop-blur">
          <Navigation size={14} />
          {destinationLabel}
        </div>
        {hasCourierLocation ? (
          <div className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/90 px-3 py-1.5 text-xs font-black text-[var(--primary)] shadow-sm backdrop-blur">
            <Truck size={14} />
            {courierLocation?.capturedAt ? `Cập nhật ${new Date(courierLocation.capturedAt).toLocaleTimeString("vi-VN")}` : "Đang theo dõi"}
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-4 left-4 grid gap-2">
          <MapLegend compact items={[{ label: originLabel, tone: "store" }, { label: destinationLabel, tone: "customer" }, { label: "Tuyến", tone: "route" }, ...(hasCourierLocation ? [{ label: "Tài xế", tone: "courier" as const }] : [])]} />
          <MapScaleBar />
        </div>
      </div>

      <div className="grid gap-2 border-t border-[var(--border)] p-3 text-sm sm:grid-cols-[1fr_auto]">
        <MapMetricStrip
          className="sm:grid-cols-2"
          items={[
            { label: "Khoảng cách", value: distanceKm ? `${distanceKm} km` : "--", tone: "green" },
            { label: "Dự kiến", value: durationMinutes ? `${durationMinutes} phút` : "--", tone: "orange" }
          ]}
        />
        {mapUrl ? (
          <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-xs font-black text-[var(--primary)] transition hover:border-[var(--primary)]">
            Chỉ đường
          </a>
        ) : (
          <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 text-xs font-semibold text-[var(--muted-foreground)]">
            Chưa có map
          </span>
        )}
      </div>
    </section>
  );
}
