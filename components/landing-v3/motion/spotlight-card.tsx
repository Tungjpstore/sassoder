"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* SpotlightCard — a surface that renders a soft brand-tinted glow
 * following the cursor, plus a gradient hairline border on hover.
 * Pure CSS variables updated on pointer move (no re-render). */
export function SpotlightCard({
  children,
  className,
  tone = "jade",
  as: Tag = "div"
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "jade" | "orange";
  as?: "div" | "article" | "li";
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  const glow =
    tone === "orange"
      ? "radial-gradient(420px circle at var(--mx) var(--my), rgba(242,140,40,0.16), transparent 42%)"
      : "radial-gradient(420px circle at var(--mx) var(--my), rgba(15,77,58,0.13), transparent 42%)";

  return (
    <Tag
      // @ts-expect-error — ref is valid for all allowed tags
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        "group/spot relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--sh-sm)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--dur)] ease-[var(--ease)]",
        "hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-[var(--sh-lg)]",
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--dur)] group-hover/spot:opacity-100"
        style={{ background: glow }}
      />
      <span className="relative z-10 flex h-full flex-col">{children}</span>
    </Tag>
  );
}
