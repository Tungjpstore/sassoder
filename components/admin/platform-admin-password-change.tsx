"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { platformAdminChangePasswordAction } from "@/app/admin/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type PlatformAdminPasswordChangeProps = {
  forced?: boolean;
  sessionTtlHours: number;
};

export function PlatformAdminPasswordChange({ forced = false, sessionTtlHours }: PlatformAdminPasswordChangeProps) {
  const [state, formAction, pending] = useActionState(platformAdminChangePasswordAction, undefined);

  return (
    <main className="stitch-admin min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_440px]">
        <section className="space-y-8">
          <LogiVNLogo href="/" className="h-11" priority />
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-950">
              <ShieldCheck className="h-4 w-4 text-orange-500" />
              Bảo vệ lần đầu
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              Đổi mật khẩu riêng cho dev console.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              {forced
                ? "Mật khẩu tạm chỉ dùng để mở khoá lần đầu. Sau khi đổi, LogiVN lưu hash trong Supabase và yêu cầu mật khẩu mới cho các lần đăng nhập sau."
                : "Cập nhật mật khẩu nội bộ cho /admin. Phiên hiện tại sẽ được làm mới sau khi lưu thành công."}
            </p>
          </div>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { label: "Storage", value: "Hash + salt" },
              { label: "Cookie", value: "HTTP-only" },
              { label: "Session", value: `${sessionTtlHours} giờ` }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-lg font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <form action={formAction} className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950 text-white">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{forced ? "Đổi mật khẩu lần đầu" : "Đổi mật khẩu /admin"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Mật khẩu mới cần tối thiểu 12 ký tự, có chữ, số và ký tự đặc biệt.
          </p>

          {[
            { name: "currentPassword", label: "Mật khẩu hiện tại", autoComplete: "current-password" },
            { name: "newPassword", label: "Mật khẩu mới", autoComplete: "new-password" },
            { name: "confirmPassword", label: "Nhập lại mật khẩu mới", autoComplete: "new-password" }
          ].map((field) => (
            <label key={field.name} className="mt-5 grid gap-2 text-sm font-semibold text-slate-800">
              {field.label}
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  name={field.name}
                  type="password"
                  autoComplete={field.autoComplete}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-base outline-none transition focus:border-emerald-950 focus:ring-4 focus:ring-emerald-950/10 disabled:bg-slate-50"
                  placeholder={field.label}
                  disabled={pending}
                  required
                />
              </span>
            </label>
          ))}

          {state?.error ? (
            <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800">{state.error}</p>
          ) : null}

          <button
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-orange-600 disabled:pointer-events-none disabled:opacity-50"
            disabled={pending}
          >
            {pending ? "Đang lưu..." : "Lưu mật khẩu mới"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
