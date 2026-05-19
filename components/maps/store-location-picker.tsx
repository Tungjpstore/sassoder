"use client";

import "@/components/maps/maplibre-gl-styles";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Search, Sparkles } from "lucide-react";
import { VietnamAdminSelector } from "@/components/location/vietnam-admin-selector";
import { MapLayerControl } from "@/components/maps/map-layer-control";
import { MapCanvas } from "@/components/maps/map-canvas";
import { MapCrosshair, MapGlassPanel, MapLegend, MapScaleBar, MapStatusPill } from "@/components/maps/map-ui-kit";
import { createLogiVNMarkerElement } from "@/components/maps/logivn-marker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCoordinatePair } from "@/lib/geolocation/coordinates";
import { formatAccuracyMeters, isLowAccuracyLocation, isUnusableAccuracyLocation } from "@/lib/geolocation/coordinate-quality";
import { applyClientMapLayer, getDefaultClientMapStyle, resolveClientMapStyle, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import { cn } from "@/lib/utils";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction, Coordinate } from "@/services/maps/types";

type MapLibreModule = typeof import("maplibre-gl");

type StoreLocationPickerProps = {
  seedAddress?: string | null;
  latitude: string;
  longitude: string;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  onResolvedAddress?: (value: string) => void;
  compact?: boolean;
};

const defaultCenter: Coordinate = {
  lat: 10.7769,
  lng: 106.7009
};

const fallbackMapStyle = getDefaultClientMapStyle();

function parseCoordinatePair(latitude: string, longitude: string): Coordinate | null {
  return normalizeCoordinatePair(latitude, longitude);
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

export function StoreLocationPicker({
  seedAddress,
  latitude,
  longitude,
  onLatitudeChange,
  onLongitudeChange,
  onResolvedAddress,
  compact = false
}: StoreLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const activeSearchRef = useRef(0);
  const appliedMapLayerRef = useRef<ClientMapLayerMode>("streets");
  const searchAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const placeSessionTokenRef = useRef(createMapSessionToken());
  const initialPointRef = useRef(parseCoordinatePair(latitude, longitude) ?? defaultCenter);
  const hasInitialPointRef = useRef(Boolean(parseCoordinatePair(latitude, longitude)));

  const [searchQuery, setSearchQuery] = useState(seedAddress ?? "");
  const [adminHint, setAdminHint] = useState("");
  const [results, setResults] = useState<AddressAutocompletePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<ClientMapLayerMode>("streets");
  const [reverseLabel, setReverseLabel] = useState(seedAddress ?? "");
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpsAccuracyLabel, setGpsAccuracyLabel] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;
      maplibreRef.current = maplibre;

      const center = initialPointRef.current;
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: resolveClientMapStyle(fallbackMapStyle, appliedMapLayerRef.current),
        center: [center.lng, center.lat],
        zoom: hasInitialPointRef.current ? 15 : 11,
        attributionControl: {}
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      const marker = new maplibre.Marker({
        element: createLogiVNMarkerElement({ label: "Q", tone: "store", title: "Vị trí quán" }),
        draggable: true
      })
        .setLngLat([center.lng, center.lat])
        .addTo(map);

      marker.on("dragend", async () => {
        const point = marker.getLngLat();
        onLatitudeChange(formatCoordinate(point.lat));
        onLongitudeChange(formatCoordinate(point.lng));
        await reverseLookup({ lat: point.lat, lng: point.lng });
      });

      map.on("click", async (event) => {
        marker.setLngLat(event.lngLat);
        onLatitudeChange(formatCoordinate(event.lngLat.lat));
        onLongitudeChange(formatCoordinate(event.lngLat.lng));
        await reverseLookup({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      });

      map.on("load", () => setMapReady(true));

      mapRef.current = map;
      markerRef.current = marker;
    }

    async function reverseLookup(point: Coordinate) {
      try {
        const response = await fetch(`/api/maps/reverse?lat=${point.lat}&lng=${point.lng}`, {
          cache: "no-store"
        });
        const json = await response.json();
        if (!json.ok || !json.data?.address) return;
        setReverseLabel(json.data.shortLabel || json.data.address);
        onResolvedAddress?.(json.data.address);
      } catch {
        // Ignore transient reverse lookup failures to keep drag UX smooth.
      }
    }

    void mountMap();
    return () => {
      disposed = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [onLatitudeChange, onLongitudeChange, onResolvedAddress]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || appliedMapLayerRef.current === mapLayer) return;
    appliedMapLayerRef.current = mapLayer;
    return applyClientMapLayer({
      map: mapRef.current,
      fallbackStyle: fallbackMapStyle,
      mode: mapLayer,
      onStyleError: () => setMapError("Không tải được lớp bản đồ này. LogiVN đã chuyển về bản đồ đường để bạn tiếp tục ghim vị trí.")
    });
  }, [mapLayer, mapReady]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const point = parseCoordinatePair(latitude, longitude);
    if (!point || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([point.lng, point.lat]);
    mapRef.current.easeTo({
      center: [point.lng, point.lat],
      duration: 600
    });
  }, [latitude, longitude]);

  const handleAdminHintChange = useCallback((hint: string) => {
    setAdminHint(hint);
    if (!hint) return;
    setSearchQuery((current) => (current.trim() ? current : hint));
  }, []);

  async function searchPlace() {
    const query = searchQuery.trim() || adminHint.trim();
    if (query.length < 3) {
      setMapError("Nhập ít nhất 3 ký tự để tìm địa chỉ.");
      return;
    }
    const normalizedQuery = query.toLowerCase();
    const scopedQuery =
      adminHint && !normalizedQuery.includes(adminHint.toLowerCase()) ? `${query}, ${adminHint}` : query;

    const searchId = activeSearchRef.current + 1;
    activeSearchRef.current = searchId;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setMapError(null);
    setSearching(true);

    try {
      const nextResults = await fetchAddressPredictions({
        query: scopedQuery,
        limit: 5,
        sessionToken: placeSessionTokenRef.current,
        location: parseCoordinatePair(latitude, longitude) ?? initialPointRef.current,
        signal: controller.signal
      });
      if (searchId !== activeSearchRef.current) return;
      setResults(nextResults);
      if (nextResults.length === 0) {
        setMapError("Chưa tìm thấy địa chỉ phù hợp. Hãy thêm phường/xã hoặc quận/huyện.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (searchId !== activeSearchRef.current) return;
      setMapError(error instanceof Error ? error.message : "Không tìm được địa chỉ.");
      setResults([]);
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
      if (searchId === activeSearchRef.current) setSearching(false);
    }
  }

  async function useCurrentPosition() {
    if (!navigator.geolocation) {
      setMapError("Trình duyệt không hỗ trợ định vị.");
      return;
    }

    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracyMeters = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        const accuracyLabel = formatAccuracyMeters(accuracyMeters);
        setGpsAccuracyLabel(accuracyLabel);
        if (isUnusableAccuracyLocation(accuracyMeters)) {
          setMapError(`GPS/IP hiện quá lệch (${accuracyLabel}). Hãy tìm địa chỉ hoặc chạm/kéo pin trên bản đồ để tránh lưu sai vị trí quán.`);
          return;
        }
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        if (isLowAccuracyLocation(accuracyMeters)) {
          setMapError(`Vị trí chỉ chính xác khoảng ${accuracyLabel}. Nên kéo pin đúng mặt tiền quán trước khi lưu.`);
        }
        onLatitudeChange(formatCoordinate(point.lat));
        onLongitudeChange(formatCoordinate(point.lng));
      },
      () => setMapError("Không lấy được vị trí hiện tại của thiết bị."),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  async function chooseResult(result: AddressAutocompletePrediction) {
    setResults([]);
    setMapError(null);
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setSearching(true);

    try {
      const detail = await resolveAddressPrediction(result, {
        sessionToken: placeSessionTokenRef.current,
        signal: controller.signal
      });
      placeSessionTokenRef.current = createMapSessionToken();
      setSearchQuery(detail.address);
      setReverseLabel(detail.shortLabel || detail.address);
      onLatitudeChange(formatCoordinate(detail.lat));
      onLongitudeChange(formatCoordinate(detail.lng));
      onResolvedAddress?.(detail.address);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMapError(error instanceof Error ? error.message : "Không lấy được chi tiết địa chỉ.");
    } finally {
      if (detailAbortRef.current === controller) detailAbortRef.current = null;
      setSearching(false);
    }
  }

  if (compact) {
    return (
      <div className="dashboard-map-surface dashboard-map-surface--compact overflow-hidden rounded-xl border border-[#e7e2d8] bg-[linear-gradient(160deg,rgba(250,246,236,0.92),rgba(238,244,232,0.96))]">
        <div className="relative">
          <MapCanvas ref={mapContainerRef} className="dashboard-map-canvas dashboard-map-canvas--compact h-[300px]" />
          <MapCrosshair />
          <div className="dashboard-map-top-overlay pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
            <MapGlassPanel className="max-w-[68%]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#6a7b6f]">Vị trí quán</span>
              <span className="mt-0.5 block truncate text-[#145a40]">{reverseLabel || "Kéo marker để cập nhật vị trí"}</span>
            </MapGlassPanel>
            <MapStatusPill label="Live" value={mapReady ? "Ready" : "Loading"} tone={mapReady ? "ready" : "loading"} />
          </div>
          <MapLegend compact items={[{ label: "Quán", tone: "store" }, { label: "Pin", tone: "customer" }]} className="dashboard-map-legend absolute bottom-3 left-3" />
          <MapLayerControl compact value={mapLayer} onChange={setMapLayer} className="dashboard-map-layer-control absolute bottom-3 right-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-map-workspace grid gap-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="dashboard-map-surface overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(160deg,rgba(255,252,246,0.92),rgba(242,247,238,0.96))] shadow-[var(--shadow-lift)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white/70 px-4 py-3 backdrop-blur">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">LogiVN Store Map</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">Pin đúng mặt tiền quán để khách đo khoảng cách và chỉ đường chính xác.</p>
            </div>
            <MapStatusPill label="Canvas" value={mapReady ? "Ready" : "Loading"} tone={mapReady ? "ready" : "loading"} />
          </div>
          <div className="relative">
            <MapCanvas ref={mapContainerRef} className="dashboard-map-canvas h-[420px] lg:h-[500px]" />
            <MapCrosshair />
            <div className="dashboard-map-top-overlay pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
              <MapGlassPanel className="max-w-[58%]">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-[#6a7b6f]">Địa chỉ đã nhận diện</span>
                <span className="mt-0.5 block truncate text-[var(--primary)]">{reverseLabel || "Chưa có địa chỉ ghim"}</span>
              </MapGlassPanel>
              <MapGlassPanel className="max-w-[42%] text-right text-[var(--muted-foreground)]">
                {latitude && longitude ? `${latitude}, ${longitude}${gpsAccuracyLabel ? ` · GPS ${gpsAccuracyLabel}` : ""}` : "Chọn vị trí"}
              </MapGlassPanel>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 grid gap-2">
              <MapLegend items={[{ label: "Quán", tone: "store" }, { label: "Pin đang kéo", tone: "customer" }, { label: "GPS", tone: "gps" }]} />
              <MapScaleBar />
            </div>
            <MapLayerControl value={mapLayer} onChange={setMapLayer} className="dashboard-map-layer-control absolute bottom-4 right-4" />
          </div>
        </div>

        <div className="admin-glass-card rounded-[28px] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Sparkles size={16} className="text-[var(--accent)]" />
            Tìm nhanh địa chỉ quán
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Nhập địa chỉ, chọn gợi ý hoặc dùng GPS. Phần tỉnh/xã chỉ là tuỳ chọn để tăng độ chính xác.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold">
              Địa chỉ quán
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Ví dụ: 12 Nguyễn Huệ, Quận 1, TP.HCM"
              />
            </label>
            <details className="rounded-xl border border-[var(--border)] bg-white/72 px-3 py-2">
              <summary className="cursor-pointer text-xs font-black text-[var(--primary)] marker:text-[var(--accent)]">
                Chọn tỉnh/xã thủ công nếu cần
              </summary>
              <div className="mt-3">
                <VietnamAdminSelector compact onAddressHintChange={handleAdminHintChange} />
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={searchPlace} disabled={searching} className="flex-1">
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {searching ? "Đang tìm…" : "Tìm trên bản đồ"}
              </Button>
              <Button type="button" variant="secondary" onClick={useCurrentPosition}>
                <LocateFixed size={16} />
                Vị trí hiện tại
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => chooseResult(result)}
                className={cn(
                  "w-full rounded-2xl border border-[var(--border)] bg-white/72 p-3 text-left transition hover:border-[var(--primary)]/40 hover:bg-white"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <MapPin size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{result.shortLabel}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{result.address}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          {mapError ? <p className="mt-3 text-sm font-semibold text-[var(--accent-strong)]">{mapError}</p> : null}

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm text-[var(--muted-foreground)]">
            <p className="font-semibold text-[var(--foreground)]">Mẹo vận hành</p>
            <p className="mt-2 leading-6">
              Đặt pin ngay mặt tiền hoặc cổng vào dễ nhận biết nhất để khách mở chỉ đường và tài xế giao hàng ít bị lệch.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
