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

/* NextSteps — đã loại bỏ. Dashboard ưu tiên thao tác trực tiếp tại từng vùng;
 * điều hướng giữa workspace dùng sidebar cố định bên trái. Component giữ
 * signature để khỏi vỡ import cũ nhưng không render gì. */
export function NextSteps(_props: { title?: string; items: CrossLinkItem[]; className?: string }) {
  void _props;
  return null;
}
