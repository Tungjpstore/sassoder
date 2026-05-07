"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { requestPasswordResetAction } from "@/app/dashboard/actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

  return (
    <form
      action={formAction}
      className="relative w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/92 p-6 shadow-[0_24px_70px_rgba(43,43,43,0.12)] backdrop-blur-2xl"
    >
      <Link href="/dashboard/login" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[var(--primary-strong)] hover:text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" />
        Quay lại đăng nhập
      </Link>

      <div className="mb-7">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[#FFF7EB]">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-black tracking-normal">Đặt lại mật khẩu</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Nhập email quản trị. Nếu tài khoản tồn tại, LogiVN sẽ gửi liên kết đặt lại mật khẩu có thời hạn.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        Địa chỉ email
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
          <input
            name="email"
            type="email"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
            placeholder="admin@example.com"
            autoComplete="email"
            required
          />
        </div>
      </label>

      {state?.error ? (
        <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="mt-4 rounded-lg border border-[var(--success)] bg-[var(--success-soft)] p-3 text-sm font-semibold text-[var(--primary-strong)]">
          {state.success}
        </p>
      ) : null}

      <button
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black uppercase tracking-[0.12em] text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Đang gửi..." : "Gửi liên kết"}
        <Send className="h-5 w-5" />
      </button>
    </form>
  );
}
