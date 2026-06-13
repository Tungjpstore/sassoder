import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "group inline-flex items-center justify-center gap-2 rounded-[var(--d-r-md)] font-semibold transition-[transform,box-shadow,background-color,border-color,color] duration-[var(--d-dur)] ease-[var(--d-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--d-jade)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)] hover:bg-[var(--d-jade-700)] active:scale-[0.98]",
  secondary: "border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-[var(--d-text)] hover:border-[var(--d-jade)] hover:bg-[var(--d-surface-2)]",
  ghost: "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]",
  danger: "bg-[var(--d-danger-fg)] text-white hover:opacity-90 active:scale-[0.98]"
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[length:var(--d-fs-xs)]",
  md: "h-10 px-4 text-[length:var(--d-fs-sm)]",
  lg: "h-11 px-5 text-[length:var(--d-fs-body)]"
};

type CommonProps = { variant?: Variant; size?: Size; className?: string; children: React.ReactNode };

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: CommonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
