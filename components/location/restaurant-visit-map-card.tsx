"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LocateFixed, MapPinned, Navigation, Phone, Route } from "lucide-react";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { Button } from "@/components/ui/button";
import { useCurrentLocation } from "@/hooks/use-location/use-current-location";
import { buildDirectionsHref } from "@/lib/geolocation/directions";
import { calculateDistance, estimateTravelTime } from "@/services/maps/distance-service";
import type { Coordinate, ResolvedRouteResult } from "@/services/maps/types";

type RestaurantVisitMapCardProps = {
  restaurant: {
    name: string;
    address?: string | null;
    hotline?: string | null;
    storeLat?: number | null;
    storeLng?: number | null;
  };
  title?: string;
  description?: string;
  compact?: boolean;
};

function toRestaurantPoint(restaurant: RestaurantVisitMapCardProps["restaurant"]): Coordinate | null {
  if (typeof restaurant.storeLat !== "number" || typeof restaurant.storeLng !== "number") return null;
  if (!Number.isFinite(restaurant.storeLat) || !Number.isFinite(restaurant.storeLng)) return null;
  return { lat: restaurant.storeLat, lng: restaurant.storeLng };
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) return "Chưa tính";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`;
}

export function RestaurantVisitMapCard({
  restaurant,
  title = "Đường đến quán",
  description = "Dùng GPS để xem khoảng cách, ETA và mở chỉ đường trên Google Maps/Apple Maps.",
  compact = false
}: RestaurantVisitMapCardProps) {
  const configuredDestination = toRestaurantPoint(restaurant);
  const [resolvedDestination, setResolvedDestination] = useState<Coordinate | null>(null);
  const [resolvingDestination, setResolvingDestination] = useState(false);
  const destination = configuredDestination ?? resolvedDestination;
  const { location, loading: locating, error: locationError, requestLocation } = useCurrentLocation();
  const [route, setRoute] = useState<ResolvedRouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const directionsHref = destination
    ? buildDirectionsHref(destination, {
        origin: location,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent
      })
    : null;
  const fallbackDistanceKm = location && destination ? calculateDistance(location, destination) : null;
  const distanceKm = route?.distanceKm ?? fallbackDistanceKm;
  const durationMinutes = route?.durationMinutes ?? (fallbackDistanceKm ? estimateTravelTime(fallbackDistanceKm) : null);

  const addressLookupKey = useMemo(() => restaurant.address?.trim() ?? "", [restaurant.address]);

  useEffect(() => {
    if (configuredDestination || !addressLookupKey) return;
    let disposed = false;

    async function resolveDestinationFromAddress() {
      setResolvingDestination(true);
      try {
        const response = await fetch(`/api/maps/search?q=${encodeURIComponent(addressLookupKey)}&limit=1`, {
          cache: "no-store"
        });
        const json = await response.json();
        const result = json.ok ? json.data?.results?.[0] : null;
        if (!disposed && typeof result?.lat === "number" && typeof result?.lng === "number") {
          setResolvedDestination({ lat: result.lat, lng: result.lng });
        }
      } catch {
        // The explicit configuration message below remains the fallback.
      } finally {
        if (!disposed) setResolvingDestination(false);
      }
    }

    void resolveDestinationFromAddress();
    return () => {
      disposed = true;
    };
  }, [addressLookupKey, configuredDestination]);

  async function resolveRoute(nextLocation: Coordinate) {
    if (!destination) return;

    setRouting(true);
    setRouteError(null);
    try {
      const params = new URLSearchParams({
        originLat: String(nextLocation.lat),
        originLng: String(nextLocation.lng),
        destinationLat: String(destination.lat),
        destinationLng: String(destination.lng)
      });
      const response = await fetch(`/api/maps/route?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tính được tuyến đường.");
      setRoute(json.data as ResolvedRouteResult);
    } catch (error) {
      const distance = calculateDistance(nextLocation, destination);
      setRoute({
        distanceKm: distance,
        durationMinutes: estimateTravelTime(distance),
        geometry: null,
        provider: "haversine",
        confidence: "low",
        isEstimated: true,
        fallbackChain: ["haversine"]
      });
      setRouteError(error instanceof Error ? `${error.message} Đang hiển thị ước tính gần đúng.` : "Đang hiển thị ước tính gần đúng.");
    } finally {
      setRouting(false);
    }
  }

  function locateAndRoute() {
    requestLocation({
      onSuccess: (point) => void resolveRoute(point),
      onError: (message) => setRouteError(message)
    });
  }

  if (!destination) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <MapPinned size={18} />
          </span>
          <div>
            <p className="font-bold text-[var(--foreground)]">
              {resolvingDestination ? "Đang đồng bộ tọa độ quán" : "Quán chưa ghim tọa độ bản đồ"}
            </p>
            <p className="mt-1 leading-6">
              {resolvingDestination
                ? "LogiVN đang kiểm tra địa chỉ quán để khách vẫn có thể xem khoảng cách và chỉ đường."
                : "Hãy cập nhật vị trí quán trong onboarding hoặc Cấu hình giao hàng để khách xem chỉ đường và ETA đặt bàn."}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-[var(--border)] bg-white/88 shadow-sm ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-black text-[var(--primary)]">
            <Route size={16} />
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">{description}</p>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-1.5 text-xs font-black text-[var(--primary)]">
          {route?.provider ? route.provider.toUpperCase() : "GPS ready"}
        </div>
      </div>

      <div className="mt-4">
        {location ? (
          <RouteMiniMap
            compact
            origin={location}
            destination={destination}
            route={route?.geometry?.coordinates ?? null}
            distanceKm={distanceKm}
            durationMinutes={durationMinutes}
            title="Tuyến đến quán"
            statusLabel={route?.isEstimated ? "Ước tính" : "Chỉ đường"}
            originLabel="Bạn"
            destinationLabel="Quán"
          />
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[linear-gradient(90deg,#eef2f7_1px,transparent_1px),linear-gradient(#eef2f7_1px,transparent_1px)] bg-[length:24px_24px] p-4">
            <div className="min-h-36 rounded-xl border border-white/70 bg-white/78 p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_16px_30px_rgba(15,77,58,0.2)]">
                  <MapPinned size={19} />
                </span>
                <div className="min-w-0">
                  <p className="font-black text-[var(--foreground)]">{restaurant.name}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[var(--muted-foreground)]">{restaurant.address || `${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}`}</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl bg-[var(--soft-surface)] px-3 py-2 text-xs font-bold text-[var(--muted-foreground)]">
                Vị trí của bạn chỉ dùng trên thiết bị để tính tuyến đến quán, không lưu vào lịch đặt bàn.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Khoảng cách</p>
          <p className="mt-1 font-black text-[var(--foreground)]">{formatDistance(distanceKm)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">ETA</p>
          <p className="mt-1 font-black text-[var(--foreground)]">{durationMinutes ? `${durationMinutes} phút` : "Chưa tính"}</p>
        </div>
        <a
          href={directionsHref ?? "#"}
          target={directionsHref ? "_blank" : undefined}
          rel={directionsHref ? "noreferrer" : undefined}
          aria-disabled={!directionsHref}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--primary)]"
        >
          <Navigation size={16} />
          Chỉ đường
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={locateAndRoute} disabled={locating || routing} className="min-h-11 rounded-xl">
          {locating || routing ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          {locating ? "Đang lấy GPS..." : routing ? "Đang tính tuyến..." : "Dùng vị trí của tôi"}
        </Button>
        {restaurant.hotline ? (
          <a href={`tel:${restaurant.hotline}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary)]">
            <Phone size={16} />
            Gọi quán
          </a>
        ) : null}
      </div>

      {routeError || locationError ? (
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent-strong)]">
          {routeError ?? locationError}
        </p>
      ) : null}
    </section>
  );
}
