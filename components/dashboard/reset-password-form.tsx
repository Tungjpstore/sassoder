"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { resendPasswordResetOtpAction, updateRecoveredPasswordAction } from "@/app/dashboard/actions";
import { OtpInput } from "@/components/dashboard/verify-email-form";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";
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
import { buildOtpCooldownStorageKey, otpCooldownExpiresAt, remainingOtpCooldownSeconds } from "@/lib/auth-otp-flow";

type ResetPasswordFormProps = {
  email?: string;
  requiresOtp?: boolean;
  nextPath?: string;
};

export function ResetPasswordForm({ email, requiresOtp = false, nextPath = "" }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendPasswordResetOtpAction, undefined);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(requiresOtp ? 60 : 0);
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  const cooldownStorageKey = buildOtpCooldownStorageKey({ email: normalizedEmail, purpose: "recovery" });
  const canResend = requiresOtp && Boolean(normalizedEmail) && cooldown === 0 && !resendPending;
  const loginHref = buildDashboardLoginPath({ email: normalizedEmail, next: nextPath });
  const canSubmit =
    (!requiresOtp || /^\d{6}$/.test(otp)) &&
    isAuthPasswordPolicySatisfied(password) &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  const handleResendSubmit = useCallback(() => {
    setOtp("");
    setCooldown(60);
    if (cooldownStorageKey) {
      window.sessionStorage.setItem(cooldownStorageKey, String(otpCooldownExpiresAt()));
    }
  }, [cooldownStorageKey]);

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
        title="Tạo mật khẩu mới"
        subtitle={requiresOtp ? "Nhập mã 6 số trong email rồi đặt mật khẩu mới cho tài khoản LogiVN." : "Đặt mật khẩu mới cho tài khoản LogiVN."}
        meta={email ? <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">{email}</span> : null}
      />

      <AuthCard>
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="email" value={requiresOtp ? email ?? "" : ""} />
          <input type="hidden" name="token" value={requiresOtp ? otp : ""} />
          <input type="hidden" name="next" value={nextPath} />

          {requiresOtp ? (
            <div className="grid gap-2">
              <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Mã OTP</p>
              <OtpInput value={otp} disabled={pending} onChange={setOtp} />
            </div>
          ) : null}

          <AuthField
            label="Mật khẩu mới"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Ít nhất 10 ký tự"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <AuthField
            label="Xác nhận mật khẩu"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />

          <PasswordPolicyList password={password} confirmPassword={confirmPassword} />

          {state?.error ? <AuthAlert tone="warn">{state.error}</AuthAlert> : null}

          <AuthSubmit className="mt-2" disabled={pending || !canSubmit}>
            {pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
          </AuthSubmit>
        </form>

        {requiresOtp ? (
          <form action={resendAction} onSubmit={handleResendSubmit} className="mt-4 grid gap-3 border-t border-[var(--d-line)] pt-4">
            <input type="hidden" name="email" value={normalizedEmail} />
            <AuthSecondaryButton type="submit" disabled={!canResend}>
              {resendPending ? "Đang gửi..." : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
            </AuthSecondaryButton>
            {resendState?.success ? <p className="text-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-ok-fg)]">{resendState.success}</p> : null}
            {resendState?.error ? <p className="text-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-warn-fg)]">{resendState.error}</p> : null}
            <Link href={loginHref} className="inline-flex min-h-10 items-center justify-center text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-jade)] transition hover:text-[var(--d-jade-700)]">
              Quay lại đăng nhập
            </Link>
          </form>
        ) : null}
      </AuthCard>
    </AuthScaffold>
  );
}
