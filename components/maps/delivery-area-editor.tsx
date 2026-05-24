"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeliveryAreaPoint = {
  lat: number;
  lng: number;
};

const viewport = {
  latSpan: 0.034,
  lngSpan: 0.046
};

function isFiniteCoordinate(point: DeliveryAreaPoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

export function makeDefaultDeliveryPolygon(centerLat: number, centerLng: number): DeliveryAreaPoint[] {
  const lat = Number.isFinite(centerLat) ? centerLat : 10.7769;
  const lng = Number.isFinite(centerLng) ? centerLng : 106.7009;

  return [
    { lat: lat + 0.0102, lng: lng - 0.0065 },
    { lat: lat + 0.0072, lng: lng + 0.0148 },
    { lat: lat - 0.0065, lng: lng + 0.019 },
    { lat: lat - 0.0142, lng: lng + 0.0035 },
    { lat: lat - 0.006, lng: lng - 0.0195 }
  ];
}

function projectPoint(point: DeliveryAreaPoint, center: DeliveryAreaPoint) {
  return {
    x: ((point.lng - center.lng) / viewport.lngSpan + 0.5) * 100,
    y: (0.5 - (point.lat - center.lat) / viewport.latSpan) * 100
  };
}

function unprojectPoint(xPercent: number, yPercent: number, center: DeliveryAreaPoint): DeliveryAreaPoint {
  return {
    lat: center.lat + (0.5 - yPercent / 100) * viewport.latSpan,
    lng: center.lng + (xPercent / 100 - 0.5) * viewport.lngSpan
  };
}

function clampPercent(value: number) {
  return Math.min(96, Math.max(4, value));
}

function normalizePoint(point: DeliveryAreaPoint): DeliveryAreaPoint {
  return { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) };
}

function haversineKm(a: DeliveryAreaPoint, b: DeliveryAreaPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateDeliveryAreaStats(points: DeliveryAreaPoint[], center: DeliveryAreaPoint) {
  const polygon = points.filter(isFiniteCoordinate);
  if (polygon.length < 3) {
    return {
      areaKm2: 0,
      maxDistanceKm: 0
    };
  }

  const latKm = 111.32;
  const lngKm = 111.32 * Math.cos((center.lat * Math.PI) / 180);
  const projected = polygon.map((point) => ({
    x: (point.lng - center.lng) * lngKm,
    y: (point.lat - center.lat) * latKm
  }));

  const shoelace = projected.reduce((sum, point, index) => {
    const next = projected[(index + 1) % projected.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return {
    areaKm2: Math.abs(shoelace) / 2,
    maxDistanceKm: Math.max(...polygon.map((point) => haversineKm(center, point)))
  };
}

type DeliveryAreaEditorProps = {
  centerLat: number;
  centerLng: number;
  points: DeliveryAreaPoint[];
  onChange: (points: DeliveryAreaPoint[]) => void;
  className?: string;
};

export function DeliveryAreaEditor({
  centerLat,
  centerLng,
  points,
  onChange,
  className
}: DeliveryAreaEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const center = useMemo(
    () => ({
      lat: Number.isFinite(centerLat) ? centerLat : 10.7769,
      lng: Number.isFinite(centerLng) ? centerLng : 106.7009
    }),
    [centerLat, centerLng]
  );
  const polygon = points.length >= 3 ? points : makeDefaultDeliveryPolygon(center.lat, center.lng);
  const projected = polygon.map((point) => projectPoint(point, center));
  const polygonPoints = projected.map((point) => `${point.x},${point.y}`).join(" ");

  function updatePointFromEvent(index: number, event: PointerEvent<HTMLElement>) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    const next = [...polygon];
    next[index] = unprojectPoint(x, y, center);
    onChange(next.map(normalizePoint));
  }

  function updatePointFromKeyboard(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (polygon.length <= 3) return;
      const next = polygon.filter((_, pointIndex) => pointIndex !== index);
      onChange(next.map(normalizePoint));
      setActivePoint(Math.min(index, next.length - 1));
      return;
    }

    if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) return;

    event.preventDefault();
    setActivePoint(index);

    const current = projected[index];
    if (!current) return;

    const step = event.shiftKey ? 3 : event.altKey ? 0.25 : 1;
    const nextPosition = { ...current };

    if (event.key === "ArrowLeft") nextPosition.x -= step;
    if (event.key === "ArrowRight") nextPosition.x += step;
    if (event.key === "ArrowUp") nextPosition.y -= step;
    if (event.key === "ArrowDown") nextPosition.y += step;

    const next = [...polygon];
    next[index] = unprojectPoint(clampPercent(nextPosition.x), clampPercent(nextPosition.y), center);
    onChange(next.map(normalizePoint));
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-[244px] overflow-hidden rounded-xl border border-[#e7e2d8] bg-[linear-gradient(135deg,rgba(243,238,226,0.9),rgba(229,238,220,0.92))] touch-none",
        className
      )}
      onPointerMove={(event) => {
        if (activePoint === null) return;
        updatePointFromEvent(activePoint, event);
      }}
      onPointerUp={() => setActivePoint(null)}
      onPointerCancel={() => setActivePoint(null)}
    >
      <div className="absolute inset-0 opacity-75 [background-image:linear-gradient(30deg,rgba(223,191,130,0.45)_1px,transparent_1px),linear-gradient(120deg,rgba(210,220,205,0.8)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:72px_72px,96px_96px,36px_36px]" />
      <div className="absolute inset-x-0 top-[46%] h-14 -rotate-12 bg-[#dce8ef]/80" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={polygonPoints} fill="rgba(18, 112, 72, 0.23)" stroke="#0f6944" strokeWidth="0.7" />
      </svg>
      <div className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#0f6944] text-white shadow-[0_16px_34px_rgba(15,105,68,0.32)]">
        <span className="h-3 w-3 rounded-full bg-white" />
      </div>
      <p id="delivery-area-editor-help" className="sr-only">
        Kéo điểm hoặc dùng phím mũi tên để chỉnh vùng giao hàng. Giữ Shift để di chuyển nhanh, Alt để chỉnh mịn.
      </p>
      {projected.map((point, index) => (
        <button
          key={`${index}-${polygon[index]?.lat}-${polygon[index]?.lng}`}
          type="button"
          aria-label={`Điểm vùng giao hàng ${index + 1}`}
          aria-describedby="delivery-area-editor-help"
          className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full border-2 border-[#0f6944] bg-white shadow-md active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6944] focus-visible:ring-offset-2"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setActivePoint(index);
            updatePointFromEvent(index, event);
          }}
          onPointerUp={() => setActivePoint(null)}
          onKeyDown={(event) => updatePointFromKeyboard(index, event)}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#0f6944]" aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(makeDefaultDeliveryPolygon(center.lat, center.lng))}
        className="absolute right-3 top-3 inline-flex h-9 items-center gap-2 rounded-lg border border-white/70 bg-white/90 px-3 text-xs font-bold text-[#145a40] shadow-sm"
      >
        <RotateCcw size={14} aria-hidden="true" />
        Tạo lại vùng
      </button>
      <p className="absolute bottom-3 left-3 rounded-lg border border-white/70 bg-white/88 px-3 py-2 text-xs font-bold text-[#145a40] shadow-sm">
        Kéo hoặc dùng phím mũi tên để chỉnh vùng giao hàng thật
      </p>
    </div>
  );
}
