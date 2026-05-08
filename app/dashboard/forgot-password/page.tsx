import Link from "next/link";
import { ForgotPasswordForm } from "@/components/dashboard/forgot-password-form";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--primary)]/8 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/6 blur-[120px]" />

        <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3 backdrop-blur-xl sm:px-8">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link
            href="/dashboard/register"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-4 text-sm font-bold text-[var(--primary-strong)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-[var(--glow-primary)]"
          >
            Tạo quán mới
          </Link>
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-6 px-5 py-10">
          {params.expired ? (
            <p className="w-full rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-center text-sm text-[var(--accent-strong)]">
              Liên kết đặt lại mật khẩu đã hết hạn hoặc chưa hợp lệ. Vui lòng yêu cầu liên kết mới.
            </p>
          ) : null}
          <ForgotPasswordForm />
        </section>
      </div>
    </main>
  );
}
