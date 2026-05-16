"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminTablesError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="stitch-admin admin-shell-bg dashboard-density min-h-screen px-3 py-4 text-[var(--foreground)] md:px-6 lg:pl-80">
      <section className="mx-auto grid min-h-[72vh] w-full max-w-[900px] place-items-center">
        <div className="dashboard-panel w-full p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <AlertTriangle size={22} />
          </span>
          <h1 className="mt-3 text-2xl font-black text-[var(--foreground)]">Không tải được Bàn & QR</h1>
          <p className="mx-auto mt-1 max-w-xl text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
            Sơ đồ bàn hoặc trạng thái QR đang bị gián đoạn. Tải lại trước khi in QR, xoay token hoặc chỉnh bàn đang phục vụ.
          </p>
          {error.digest ? <p className="mt-2 text-[11px] font-bold text-[var(--muted-foreground)]">Mã lỗi: {error.digest}</p> : null}
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <button type="button" onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-4 text-sm font-black text-[var(--background)]">
              <RefreshCw size={15} />
              Tải lại
            </button>
            <Link href="/dashboard/orders" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary-strong)]">
              Mở đơn hàng
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
