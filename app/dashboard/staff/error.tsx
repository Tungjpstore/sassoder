"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminStaffError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density dashboard-route-fallback">
      <section className="mx-auto grid min-h-[72vh] w-full max-w-[920px] place-items-center">
        <div className="staff-screen-card w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-[var(--shadow-soft)]">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <AlertTriangle size={22} />
          </span>
          <h1 className="mt-3 text-2xl font-black text-[var(--foreground)]">Không tải được màn Nhân viên</h1>
          <p className="mx-auto mt-1 max-w-xl text-sm font-semibold text-[var(--muted-foreground)]">
            Dữ liệu nhân sự, ca làm hoặc chấm công đang bị gián đoạn. Thử tải lại trước khi thao tác ca trực.
          </p>
          {error.digest ? <p className="mt-2 text-[11px] font-bold text-[var(--muted-foreground)]">Mã lỗi: {error.digest}</p> : null}
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-4 text-sm font-black text-[var(--background)]">
              <RefreshCw size={15} />
              Tải lại
            </button>
            <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary-strong)]">
              Về tổng quan
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
