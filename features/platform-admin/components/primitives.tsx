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
    "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
    kind === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    kind === "warning" && "border-orange-200 bg-orange-50 text-orange-700",
    kind === "danger" && "border-red-200 bg-red-50 text-red-700",
    kind === "info" && "border-blue-200 bg-blue-50 text-blue-700",
    kind === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
  );
}

export function statusTone(status: string): BadgeTone {
  if (status === "active" || status === "confirmed" || status === "live" || status === "configured" || status === "pass" || status === "success") return "good";
  if (status === "suspended" || status === "waiting_confirm" || status === "trialing" || status === "needs_review" || status === "partial" || status === "static" || status === "planned" || status === "warn") return "warning";
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
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
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
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
    </label>
  );
}

export function PrimaryButton({ children, tone = "dark" }: { children: ReactNode; tone?: ButtonTone }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
        tone === "dark" && "bg-[var(--primary)] text-[#FFF7EB] hover:bg-[var(--primary-hover)]",
        tone === "orange" && "bg-[var(--accent)] text-[#FFF7EB] hover:bg-[var(--accent-hover)]",
        tone === "danger" && "bg-[var(--accent-strong)] text-[#FFF7EB] hover:bg-[var(--accent)]",
        tone === "soft" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--soft-surface)]"
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl border",
            tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            tone === "warning" && "border-orange-200 bg-orange-50 text-orange-700",
            tone === "danger" && "border-red-200 bg-red-50 text-red-700",
            tone === "info" && "border-blue-200 bg-blue-50 text-blue-700",
            tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
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
    <section className={cn("rounded-2xl border border-slate-200 bg-white", className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
