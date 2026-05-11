import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/dashboard/reset-password-form";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAuthUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await getAuthUser();
  if (!user) redirect("/dashboard/forgot-password?expired=1");

  return (
    <main className="stitch-onboarding min-h-screen bg-[#fbf7ef] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,77,58,0.08),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(242,140,40,0.09),transparent_22%),linear-gradient(180deg,#fffcf6,#f7efe4)]" />

        <header className="relative z-10 flex min-h-14 items-center justify-between border-b border-[#123b2b]/10 bg-[#fffdf8]/76 px-5 py-3 backdrop-blur sm:px-8">
          <LogiVNLogo href="/" className="h-8" priority />
          <span className="rounded-lg border border-[#0f4d3a]/15 bg-white/50 px-4 py-2 text-sm font-bold text-[#0f4d3a]">Phiên bảo mật</span>
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col items-center justify-center gap-5 px-5 py-8">
          <ResetPasswordForm email={user.email} />
        </section>
      </div>
    </main>
  );
}
