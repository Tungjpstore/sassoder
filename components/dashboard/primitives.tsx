import type { ElementType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DashboardTone = "green" | "yellow" | "red" | "blue" | "neutral";

const metricToneClasses: Record<DashboardTone, string> = {
  green: "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]",
  yellow: "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  red: "border-[var(--accent)]/30 bg-[var(--danger-soft)] text-[var(--tertiary)]",
  blue: "border-[var(--secondary)]/30 bg-[var(--secondary-soft)] text-[var(--primary)]",
  neutral: "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
};

export function DashboardPanel({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("dashboard-panel p-4", className)}>{children}</section>;
}

export function DashboardSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="dashboard-eyebrow text-[var(--muted-foreground)]">{eyebrow}</p> : null}
        <h2 className="dashboard-section-title mt-1">{title}</h2>
        {description ? <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{description}</p> : null}
      </div>
      {action ? <div className="dashboard-action-row flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function DashboardPageHero({
  eyebrow,
  title,
  description,
  badges,
  actions,
  aside,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("admin-hero-panel rounded-[14px] p-4", className)}>
      <div className="relative z-[1] flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
          {eyebrow ? <p className={cn("dashboard-eyebrow", badges ? "mt-3" : "")}>{eyebrow}</p> : null}
          <h1 className={cn("dashboard-page-title", badges || eyebrow ? "mt-2" : "")}>{title}</h1>
          {description ? <p className="dashboard-body-copy mt-2 max-w-3xl">{description}</p> : null}
          {actions ? <div className="dashboard-action-row mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {aside ? <div className="min-w-0 shrink-0 xl:max-w-sm">{aside}</div> : null}
      </div>
    </section>
  );
}

export function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  meta,
  tone = "green",
  className
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: DashboardTone;
  className?: string;
}) {
  return (
    <article className={cn("admin-stat-tile rounded-[14px] p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", metricToneClasses[tone])}>
          <Icon size={18} />
        </span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="metric-number mt-3 truncate text-2xl font-semibold text-[var(--foreground)]">{value}</p>
      {meta ? <p className="mt-1 truncate text-sm font-medium text-[var(--muted-foreground)]">{meta}</p> : null}
    </article>
  );
}

export function DashboardEmptyState({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-5 text-center text-sm font-semibold text-[var(--muted-foreground)]", className)}>
      {children}
    </div>
  );
}
