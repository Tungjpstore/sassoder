"use client";

import "@/components/maps/maplibre-gl-styles";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { VietnamAdminSelector } from "@/components/location/vietnam-admin-selector";
import { MapLayerControl } from "@/components/maps/map-layer-control";
import { MapCrosshair, MapGlassPanel, MapLegend, MapScaleBar, MapStatusPill } from "@/components/maps/map-ui-kit";
import { createLogiVNMarkerElement } from "@/components/maps/logivn-marker";
import { fitMapToPoints, removeRoutePreviewLayer, syncRoutePreviewLayer, toLngLat } from "@/components/maps/route-preview-layer";
import { Button } from "@/components/ui/button";
import { normalizeCoordinatePair } from "@/lib/geolocation/coordinates";
import { formatAccuracyMeters, isLowAccuracyLocation, isUnusableAccuracyLocation } from "@/lib/geolocation/coordinate-quality";
import { applyClientMapLayer, getDefaultClientMapStyle, resolveClientMapStyle, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import { cn } from "@/lib/utils";
import { createMapSessionToken, fetchAddressPredictions, resolveAddressPrediction } from "@/services/maps/client-address-service";
import type { AddressAutocompletePrediction, Coordinate } from "@/services/maps/types";

type MapLibreModule = typeof import("maplibre-gl");

type CustomerDeliveryLocationPickerProps = {
  address: string;
  latitude?: number;
  longitude?: number;
  restaurantPoint?: Coordinate | null;
  route?: number[][] | null;
  onAddressChange: (value: string) => void;
  onManualAddressChange?: (value: string) => void;
  onCoordinateChange: (point: Coordinate) => void;
};

const defaultCenter: Coordinate = {
  lat: 10.7769,
  lng: 106.7009
};

const fallbackMapStyle = getDefaultClientMapStyle();

function parseOptionalCoordinate(latitude?: number, longitude?: number): Coordinate | null {
  return normalizeCoordinatePair(latitude, longitude);
}

export function CustomerDeliveryLocationPicker({
  address,
  latitude,
  longitude,
  restaurantPoint,
  route,
  onAddressChange,
  onManualAddressChange,
  onCoordinateChange
}: CustomerDeliveryLocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const customerMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const restaurantMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const activeSearchRef = useRef(0);
  const appliedMapLayerRef = useRef<ClientMapLayerMode>("streets");
  const reverseAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const placeSessionTokenRef = useRef(createMapSessionToken());
  const onAddressChangeRef = useRef(onAddressChange);
  const onCoordinateChangeRef = useRef(onCoordinateChange);

  const [adminHint, setAdminHint] = useState("");
  const [searchQuery, setSearchQuery] = useState(address);
  const [results, setResults] = useState<AddressAutocompletePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<ClientMapLayerMode>("streets");
  const [styleRevision, setStyleRevision] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpsAccuracyLabel, setGpsAccuracyLabel] = useState<string | null>(null);

  const destination = parseOptionalCoordinate(latitude, longitude);
  const initialCenter = destination ?? restaurantPoint ?? defaultCenter;
  const initialCenterRef = useRef(initialCenter);
  const initialDestinationRef = useRef(destination);
  const initialRestaurantPointRef = useRef(restaurantPoint);

  useEffect(() => {
    onAddressChangeRef.current = onAddressChange;
    onCoordinateChangeRef.current = onCoordinateChange;
  }, [onAddressChange, onCoordinateChange]);

  const applyPoint = useCallback((point: Coordinate, resolvedAddress?: string) => {
    onCoordinateChangeRef.current(point);
    customerMarkerRef.current?.setLngLat(toLngLat(point));
    mapRef.current?.easeTo({
      center: toLngLat(point),
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 520
    });
    if (resolvedAddress) {
      setSearchQuery(resolvedAddress);
      onAddressChangeRef.current(resolvedAddress);
    }
  }, []);

  const reverseLookup = useCallback(
    async (point: Coordinate) => {
      applyPoint(point);
      reverseAbortRef.current?.abort();
      const controller = new AbortController();
      reverseAbortRef.current = controller;
      try {
        const response = await fetch(`/api/maps/reverse?lat=${point.lat}&lng=${point.lng}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const json = await response.json();
        if (!json.ok || !json.data?.address) return;
        const nextAddress = json.data.address as string;
        setSearchQuery(nextAddress);
        onAddressChangeRef.current(nextAddress);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Manual address typing remains available if reverse lookup is temporarily unavailable.
      } finally {
        if (reverseAbortRef.current === controller) reverseAbortRef.current = null;
      }
    },
    [applyPoint]
  );

  useEffect(() => {
    return () => {
      reverseAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;
      maplibreRef.current = maplibre;

      const mountCenter = initialCenterRef.current;
      const mountDestination = initialDestinationRef.current;
      const mountRestaurantPoint = initialRestaurantPointRef.current;
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: resolveClientMapStyle(fallbackMapStyle, appliedMapLayerRef.current),
        center: toLngLat(mountCenter),
        zoom: mountDestination ? 15 : mountRestaurantPoint ? 13 : 11,
        attributionControl: {}
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      if (mountRestaurantPoint) {
        const storeElement = createLogiVNMarkerElement({ label: "Q", tone: "store", title: "Quán" });
        restaurantMarkerRef.current = new maplibre.Marker({ element: storeElement }).setLngLat(toLngLat(mountRestaurantPoint)).addTo(map);
      }

      const customerElement = createLogiVNMarkerElement({ label: "•", tone: "customer", title: "Điểm giao" });
      const marker = new maplibre.Marker({ element: customerElement, draggable: true }).setLngLat(toLngLat(mountDestination ?? mountCenter)).addTo(map);
      marker.on("dragend", async () => {
        const point = marker.getLngLat();
        await reverseLookup({ lat: point.lat, lng: point.lng });
      });

      map.on("click", async (event) => {
        marker.setLngLat(event.lngLat);
        await reverseLookup({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      });
      map.on("load", () => setMapReady(true));

      customerMarkerRef.current = marker;
      mapRef.current = map;
    }

    void mountMap();
    return () => {
      disposed = true;
      customerMarkerRef.current?.remove();
      restaurantMarkerRef.current?.remove();
      mapRef.current?.remove();
      customerMarkerRef.current = null;
      restaurantMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [reverseLookup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || appliedMapLayerRef.current === mapLayer) return;
    appliedMapLayerRef.current = mapLayer;
    return applyClientMapLayer({
      map,
      fallbackStyle: fallbackMapStyle,
      mode: mapLayer,
      onStyleReady: () => setStyleRevision((revision) => revision + 1),
      onStyleError: () => setMapError("Không tải được lớp bản đồ này. LogiVN đã chuyển về bản đồ đường để bạn vẫn chốt được điểm giao.")
    });
  }, [mapLayer, mapReady]);

  useEffect(() => {
    const nextDestination = parseOptionalCoordinate(latitude, longitude);
    if (!nextDestination || !mapRef.current || !customerMarkerRef.current) return;
    customerMarkerRef.current.setLngLat(toLngLat(nextDestination));
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.isStyleLoaded()) return;
    if (!route || route.length < 2) {
      removeRoutePreviewLayer(map, { sourceId: "customer-delivery-route" });
      return;
    }

    const maplibre = maplibreRef.current;
    if (!maplibre) return;
    const routePoints = route.map((point) => ({ lng: Number(point[0]), lat: Number(point[1]) })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (routePoints.length < 2) return;
    syncRoutePreviewLayer(map, routePoints, {
      sourceId: "customer-delivery-route",
      color: "#F28C28",
      shadowWidth: 7,
      width: 4,
      opacity: 0.86
    });
    fitMapToPoints(maplibre, map, routePoints, { padding: 44, duration: 520, maxZoom: 15 });
  }, [mapReady, route, styleRevision]);

  const handleAdminHintChange = useCallback((hint: string) => {
    setAdminHint(hint);
    if (!hint) return;
    setSearchQuery((current) => (current.trim() ? current : hint));
    if (!address.trim()) onAddressChangeRef.current(hint);
  }, [address]);

  async function searchPlace() {
    const query = searchQuery.trim() || adminHint.trim();
    if (query.length < 3) {
      setMapError("Nhập địa chỉ, chọn xã/phường hoặc dùng GPS để định vị.");
      return;
    }
    const scopedQuery =
      adminHint && !query.toLowerCase().includes(adminHint.toLowerCase()) ? `${query}, ${adminHint}` : query;
    const searchId = activeSearchRef.current + 1;
    activeSearchRef.current = searchId;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setMapError(null);

    try {
      const nextResults = await fetchAddressPredictions({
        query: scopedQuery,
        limit: 5,
        sessionToken: placeSessionTokenRef.current,
        location: parseOptionalCoordinate(latitude, longitude) ?? restaurantPoint ?? defaultCenter,
        signal: controller.signal
      });
      if (searchId !== activeSearchRef.current) return;
      setResults(nextResults);
      if (nextResults.length === 0) setMapError("Chưa tìm thấy điểm phù hợp. Có thể chọn GPS rồi ghi thêm mô tả nhận hàng.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (searchId !== activeSearchRef.current) return;
      setResults([]);
      setMapError(error instanceof Error ? error.message : "Không tìm thấy địa chỉ.");
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
    setLocating(true);
    setMapError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracyMeters = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        const accuracyLabel = formatAccuracyMeters(accuracyMeters);
        setGpsAccuracyLabel(accuracyLabel);
        if (isUnusableAccuracyLocation(accuracyMeters)) {
          setLocating(false);
          setMapError(`Vị trí trình duyệt quá rộng (${accuracyLabel}). Hãy tìm địa chỉ hoặc chạm/kéo pin trên bản đồ để chốt điểm giao.`);
          return;
        }
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setLocating(false);
        if (isLowAccuracyLocation(accuracyMeters)) {
          setMapError(`GPS đang ước lượng rộng (${accuracyLabel}). Hãy kiểm tra lại pin trước khi đặt hàng.`);
        }
        void reverseLookup(point);
      },
      () => {
        setLocating(false);
        setMapError("Không lấy được vị trí. Bạn vẫn có thể chọn xã/phường và chạm trên bản đồ.");
      },
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
      applyPoint({ lat: detail.lat, lng: detail.lng }, detail.address);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMapError(error instanceof Error ? error.message : "Không lấy được chi tiết địa chỉ.");
    } finally {
      if (detailAbortRef.current === controller) detailAbortRef.current = null;
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-[rgba(169,197,161,0.35)] bg-[#FFF7EB]/72 p-3">
      <div className="rounded-2xl border border-[rgba(169,197,161,0.32)] bg-white/78 p-3">
        <p className="text-sm font-black text-[var(--foreground)]">Bạn muốn giao đến đâu?</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
          Cách nhanh nhất: dùng GPS hoặc nhập số nhà/tên đường, sau đó kéo pin nếu cần.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-black text-[var(--foreground)]">
        Địa chỉ giao hàng
        <textarea
          value={searchQuery}
          onChange={(event) => {
            const nextAddress = event.target.value;
            setSearchQuery(nextAddress);
            (onManualAddressChange ?? onAddressChange)(nextAddress);
          }}
          placeholder="Ví dụ: 12 Nguyễn Huệ hoặc tên tòa nhà/mốc gần bạn"
          className="min-h-20 rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={useCurrentPosition}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(169,197,161,0.42)] bg-white text-sm font-black text-[var(--primary)]"
        >
          {locating ? <Loader2 size={17} className="animate-spin" /> : <LocateFixed size={17} />}
          {locating ? "Đang định vị..." : "Dùng GPS"}
        </button>
        <Button type="button" onClick={searchPlace} disabled={searching} className="h-11 rounded-xl">
          {searching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          {searching ? "Đang tìm..." : "Tìm điểm giao"}
        </Button>
      </div>

      <details className="rounded-xl border border-[rgba(169,197,161,0.28)] bg-white/70 px-3 py-2">
        <summary className="cursor-pointer text-xs font-black text-[var(--primary)] marker:text-[var(--accent)]">
          Chọn tỉnh/xã thủ công nếu không tìm thấy
        </summary>
        <div className="mt-3">
          <VietnamAdminSelector compact onAddressHintChange={handleAdminHintChange} />
        </div>
      </details>

      <div className="relative overflow-hidden rounded-[24px] border border-[rgba(169,197,161,0.34)] bg-white shadow-[0_18px_50px_rgba(15,77,58,0.12)]">
        <div ref={mapContainerRef} className="h-[310px] w-full bg-[radial-gradient(circle_at_top,rgba(15,77,58,0.09),transparent_42%),linear-gradient(180deg,rgba(255,247,235,0.8),rgba(248,242,232,0.95))] sm:h-[360px]" />
        <MapCrosshair />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <MapGlassPanel className="max-w-[64%]">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[#6a7b6f]">Điểm giao</span>
            <span className="mt-0.5 block truncate text-[var(--primary)]">{mapReady ? "Chạm bản đồ hoặc kéo pin" : "Đang tải bản đồ"}</span>
          </MapGlassPanel>
          <MapStatusPill label="GPS" value={gpsAccuracyLabel ?? "Chưa bật"} tone={gpsAccuracyLabel ? "ready" : "muted"} />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 grid max-w-[62%] gap-2">
          <MapGlassPanel className="flex items-center gap-2 text-[var(--muted-foreground)]">
            <Navigation size={13} className="shrink-0 text-[var(--accent)]" />
            <span className="truncate">
              {latitude && longitude ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : "Chưa chốt tọa độ"}
              {gpsAccuracyLabel ? ` · GPS ${gpsAccuracyLabel}` : ""}
            </span>
          </MapGlassPanel>
          <div className="flex items-center gap-2">
            <MapLegend compact items={[{ label: "Bạn", tone: "customer" }, { label: "Quán", tone: "store" }, { label: "Tuyến", tone: "route" }]} />
            <MapScaleBar />
          </div>
        </div>
        <MapLayerControl compact value={mapLayer} onChange={setMapLayer} className="absolute bottom-3 right-3" />
      </div>

      {results.length > 0 ? (
        <div className="grid gap-2">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => chooseResult(result)}
              className={cn("rounded-xl border border-[rgba(169,197,161,0.34)] bg-white px-3 py-2 text-left transition hover:border-[var(--primary)]/45")}
            >
              <span className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[var(--foreground)]">{result.shortLabel}</span>
                  <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--muted-foreground)]">{result.address}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {mapError ? <p className="text-sm font-bold text-[var(--accent-strong)]">{mapError}</p> : null}
    </div>
  );
}
