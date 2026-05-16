import Link from "next/link";
import { ForgotPasswordForm } from "@/components/dashboard/forgot-password-form";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ expired?: string | string[]; email?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialEmail = firstParam(params.email)?.trim().toLowerCase() ?? "";

  return (
    <main className="stitch-onboarding min-h-screen bg-[#fbf7ef] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,77,58,0.08),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(242,140,40,0.09),transparent_22%),linear-gradient(180deg,#fffcf6,#f7efe4)]" />

        <header className="relative z-10 flex min-h-14 items-center justify-between border-b border-[#123b2b]/10 bg-[#fffdf8]/76 px-5 py-3 backdrop-blur sm:px-8">
          <LogiVNLogo href="/" className="h-11" priority />
          <Link
            href="/dashboard/register"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#0f4d3a]/15 bg-white/50 px-4 text-sm font-bold text-[#0f4d3a] transition hover:border-[#0f4d3a]/35"
          >
            Tạo quán mới
          </Link>
        </header>

        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col items-center justify-center gap-5 px-5 py-8">
          {firstParam(params.expired) ? (
            <p className="w-full rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-center text-sm text-[var(--accent-strong)]">
              Liên kết đặt lại mật khẩu đã hết hạn hoặc chưa hợp lệ. Vui lòng yêu cầu liên kết mới.
            </p>
          ) : null}
          <ForgotPasswordForm initialEmail={initialEmail} />
        </section>
      </div>
    </main>
  );
}
