"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { resendEmailOtpAction, verifyEmailOtpAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

export function VerifyEmailForm({ email }: { email: string }) {
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEmailOtpAction, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendEmailOtpAction, undefined);

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
        <div className="pointer-events-none absolute -left-36 top-10 h-96 w-96 rounded-full bg-[var(--secondary)]/70 blur-[100px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[var(--accent)]/20 blur-[110px]" />

        <section className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_24px_70px_rgba(43,43,43,0.14)] backdrop-blur-2xl">
          <div className="mb-6 flex justify-center">
            <LogiVNLogo href="/" className="h-10" priority />
          </div>
          <div className="mb-7">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[#FFF7EB] shadow-[0_14px_30px_rgba(15,77,58,0.24)]">
              <MailCheck className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Xác thực email</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">Nhập mã OTP</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              LogiVN đã gửi mã gồm 6 chữ số đến <strong className="text-[var(--foreground)]">{email || "email của bạn"}</strong>.
              Sau khi xác thực, hệ thống sẽ tự tạo quán và mở dashboard.
            </p>
          </div>

          <form action={verifyAction} className="grid gap-4">
            <input type="hidden" name="email" value={email} />
            <label className="grid gap-2 text-sm font-semibold">
              Mã OTP
              <input
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="h-14 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-center text-2xl font-black tracking-[0.35em] text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="123456"
                required
              />
            </label>

            {verifyState?.error && (
              <p className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">
                {verifyState.error}
              </p>
            )}

            <button
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black uppercase tracking-[0.12em] text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.32)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-50"
              disabled={verifyPending}
            >
              {verifyPending ? "Đang xác thực..." : "Xác thực & tạo quán"}
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>

          <form action={resendAction} className="mt-4">
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--primary-strong)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50"
              disabled={resendPending || !email}
            >
              <RefreshCw className={resendPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Gửi lại mã
            </button>
            {resendState?.success && <p className="mt-3 text-center text-sm font-semibold text-[var(--primary)]">{resendState.success}</p>}
            {resendState?.error && <p className="mt-3 text-center text-sm text-[var(--accent-strong)]">{resendState.error}</p>}
          </form>

          <div className="mt-6 rounded-xl bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
            <div className="mb-2 flex items-center gap-2 font-bold text-[var(--primary-strong)]">
              <ShieldCheck className="h-4 w-4" />
              Bảo mật đăng ký
            </div>
            Mã OTP giúp xác nhận chủ quán sở hữu email trước khi tạo dữ liệu nhà hàng và quyền quản trị.
          </div>

          <Link className="mt-5 block text-center text-sm font-semibold text-[var(--muted-foreground)] hover:text-[var(--primary)]" href="/dashboard/login">
            Quay lại đăng nhập
          </Link>
        </section>
      </div>
    </main>
  );
}
