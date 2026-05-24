import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BillingCard({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_20px_60px_rgba(15,23,18,0.05)]", className)}>{children}</section>;
}
