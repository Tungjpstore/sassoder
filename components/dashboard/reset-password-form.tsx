"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { updateRecoveredPasswordAction } from "@/app/dashboard/actions";

type ResetPasswordFormProps = {
  email?: string;
};

export function ResetPasswordForm({ email }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form
      action={formAction}
      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-[var(--shadow-lift)] ring-1 ring-[var(--primary)]/5 backdrop-blur-2xl sm:p-8"
    >
      <div className="mb-7">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] shadow-[var(--glow-primary)]">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Tạo mật khẩu mới</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {email ? `Đang đặt lại cho ${email}.` : "Phiên đặt lại mật khẩu đã được xác thực."} Sau khi đổi, mọi phiên cũ sẽ được đăng xuất.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Mật khẩu mới
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-12 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
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
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-12 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
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

      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
        Mật khẩu cần có tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số.
      </p>

      {state?.error ? (
        <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>
      ) : null}

      <button
        className="login-cta-glow mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-base font-black uppercase tracking-[0.1em] text-white shadow-[var(--glow-primary)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(52,211,153,0.25)] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        <ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}
