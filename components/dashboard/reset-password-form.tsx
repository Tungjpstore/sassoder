"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { updateRecoveredPasswordAction } from "@/app/dashboard/actions";

type ResetPasswordFormProps = {
  email?: string;
};

export function ResetPasswordForm({ email }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, undefined);

  return (
    <form
      action={formAction}
      className="relative w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[0_24px_70px_rgba(43,43,43,0.12)] backdrop-blur-2xl"
    >
      <div className="mb-7">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[#FFF7EB]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-black tracking-normal">Tạo mật khẩu mới</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {email ? `Đang đặt lại cho ${email}.` : "Phiên đặt lại mật khẩu đã được xác thực."} Sau khi đổi, mọi phiên cũ sẽ được đăng xuất.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Mật khẩu mới
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
            <input
              name="password"
              type="password"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Ít nhất 10 ký tự"
              autoComplete="new-password"
              required
            />
          </div>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Xác nhận mật khẩu
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
            <input
              name="confirmPassword"
              type="password"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
              required
            />
          </div>
        </label>
      </div>

      <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
        Mật khẩu cần có tối thiểu 10 ký tự, gồm chữ hoa, chữ thường và chữ số.
      </p>

      {state?.error ? (
        <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>
      ) : null}

      <button
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black uppercase tracking-[0.12em] text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
        <ArrowRight className="h-5 w-5" />
      </button>
    </form>
  );
}
