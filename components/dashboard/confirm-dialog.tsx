"use client";

import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { useDialogFocusTrap } from "@/components/dashboard/dialog-focus";
import { useDashboardOverlay } from "@/components/dashboard/use-dashboard-overlay";
import { Button } from "@/components/ui/button";

type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmationText?: string;
  tone?: "danger" | "warning";
};

type PendingConfirmation = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

export function ConfirmDialog({
  cancelLabel = "Huỷ",
  confirmLabel = "Xác nhận",
  confirmationText,
  description,
  onCancel,
  onConfirm,
  open,
  title,
  tone = "danger"
}: ConfirmDialogOptions & {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [inputValue, setInputValue] = useState("");
  const portalTarget = useDashboardOverlay(open);
  const canConfirm = !confirmationText || inputValue === confirmationText;

  useDialogFocusTrap({ containerRef: panelRef, onClose: onCancel, open });

  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="dashboard-modal-root fixed inset-0 isolate z-[var(--z-dashboard-confirm)] grid place-items-center overflow-y-auto overscroll-contain px-4 py-6">
      <button type="button" aria-hidden="true" tabIndex={-1} onClick={onCancel} className="drawer-backdrop absolute inset-0 z-0" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-[1] w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_70px_rgba(15,23,18,0.24)] focus:outline-none"
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone === "danger" ? "bg-[var(--danger-soft)] text-[var(--accent-strong)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}>
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-black text-[var(--foreground)]">
              {title}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
          </div>
        </div>

        {confirmationText ? (
          <label className="mt-4 grid gap-2 text-sm font-semibold text-[var(--foreground)]">
            Gõ <span className="font-mono text-[var(--accent-strong)]">{confirmationText}</span> để xác nhận
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 font-mono text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={onCancel} className="shadow-none hover:shadow-none">
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={!canConfirm} className="shadow-none hover:shadow-none">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (confirmed: boolean) => {
      request?.resolve(confirmed);
      setRequest(null);
    },
    [request]
  );

  return {
    confirm,
    confirmDialog: request ? (
      <ConfirmDialog
        open
        title={request.title}
        description={request.description}
        confirmLabel={request.confirmLabel}
        cancelLabel={request.cancelLabel}
        confirmationText={request.confirmationText}
        tone={request.tone}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />
    ) : null
  };
}
