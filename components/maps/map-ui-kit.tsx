"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MapLegendTone = "store" | "customer" | "route" | "zone" | "radius" | "courier" | "gps";
type MapStatusTone = "ready" | "loading" | "warning" | "muted";

function legendToneClass(tone: MapLegendTone) {
  if (tone === "store") return "bg-[#0f4d3a]";
  if (tone === "customer") return "bg-[#f28c28]";
  if (tone === "route") return "bg-[linear-gradient(90deg,#ffffff_0_18%,#0f4d3a_18%_82%,#ffffff_82%)]";
  if (tone === "zone") return "bg-[#0f6944]/25 ring-1 ring-[#0f6944]";
  if (tone === "radius") return "bg-[#f28c28]/22 ring-1 ring-[#f28c28]";
  if (tone === "courier") return "bg-[#12251c]";
  return "bg-[#2f7dd3]";
}

function statusToneClass(tone: MapStatusTone) {
  if (tone === "ready") return "border-[#b9d8c2] bg-[#f4faf2]/92 text-[#0f6944]";
  if (tone === "loading") return "border-[#f2d6af] bg-[#fff7eb]/92 text-[#bb5f12]";
  if (tone === "warning") return "border-[#f4c8c8] bg-[#fff5f2]/92 text-[#c53535]";
  return "border-white/70 bg-white/88 text-[#536154]";
}

export function MapGlassPanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none rounded-[18px] border border-white/75 bg-white/88 px-3 py-2 text-xs font-bold text-[#123b2b] shadow-[0_14px_34px_rgba(15,77,58,0.14)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MapStatusPill({
  label,
  value,
  tone = "ready",
  className
}: {
  label: string;
  value: string;
  tone?: MapStatusTone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-full border px-3 py-1.5 shadow-sm backdrop-blur-xl", statusToneClass(tone), className)}>
      <span className="mr-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{label}</span>
      <span className="text-xs font-black">{value}</span>
    </div>
  );
}

export function MapLegend({
  items,
  className,
  compact = false
}: {
  items: Array<{ label: string; tone: MapLegendTone }>;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none flex flex-wrap items-center gap-1.5 rounded-[18px] border border-white/75 bg-white/88 p-1.5 shadow-[0_14px_34px_rgba(15,77,58,0.14)] backdrop-blur-xl",
        className
      )}
    >
      {items.map((item) => (
        <span key={`${item.tone}-${item.label}`} className={cn("inline-flex items-center gap-1.5 rounded-full bg-[#f7faf4] px-2 py-1 font-black text-[#234737]", compact ? "text-[10px]" : "text-[11px]")}>
          <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", legendToneClass(item.tone))} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function MapMetricStrip({
  items,
  className
}: {
  items: Array<{ label: string; value: string; tone?: "green" | "orange" | "neutral" }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 rounded-2xl border border-white/75 bg-white/90 p-2 shadow-[0_18px_42px_rgba(15,77,58,0.16)] backdrop-blur-xl sm:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-[#f7faf4] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#6b776d]">{item.label}</p>
          <p
            className={cn(
              "mt-0.5 text-sm font-black",
              item.tone === "orange" ? "text-[#bb5f12]" : item.tone === "green" ? "text-[#0f6944]" : "text-[#121813]"
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function MapScaleBar({
  label = "500 m",
  className
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none rounded-xl border border-white/75 bg-white/86 px-2.5 py-2 text-[#234737] shadow-sm backdrop-blur-xl", className)}>
      <div className="h-1 w-16 rounded-full bg-[linear-gradient(90deg,#0f4d3a_0_45%,transparent_45%_55%,#0f4d3a_55%)]" />
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}

export function MapCrosshair({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute left-1/2 top-1/2 hidden h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55 bg-white/10 shadow-[0_0_0_1px_rgba(15,77,58,0.08)_inset] backdrop-blur-[1px] sm:block", className)}>
      <span className="absolute left-1/2 top-2 h-3 w-px -translate-x-1/2 bg-white/75" />
      <span className="absolute bottom-2 left-1/2 h-3 w-px -translate-x-1/2 bg-white/75" />
      <span className="absolute left-2 top-1/2 h-px w-3 -translate-y-1/2 bg-white/75" />
      <span className="absolute right-2 top-1/2 h-px w-3 -translate-y-1/2 bg-white/75" />
    </div>
  );
}
