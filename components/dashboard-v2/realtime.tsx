"use client";

/* ============================================================
 * Realtime v2 — hạ tầng dùng chung cho mọi workspace realtime.
 *  - RealtimeState: trạng thái kết nối kênh Supabase.
 *  - RealtimeStatusBadge: chip hiển thị "Tức thời / Đang đồng bộ / Mất kết nối".
 *  - playOrderChime: âm báo ngắn khi có đơn/sự kiện mới (Web Audio, không cần asset).
 * ============================================================ */

import * as React from "react";
import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type RealtimeState = "connecting" | "connected" | "error";

/* Badge trạng thái kết nối realtime — đặt trên Toolbar của workspace. */
export function RealtimeStatusBadge({ state, className }: { state: RealtimeState; className?: string }) {
  const meta =
    state === "connected"
      ? { label: "Tức thời", icon: <Radio size={12} />, cls: "border-[var(--d-ok-fg)]/30 bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]" }
      : state === "connecting"
      ? { label: "Đang đồng bộ", icon: <RefreshCw size={12} className="animate-spin" />, cls: "border-[var(--d-line-strong)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)]" }
      : { label: "Mất kết nối", icon: <WifiOff size={12} />, cls: "border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]" };

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[var(--d-r-pill)] border px-3 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]",
        meta.cls,
        className
      )}
    >
      <span className="relative flex">
        {state === "connected" ? (
          <span className="absolute inline-flex h-3 w-3 -translate-x-0.5 -translate-y-0.5 animate-ping rounded-full bg-[var(--d-ok-fg)]/40" aria-hidden="true" />
        ) : null}
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

type BrowserAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/* Âm báo ngắn khi có đơn/sự kiện mới. tone: "new" (mới) | "alert" (gấp). */
export function playOrderChime(tone: "new" | "alert" = "new") {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = tone === "alert" ? 760 : 540;
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 320);
  } catch {
    /* AudioContext có thể bị chặn trước tương tác người dùng — bỏ qua. */
  }
}
