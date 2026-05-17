"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { requestPasswordResetAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

export function ForgotPasswordForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, undefined);

  useEffect(() => {
    if (state?.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state?.redirectTo]);

  return (
    <form
      action={formAction}
      className="w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-col items-center text-center">
        <LogiVNLogo href="/" className="h-10" priority />
        <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">Quên mật khẩu</h1>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-[#344054]">
        Email
        <input
          name="email"
          type="email"
          defaultValue={initialEmail}
          className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
          placeholder="admin@example.com"
          autoComplete="email"
          required
        />
      </label>

      {state?.error ? (
        <p className="mt-4 rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="mt-4 rounded-md border border-[#0F4D3A]/25 bg-[#eef7f2] p-3 text-sm font-semibold text-[#0F4D3A]">{state.success}</p>
      ) : null}

      <button
        className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50"
        disabled={pending}
      >
        {pending ? "Đang gửi..." : "Gửi mã"}
      </button>

      <Link href="/dashboard/login" className="mt-4 inline-flex min-h-11 w-full items-center justify-center text-sm font-bold text-[#0F4D3A] transition hover:text-[#0b3d2e]">
        Đăng nhập
      </Link>
    </form>
  );
}
