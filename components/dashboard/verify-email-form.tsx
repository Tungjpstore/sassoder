"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { resendEmailOtpAction, verifyEmailOtpAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      const cleaned = digit.replace(/\D/g, "").slice(-1);
      const chars = value.split("");
      chars[index] = cleaned;
      const next = chars.join("").slice(0, 6);
      onChange(next.padEnd(6, " ").trimEnd());
      if (cleaned && index < 5) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !value[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    },
    [value]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, 5);
      inputsRef.current[focusIdx]?.focus();
    },
    [onChange]
  );

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="h-14 w-11 rounded-xl border border-[var(--border)] bg-[var(--background)] text-center text-2xl font-black text-[var(--foreground)] outline-none transition-all duration-200 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] sm:h-16 sm:w-14 sm:text-3xl"
          autoComplete={i === 0 ? "one-time-code" : "off"}
        />
      ))}
    </div>
  );
}

export function VerifyEmailForm({ email }: { email: string }) {
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyEmailOtpAction, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendEmailOtpAction, undefined);
  const [otp, setOtp] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && /^\d{6}$/.test(otp) && formRef.current) {
      formRef.current.requestSubmit();
    }
  }, [otp]);

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--primary)]/8 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/6 blur-[120px]" />

        <header className="relative z-10 flex min-h-16 items-center justify-center border-b border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3 backdrop-blur-xl">
          <LogiVNLogo href="/" className="h-9" priority />
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-6 px-5 py-10">
          <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-[var(--shadow-lift)] ring-1 ring-[var(--primary)]/5 backdrop-blur-2xl sm:p-8">
            {/* Icon + heading */}
            <div className="mb-7 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] shadow-[var(--glow-primary)]">
                <MailCheck className="h-7 w-7 text-white" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">Xác thực email</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Nhập mã OTP</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                LogiVN đã gửi mã gồm 6 chữ số đến <strong className="text-[var(--foreground)]">{email || "email của bạn"}</strong>.
                Sau khi xác thực, hệ thống sẽ tự tạo quán và mở dashboard.
              </p>
            </div>

            {/* OTP form */}
            <form ref={formRef} action={verifyAction} className="grid gap-5">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="token" value={otp} />

              <OtpInput value={otp} onChange={setOtp} />

              {verifyState?.error && (
                <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-center text-sm text-[var(--accent-strong)]">
                  {verifyState.error}
                </p>
              )}

              <button
                className="login-cta-glow flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-base font-black uppercase tracking-[0.1em] text-white shadow-[var(--glow-primary)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(52,211,153,0.25)] disabled:pointer-events-none disabled:opacity-50"
                disabled={verifyPending}
              >
                {verifyPending ? "Đang xác thực..." : "Xác thực & tạo quán"}
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>

            {/* Resend */}
            <form action={resendAction} className="mt-4">
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 text-sm font-bold text-[var(--primary-strong)] transition-all hover:-translate-y-0.5 hover:border-[var(--primary)]/30 disabled:opacity-50"
                disabled={resendPending || !email}
              >
                <RefreshCw className={resendPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Gửi lại mã
              </button>
              {resendState?.success && <p className="mt-3 text-center text-sm font-semibold text-[var(--primary)]">{resendState.success}</p>}
              {resendState?.error && <p className="mt-3 text-center text-sm text-[var(--accent-strong)]">{resendState.error}</p>}
            </form>

            {/* Security note */}
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-[var(--primary)]/10 bg-[var(--primary-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
              <span>Mã OTP giúp xác nhận chủ quán sở hữu email trước khi tạo dữ liệu nhà hàng và quyền quản trị.</span>
            </div>

            <Link className="mt-5 block text-center text-sm font-semibold text-[var(--muted-foreground)] transition hover:text-[var(--primary)]" href="/dashboard/login">
              Quay lại đăng nhập
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
