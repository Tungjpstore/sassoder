"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Charts v2 — bộ biểu đồ SVG thuần, không thư viện ngoài.
 * Màu brand jade/orange, responsive theo viewBox.
 * ============================================================ */

export type Point = { label: string; value: number };

/* AreaChart — đường + vùng tô, dùng cho xu hướng doanh thu. */
export function AreaChart({
  data,
  height = 180,
  stroke = "var(--d-jade)",
  fill = "var(--d-primary-soft)",
  className,
  valueFormat = (v: number) => String(v)
}: {
  data: Point[];
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  valueFormat?: (v: number) => string;
}) {
  const w = 600;
  const h = height;
  const pad = { t: 16, r: 8, b: 24, l: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const x = (i: number) => pad.l + i * stepX;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`;
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} role="img" aria-label="Biểu đồ xu hướng">
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * g} y2={pad.t + innerH * g} stroke="var(--d-line)" strokeDasharray="3 5" />
      ))}
      <path d={area} fill={fill} opacity={0.5} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.label}>
          {i === peakIdx ? (
            <>
              <circle cx={x(i)} cy={y(d.value)} r={4.5} fill={stroke} />
              <circle cx={x(i)} cy={y(d.value)} r={8} fill="none" stroke={stroke} opacity={0.25} />
            </>
          ) : null}
          {i % Math.ceil(data.length / 6) === 0 ? (
            <text x={x(i)} y={h - 6} textAnchor="middle" className="fill-[var(--d-text-faint)]" style={{ fontSize: 10 }}>
              {d.label}
            </text>
          ) : null}
        </g>
      ))}
      <text x={x(peakIdx)} y={y(data[peakIdx].value) - 12} textAnchor="middle" className="fill-[var(--d-text)]" style={{ fontSize: 11, fontWeight: 700 }}>
        {valueFormat(data[peakIdx].value)}
      </text>
    </svg>
  );
}

/* BarChart — cột dọc, dùng cho giờ cao điểm / đơn theo giờ. */
export function BarChart({
  data,
  height = 180,
  color = "var(--d-jade)",
  peakColor = "var(--d-orange)",
  className
}: {
  data: Point[];
  height?: number;
  color?: string;
  peakColor?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div className={cn("flex h-full items-end gap-1.5", className)} style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <div
            className="w-full rounded-t-[4px] transition-[height] duration-500"
            style={{
              height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 1)}%`,
              background: i === peakIdx ? peakColor : color,
              opacity: i === peakIdx ? 1 : 0.55
            }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="truncate text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* DonutChart — vòng tỉ lệ, dùng cho cơ cấu thanh toán / nguồn đơn. */
export type DonutSlice = { label: string; value: number; color: string };

export function DonutChart({
  slices,
  size = 150,
  thickness = 22,
  centerLabel,
  centerValue,
  className
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}) {
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={cn("flex items-center gap-[var(--d-s-5)]", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--d-surface-3)" strokeWidth={thickness} />
          {slices.map((s) => {
            const len = (s.value / total) * c;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? <span className="d-num text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">{centerValue}</span> : null}
          {centerLabel ? <span className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{centerLabel}</span> : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[length:var(--d-fs-sm)]">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-[var(--d-text-muted)]">{s.label}</span>
            <span className="d-num font-semibold text-[var(--d-text)]">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Sparkline — đường mini cho thẻ KPI. */
export function Sparkline({ data, stroke = "var(--d-jade)", className }: { data: number[]; stroke?: string; className?: string }) {
  const w = 100;
  const h = 28;
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("w-full", className)} preserveAspectRatio="none" aria-hidden="true">
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
