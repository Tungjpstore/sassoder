"use client";

import { useActionState } from "react";
import { ArrowRight, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, ShieldEllipsis } from "lucide-react";
import { platformAdminChangePasswordAction } from "@/features/platform-admin/actions";

type PlatformAdminPasswordChangeProps = {
  forced?: boolean;
  sessionTtlHours: number;
};

export function PlatformAdminPasswordChange({ forced = false, sessionTtlHours }: PlatformAdminPasswordChangeProps) {
  const [state, formAction, pending] = useActionState(platformAdminChangePasswordAction, undefined);

  return (
    <main className="stitch-admin stitch-devops min-h-screen overflow-hidden bg-[#0B1020] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(14,165,233,0.14),transparent_32%),radial-gradient(circle_at_76%_22%,rgba(16,185,129,0.1),transparent_30%),linear-gradient(180deg,#0B1020_0%,#111827_60%,#0B1020_100%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_440px] lg:px-8">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sm font-black text-sky-100 shadow-[0_0_30px_rgba(14,165,233,0.22)]">LV</span>
            <span>
              <span className="block text-sm font-semibold text-white">LogiVN DevOps Control Center</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Bảo vệ phiên quản trị</span>
            </span>
          </div>
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
              <ShieldCheck className="h-4 w-4" />
              Bảo vệ lần đầu
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">Thiết lập credential riêng cho Control Center.</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400">
              {forced
                ? "Mật khẩu tạm chỉ dùng để mở khoá lần đầu. Sau khi đổi, LogiVN lưu hash theo admin user hoặc credential bootstrap trong Supabase."
                : "Cập nhật mật khẩu cho phiên admin.logivn.com hiện tại. Phiên sẽ được làm mới sau khi lưu thành công."}
            </p>
          </div>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { label: "Credential", value: "Hash + salt", icon: Fingerprint },
              { label: "Cookie", value: "HTTP-only", icon: ShieldEllipsis },
              { label: "Phiên", value: `${sessionTtlHours} giờ`, icon: LockKeyhole }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                    <Icon size={16} className="text-sky-200" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-100">{item.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <form action={formAction} className="rounded-xl border border-white/10 bg-[#111827]/82 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-100 shadow-[0_0_28px_rgba(14,165,233,0.18)]">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">{forced ? "Đổi mật khẩu lần đầu" : "Đổi mật khẩu Control Center"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Mật khẩu mới cần tối thiểu 12 ký tự, có chữ, số và ký tự đặc biệt.</p>

          {[
            { name: "currentPassword", label: "Mật khẩu hiện tại", autoComplete: "current-password" },
            { name: "newPassword", label: "Mật khẩu mới", autoComplete: "new-password" },
            { name: "confirmPassword", label: "Nhập lại mật khẩu mới", autoComplete: "new-password" }
          ].map((field) => (
            <label key={field.name} className="mt-5 grid gap-2 text-sm font-semibold text-slate-300">
              {field.label}
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" />
                <input
                  name={field.name}
                  type="password"
                  autoComplete={field.autoComplete}
                  className="h-12 w-full rounded-lg border border-white/10 bg-[#0B1224]/80 pl-11 pr-4 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:ring-4 focus:ring-sky-500/10 disabled:bg-white/[0.03]"
                  placeholder={field.label}
                  disabled={pending}
                  required
                />
              </span>
            </label>
          ))}

          {state?.error ? <p className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm font-medium text-red-200">{state.error}</p> : null}

          <button
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/90 px-5 text-sm font-semibold uppercase tracking-[0.12em] text-white shadow-[0_0_30px_rgba(14,165,233,0.18)] transition hover:bg-sky-400 disabled:pointer-events-none disabled:opacity-50"
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
