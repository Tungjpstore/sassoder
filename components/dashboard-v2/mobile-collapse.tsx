"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* MobileCollapse — gói các vùng phụ (insight, phân tích) lại để mobile bớt cuộn.
 * - Mobile: hiển thị 1 nút gập/mở, nội dung ẩn mặc định để ưu tiên vùng vận hành.
 * - Desktop (md+): luôn hiển thị đầy đủ, nút gập tự ẩn → không đổi trải nghiệm máy tính. */
export function MobileCollapse({
  title,
  hint,
  defaultOpen = false,
  className,
  children
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className={cn("flex flex-col gap-[var(--d-s-3)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-[var(--d-s-4)] py-2.5 text-left transition-colors hover:border-[var(--d-line-strong)] md:hidden"
      >
        <span className="min-w-0">
          <span className="block text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{title}</span>
          {hint ? <span className="block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{hint}</span> : null}
        </span>
        <ChevronDown
          size={18}
          className={cn("flex-none text-[var(--d-text-muted)] transition-transform", open ? "rotate-180" : "")}
          aria-hidden="true"
        />
      </button>
      <div className={cn("flex-col gap-[var(--d-s-3)] md:flex", open ? "flex" : "hidden")}>{children}</div>
    </section>
  );
}
