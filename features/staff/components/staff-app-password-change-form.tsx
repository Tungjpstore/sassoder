"use client";

import { useActionState } from "react";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { staffAppPasswordChangeAction } from "@/app/dashboard/actions/auth";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type StaffAppPasswordChangeFormProps = {
  employeeCode?: string | null;
  nextPath: string;
};

export function StaffAppPasswordChangeForm({ employeeCode, nextPath }: StaffAppPasswordChangeFormProps) {
  const [state, action, pending] = useActionState(staffAppPasswordChangeAction, undefined);

  return (
    <main className="staff-brand-page dashboard-density min-h-screen text-[#2B2B2B]">
      <section className="mx-auto flex min-h-screen w-full max-w-[1120px] flex-col px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <header className="flex h-12 items-center justify-between">
          <LogiVNLogo href="/" priority className="h-9 w-auto" />
          <span className="rounded-full border border-[#D8D1C7] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-[#0F4D3A]">
            Staff App
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_430px]">
          <section className="hidden lg:block">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F4D3A] text-white shadow-[0_18px_44px_rgba(15,77,58,0.2)]">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <h1 className="mt-6 max-w-xl text-[34px] font-black leading-tight text-[#2B2B2B]">
              Đổi mật khẩu lần đầu trước khi vào app làm việc.
            </h1>
            <p className="mt-3 max-w-lg text-sm font-semibold leading-6 text-[#5E5A54]">
              Mã nhân viên dùng để đăng nhập lâu dài. Mật khẩu tạm chỉ hiển thị một lần cho chủ quán và cần đổi ngay khi nhân viên đăng nhập lần đầu.
            </p>
            <div className="mt-6 grid max-w-lg grid-cols-2 gap-3">
              {[
                "Không dùng PIN chung",
                "Bảo vệ tài khoản cá nhân",
                "Ghi nhận audit log",
                "Sẵn sàng cho payroll"
              ].map((item) => (
                <div key={item} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#D8D1C7] bg-white px-3 text-sm font-bold text-[#3F3D39]">
                  <CheckCircle2 size={17} className="text-[#0F4D3A]" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-[#D8D1C7] bg-[#FFFDF7] p-4 shadow-[0_24px_70px_rgba(49,38,20,0.10)] sm:p-5">
            <div className="rounded-2xl border border-[#D8D1C7] bg-[#F7F2EA] p-4">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#0F4D3A] text-white">
                <LockKeyhole size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-2xl font-black text-[#2B2B2B]">Tạo mật khẩu app mới</h2>
              {employeeCode ? <p className="mt-2 text-sm font-bold text-[#5E5A54]">Mã nhân viên: <span className="text-[#0F4D3A]">{employeeCode}</span></p> : null}
            </div>

            <form action={action} className="mt-4 grid gap-3">
              <input type="hidden" name="next" value={nextPath} />
              <label className="grid gap-1.5 text-sm font-black text-[#2B2B2B]">
                Mật khẩu tạm / hiện tại
                <input name="currentPassword" type="password" autoComplete="current-password" className="h-12 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-semibold outline-none focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10" />
              </label>
              <label className="grid gap-1.5 text-sm font-black text-[#2B2B2B]">
                Mật khẩu mới
                <input name="newPassword" type="password" autoComplete="new-password" className="h-12 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-semibold outline-none focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10" />
              </label>
              <label className="grid gap-1.5 text-sm font-black text-[#2B2B2B]">
                Nhập lại mật khẩu mới
                <input name="confirmPassword" type="password" autoComplete="new-password" className="h-12 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-semibold outline-none focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10" />
              </label>

              {state?.error ? <p className="rounded-xl border border-[#F28C28]/30 bg-[#FFF1DE] px-3 py-2 text-sm font-bold text-[#9A4F07]">{state.error}</p> : null}

              <button type="submit" disabled={pending} className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0F4D3A] px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(15,77,58,0.18)] transition active:scale-[0.99] disabled:opacity-60">
                <LockKeyhole size={17} aria-hidden="true" />
                {pending ? "Đang cập nhật..." : "Đổi mật khẩu và vào app"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
