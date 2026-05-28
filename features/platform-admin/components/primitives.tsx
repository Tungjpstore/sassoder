import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ProjectSurface } from "@/features/platform-admin/types";

type BadgeTone = "good" | "warning" | "danger" | "info" | "neutral";
type ButtonTone = "dark" | "orange" | "danger" | "soft";

export function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function formatDateTime(value: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function badgeTone(kind: BadgeTone) {
  return cn(
    "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none backdrop-blur",
    kind === "good" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.12)]",
    kind === "warning" && "border-amber-400/30 bg-amber-400/10 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.1)]",
    kind === "danger" && "border-red-400/30 bg-red-400/10 text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.1)]",
    kind === "info" && "border-sky-400/30 bg-sky-400/10 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.1)]",
    kind === "neutral" && "border-white/10 bg-white/[0.05] text-slate-300"
  );
}

export function statusTone(status: string): BadgeTone {
  if (status === "active" || status === "confirmed" || status === "live" || status === "configured" || status === "pass" || status === "success" || status === "sent" || status === "generated") return "good";
  if (status === "suspended" || status === "waiting_confirm" || status === "trialing" || status === "needs_review" || status === "partial" || status === "static" || status === "planned" || status === "warn" || status === "skipped") return "warning";
  if (status === "deleted" || status === "blocked" || status === "rejected" || status === "past_due") return "danger";
  if (status === "needs_config" || status === "pending_payment") return "info";
  if (status === "error" || status === "fail" || status === "failed" || status === "missing") return "danger";
  return "neutral";
}

export function riskTone(risk: "low" | "medium" | "high"): BadgeTone {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "good";
}

export function criticalityTone(criticality: ProjectSurface["criticality"]): BadgeTone {
  if (criticality === "critical") return "danger";
  if (criticality === "high") return "warning";
  return "info";
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = true,
  placeholder
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-200">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-white/10 bg-[#0A1020] px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
      />
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 4
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-200">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        className="resize-none rounded-lg border border-white/10 bg-[#0A1020] px-3 py-2 text-sm font-medium leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
      />
    </label>
  );
}

export function PrimaryButton({ children, tone = "dark" }: { children: ReactNode; tone?: ButtonTone }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        tone === "dark" && "bg-[#F8FAFC] text-[#080C16] hover:bg-slate-200",
        tone === "orange" && "bg-amber-300 text-[#080C16] hover:bg-amber-200",
        tone === "danger" && "bg-red-400 text-white hover:bg-red-300",
        tone === "soft" && "border border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]"
      )}
    >
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  icon: ElementType;
  tone?: BadgeTone;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0F1629] p-4 shadow-[0_14px_42px_rgba(0,0,0,0.2)] transition hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="metric-number mt-3 text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
        </div>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-lg border",
            tone === "good" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
            tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-200",
            tone === "danger" && "border-red-400/25 bg-red-400/10 text-red-200",
            tone === "info" && "border-sky-400/25 bg-sky-400/10 text-sky-200",
            tone === "neutral" && "border-white/10 bg-white/[0.04] text-slate-300"
          )}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">{detail}</p>
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-white/10 bg-[#0F1629] shadow-[0_14px_42px_rgba(0,0,0,0.2)]", className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function LiveDot({ tone = "good" }: { tone?: BadgeTone }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping", tone === "good" && "bg-emerald-400", tone === "warning" && "bg-amber-400", tone === "danger" && "bg-red-400", tone === "info" && "bg-sky-400", tone === "neutral" && "bg-slate-400")} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", tone === "good" && "bg-emerald-300", tone === "warning" && "bg-amber-300", tone === "danger" && "bg-red-300", tone === "info" && "bg-sky-300", tone === "neutral" && "bg-slate-300")} />
    </span>
  );
}
