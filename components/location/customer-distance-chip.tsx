"use client";

import { Clock3, MapPinned } from "lucide-react";

export function CustomerDistanceChip({
  distanceKm,
  etaMinutes,
  storeName
}: {
  distanceKm?: number | null;
  etaMinutes?: number | null;
  storeName?: string | null;
}) {
  if (distanceKm === null || distanceKm === undefined) return null;

  return (
    <div className="customer-glass-card rounded-2xl p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        <MapPinned size={14} className="text-[var(--primary)]" />
        {storeName ? `Chi nhánh gần nhất: ${storeName}` : "Khoảng cách tới quán"}
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-base font-black text-[var(--foreground)]">Cách bạn {distanceKm.toFixed(1)}km</p>
        {etaMinutes ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white/80 px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">
            <Clock3 size={12} />
            {etaMinutes} phút
          </span>
        ) : null}
      </div>
    </div>
  );
}
