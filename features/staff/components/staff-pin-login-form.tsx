"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BadgeCheck, BriefcaseBusiness, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { staffAppLoginAction } from "@/app/dashboard/actions/auth";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type StaffPinLoginFormProps = {
  restaurantSlug?: string;
  restaurantName?: string | null;
  mode: "gate" | "pin";
  nextPath?: string;
};

const assuranceItems = [
  { icon: UserRound, label: "Mã riêng", value: "Không dùng PIN chung" },
  { icon: ShieldCheck, label: "Mật khẩu app", value: "Bắt đổi lần đầu" },
  { icon: BriefcaseBusiness, label: "Vào ca", value: "Chấm công & lịch làm" }
];

export function StaffPinLoginForm({ restaurantName, nextPath = "" }: StaffPinLoginFormProps) {
  const [state, formAction, pending] = useActionState(staffAppLoginAction, undefined);

  return (
    <main className="staff-brand-page dashboard-density min-h-screen overflow-x-clip text-[#2B2B2B]">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl content-start gap-5 px-4 py-[calc(1rem+env(safe-area-inset-top))] sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:py-8">
        <header className="flex h-12 items-center justify-between lg:col-span-2">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link href="/dashboard/login" className="inline-flex min-h-10 items-center rounded-xl border border-[#D8D1C7] bg-white px-3 text-xs font-black text-[#2B2B2B] transition hover:border-[#0F4D3A]/30">
            Chủ quán
          </Link>
        </header>

        <section className="hidden min-w-0 lg:block">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F4D3A] text-white shadow-[0_18px_44px_rgba(15,77,58,0.2)]">
            <BadgeCheck size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-6 max-w-xl text-[34px] font-black leading-tight text-[#2B2B2B]">
            Staff app cho ca làm thật, dữ liệu thật.
          </h1>
          <p className="mt-3 max-w-lg text-sm font-semibold leading-6 text-[#5E5A54]">
            Nhân viên đăng nhập bằng mã nhân viên do quán cấp và mật khẩu app cá nhân. Mọi thao tác chấm công, ca làm, báo cáo sự cố đều gắn đúng tài khoản.
          </p>
          <div className="mt-6 grid max-w-2xl grid-cols-3 gap-3">
            {assuranceItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-[#D8D1C7] bg-white p-4 shadow-[0_12px_34px_rgba(49,38,20,0.06)]">
                  <Icon size={20} className="text-[#0F4D3A]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-black text-[#2B2B2B]">{item.label}</p>
                  <p className="mt-1 text-xs font-bold text-[#5E5A54]">{item.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-[420px] rounded-[18px] border border-[#D8D1C7] bg-[#FFFDF7] p-4 shadow-[0_24px_70px_rgba(49,38,20,0.10)] sm:p-5">
          <div className="rounded-2xl border border-[#D8D1C7] bg-[#F7F2EA] p-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#0F4D3A] text-white">
              <LockKeyhole size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-black text-[#2B2B2B]">Đăng nhập nhân viên</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-[#5E5A54]">
              {restaurantName ? `${restaurantName} · ` : ""}Nhập mã nhân viên và mật khẩu app.
            </p>
          </div>

          <form action={formAction} className="mt-4 grid gap-3">
            <input type="hidden" name="next" value={nextPath} />
            <label className="grid gap-1.5 text-sm font-black text-[#2B2B2B]">
              Mã nhân viên
              <input
                name="employeeCode"
                placeholder="VD: LOGI01000001"
                className="h-12 rounded-xl border border-[#D8D1C7] bg-white px-4 text-base font-black uppercase tracking-[0.08em] outline-none transition placeholder:text-sm placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10"
                autoCapitalize="characters"
                autoComplete="username"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-black text-[#2B2B2B]">
              Mật khẩu app
              <input
                name="password"
                type="password"
                placeholder="Mật khẩu lần đầu hoặc mật khẩu đã đổi"
                className="h-12 rounded-xl border border-[#D8D1C7] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#0F4D3A] focus:ring-4 focus:ring-[#0F4D3A]/10"
                autoComplete="current-password"
              />
            </label>

            {state?.error ? <p aria-live="polite" className="rounded-xl border border-[#F28C28]/30 bg-[#FFF1DE] px-3 py-2 text-sm font-bold text-[#9A4F07]">{state.error}</p> : null}

            <button type="submit" disabled={pending} className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0F4D3A] px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(15,77,58,0.18)] transition active:scale-[0.99] disabled:opacity-60">
              <LogIn size={17} aria-hidden="true" />
              {pending ? "Đang đăng nhập..." : "Vào app nhân viên"}
            </button>

            <p className="text-center text-xs font-bold leading-5 text-[#5E5A54]">
              Quên mật khẩu? Liên hệ chủ quán để cấp lại mật khẩu tạm trong màn Nhân sự.
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}
