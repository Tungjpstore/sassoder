"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { resendPasswordResetOtpAction, updateRecoveredPasswordAction } from "@/app/dashboard/actions";
import { OtpInput } from "@/components/dashboard/verify-email-form";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
    <form
      action={formAction}
      className="w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-col items-center text-center">
        <LogiVNLogo href="/" className="h-10" priority />
        <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">Tạo mật khẩu mới</h1>
        {email ? <p className="mt-2 text-xs font-bold text-[#667085]">{email}</p> : null}
        {requiresOtp ? (
          <p className="mt-2 max-w-[280px] text-sm font-semibold leading-6 text-[#667085]">
            Nhập mã 6 số trong email rồi đặt mật khẩu mới cho tài khoản LogiVN.
          </p>
        ) : null}
      </div>

      <input type="hidden" name="email" value={requiresOtp ? email ?? "" : ""} />
      <input type="hidden" name="token" value={requiresOtp ? otp : ""} />
      <input type="hidden" name="next" value={nextPath} />

      <div className="grid gap-3">
        {requiresOtp ? (
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-[#344054]">Mã OTP</p>
            <OtpInput value={otp} disabled={pending} onChange={setOtp} />
          </div>
        ) : null}

        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Mật khẩu mới
          <div className="relative">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 pr-14 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
              placeholder="Ít nhất 10 ký tự"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition hover:bg-[#eef3f9] hover:text-[#111827]"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-[#344054]">
          Xác nhận mật khẩu
          <div className="relative">
            <input
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 pr-14 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition hover:bg-[#eef3f9] hover:text-[#111827]"
              aria-label={showConfirm ? "Ẩn" : "Hiện"}
            >
              {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </label>
      </div>

      <div className="mt-3">
        <PasswordPolicyList password={password} confirmPassword={confirmPassword} />
      </div>

      {state?.error ? (
        <p className="mt-4 rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p>
      ) : null}

      <button
        className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending || !canSubmit}
      >
        {pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
      </button>

      {requiresOtp ? (
        <div className="mt-4 grid gap-3 border-t border-[#e5e7eb] pt-4">
          <button
            formAction={resendAction}
            onClick={handleResendSubmit}
            className="flex h-11 w-full items-center justify-center rounded-md border border-[#d8dee9] bg-white px-4 text-sm font-bold text-[#0F4D3A] transition hover:border-[#0F4D3A]/35 disabled:opacity-50"
            disabled={!canResend}
          >
            {resendPending ? "Đang gửi..." : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
          </button>
          <input type="hidden" name="email" value={normalizedEmail} />
          {resendState?.success ? <p className="text-center text-sm font-semibold text-[#0F4D3A]">{resendState.success}</p> : null}
          {resendState?.error ? <p className="text-center text-sm font-semibold text-[#9a4a17]">{resendState.error}</p> : null}
          <Link href={loginHref} className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-[#0F4D3A] transition hover:text-[#0b3d2e]">
            Quay lại đăng nhập
          </Link>
        </div>
      ) : null}
    </form>
  );
}
