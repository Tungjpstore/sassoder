import * as React from "react";
import { cn } from "@/lib/utils";

/* Container — single max width, consistent gutter */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[var(--container)] px-4 min-[360px]:px-5 sm:px-7 lg:px-8", className)} {...props} />;
}

/* Section — consistent vertical rhythm */
export function Section({
  as = "section",
  className,
  spacing = "lg",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div"; spacing?: "md" | "lg" | "xl" }) {
  const Tag = as;
  const pad = spacing === "md" ? "py-[var(--s-12)]" : spacing === "xl" ? "py-[var(--s-28)]" : "py-[var(--s-20)]";
  return <Tag className={cn("relative", pad, className)} {...props} />;
}

/* Eyebrow — small uppercase label, used once per section */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("v2-eyebrow", className)} {...props} />;
}

/* Section header — eyebrow + title + lead in one consistent shape */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  align = "left",
  className
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[var(--s-4)]", align === "center" && "items-center text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="max-w-3xl text-[length:var(--fs-h2)] font-bold leading-[var(--lh-snug)] tracking-[var(--tracking-tight)] text-[var(--text)]">
        {title}
      </h2>
      {lead ? (
        <p className="max-w-2xl text-[length:var(--fs-lead)] leading-[var(--lh-body)] text-[var(--text-muted)]">{lead}</p>
      ) : null}
    </div>
  );
}

/* Card — single elevated surface used everywhere */
export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--sh-md)]",
        className
      )}
      {...props}
    />
  );
}

/* Pill — small status/info chip */
export function Pill({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "jade" | "orange" | "ok" }) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
    jade: "bg-[var(--primary-soft)] text-[var(--primary)]",
    orange: "bg-[var(--accent-soft)] text-[var(--orange-600)]",
    ok: "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
  };
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-[var(--r-pill)] px-2.5 text-[length:var(--fs-xs)] font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
