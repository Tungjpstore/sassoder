"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";

type DashboardDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
};

const widthMap = {
  sm: "max-w-[420px]",
  md: "max-w-[520px]",
  lg: "max-w-[640px]",
};

export function DashboardDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
  footer,
}: DashboardDrawerProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  useDialogFocusTrap({ containerRef: panelRef, onClose, open });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden overscroll-contain">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="drawer-backdrop absolute inset-0 z-0"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`drawer-panel absolute inset-y-0 right-0 z-[1] flex h-dvh max-h-dvh w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] ${widthMap[width]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            {subtitle && (
                <p id={subtitleId} className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {subtitle}
                </p>
            )}
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-[var(--foreground)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-container-high)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                aria-label="Đóng drawer"
              >
                <X size={18} aria-hidden="true" />
              </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && (
          <div className="border-t border-[var(--border)] px-5 py-4">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}
