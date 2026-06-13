"use client";

import * as React from "react";
import { Bike, MapPin, Navigation, Store } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Maps v2 — bản đồ SVG thuần (không thư viện map nặng).
 *  - DeliveryMap: tuyến giao từ quán → khách, có shipper.
 *  - FloorMap: sơ đồ bàn theo khu vực, trạng thái màu.
 * ============================================================ */

/* DeliveryMap — minh họa tuyến giao hàng trên lưới đường phố. */
export function DeliveryMap({
  storeLabel = "Quán",
  customerLabel = "Khách",
  distanceKm,
  etaMin,
  driverProgress = 0.55,
  className
}: {
  storeLabel?: string;
  customerLabel?: string;
  distanceKm: number;
  etaMin: number;
  driverProgress?: number;
  className?: string;
}) {
  // Toạ độ tuyến (đường gấp khúc qua "phố")
  const path = [
    { x: 60, y: 210 },
    { x: 60, y: 130 },
    { x: 160, y: 130 },
    { x: 160, y: 70 },
    { x: 300, y: 70 }
  ];
  const d = path.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  // Vị trí shipper theo progress (nội suy tuyến tính theo các đoạn)
  const seg = Math.min(path.length - 2, Math.floor(driverProgress * (path.length - 1)));
  const segT = driverProgress * (path.length - 1) - seg;
  const driver = {
    x: path[seg].x + (path[seg + 1].x - path[seg].x) * segT,
    y: path[seg].y + (path[seg + 1].y - path[seg].y) * segT
  };

  return (
    <div className={cn("overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]", className)}>
      <svg viewBox="0 0 360 240" className="h-full w-full" role="img" aria-label="Bản đồ giao hàng">
        {/* Lưới phố */}
        <defs>
          <pattern id="streets" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="var(--d-surface-2)" />
            <path d="M0 0H40M0 0V40" stroke="var(--d-line)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="360" height="240" fill="url(#streets)" />
        {/* khối nhà mờ */}
        {[
          [20, 150, 70, 50], [110, 150, 90, 50], [220, 150, 120, 50],
          [20, 20, 110, 80], [200, 90, 60, 40]
        ].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="4" fill="var(--d-surface-3)" opacity="0.6" />
        ))}

        {/* tuyến đi */}
        <path d={d} fill="none" stroke="var(--d-jade)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 8" opacity="0.5" />
        <path
          d={d}
          fill="none"
          stroke="var(--d-orange)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="240"
          strokeDashoffset={240 * (1 - driverProgress)}
        />

        {/* điểm quán */}
        <g transform={`translate(${path[0].x},${path[0].y})`}>
          <circle r="14" fill="var(--d-jade)" />
          <circle r="20" fill="none" stroke="var(--d-jade)" opacity="0.25" />
        </g>
        {/* điểm khách */}
        <g transform={`translate(${path[path.length - 1].x},${path[path.length - 1].y})`}>
          <circle r="14" fill="var(--d-orange)" />
          <circle r="20" fill="none" stroke="var(--d-orange)" opacity="0.25" />
        </g>
        {/* shipper */}
        <g transform={`translate(${driver.x},${driver.y})`}>
          <circle r="11" fill="var(--d-surface)" stroke="var(--d-orange)" strokeWidth="2.5" />
        </g>
      </svg>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">
          <Store size={14} /> {storeLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <Bike size={14} className="text-[var(--d-orange)]" />
          <span className="d-num font-semibold text-[var(--d-text)]">{distanceKm}km</span> · còn{" "}
          <span className="d-num font-semibold text-[var(--d-text)]">{etaMin}'</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-orange-600)]">
          {customerLabel} <MapPin size={14} />
        </span>
      </div>
    </div>
  );
}

/* FloorMap — sơ đồ bàn theo khu vực, trạng thái màu. */
export type FloorTable = {
  id: string;
  name: string;
  seats: number;
  zone: string;
  status: "available" | "serving" | "overdue" | "reserved";
  x: number; // 0..100 (%)
  y: number; // 0..100 (%)
};

const tableStatusStyle: Record<FloorTable["status"], { bg: string; ring: string; label: string }> = {
  available: { bg: "var(--d-surface)", ring: "var(--d-line-strong)", label: "Trống" },
  serving: { bg: "var(--d-primary-soft)", ring: "var(--d-jade)", label: "Đang phục vụ" },
  overdue: { bg: "var(--d-danger-bg)", ring: "var(--d-danger-fg)", label: "Quá giờ" },
  reserved: { bg: "var(--d-accent-soft)", ring: "var(--d-orange)", label: "Đã đặt" }
};

export function FloorMap({
  tables,
  selectedId,
  onSelect,
  className
}: {
  tables: FloorTable[];
  selectedId?: string;
  onSelect?: (t: FloorTable) => void;
  className?: string;
}) {
  const zones = Array.from(new Set(tables.map((t) => t.zone)));

  return (
    <div className={cn("flex flex-col gap-[var(--d-s-3)]", className)}>
      {/* Chú thích */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(tableStatusStyle) as FloorTable["status"][]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            <span className="h-2.5 w-2.5 rounded-full border-2" style={{ background: tableStatusStyle[s].bg, borderColor: tableStatusStyle[s].ring }} />
            {tableStatusStyle[s].label}
          </span>
        ))}
      </div>

      {/* Khung sơ đồ */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]">
        {/* nhãn khu vực mờ */}
        {zones.map((z, i) => (
          <span
            key={z}
            className="absolute text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]/50"
            style={{ left: "3%", top: `${6 + i * 48}%` }}
          >
            {z}
          </span>
        ))}
        {/* vạch ngăn khu */}
        <div className="absolute inset-x-[2%] top-1/2 border-t border-dashed border-[var(--d-line)]" />

        {tables.map((t) => {
          const st = tableStatusStyle[t.status];
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={onSelect ? () => onSelect(t) : undefined}
              className={cn(
                "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[var(--d-r-md)] border-2 transition-all duration-[var(--d-dur)]",
                selected ? "scale-110 shadow-[var(--d-sh-md)]" : "hover:scale-105"
              )}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: 56,
                height: 44,
                background: st.bg,
                borderColor: st.ring
              }}
              aria-label={`${t.name} · ${st.label}`}
              title={`${t.name} · ${t.seats} chỗ · ${st.label}`}
            >
              <span className="d-num text-[length:var(--d-fs-sm)] font-bold leading-none text-[var(--d-text)]">{t.name}</span>
              <span className="text-[length:var(--d-fs-2xs)] leading-none text-[var(--d-text-faint)]">{t.seats} chỗ</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
