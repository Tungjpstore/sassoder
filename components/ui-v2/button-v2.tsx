"use client";

import * as React from "react";
import Link from "next/link";
import type { LinkProps } from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] font-semibold " +
  "transition-[transform,box-shadow,background-color,border-color] duration-[var(--dur)] ease-[var(--ease)] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)] " +
  "disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-orange)] shadow-[var(--sh-accent)] hover:bg-[var(--orange-600)] hover:-translate-y-0.5 active:translate-y-0",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--line-strong)] hover:border-[var(--jade)] hover:text-[var(--jade)]",
  ghost: "bg-transparent text-[var(--text)] hover:text-[var(--jade)]"
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[length:var(--fs-sm)]",
  lg: "h-[3.25rem] px-7 text-[length:var(--fs-body)]"
};

type Common = { variant?: Variant; size?: Size; className?: string; children?: React.ReactNode };
type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & { as?: "button" };
type AsLink = Common & Omit<LinkProps, keyof Common> & { as: "link" };

export type ButtonV2Props = AsButton | AsLink;

export function ButtonV2(props: ButtonV2Props) {
  const { variant = "primary", size = "md", className, children } = props;
  const cls = cn(base, variants[variant], sizes[size], className);

  if (props.as === "link") {
    const { as: _a, variant: _v, size: _s, className: _c, children: _ch, ...rest } = props;
    void _a; void _v; void _s; void _c; void _ch;
    return (
      <Link className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  const { as: _a, variant: _v, size: _s, className: _c, children: _ch, ...rest } = props;
  void _a; void _v; void _s; void _c; void _ch;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
