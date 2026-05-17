"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { updateRecoveredPasswordAction } from "@/app/dashboard/actions";
import { OtpInput } from "@/components/dashboard/verify-email-form";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type ResetPasswordFormProps = {
  email?: string;
  requiresOtp?: boolean;
};

export function ResetPasswordForm({ email, requiresOtp = false }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const canSubmit =
    (!requiresOtp || /^\d{6}$/.test(otp)) &&
    isAuthPasswordPolicySatisfied(password) &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  return (
    <form
      action={formAction}
      className="w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-col items-center text-center">
        <LogiVNLogo href="/" className="h-10" priority />
        <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">Tạo mật khẩu mới</h1>
        {email ? <p className="mt-2 text-xs font-bold text-[#667085]">{email}</p> : null}
      </div>

      <input type="hidden" name="email" value={requiresOtp ? email ?? "" : ""} />
      <input type="hidden" name="token" value={requiresOtp ? otp : ""} />

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
    </form>
  );
}
