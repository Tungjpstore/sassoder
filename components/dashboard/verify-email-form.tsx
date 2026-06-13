"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { resendEmailOtpAction, verifyEmailOtpAction } from "@/app/dashboard/actions";
import {
  AuthAlert,
  AuthCard,
  AuthField,
  AuthHeader,
  AuthScaffold,
  AuthSecondaryButton,
  AuthSubmit
} from "@/components/dashboard/auth-v2/auth-scaffold";
import { buildDashboardLoginPath } from "@/lib/auth-onboarding-intent";
import { buildOtpCooldownStorageKey, normalizeOtpDigits, otpCooldownExpiresAt, remainingOtpCooldownSeconds } from "@/lib/auth-otp-flow";

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
      const cleanedDigits = normalizeOtpDigits(digits, 6 - index);
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
      const cleaned = normalizeOtpDigits(digit);
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
      const pasted = normalizeOtpDigits(event.clipboardData.getData("text"));
      applyDigits(0, pasted);
    },
    [applyDigits]
  );

  return (
    <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          aria-label={`Số OTP thứ ${i + 1}`}
          disabled={disabled}
          className="h-12 w-11 rounded-[var(--d-r-md)] border border-[var(--d-line-strong)] bg-[var(--d-surface)] text-center text-xl font-bold text-[var(--d-text)] outline-none transition focus:border-[var(--d-jade)] focus:ring-2 focus:ring-[var(--d-jade)]/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-12"
          autoComplete={i === 0 ? "one-time-code" : "off"}
        />
      ))}
    </div>
  );
}

export function VerifyEmailForm({ email, nextPath = "" }: { email: string; nextPath?: string }) {
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
  const loginHref = buildDashboardLoginPath({ email: effectiveEmail, next: nextPath });
  const cooldownStorageKey = buildOtpCooldownStorageKey({ email: effectiveEmail, purpose: "signup" });

  const handleResendSubmit = useCallback(() => {
    setOtp("");
    lastSubmittedOtpRef.current = "";
    setCooldown(resendCooldownSeconds);
    if (cooldownStorageKey) {
      window.sessionStorage.setItem(cooldownStorageKey, String(otpCooldownExpiresAt()));
    }
  }, [cooldownStorageKey]);

  useEffect(() => {
    if (canVerify && !verifyPending && lastSubmittedOtpRef.current !== `${effectiveEmail}:${otp}` && formRef.current) {
      lastSubmittedOtpRef.current = `${effectiveEmail}:${otp}`;
      formRef.current.requestSubmit();
    }
  }, [canVerify, effectiveEmail, otp, verifyPending]);

  useEffect(() => {
    if (!cooldownStorageKey) return;
    const timeout = window.setTimeout(() => {
      setCooldown((current) => Math.max(current, remainingOtpCooldownSeconds(window.sessionStorage.getItem(cooldownStorageKey))));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [cooldownStorageKey]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [cooldown]);

  useEffect(() => {
    if (resendState?.success && cooldownStorageKey) {
      window.sessionStorage.setItem(cooldownStorageKey, String(otpCooldownExpiresAt()));
    }
  }, [cooldownStorageKey, resendState?.success]);

  return (
    <AuthScaffold>
      <AuthHeader
        title="Xác thực email"
        subtitle="Nhập mã 6 số vừa gửi qua email. Mã chỉ dùng một lần và sẽ hết hạn sau ít phút."
        meta={effectiveEmail ? <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">{effectiveEmail}</span> : null}
      />

      <AuthCard>
        <form ref={formRef} action={verifyAction} className="grid gap-4">
          {!normalizedEmail ? (
            <AuthField
              label="Email đăng ký"
              name="visibleEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="admin@example.com"
              value={manualEmail}
              onChange={(event) => setManualEmail(event.target.value)}
            />
          ) : null}
          <input type="hidden" name="email" value={effectiveEmail} />
          <input type="hidden" name="token" value={otp} />
          <input type="hidden" name="next" value={nextPath} />

          <OtpInput value={otp} disabled={verifyPending} onChange={setOtp} />

          {verifyState?.error ? (
            <AuthAlert tone="warn" className="text-center">
              {verifyState.error}
            </AuthAlert>
          ) : null}
          {verifyPending ? (
            <p className="text-center text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
              Đang kiểm tra mã và chuẩn bị chuyển sang bước thiết lập quán...
            </p>
          ) : null}

          <AuthSubmit disabled={verifyPending || !canVerify}>{verifyPending ? "Đang xác thực..." : "Xác nhận mã"}</AuthSubmit>
        </form>

        <form action={resendAction} onSubmit={handleResendSubmit} className="mt-4">
          <input type="hidden" name="email" value={effectiveEmail} />
          <input type="hidden" name="next" value={nextPath} />
          <AuthSecondaryButton type="submit" disabled={!canResend}>
            {resendPending ? "Đang gửi..." : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
          </AuthSecondaryButton>
          {resendState?.success ? <p className="mt-3 text-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-ok-fg)]">{resendState.success}</p> : null}
          {resendState?.error ? <p className="mt-3 text-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-warn-fg)]">{resendState.error}</p> : null}
        </form>

        <Link
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center text-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:text-[var(--d-jade-700)]"
          href={loginHref}
        >
          Quay lại đăng nhập
        </Link>
      </AuthCard>
    </AuthScaffold>
  );
}
