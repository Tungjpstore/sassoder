"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { updateRecoveredPasswordAction } from "@/app/dashboard/actions";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";

type ResetPasswordFormProps = {
  email?: string;
};

export function ResetPasswordForm({ email }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const canSubmit = isAuthPasswordPolicySatisfied(password) && confirmPassword.length > 0 && password === confirmPassword;

  return (
    <form
      action={formAction}
      className="w-full rounded-[24px] border border-[#123b2b]/10 bg-[#fffdf8]/95 p-5 shadow-[0_20px_60px_rgba(15,77,58,0.07)] sm:p-6"
    >
      <div className="mb-5 border-b border-[#123b2b]/10 pb-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f4d3a]">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Tạo mật khẩu mới</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {email ? `Đang đặt lại cho ${email}.` : "Phiên đặt lại mật khẩu đã được xác thực."} Sau khi đổi, mọi phiên cũ sẽ được đăng xuất.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-2 text-sm font-semibold">
          Mật khẩu mới
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-12 text-sm font-semibold leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
              placeholder="Ít nhất 10 ký tự"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Xác nhận mật khẩu
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-12 text-sm font-semibold leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
              aria-label={showConfirm ? "Ẩn" : "Hiện"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
      </div>

      <div className="mt-3">
        <PasswordPolicyList password={password} confirmPassword={confirmPassword} />
      </div>

      {state?.error ? (
        <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>
      ) : null}

      <button
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] px-5 text-sm font-black uppercase tracking-[0.1em] text-[#FFF7EB] shadow-[0_12px_28px_rgba(15,77,58,0.16)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        disabled={pending || !canSubmit}
      >
        {pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        <ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}
