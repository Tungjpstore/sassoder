"use client";

/* AttendanceClock — hero đồng hồ chấm công dùng chung. Hiển thị giờ chạy mỗi 1s,
 * trạng thái ca (ViewModel) và các chip nguồn xác thực GPS/QR/WiFi (Req 5.2, 5.3). */
import { useEffect, useState } from "react";
import { Badge } from "@/components/dashboard-v2/primitives";
import { Button } from "@/components/dashboard-v2/button";
import { cn } from "@/lib/utils";
import type { StaffDescriptor } from "./staff-view-model";

export type AttendanceSourceKey = "gps" | "qr" | "wifi";
export type AttendanceSourceStatus = "available" | "unavailable" | "checking";
export type AttendanceSourceChip = {
  key: AttendanceSourceKey;
  label: string;
  status: AttendanceSourceStatus;
  active?: boolean;
  onSelect?: () => void;
};

const STATUS_CLS: Record<AttendanceSourceStatus, string> = {
  available: "border-[var(--d-jade)]/40 bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
  unavailable: "border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]",
  checking: "border-[var(--d-orange)]/40 bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
};

function fmt(d: Date) {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AttendanceClock({
  state,
  sources,
  onClock,
  primaryLabel = "Chấm công",
  disabled = false
}: {
  state: StaffDescriptor;
  sources: AttendanceSourceChip[];
  onClock: () => void;
  primaryLabel?: string;
  disabled?: boolean;
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const StateIcon = state.icon;
  return (
    <section
      className="flex flex-col items-center gap-3 rounded-[var(--d-r-xl)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]"
      style={{ minHeight: "var(--d-heroclock-h)" }}
    >
      <Badge tone={state.tone}>{StateIcon ? <StateIcon size={12} className="mr-1 inline" aria-hidden="true" /> : null}{state.label}</Badge>
      <p className="d-num text-[clamp(2.5rem,12vw,3.5rem)] font-black leading-none tracking-tight text-[var(--d-text)]">{fmt(now)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onSelect}
            aria-pressed={s.active ?? false}
            className={cn(
              "inline-flex min-h-[var(--d-touch-min)] items-center gap-1.5 rounded-[var(--d-r-pill)] border px-3 text-[length:var(--d-fs-xs)] font-bold uppercase tracking-[var(--d-track-wide)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--d-jade)]",
              STATUS_CLS[s.status],
              s.active && "ring-2 ring-[var(--d-jade)]"
            )}
          >
            {s.label}
            <span className="d-num opacity-70">
              {s.status === "available" ? "✓" : s.status === "checking" ? "…" : "—"}
            </span>
          </button>
        ))}
      </div>
      <Button variant="primary" size="lg" className="w-full max-w-xs" onClick={onClock} disabled={disabled}>
        {primaryLabel}
      </Button>
    </section>
  );
}
