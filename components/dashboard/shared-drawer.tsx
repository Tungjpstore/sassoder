"use client";

import { useCallback, useEffect } from "react";
import { X } from "lucide-react";

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
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        className="drawer-backdrop absolute inset-0"
        onClick={onClose}
        aria-label="Đóng"
      />
      <aside
        className={`drawer-panel absolute right-0 top-0 flex h-full w-full flex-col border-l border-[var(--border)] bg-white ${widthMap[width]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            {subtitle && (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                {subtitle}
              </p>
            )}
            <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted-foreground)] transition hover:bg-[var(--soft-surface)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="border-t border-[var(--border)] px-5 py-4">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}
