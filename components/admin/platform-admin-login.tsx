"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { platformAdminLoginAction } from "@/features/platform-admin/actions";

type PlatformAdminLoginProps = {
  configured: boolean;
  devFallbackEnabled: boolean;
  requiresFirstPasswordChange: boolean;
  rbacConfigured: boolean;
  adminUsersConfigured: boolean;
  bootstrapFallbackEnabled: boolean;
  sessionTtlHours: number;
};

export function PlatformAdminLogin({
  configured,
  requiresFirstPasswordChange,
  adminUsersConfigured
}: PlatformAdminLoginProps) {
  const [state, formAction, pending] = useActionState(platformAdminLoginAction, undefined);

  return (
    <main className="stitch-admin stitch-devops grid min-h-screen place-items-center bg-[#080C16] px-4 py-8 text-slate-100">
      <form action={formAction} className="w-full max-w-[380px] rounded-lg border border-white/10 bg-[#0F1629] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-black text-white">LV</span>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-white">Đăng nhập quản trị</h1>
            <p className="text-xs text-slate-500">admin.logivn.com</p>
          </div>
        </div>

        {!configured ? (
          <div className="mb-4 flex gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm font-medium text-amber-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Thiếu cấu hình bảo vệ production.
          </div>
        ) : null}

        {requiresFirstPasswordChange ? (
          <div className="mb-4 rounded-lg border border-sky-400/25 bg-sky-400/10 p-3 text-sm font-medium text-sky-100">
            Cần đổi mật khẩu sau khi đăng nhập.
          </div>
        ) : null}

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Email
            <span className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                name="email"
                type="email"
                autoComplete="username"
                className="h-11 w-full rounded-lg border border-white/10 bg-[#0A1020] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
                placeholder="owner@logivn.com"
                disabled={!configured || pending}
                required={adminUsersConfigured}
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Mật khẩu
            <span className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-white/10 bg-[#0A1020] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
                placeholder="Mật khẩu"
                disabled={!configured || pending}
                required
              />
            </span>
          </label>
        </div>

        {state?.error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm font-medium text-red-100">{state.error}</p> : null}

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#F8FAFC] px-4 text-sm font-semibold text-[#080C16] transition hover:bg-slate-200 disabled:pointer-events-none disabled:opacity-50"
          disabled={!configured || pending}
        >
          {pending ? "Đang kiểm tra" : "Đăng nhập"}
          {pending ? <LockKeyhole className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>
    </main>
  );
}
