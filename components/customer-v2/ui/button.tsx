"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] font-semibold leading-none " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-[var(--dur)] ease-[var(--ease)] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)] " +
  "disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-orange)] shadow-[var(--sh-accent)] hover:bg-[var(--orange-600)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--line-strong)] hover:border-[var(--jade)] hover:text-[var(--jade)]",
  ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:brightness-95"
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[length:var(--fs-sm)]",
  md: "h-11 px-5 text-[length:var(--fs-sm)]",
  lg: "h-[var(--tap-cta)] px-6 text-[length:var(--fs-body)]"
};

export type ShopButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export const ShopButton = React.forwardRef<HTMLButtonElement, ShopButtonProps>(function ShopButton(
  { variant = "primary", size = "md", fullWidth, loading, leftIcon, rightIcon, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={size === "lg" ? 18 : 16} aria-hidden /> : leftIcon}
      {children}
      {!loading ? rightIcon : null}
    </button>
  );
});
