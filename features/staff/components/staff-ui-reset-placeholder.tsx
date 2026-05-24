import Link from "next/link";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type StaffUiResetPlaceholderProps = {
  title: string;
  description: string;
  backHref?: string;
};

export function StaffUiResetPlaceholder({ title, description, backHref = "/dashboard" }: StaffUiResetPlaceholderProps) {
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-4 py-6 text-[#10231d]">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col justify-between rounded-[28px] border border-[#e4ded6] bg-[#fffdfa] p-6 shadow-[0_24px_80px_rgba(0,53,38,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <LogiVNLogo href={backHref} className="h-9" priority />
          <span className="rounded-full border border-[#c8d8ca] bg-[#eef7ee] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#003526]">
            Đang làm lại
          </span>
        </div>

        <div className="py-16">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f4d3a]">Staff UI reset</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#10231d] md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#66716b]">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee6dc] pt-4">
          <p className="text-sm font-semibold text-[#66716b]">Backend, API, service và schema nhân sự được giữ nguyên.</p>
          <Link href={backHref} className="inline-flex h-10 items-center rounded-xl bg-[#003526] px-4 text-sm font-black text-white">
            Quay lại
          </Link>
        </div>
      </section>
    </main>
  );
}
