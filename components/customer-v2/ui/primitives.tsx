"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVnd } from "@/lib/money";

/* Money — hiển thị tiền VND, tabular-nums */
export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn("shop-num", className)}>{formatVnd(value)}</span>;
}

/* Card — surface nền cho mọi block */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]",
        interactive &&
          "transition-[border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease)] hover:border-[var(--line-strong)] hover:shadow-[var(--sh-md)]",
        className
      )}
      {...props}
    />
  );
}

type Tone = "neutral" | "jade" | "orange" | "ok" | "warn" | "danger" | "info";
const toneStyles: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  jade: "bg-[var(--primary-soft)] text-[var(--jade)]",
  orange: "bg-[var(--accent-soft)] text-[var(--orange-600)]",
  ok: "bg-[var(--ok-bg)] text-[var(--ok-fg)]",
  warn: "bg-[var(--warn-bg)] text-[var(--warn-fg)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger-fg)]",
  info: "bg-[var(--info-bg)] text-[var(--info-fg)]"
};

/* Pill — chip trạng thái/thông tin nhỏ */
export function Pill({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[var(--r-pill)] px-2.5 text-[length:var(--fs-xs)] font-semibold",
        toneStyles[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* QtyStepper — tăng/giảm số lượng, tap target ≥ 44px */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = "md",
  ariaLabel = "Số lượng"
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const btn =
    "grid place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)] " +
    "transition active:scale-90 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--jade)]";
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={ariaLabel}>
      <button type="button" className={cn(btn, dim)} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Giảm">
        <Minus size={size === "sm" ? 14 : 16} />
      </button>
      <span className="shop-num min-w-[1.5rem] text-center text-[length:var(--fs-body)] font-bold tabular-nums">{value}</span>
      <button type="button" className={cn(btn, dim)} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Tăng">
        <Plus size={size === "sm" ? 14 : 16} />
      </button>
    </div>
  );
}

/* SegmentedTabs — chuyển chế độ (vd: Mang đi / Giao hàng) */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface-2)] p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-[var(--r-pill)] px-3 text-[length:var(--fs-sm)] font-semibold transition",
              "disabled:opacity-40 disabled:pointer-events-none",
              active ? "bg-[var(--surface)] text-[var(--jade)] shadow-[var(--sh-sm)]" : "text-[var(--text-muted)]"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* SectionLabel — nhãn nhóm nhỏ in hoa */
export function SectionLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "text-[length:var(--fs-2xs)] font-bold uppercase tracking-[var(--track-wide)] text-[var(--text-faint)]",
        className
      )}
    >
      {children}
    </span>
  );
}

/* MoneyRow — dòng tổng tiền (subtotal/fee/total) */
export function MoneyRow({
  label,
  value,
  strong,
  tone,
  hint
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "muted" | "accent";
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={cn(
          "text-[length:var(--fs-sm)]",
          strong ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]",
          tone === "accent" && "text-[var(--orange-600)]"
        )}
      >
        {label}
        {hint ? <span className="ml-1 text-[length:var(--fs-xs)] text-[var(--text-faint)]">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "shop-num text-right",
          strong ? "text-[length:var(--fs-body)] font-bold text-[var(--text)]" : "text-[length:var(--fs-sm)] text-[var(--text)]",
          tone === "accent" && "text-[var(--orange-600)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* Skeleton — khối loading shimmer */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shop-skeleton", className)} aria-hidden />;
}

/* MenuRowSkeleton — placeholder 1 dòng món */
export function MenuRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <Skeleton className="h-[68px] w-[68px] rounded-[var(--r-md)]" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-9 w-16 rounded-[var(--r-pill)]" />
    </div>
  );
}

/* Spinner */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn("shop-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* EmptyState — màn trống */
export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]">{icon}</div>
      ) : null}
      <h3 className="text-[length:var(--fs-h3)] font-semibold text-[var(--text)]">{title}</h3>
      {description ? <p className="max-w-xs text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--text-muted)]">{description}</p> : null}
      {action}
    </div>
  );
}
