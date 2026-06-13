"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    document.body.classList.add("shop-scroll-lock");
    return () => document.body.classList.remove("shop-scroll-lock");
  }, [active]);
}

/* BottomSheet — sheet trượt từ dưới, mobile-first.
 * Có overlay, focus trap, ESC để đóng, khôi phục focus, scroll lock. */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "auto"
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "auto" | "tall" | "full";
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descId = React.useId();

  useScrollLock(open);

  React.useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusTarget = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    focusTarget?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastFocused.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (typeof document === "undefined" || !open) return null;

  const heightClass =
    size === "full" ? "h-[calc(100dvh-var(--safe-top))]" : size === "tall" ? "max-h-[92dvh]" : "max-h-[88dvh]";

  return createPortal(
    <div
      data-shop="v2"
      className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center"
      style={{ animation: "shop-overlay-in var(--dur) var(--ease)" }}
    >
      <button
        type="button"
        aria-label="Đóng"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,30,24,0.45)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full max-w-[var(--shop-max)] flex-col rounded-t-[var(--r-2xl)] bg-[var(--surface)] shadow-[var(--sh-sheet)] outline-none",
          heightClass
        )}
        style={{ animation: "shop-sheet-in var(--dur) var(--ease)" }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--line)] px-5 pb-3 pt-4">
          <div aria-hidden className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-[var(--surface-3)]" />
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 id={titleId} className="truncate text-[length:var(--fs-h2)] font-bold text-[var(--text)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descId} className="mt-0.5 text-[length:var(--fs-sm)] text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] transition hover:text-[var(--text)] active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer ? (
          <div
            className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-5 pt-3"
            style={{ paddingBottom: "calc(var(--s-3) + var(--safe-bottom))" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
