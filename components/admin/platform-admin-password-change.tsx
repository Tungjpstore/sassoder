"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react";
import { platformAdminChangePasswordAction } from "@/features/platform-admin/actions";

type PlatformAdminPasswordChangeProps = {
  forced?: boolean;
  sessionTtlHours: number;
};

export function PlatformAdminPasswordChange({ forced = false }: PlatformAdminPasswordChangeProps) {
  const [state, formAction, pending] = useActionState(platformAdminChangePasswordAction, undefined);

  return (
    <main className="stitch-admin stitch-devops grid min-h-screen place-items-center bg-[#080C16] px-4 py-8 text-slate-100">
      <form action={formAction} className="w-full max-w-[420px] rounded-lg border border-white/10 bg-[#0F1629] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold text-white">{forced ? "Đổi mật khẩu lần đầu" : "Đổi mật khẩu"}</h1>
            <p className="mt-0.5 text-xs text-slate-500">admin.logivn.com</p>
          </div>
        </div>

        <div className="grid gap-4">
          {[
            { name: "currentPassword", label: "Mật khẩu hiện tại", autoComplete: "current-password" },
            { name: "newPassword", label: "Mật khẩu mới", autoComplete: "new-password" },
            { name: "confirmPassword", label: "Nhập lại mật khẩu", autoComplete: "new-password" }
          ].map((field) => (
            <label key={field.name} className="grid gap-2 text-sm font-semibold text-slate-200">
              {field.label}
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  name={field.name}
                  type="password"
                  autoComplete={field.autoComplete}
                  className="h-11 w-full rounded-lg border border-white/10 bg-[#0A1020] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10"
                  placeholder={field.label}
                  disabled={pending}
                  required
                />
              </span>
            </label>
          ))}
        </div>

        {state?.error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm font-medium text-red-100">{state.error}</p> : null}

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#F8FAFC] px-4 text-sm font-semibold text-[#080C16] transition hover:bg-slate-200 disabled:pointer-events-none disabled:opacity-50"
          disabled={pending}
        >
          {pending ? "Đang lưu" : "Lưu mật khẩu"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </main>
  );
}
