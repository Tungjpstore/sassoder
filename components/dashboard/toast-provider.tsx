"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

export type ToastInput =
  | string
  | {
      title: string;
      message?: string;
      durationMs?: number;
      actionLabel?: string;
      onAction?: () => void;
    };

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  toast: (type: ToastType, input: ToastInput) => void;
  success: (input: ToastInput) => void;
  error: (input: ToastInput) => void;
  info: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const toneClasses = {
  success:
    "border-[var(--primary)]/20 bg-[var(--surface)] text-[var(--foreground)] shadow-[0_18px_48px_rgba(15,77,58,0.16)] backdrop-blur-xl",
  error: "border-[var(--tertiary)]/18 bg-[var(--surface)] text-[var(--foreground)] shadow-[0_18px_48px_rgba(180,46,46,0.16)] backdrop-blur-xl",
  info: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl",
};

const iconToneClasses = {
  success: "bg-[var(--primary-soft)] text-[var(--primary)]",
  error: "bg-[var(--danger-soft)] text-[var(--tertiary)]",
  info: "bg-[var(--soft-surface)] text-[var(--foreground)]",
};

let nextId = 0;

function normalizeToastInput(type: ToastType, input: ToastInput) {
  const fallbackDuration = type === "error" ? 5600 : 3600;
  if (typeof input === "string") {
    return { title: input, durationMs: fallbackDuration };
  }

  return {
    ...input,
    durationMs: input.durationMs ?? fallbackDuration,
  };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, input: ToastInput) => {
    const normalized = normalizeToastInput(type, input);
    const id = `toast-${++nextId}`;
    setToasts((prev) => [
      ...prev.slice(-3),
      {
        id,
        type,
        title: normalized.title,
        message: normalized.message,
        actionLabel: normalized.actionLabel,
        onAction: normalized.onAction,
      },
    ]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, normalized.durationMs);
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (input) => addToast("success", input),
    error: (input) => addToast("error", input),
    info: (input) => addToast("info", input),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 z-[var(--z-dashboard-toast)] grid gap-2 max-lg:left-3 lg:bottom-[calc(1rem+env(safe-area-inset-bottom))] lg:right-4 lg:w-[384px]">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          const isError = t.type === "error";
          return (
            <div
              key={t.id}
              role={isError ? "alert" : "status"}
              aria-live={isError ? "assertive" : "polite"}
              aria-atomic="true"
              className={`toast-enter flex items-start gap-3 rounded-[14px] border px-3 py-3 text-sm ${toneClasses[t.type]}`}
            >
              <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconToneClasses[t.type]}`}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 self-center">
                <span className="block text-[13px] font-bold leading-5 text-[var(--foreground)]">{t.title}</span>
                {t.message ? (
                  <span className="mt-0.5 block text-[12px] font-semibold leading-4 text-[var(--muted-foreground)]">{t.message}</span>
                ) : null}
                {t.actionLabel && t.onAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      t.onAction?.();
                      removeToast(t.id);
                    }}
                    className="mt-2 inline-flex min-h-8 items-center rounded-md bg-[var(--foreground)] px-3 text-[12px] font-bold text-[var(--background)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                  >
                    {t.actionLabel}
                  </button>
                ) : null}
              </span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => removeToast(t.id)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] opacity-70 transition hover:bg-[var(--soft-surface)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
