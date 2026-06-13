"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Workspace UI v2 — primitive dùng chung cho mọi workspace:
 * FilterTabs, Toolbar, DataTable, StatusDot, FloorTile.
 * ============================================================ */

export type TabItem = { key: string; label: string; count?: number };

/* FilterTabs — dải pill lọc, đồng bộ với overview. */
export function FilterTabs({
  tabs,
  active,
  onChange,
  className
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[var(--d-r-pill)] px-3.5 text-[length:var(--d-fs-sm)] font-semibold transition-colors",
              on
                ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                : "border border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className={cn("d-num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--d-fs-2xs)] font-bold", on ? "bg-white/20 text-[var(--d-on-jade)]" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* Toolbar — hàng tiêu đề khu + filter + action. */
export function Toolbar({
  eyebrow,
  title,
  children,
  className
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[var(--d-s-3)] sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="d-eyebrow text-[var(--d-orange-600)]">{eyebrow}</p> : null}
        <h2 className="text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">{title}</h2>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/* StatusDot — chấm trạng thái có nhãn. */
export function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-medium text-[var(--d-text-muted)]">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/* DataTable — bảng dữ liệu responsive (desktop: bảng, mobile: card stack). */
export type Column<T> = {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  onRowClick,
  empty,
  className
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
}) {
  const gridTemplate = columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ");

  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div className={cn("overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)]", className)}>
      {/* Header — chỉ desktop */}
      <div
        className="hidden gap-3 border-b border-[var(--d-line)] bg-[var(--d-surface-2)]/60 px-[var(--d-s-4)] py-[var(--d-s-3)] md:grid"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => (
          <span
            key={c.key}
            className={cn(
              "text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]",
              c.align === "right" && "text-right",
              c.align === "center" && "text-center"
            )}
          >
            {c.header}
          </span>
        ))}
      </div>

      <div className="divide-y divide-[var(--d-line)]">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "flex flex-col gap-2 px-[var(--d-s-4)] py-[var(--d-s-3)] md:grid md:items-center md:gap-3",
              onRowClick && "cursor-pointer transition-colors hover:bg-[var(--d-surface-2)]"
            )}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "flex items-center justify-between gap-2 md:block",
                  c.align === "right" && "md:text-right",
                  c.align === "center" && "md:text-center"
                )}
              >
                <span className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)] md:hidden">
                  {c.header}
                </span>
                <span className="min-w-0 text-[length:var(--d-fs-sm)] text-[var(--d-text)]">{c.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
