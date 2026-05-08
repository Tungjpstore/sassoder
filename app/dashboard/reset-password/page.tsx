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
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--primary)]/8 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/6 blur-[120px]" />

        <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3 backdrop-blur-xl sm:px-8">
          <LogiVNLogo href="/" className="h-9" priority />
          <span className="rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-4 py-2 text-sm font-bold text-[var(--primary-strong)]">Phiên bảo mật</span>
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-6 px-5 py-10">
          <ResetPasswordForm email={user.email} />
        </section>
      </div>
    </main>
  );
}
