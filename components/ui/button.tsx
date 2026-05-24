"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-semibold transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        variant === "primary" &&
          "bg-[var(--primary)] text-[#FFF7EB] shadow-[0_12px_28px_rgba(15,77,58,0.16)] hover:-translate-y-0.5 hover:bg-[var(--primary-hover)] hover:shadow-[0_16px_34px_rgba(15,77,58,0.22)]",
        variant === "secondary" &&
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--primary-strong)] shadow-sm hover:-translate-y-0.5 hover:border-[var(--primary)]/35 hover:bg-[var(--primary-soft)] dark:text-[var(--foreground)]",
        variant === "ghost" && "text-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]",
        variant === "danger" && "bg-[var(--accent-strong)] text-[#FFF7EB] hover:bg-[var(--accent-hover)]",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "icon" && "h-11 w-11",
        className
      )}
      {...props}
    />
  );
});
