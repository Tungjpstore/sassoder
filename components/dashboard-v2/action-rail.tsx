"use client";

import Link from "next/link";
import { Bell, ChefHat, ClipboardList, Clock3, Sparkles, Warehouse, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
 * ActionRail — cột "Dòng hành động" cố định bên phải.
 * Tổng hợp việc cần xử lý XUYÊN SUỐT mọi workspace vào một nơi,
 * không đổi khi chủ quán chuyển trang. Đây là hiện thân cấu trúc
 * của yêu cầu "các workspace liên thông".
 * ============================================================ */

export type ActionStreamItem = {
  id: string;
  kind: "order" | "payment" | "kitchen" | "table" | "inventory" | "ai";
  title: string;
  detail: string;
  href: string;
  amount?: string;
  urgent?: boolean;
};

const kindMeta: Record<ActionStreamItem["kind"], { icon: React.ReactNode; label: string; tone: string }> = {
  order: { icon: <ClipboardList size={15} />, label: "Đơn mới", tone: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]" },
  payment: { icon: <WalletCards size={15} />, label: "Thanh toán", tone: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]" },
  kitchen: { icon: <ChefHat size={15} />, label: "Bếp", tone: "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]" },
  table: { icon: <Clock3 size={15} />, label: "Bàn", tone: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]" },
  inventory: { icon: <Warehouse size={15} />, label: "Kho", tone: "bg-[var(--d-warn-bg)] text-[var(--d-warn-fg)]" },
  ai: { icon: <Sparkles size={15} />, label: "Trợ lý AI", tone: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]" }
};

export function ActionRail({ items }: { items: ActionStreamItem[] }) {
  const urgentCount = items.filter((i) => i.urgent).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--d-line)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] text-[var(--d-on-jade)]">
            <Bell size={15} />
          </span>
          <div>
            <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Dòng hành động</p>
            <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
              {items.length} việc · {urgentCount} gấp
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-ok-fg)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--d-ok-fg)]" /> Realtime
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-[var(--d-s-3)]">
        {items.map((item) => {
          const meta = kindMeta[item.kind];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group flex flex-col gap-1.5 rounded-[var(--d-r-md)] border bg-[var(--d-surface)] p-[var(--d-s-3)] transition-colors duration-[var(--d-dur)]",
                item.urgent ? "border-[var(--d-danger-fg)]/30 hover:border-[var(--d-danger-fg)]" : "border-[var(--d-line)] hover:border-[var(--d-line-strong)]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)]", meta.tone)}>{meta.icon}</span>
                <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
                  {meta.label}
                </span>
                {item.urgent ? <span className="ml-auto h-2 w-2 rounded-full bg-[var(--d-danger-fg)]" /> : null}
              </div>
              <p className="text-[length:var(--d-fs-sm)] font-semibold leading-snug text-[var(--d-text)]">{item.title}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{item.detail}</span>
                {item.amount ? <span className="d-num text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]">{item.amount}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
