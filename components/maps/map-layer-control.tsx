"use client";

import { Layers3 } from "lucide-react";
import { clientMapLayerModes, type ClientMapLayerMode } from "@/lib/geolocation/map-style";
import { cn } from "@/lib/utils";

type MapLayerControlProps = {
  value: ClientMapLayerMode;
  onChange: (value: ClientMapLayerMode) => void;
  className?: string;
  compact?: boolean;
};

export function MapLayerControl({
  value,
  onChange,
  className,
  compact = false
}: MapLayerControlProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto max-w-[calc(100%-1.5rem)] rounded-[22px] border border-white/75 bg-white/90 p-1.5 shadow-[0_18px_42px_rgba(15,77,58,0.16)] backdrop-blur-xl",
        className
      )}
      aria-label="Chọn lớp bản đồ"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!compact ? (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f4faf2] text-[#0f6944]">
            <Layers3 size={15} aria-hidden="true" />
          </span>
        ) : null}
        {clientMapLayerModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={cn(
              "group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-[11px] font-black transition active:scale-[0.98]",
              value === mode.id
                ? "bg-[#0f4d3a] text-white shadow-[0_10px_24px_rgba(15,77,58,0.22)]"
                : "bg-white text-[#496253] hover:bg-[#edf7ef]"
            )}
            aria-pressed={value === mode.id}
            title={mode.label}
          >
            <span
              className={cn(
                "h-7 w-8 rounded-xl border border-white/70 shadow-sm",
                mode.id === "streets" && "bg-[linear-gradient(135deg,#e7f2de_0_34%,#ffffff_34%_46%,#cfe4c6_46%_100%)]",
                mode.id === "satellite" && "bg-[radial-gradient(circle_at_25%_25%,#7c8f55,transparent_28%),radial-gradient(circle_at_70%_70%,#26482f,transparent_34%),#6b7f58]",
                mode.id === "hybrid" && "bg-[linear-gradient(135deg,#61764c_0_50%,#f8f1d9_50%_56%,#0f4d3a_56%_100%)]"
              )}
              aria-hidden="true"
            />
            <span className={compact ? "sr-only sm:not-sr-only" : ""}>{compact ? mode.shortLabel : mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
