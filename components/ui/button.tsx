"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg font-bold transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        variant === "primary" &&
          "bg-[var(--accent)] text-[#FFF7EB] shadow-[0_12px_28px_rgba(242,140,40,0.22)] hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-[0_16px_34px_rgba(242,140,40,0.28)]",
        variant === "secondary" &&
          "border border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--secondary-soft)] dark:text-[var(--foreground)]",
        variant === "ghost" && "text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]",
        variant === "danger" && "bg-[var(--danger)] text-[#FFF7EB] hover:bg-[var(--accent-strong)]",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "icon" && "h-10 w-10",
        className
      )}
      {...props}
    />
  );
}
