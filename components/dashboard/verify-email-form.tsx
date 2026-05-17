"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { resendEmailOtpAction, verifyEmailOtpAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

const resendCooldownSeconds = 60;

export function OtpInput({
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
    <div className="flex justify-center gap-1 sm:gap-2" onPaste={handlePaste}>
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
          className="h-12 w-11 rounded-md border border-[#d8dee9] bg-[#f8fafc] text-center text-xl font-black text-[#111827] outline-none transition focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-12"
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
    <main className="min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
      <section className="auth-fade-in mx-auto flex min-h-svh w-full max-w-[400px] flex-col justify-center px-4 py-6 sm:px-5">
        <div className="w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5">
          <div className="mb-4 flex flex-col items-center text-center">
            <LogiVNLogo href="/" className="h-10" priority />
            <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">Xác thực email</h1>
            {effectiveEmail ? <p className="mt-2 text-xs font-bold text-[#667085]">{effectiveEmail}</p> : null}
          </div>

            <form ref={formRef} action={verifyAction} className="grid gap-4">
              {!normalizedEmail ? (
                <label className="grid gap-2 text-sm font-semibold text-[#344054]">
                  Email đăng ký
                  <input
                    value={manualEmail}
                    onChange={(event) => setManualEmail(event.target.value)}
                    name="visibleEmail"
                    type="email"
                    inputMode="email"
                    className="h-12 rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />
                </label>
              ) : null}
              <input type="hidden" name="email" value={effectiveEmail} />
              <input type="hidden" name="token" value={otp} />

              <OtpInput value={otp} disabled={verifyPending} onChange={setOtp} />

              {verifyState?.error && (
                <p className="rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-center text-sm font-semibold text-[#9a4a17]">
                  {verifyState.error}
                </p>
              )}

              <button
                className="flex h-12 w-full items-center justify-center rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50"
                disabled={verifyPending || !canVerify}
              >
                {verifyPending ? "Đang xác thực..." : "Xác nhận mã"}
              </button>
            </form>

            <form action={resendAction} onSubmit={handleResendSubmit} className="mt-4">
              <input type="hidden" name="email" value={effectiveEmail} />
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-md border border-[#d8dee9] bg-white px-4 text-sm font-bold text-[#0F4D3A] transition hover:border-[#0F4D3A]/35 disabled:opacity-50"
                disabled={!canResend}
              >
                {resendPending ? "Đang gửi..." : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
              </button>
              {resendState?.success && <p className="mt-3 text-center text-sm font-semibold text-[#0F4D3A]">{resendState.success}</p>}
              {resendState?.error && <p className="mt-3 text-center text-sm font-semibold text-[#9a4a17]">{resendState.error}</p>}
            </form>

            <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center text-center text-sm font-semibold text-[#0F4D3A] transition hover:text-[#0b3d2e]" href="/dashboard/login">
              Quay lại đăng nhập
            </Link>
        </div>
      </section>
    </main>
  );
}
