import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { OfflineReloadButton } from "@/components/pwa/offline-reload-button";

export const metadata: Metadata = {
  title: "Ngoại tuyến - LogiVN",
  robots: {
    index: false,
    follow: false
  }
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <LogiVNLogo className="h-9" priority />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <WifiOff size={24} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-normal">Bạn đang ngoại tuyến</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Dữ liệu có thể không phải mới nhất. Vui lòng kiểm tra kết nối rồi tải lại trang.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[#FFF7EB]" href="/">
              Về trang chủ
            </Link>
            <OfflineReloadButton />
          </div>
        </div>
      </section>
    </main>
  );
}
