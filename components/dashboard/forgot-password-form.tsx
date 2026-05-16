"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { requestPasswordResetAction } from "@/app/dashboard/actions";

export function ForgotPasswordForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

  return (
    <form
      action={formAction}
      className="w-full rounded-[24px] border border-[#123b2b]/10 bg-[#fffdf8]/95 p-5 shadow-[0_20px_60px_rgba(15,77,58,0.07)] sm:p-6"
    >
      <Link href="/dashboard/login" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#0f4d3a] transition hover:text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" />
        Quay lại đăng nhập
      </Link>

      <div className="mb-5 border-b border-[#123b2b]/10 pb-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f4d3a]">
          <Mail className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Đặt lại mật khẩu</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Nhập email quản trị. Nếu tài khoản tồn tại, LogiVN sẽ gửi liên kết đặt lại mật khẩu có thời hạn.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        Địa chỉ email
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            name="email"
            type="email"
            defaultValue={initialEmail}
            className="h-12 w-full rounded-xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-4 text-sm font-semibold leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
            placeholder="admin@example.com"
            autoComplete="email"
            required
          />
        </div>
      </label>

      {state?.error ? (
        <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="mt-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-sm font-semibold text-[var(--primary-strong)]">
          {state.success}
        </p>
      ) : null}

      <button
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0f4d3a] px-5 text-sm font-black uppercase tracking-[0.1em] text-[#FFF7EB] shadow-[0_12px_28px_rgba(15,77,58,0.16)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Đang gửi..." : "Gửi liên kết"}
        <Send className="h-5 w-5" />
      </button>
    </form>
  );
}
