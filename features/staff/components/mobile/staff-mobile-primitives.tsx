import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffMobileTone = "primary" | "success" | "warning" | "danger" | "neutral" | "muted";

export function staffToneClass(tone: StaffMobileTone) {
  const classes: Record<StaffMobileTone, string> = {
    primary: "border-[var(--primary)]/25 bg-[var(--primary-soft)] text-[var(--primary)]",
    success: "border-[var(--primary)]/20 bg-[var(--success-soft)] text-[var(--primary)]",
    warning: "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    danger: "border-[var(--accent)]/35 bg-[var(--danger-soft)] text-[var(--tertiary)]",
    neutral: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]",
    muted: "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
  };
  return classes[tone];
}

export function StaffMobilePanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("dashboard-panel rounded-[14px] p-3", className)}>{children}</section>;
}

export function StaffMobileSectionHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-10 items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="dashboard-eyebrow text-[var(--muted-foreground)]">{eyebrow}</p> : null}
        <h2 className="dashboard-section-title mt-0.5 truncate">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StaffStatusPill({ children, tone = "neutral", className }: { children: ReactNode; tone?: StaffMobileTone; className?: string }) {
  return <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold", staffToneClass(tone), className)}>{children}</span>;
}

export function StaffMobileEmptyState({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center">
      <div>
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon ?? <CheckCircle2 size={18} aria-hidden="true" />}
        </span>
        <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{title}</p>
        {text ? <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{text}</p> : null}
      </div>
    </div>
  );
}

export function StaffMetricTile({ icon, label, value, tone = "neutral" }: { icon: ReactNode; label: string; value: ReactNode; tone?: StaffMobileTone }) {
  return (
    <article className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--dashboard-glass-muted)] p-2.5">
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg border", staffToneClass(tone))}>{icon}</span>
      <p className="metric-number mt-2 truncate text-xl font-semibold text-[var(--foreground)]">{value}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</p>
    </article>
  );
}

export function StaffPrimaryButton({ children, className, tone = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-[var(--glow-primary)] transition active:scale-[0.99] disabled:opacity-55",
        tone === "danger" ? "bg-[var(--accent-strong)] shadow-[var(--glow-accent)]" : "bg-[var(--primary)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StaffSecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]/30 active:scale-[0.99] disabled:opacity-55", className)}
      {...props}
    >
      {children}
    </button>
  );
}
