import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/dashboard/reset-password-form";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getAuthUser();
  if (!user) redirect("/dashboard/forgot-password?expired=1");

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-[var(--secondary)]/60 blur-[100px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[var(--accent)]/25 blur-[110px]" />

        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-6 py-4 shadow-sm backdrop-blur-xl">
          <LogiVNLogo href="/" className="h-10" priority />
          <span className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--primary-strong)]">Phiên bảo mật</span>
        </header>

        <section className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[1fr_440px] lg:px-12">
          <div className="hidden lg:block">
            <p className="mb-5 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Recovery session
            </p>
            <h1 className="max-w-2xl text-[54px] font-black leading-[1.04] tracking-normal">
              Đổi mật khẩu trong một phiên đã xác thực.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
              Sau khi cập nhật mật khẩu, LogiVN đăng xuất mọi phiên cũ để giảm rủi ro tài khoản bị truy cập trái phép.
            </p>
          </div>

          <ResetPasswordForm email={user.email} />
        </section>
      </div>
    </main>
  );
}
