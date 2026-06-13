"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { fontVars } from "../fonts";
import { Money } from "../ui/primitives";

/* ShopShell — gốc của mọi trang khách v2.
 * Áp data-shop="v2" + fonts, nền bg, và canh khung giữa (mobile full-bleed,
 * desktop khung gọn max ~30rem). */
export function ShopShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div data-shop="v2" className={cn(fontVars, "min-h-[100dvh] bg-[var(--bg)] text-[var(--text)]")}>
      <div className={cn("relative mx-auto flex min-h-[100dvh] w-full max-w-[var(--shop-max)] flex-col bg-[var(--bg)] sm:shadow-[var(--sh-lg)]", className)}>
        {children}
      </div>
    </div>
  );
}

/* TopBar — dính trên cùng. Logo + tên quán + dòng phụ (bàn/kênh) + nút back tuỳ chọn. */
export function TopBar({
  title,
  subtitle,
  logoUrl,
  onBack,
  right,
  statusSlot,
  loading
}: {
  title: string;
  subtitle?: React.ReactNode;
  logoUrl?: string | null;
  onBack?: () => void;
  right?: React.ReactNode;
  statusSlot?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-[var(--z-topbar)] border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-md"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-[var(--topbar-h)] items-center gap-3 px-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Quay lại"
            className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--text)] transition hover:bg-[var(--surface-2)] active:scale-90"
          >
            <ChevronLeft size={22} />
          </button>
        ) : logoUrl ? (
          <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)]">
            <Image src={logoUrl} alt="" width={36} height={36} className="h-full w-full object-cover" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[length:var(--fs-h3)] font-bold leading-tight text-[var(--text)]">{title}</h1>
          {subtitle ? <div className="truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{subtitle}</div> : null}
        </div>

        {right}
      </div>
      {statusSlot}
      {loading ? <div className="shop-topbar-progress" aria-hidden /> : null}
    </header>
  );
}

/* StickyCartBar — thanh giỏ dính dưới, CTA một tay. */
export function StickyCartBar({
  count,
  total,
  label = "Xem giỏ hàng",
  onClick,
  disabled,
  hidden
}: {
  count: number;
  total: number;
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div
      className="shop-slide-up sticky bottom-0 z-[var(--z-cartbar)] border-t border-[var(--line)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur-md"
      style={{ paddingBottom: "calc(var(--s-3) + var(--safe-bottom))" }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-[var(--tap-cta)] w-full items-center justify-between gap-3 rounded-[var(--r-pill)] bg-[var(--accent)] px-5 text-[var(--on-orange)] shadow-[var(--sh-accent)]",
          "transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)]"
        )}
      >
        <span className="flex items-center gap-2">
          <span key={count} className="shop-pop grid min-h-6 min-w-6 place-items-center rounded-full bg-[var(--on-orange)]/15 px-2 text-[length:var(--fs-xs)] font-bold shop-num">
            {count}
          </span>
          <span className="text-[length:var(--fs-body)] font-bold">{label}</span>
        </span>
        <Money value={total} className="text-[length:var(--fs-body)] font-bold" />
      </button>
    </div>
  );
}

/* PageBody — vùng cuộn nội dung giữa topbar và cartbar */
export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex-1", className)}>{children}</div>;
}
