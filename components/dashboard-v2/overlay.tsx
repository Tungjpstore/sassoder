"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";
import { useDashboardOverlay } from "@/components/dashboard/use-dashboard-overlay";
import { fontVars } from "@/components/landing-v2/fonts";
import { cn } from "@/lib/utils";

/* ============================================================
 * Overlay family v2 — một nền tảng duy nhất cho Drawer / Sheet /
 * Modal. Dựng trên use-dashboard-overlay (scroll lock + portal)
 * và useDialogFocusTrap (focus trap + Esc + restore).
 * Thay thế: shared-drawer, confirm-dialog, mobile nav sheet,
 * quick-actions popover, các bề mặt AI rời rạc.
 * ============================================================ */

type OverlayBaseProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerMeta?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
};

function OverlayHeader({
  title,
  subtitle,
  headerMeta,
  onClose,
  closeLabel
}: Pick<OverlayBaseProps, "title" | "subtitle" | "headerMeta" | "onClose" | "closeLabel">) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">
      <div className="min-w-0">
        {subtitle ? <p className="d-eyebrow">{subtitle}</p> : null}
        <h2 className={cn("text-[length:var(--d-fs-h2)] font-semibold text-[var(--d-text)]", subtitle && "mt-1")}>{title}</h2>
        {headerMeta ? <div className="mt-2 flex flex-wrap gap-2">{headerMeta}</div> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel ?? "Đóng"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)] transition hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

const drawerWidth = {
  sm: "max-w-[420px]",
  md: "max-w-[540px]",
  lg: "max-w-[680px]"
} as const;

/* Drawer — panel trượt từ phải. Dùng cho chi tiết đơn, sửa món, chi tiết bàn. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerMeta,
  footer,
  children,
  closeLabel,
  width = "md",
  contentClassName
}: OverlayBaseProps & { width?: keyof typeof drawerWidth }) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const portalTarget = useDashboardOverlay(open);
  useDialogFocusTrap({ containerRef: panelRef, onClose, open });

  if (!open || !portalTarget) return null;

  return createPortal(
    <div data-dash="v2" className={`${fontVars} fixed inset-0 isolate z-[var(--d-z-drawer)] overflow-hidden overscroll-contain`}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-[var(--d-jade-900)]/30 backdrop-blur-[2px]"
        style={{ animation: "d-overlay-in var(--d-dur) var(--d-ease)" }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 z-10 flex h-dvh w-full flex-col border-l border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-lg)]",
          drawerWidth[width]
        )}
        style={{ animation: "d-drawer-in var(--d-dur) var(--d-ease)" }}
      >
        <OverlayHeader title={title} subtitle={subtitle} headerMeta={headerMeta} onClose={onClose} closeLabel={closeLabel} />
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--d-s-5)] py-[var(--d-s-4)]", contentClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)] pb-[calc(var(--d-s-4)+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>,
    portalTarget
  );
}

/* Sheet — panel trượt từ dưới (mobile-first). Dùng cho menu mobile,
 * quick actions, bộ lọc trên di động. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  headerMeta,
  footer,
  children,
  closeLabel,
  contentClassName
}: OverlayBaseProps) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const portalTarget = useDashboardOverlay(open);
  useDialogFocusTrap({ containerRef: panelRef, onClose, open });

  if (!open || !portalTarget) return null;

  return createPortal(
    <div data-dash="v2" className={`${fontVars} fixed inset-0 isolate z-[var(--d-z-drawer)] overflow-hidden overscroll-contain`}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-[var(--d-jade-900)]/30 backdrop-blur-[2px]"
        style={{ animation: "d-overlay-in var(--d-dur) var(--d-ease)" }}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-10 flex max-h-[90dvh] flex-col rounded-t-[var(--d-r-xl)] border-t border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-lg)]"
        style={{ animation: "d-sheet-in var(--d-dur) var(--d-ease)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--d-line-strong)]" aria-hidden="true" />
        <OverlayHeader title={title} subtitle={subtitle} headerMeta={headerMeta} onClose={onClose} closeLabel={closeLabel} />
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--d-s-5)] py-[var(--d-s-4)] pb-[calc(var(--d-s-6)+env(safe-area-inset-bottom))]", contentClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)] pb-[calc(var(--d-s-4)+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </section>
    </div>,
    portalTarget
  );
}

/* Modal — hộp giữa màn hình. Dùng cho form ngắn, confirm phức tạp. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerMeta,
  footer,
  children,
  closeLabel,
  contentClassName,
  size = "md"
}: OverlayBaseProps & { size?: "sm" | "md" | "lg" }) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const portalTarget = useDashboardOverlay(open);
  useDialogFocusTrap({ containerRef: panelRef, onClose, open });

  if (!open || !portalTarget) return null;

  const maxW = size === "sm" ? "max-w-[420px]" : size === "lg" ? "max-w-[720px]" : "max-w-[560px]";

  return createPortal(
    <div data-dash="v2" className={`${fontVars} fixed inset-0 isolate z-[var(--d-z-modal)] grid place-items-center overflow-y-auto overscroll-contain px-4 py-6`}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-0 bg-[var(--d-jade-900)]/35 backdrop-blur-[2px]"
        style={{ animation: "d-overlay-in var(--d-dur) var(--d-ease)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn("relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-[var(--d-r-xl)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-lg)]", maxW)}
        style={{ animation: "d-modal-in var(--d-dur) var(--d-ease)" }}
      >
        <OverlayHeader title={title} subtitle={subtitle} headerMeta={headerMeta} onClose={onClose} closeLabel={closeLabel} />
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--d-s-5)] py-[var(--d-s-4)]", contentClassName)}>
          {children}
        </div>
        {footer ? <div className="shrink-0 border-t border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]">{footer}</div> : null}
      </div>
    </div>,
    portalTarget
  );
}
