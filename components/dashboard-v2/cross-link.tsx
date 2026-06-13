import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Cross-link layer — "liên thông" giữa các workspace.
 * Cho phép một vùng nội dung trỏ sang vùng khác kèm ngữ cảnh
 * (đơn → bàn → thanh toán → bếp; kho thiếu → tạo PO; món →
 * công thức/doanh thu). Đây là xương sống trải nghiệm chủ quán:
 * không phải nhảy menu thủ công mà đi theo dòng công việc.
 * ============================================================ */

export type CrossLinkItem = {
  href: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "jade" | "orange" | "danger" | "neutral";
};

/* CrossLink — một liên kết ngữ cảnh đơn lẻ (inline). */
export function CrossLink({ href, label, hint, icon, tone = "jade", className }: CrossLinkItem & { className?: string }) {
  const tones: Record<string, string> = {
    jade: "text-[var(--d-primary)] hover:bg-[var(--d-primary-soft)]",
    orange: "text-[var(--d-orange-600)] hover:bg-[var(--d-accent-soft)]",
    danger: "text-[var(--d-danger-fg)] hover:bg-[var(--d-danger-bg)]",
    neutral: "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)]"
  };
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-[var(--d-r-sm)] px-2 py-1 text-[length:var(--d-fs-sm)] font-semibold transition-colors duration-[var(--d-dur)]",
        tones[tone],
        className
      )}
    >
      {icon ? <span className="grid place-items-center">{icon}</span> : null}
      <span className="truncate">{label}</span>
      {hint ? <span className="text-[length:var(--d-fs-xs)] font-normal text-[var(--d-text-faint)]">· {hint}</span> : null}
      <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

/* NextSteps — panel "bước tiếp theo" đặt cuối mỗi workspace.
 * Gợi ý dòng công việc kế tiếp dựa trên ngữ cảnh hiện tại,
 * giúp chủ quán đi liền mạch thay vì tự tìm menu. */
export function NextSteps({ title = "Bước tiếp theo", items, className }: { title?: string; items: CrossLinkItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <section
      className={cn(
        "hidden md:flex flex-col gap-[var(--d-s-3)] rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]",
        className
      )}
    >
      <p className="d-eyebrow">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const tones: Record<string, string> = {
            jade: "border-[var(--d-line)] hover:border-[var(--d-jade)]",
            orange: "border-[var(--d-line)] hover:border-[var(--d-orange)]",
            danger: "border-[var(--d-danger-fg)]/30 hover:border-[var(--d-danger-fg)]",
            neutral: "border-[var(--d-line)] hover:border-[var(--d-line-strong)]"
          };
          const iconTones: Record<string, string> = {
            jade: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
            orange: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
            danger: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
            neutral: "bg-[var(--d-surface-3)] text-[var(--d-text-muted)]"
          };
          const tone = item.tone ?? "jade";
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-[var(--d-r-md)] border bg-[var(--d-surface)] p-[var(--d-s-3)] transition-colors duration-[var(--d-dur)]",
                tones[tone]
              )}
            >
              {item.icon ? (
                <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)]", iconTones[tone])}>
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{item.label}</span>
                {item.hint ? <span className="block truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{item.hint}</span> : null}
              </span>
              <ArrowUpRight size={16} className="flex-none text-[var(--d-text-faint)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--d-text)]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
