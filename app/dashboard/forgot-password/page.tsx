import Link from "next/link";
import { ForgotPasswordForm } from "@/components/dashboard/forgot-password-form";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-[var(--secondary)]/60 blur-[100px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[var(--accent)]/25 blur-[110px]" />

        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-6 py-4 shadow-sm backdrop-blur-xl">
          <LogiVNLogo href="/" className="h-10" priority />
          <Link
            href="/dashboard/register"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--primary-strong)] transition-colors duration-200 hover:bg-[var(--primary-soft)]"
          >
            Tạo quán mới
          </Link>
        </header>

        <section className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 px-6 py-10 lg:grid-cols-[1fr_440px] lg:px-12">
          <div className="hidden lg:block">
            <p className="mb-5 inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Bảo mật tài khoản
            </p>
            <h1 className="max-w-2xl text-[54px] font-black leading-[1.04] tracking-normal">
              Lấy lại quyền truy cập mà không lộ thông tin tài khoản.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
              LogiVN luôn trả về phản hồi an toàn để tránh dò email, giới hạn số lần yêu cầu và chỉ cho đổi mật khẩu qua phiên xác thực.
            </p>
          </div>

          <div>
            {params.expired ? (
              <p className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">
                Liên kết đặt lại mật khẩu đã hết hạn hoặc chưa hợp lệ. Vui lòng yêu cầu liên kết mới.
              </p>
            ) : null}
            <ForgotPasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
