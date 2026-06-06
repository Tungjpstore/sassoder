"use client";

import { RefreshCw } from "lucide-react";

export function OfflineReloadButton() {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]"
      type="button"
      onClick={() => window.location.reload()}
    >
      <RefreshCw size={16} aria-hidden="true" />
      Tải lại
    </button>
  );
}
