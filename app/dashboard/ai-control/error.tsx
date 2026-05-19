"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AiControlError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid min-h-[72vh] w-full max-w-[920px] place-items-center">
        <div className="dashboard-panel w-full p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <AlertTriangle size={22} />
          </span>
          <h1 className="dashboard-page-title mt-3">Không tải được cấu hình AI</h1>
          <p className="mx-auto mt-1 max-w-xl text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
            Provider, memory hoặc workflow AI đang bị gián đoạn. Tải lại trước khi duyệt gợi ý hoặc chỉnh bộ nhớ AI.
          </p>
          {error.digest ? <p className="mt-2 text-xs font-semibold text-[var(--muted-foreground)]">Mã lỗi: {error.digest}</p> : null}
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-4 text-sm font-semibold text-[var(--background)]"
            >
              <RefreshCw size={15} />
              Tải lại
            </button>
            <Link
              href="/dashboard/ai-ops"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary-strong)]"
            >
              Trợ lý vận hành
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
