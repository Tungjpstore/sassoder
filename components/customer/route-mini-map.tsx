"use client";

import { Navigation, Route, Store } from "lucide-react";
import { deliveryStatusLabel } from "@/lib/labels";

type Coordinate = { lat: number | null | undefined; lng: number | null | undefined };

function isValidCoordinate(point: Coordinate) {
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  );
}

function normalizeCoordinates({
  origin,
  destination,
  route
}: {
  origin: Coordinate;
  destination: Coordinate;
  route?: number[][] | null;
}) {
  const coordinates =
    route && route.length >= 2
      ? route
          .map((point) => ({ lng: Number(point[0]), lat: Number(point[1]) }))
          .filter(isValidCoordinate)
      : [];

  if (coordinates.length >= 2) return coordinates;
  if (isValidCoordinate(origin) && isValidCoordinate(destination)) {
    return [
      { lat: Number(origin.lat), lng: Number(origin.lng) },
      { lat: Number(destination.lat), lng: Number(destination.lng) }
    ];
  }
  return [];
}

function buildPolyline(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return "";
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngRange = Math.max(maxLng - minLng, 0.00001);
  const latRange = Math.max(maxLat - minLat, 0.00001);

  return points
    .map((point) => {
      const x = 10 + ((point.lng - minLng) / lngRange) * 80;
      const y = 90 - ((point.lat - minLat) / latRange) * 80;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function buildDirectionsUrl(origin: Coordinate, destination: Coordinate) {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) return null;
  const start = `${origin.lat},${origin.lng}`;
  const end = `${destination.lat},${destination.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&travelmode=driving`;
}

export function RouteMiniMap({
  origin,
  destination,
  route,
  distanceKm,
  durationMinutes,
  status,
  compact = false
}: {
  origin: Coordinate;
  destination: Coordinate;
  route?: number[][] | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  status?: string | null;
  compact?: boolean;
}) {
  const points = normalizeCoordinates({ origin, destination, route });
  const polyline = buildPolyline(points);
  const mapUrl = buildDirectionsUrl(origin, destination);

  if (!polyline) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
        Chưa đủ tọa độ để dựng bản đồ tuyến giao.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Route size={16} className="text-[var(--primary)]" />
          Tuyến giao realtime
        </div>
        <span className="rounded-full bg-[var(--soft-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
          {deliveryStatusLabel(status)}
        </span>
      </div>

      <div className={`relative ${compact ? "h-40" : "h-52"} bg-[linear-gradient(90deg,#eef2f7_1px,transparent_1px),linear-gradient(#eef2f7_1px,transparent_1px)] bg-[length:24px_24px]`}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={polyline} fill="none" stroke="rgba(15,77,58,0.16)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={polyline} fill="none" stroke="#0F4D3A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--primary)]">
          <Store size={14} />
          Quán
        </div>
        <div className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-[#F28C28]/30 bg-[#FFF7ED] px-3 py-1.5 text-xs font-semibold text-[#C76312]">
          <Navigation size={14} />
          Khách
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-[var(--border)] p-3 text-sm">
        <div>
          <p className="font-semibold text-[var(--foreground)]">{distanceKm ? `${distanceKm} km` : "--"}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Khoảng cách</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--foreground)]">{durationMinutes ? `${durationMinutes} phút` : "--"}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Dự kiến</p>
        </div>
        {mapUrl ? (
          <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--primary)]">
            Chỉ đường
          </a>
        ) : (
          <span className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 text-xs font-semibold text-[var(--muted-foreground)]">
            Chưa có map
          </span>
        )}
      </div>
    </section>
  );
}
