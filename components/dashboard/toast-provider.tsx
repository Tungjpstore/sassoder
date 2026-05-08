"use client";

import { createContext, useCallback, useContext, useState } from "react";
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
    "border-[rgba(52,211,153,0.25)] bg-[rgba(52,211,153,0.1)] text-[var(--primary)] backdrop-blur-xl",
  error: "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[#FB7185] backdrop-blur-xl",
  info: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] backdrop-blur-xl",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
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
      <div className="fixed bottom-4 right-4 z-[200] grid gap-2 max-lg:left-4 lg:w-[380px]">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className={`toast-enter flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${toneClasses[t.type]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="shrink-0 opacity-60 hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
