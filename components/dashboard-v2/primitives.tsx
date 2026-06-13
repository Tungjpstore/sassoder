import * as React from "react";
import { cn } from "@/lib/utils";

/* Panel — surface chuẩn cho mọi vùng nội dung. */
export function Panel({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-[var(--d-dur)] ease-[var(--d-ease)] hover:-translate-y-0.5 hover:border-[var(--d-line-strong)] hover:shadow-[var(--d-sh-md)]",
        className
      )}
      {...props}
    />
  );
}

/* PanelHeader — header bên trong Panel, có eyebrow + title + action slot. */
export function PanelHeader({
  eyebrow,
  title,
  description,
  action,
  className
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="d-eyebrow">{eyebrow}</p> : null}
        <h2 className={cn("text-[length:var(--d-fs-h2)] font-semibold leading-[var(--d-lh-snug)] text-[var(--d-text)]", eyebrow && "mt-1")}>
          {title}
        </h2>
        {description ? <p className="mt-1 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

/* PageHero — header trang (gom AdminShell title + admin-hero-panel cũ về 1).
 * Có slot meta phải để nhúng filter, date picker, hoặc nhóm action. */
export function PageHero({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-[var(--d-s-3)] pb-[var(--d-s-4)] sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="d-eyebrow">{eyebrow}</p> : null}
        <h1 className={cn("text-[length:var(--d-fs-display)] font-bold leading-[var(--d-lh-tight)] tracking-[var(--d-track-tight)] text-[var(--d-text)]", eyebrow && "mt-1.5")}>
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[length:var(--d-fs-sm)] leading-[var(--d-lh-body)] text-[var(--d-text-muted)]">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-[var(--d-s-3)] flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

/* MetricCard — stat tile chuẩn (thay admin-stat-tile cũ + DashboardMetricCard
 * trong primitives v1). Hỗ trợ trend (delta) và link tới workspace để
 * đóng vai trò "cầu nối liên thông" giữa các vùng. */
export function MetricCard({
  icon,
  label,
  value,
  helper,
  trend,
  tone = "neutral",
  href,
  className
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  trend?: { delta: string; direction: "up" | "down" | "flat" };
  tone?: "jade" | "orange" | "danger" | "info" | "neutral";
  href?: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    jade: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
    orange: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
    danger: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]",
    neutral: "bg-[var(--d-surface-2)] text-[var(--d-text-muted)]"
  };
  const trendTone =
    trend?.direction === "up"
      ? "text-[var(--d-ok-fg)]"
      : trend?.direction === "down"
      ? "text-[var(--d-danger-fg)]"
      : "text-[var(--d-text-faint)]";
  const Tag = (href ? "a" : "article") as React.ElementType;
  return (
    <Tag
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-4)] py-2.5 shadow-[var(--d-sh-sm)]",
        href && "transition-colors duration-[var(--d-dur)] hover:border-[var(--d-line-strong)] hover:bg-[var(--d-surface-2)]",
        className
      )}
    >
      {icon ? (
        <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)]", tones[tone])}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
          {label}
        </span>
        <span className="d-num block truncate text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{value}</span>
        {(helper || trend) && (
          <span className="flex items-center gap-1.5 truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {trend ? (
              <span className={cn("d-num font-semibold", trendTone)}>
                {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.delta}
              </span>
            ) : null}
            {helper ? <span className="truncate">{helper}</span> : null}
          </span>
        )}
      </span>
    </Tag>
  );
}

/* Badge — chip trạng thái nhỏ, đồng bộ tone với MetricCard. */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "jade" | "orange" | "danger" | "info" | "ok" | "neutral" }) {
  const tones: Record<string, string> = {
    jade: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
    orange: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
    danger: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]",
    ok: "bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]",
    neutral: "bg-[var(--d-surface-2)] text-[var(--d-text-muted)]"
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[var(--d-r-pill)] px-2.5 text-[length:var(--d-fs-2xs)] font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/* SwitchControl — nút gạt chuẩn cho Dashboard v2.
 * Có chữ Bật/Tắt rõ ràng để chủ quán không phải đoán trạng thái. */
export function SwitchControl({
  checked,
  onChange,
  label,
  disabled = false,
  className
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "group inline-flex h-8 min-w-[76px] shrink-0 items-center rounded-[var(--d-r-pill)] border px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--d-jade)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "justify-end border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
          : "justify-start border-[var(--d-line-strong)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)]",
        className
      )}
    >
      <span className={cn("grid h-6 w-6 place-items-center rounded-full bg-white shadow-[var(--d-sh-sm)]", checked ? "text-[var(--d-jade)]" : "text-[var(--d-text-faint)]")}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: checked ? "var(--d-jade)" : "var(--d-line-strong)" }} />
      </span>
      <span className={cn("px-2 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]", checked ? "order-first" : "order-last")}>
        {label ?? (checked ? "Bật" : "Tắt")}
      </span>
    </button>
  );
}

/* EmptyState — trạng thái rỗng nhất quán, có CTA tùy chọn. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-[var(--d-s-3)] rounded-[var(--d-r-lg)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface-2)] px-[var(--d-s-6)] py-[var(--d-s-10)] text-center",
        className
      )}
    >
      {icon ? <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{icon}</span> : null}
      <div className="flex flex-col gap-1">
        <p className="text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">{title}</p>
        {description ? <p className="max-w-sm text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* SkeletonBlock — placeholder loading dùng chung (thay 4 skeleton copy-paste). */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--d-r-lg)] bg-[var(--d-surface-3)]/60", className)} />;
}
