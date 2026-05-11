"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
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
    "border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)] backdrop-blur-xl",
  error: "border-[var(--tertiary)]/12 bg-[var(--danger-soft)] text-[var(--tertiary)] backdrop-blur-xl",
  info: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] backdrop-blur-xl",
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++nextId}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast("success", msg),
    error: (msg) => addToast("error", msg),
    info: (msg) => addToast("info", msg),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[200] grid gap-2 max-lg:left-4 lg:w-[380px]">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          const isError = t.type === "error";
          return (
            <div
              key={t.id}
              role={isError ? "alert" : "status"}
              aria-live={isError ? "assertive" : "polite"}
              aria-atomic="true"
              className={`toast-enter flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${toneClasses[t.type]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
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
