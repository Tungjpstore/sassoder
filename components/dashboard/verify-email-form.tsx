"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { resendEmailOtpAction, verifyEmailOtpAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

const resendCooldownSeconds = 60;

function OtpInput({
  value,
  disabled = false,
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const applyDigits = useCallback(
    (index: number, digits: string) => {
      const cleanedDigits = digits.replace(/\D/g, "").slice(0, 6 - index);
      const chars = value.padEnd(6, " ").split("");
      cleanedDigits.split("").forEach((digit, offset) => {
        chars[index + offset] = digit;
      });

      const next = chars.join("").slice(0, 6).trimEnd();
      onChange(next);
      inputsRef.current[Math.min(index + cleanedDigits.length, 5)]?.focus();
    },
    [value, onChange]
  );

  const handleChange = useCallback(
    (index: number, digit: string) => {
      const cleaned = digit.replace(/\D/g, "");
      if (cleaned.length > 1) {
        applyDigits(index, cleaned);
        return;
      }

      const chars = value.padEnd(6, " ").split("");
      chars[index] = cleaned;
      const next = chars.join("").slice(0, 6).trimEnd();
      onChange(next);
      if (cleaned && index < 5) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [applyDigits, value, onChange]
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !value[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (event.key === "ArrowLeft" && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      if (event.key === "ArrowRight" && index < 5) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [value]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      applyDigits(0, pasted);
    },
    [applyDigits]
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
          aria-label={`Số OTP thứ ${i + 1}`}
          disabled={disabled}
          className="h-12 w-10 rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] text-center text-xl font-black text-[var(--foreground)] outline-none transition focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-12 sm:text-2xl"
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
  const [manualEmail, setManualEmail] = useState("");
  const [cooldown, setCooldown] = useState(email ? resendCooldownSeconds : 0);
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmittedOtpRef = useRef("");
  const normalizedEmail = email.trim().toLowerCase();
  const effectiveEmail = normalizedEmail || manualEmail.trim().toLowerCase();
  const canVerify = Boolean(effectiveEmail) && /^\d{6}$/.test(otp);
  const canResend = Boolean(effectiveEmail) && cooldown === 0 && !resendPending;

  const handleResendSubmit = useCallback(() => {
    setOtp("");
    lastSubmittedOtpRef.current = "";
    setCooldown(resendCooldownSeconds);
  }, []);

  useEffect(() => {
    if (canVerify && !verifyPending && lastSubmittedOtpRef.current !== `${effectiveEmail}:${otp}` && formRef.current) {
      lastSubmittedOtpRef.current = `${effectiveEmail}:${otp}`;
      formRef.current.requestSubmit();
    }
  }, [canVerify, effectiveEmail, otp, verifyPending]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [cooldown]);

  return (
    <main className="stitch-onboarding min-h-screen bg-[#fbf7ef] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,77,58,0.08),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(242,140,40,0.09),transparent_22%),linear-gradient(180deg,#fffcf6,#f7efe4)]" />

        <header className="relative z-10 flex min-h-14 items-center justify-center border-b border-[#123b2b]/10 bg-[#fffdf8]/76 px-5 py-3 backdrop-blur">
          <LogiVNLogo href="/" className="h-8" priority />
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col items-center justify-center gap-5 px-5 py-8">
          <div className="w-full rounded-[24px] border border-[#123b2b]/10 bg-[#fffdf8]/95 p-5 shadow-[0_20px_60px_rgba(15,77,58,0.07)] sm:p-6">
            {/* Icon + heading */}
            <div className="mb-5 border-b border-[#123b2b]/10 pb-5 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f4d3a]">
                <MailCheck className="h-6 w-6 text-white" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">Xác thực email</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Kiểm tra email của bạn</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                LogiVN đã gửi mã OTP 6 số đến <strong className="text-[var(--foreground)]">{effectiveEmail || "email của bạn"}</strong>.
                Nhập mã bên dưới hoặc bấm nút xác thực trong email. Nếu chưa thấy, hãy kiểm tra Spam/Promotions rồi gửi lại mã.
              </p>
            </div>

            {/* OTP form */}
            <form ref={formRef} action={verifyAction} className="grid gap-5">
              {!normalizedEmail ? (
                <label className="grid gap-2 text-sm font-semibold">
                  Email đăng ký
                  <input
                    value={manualEmail}
                    onChange={(event) => setManualEmail(event.target.value)}
                    name="visibleEmail"
                    type="email"
                    inputMode="email"
                    className="h-11 rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] px-4 text-sm font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />
                </label>
              ) : null}
              <input type="hidden" name="email" value={effectiveEmail} />
              <input type="hidden" name="token" value={otp} />

              <OtpInput value={otp} disabled={verifyPending} onChange={setOtp} />

              {verifyState?.error && (
                <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-center text-sm text-[var(--accent-strong)]">
                  {verifyState.error}
                </p>
              )}

              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] px-5 text-sm font-black uppercase tracking-[0.1em] text-[#FFF7EB] shadow-[0_12px_28px_rgba(15,77,58,0.16)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                disabled={verifyPending || !canVerify}
              >
                {verifyPending ? "Đang xác thực..." : "Xác nhận mã"}
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>

            {/* Resend */}
            <form action={resendAction} onSubmit={handleResendSubmit} className="mt-4">
              <input type="hidden" name="email" value={effectiveEmail} />
              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#123b2b]/10 bg-white/55 px-4 text-sm font-bold text-[#0f4d3a] transition hover:border-[#0f4d3a]/35 disabled:opacity-50"
                disabled={!canResend}
              >
                <RefreshCw className={resendPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã OTP"}
              </button>
              {resendState?.success && <p className="mt-3 text-center text-sm font-semibold text-[var(--primary)]">{resendState.success}</p>}
              {resendState?.error && <p className="mt-3 text-center text-sm text-[var(--accent-strong)]">{resendState.error}</p>}
            </form>

            {/* Security note */}
            <div className="mt-5 flex items-start gap-3 border-t border-[#123b2b]/10 pt-4 text-sm leading-6 text-[var(--text-secondary)]">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
              <span>Email phải được xác thực trước khi LogiVN mở onboarding tạo quán và cấp quyền quản trị dashboard.</span>
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
