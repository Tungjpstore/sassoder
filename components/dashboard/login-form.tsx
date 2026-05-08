"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Lock, Mail, QrCode, ShieldCheck, Sparkles, Store } from "lucide-react";
import { loginAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type LoginFormProps = {
  rootDomain: string;
  tenantSlug?: string;
  authError?: string;
  resetStatus?: string;
};

function getGoogleAuthErrorMessage(authError?: string) {
  if (!authError) return null;

  const messages: Record<string, string> = {
    google_init: "Không khởi tạo được đăng nhập Google. Hệ thống đã dọn phiên cũ, vui lòng bấm lại một lần nữa.",
    provider: "Google hoặc Supabase từ chối phiên đăng nhập.",
    missing_code: "Google callback thiếu mã xác thực.",
    callback: "Không đổi được mã Google thành phiên đăng nhập. Thường do cookie phiên cũ hoặc redirect OAuth chưa khớp.",
    session: "Đã nhận callback nhưng chưa tạo được phiên đăng nhập.",
    invalid_link: "Liên kết xác thực không hợp lệ hoặc đã hết hạn.",
    confirm: "Không xác nhận được email bằng liên kết này."
  };

  return messages[authError] ?? "Không hoàn tất được đăng nhập Google. Vui lòng thử lại hoặc dùng email và mật khẩu.";
}

export function LoginForm({ rootDomain, tenantSlug = "", authError, resetStatus }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const tenantHost = tenantSlug ? `${tenantSlug}.${rootDomain}` : rootDomain;
  const googleAuthErrorMessage = getGoogleAuthErrorMessage(authError);

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
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted-foreground)] shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              Cổng quản trị theo từng quán
            </div>
            <h1 className="max-w-2xl text-[56px] font-black leading-[1.04] tracking-normal">
              Chỉ cần email và mật khẩu, LogiVN tự mở đúng quán.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">
              Tài khoản của bạn đã gắn với một quán cụ thể. Sau khi đăng nhập, hệ thống tự kiểm tra hồ sơ và chuyển về dashboard
              hoặc subdomain phù hợp.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[
                { icon: Store, label: "Tách dữ liệu quán" },
                { icon: QrCode, label: "QR theo từng bàn" },
                { icon: ShieldCheck, label: "Phiên quản trị an toàn" }
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 shadow-[0_10px_30px_rgba(43,43,43,0.07)] backdrop-blur">
                    <Icon className="h-6 w-6 text-[var(--primary-strong)]" />
                    <p className="mt-5 text-sm font-semibold leading-5 text-[var(--foreground)]">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <form
            action={formAction}
            className="relative w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_24px_70px_rgba(43,43,43,0.14)] backdrop-blur-2xl"
          >
            <div className="mb-7">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[#FFF7EB] shadow-[0_14px_30px_rgba(15,77,58,0.24)]">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-3xl font-black tracking-normal">Đăng nhập quản trị</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {tenantSlug ? `Bạn đang ở ${tenantHost}.` : "Nhập email và mật khẩu, phần còn lại backend sẽ tự xử lý."}
              </p>
            </div>

            <a
              href="/auth/google"
              className="mb-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-black text-[var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--primary-soft)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-container-high)] text-base font-black text-[var(--primary)] shadow-sm">
                G
              </span>
              Đăng nhập bằng Google
            </a>

            <div className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              Hoặc email
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Địa chỉ email
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
                  <input
                    name="email"
                    type="email"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                    placeholder="admin@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                <span className="flex items-center justify-between gap-3">
                  Mật khẩu
                  <Link href="/dashboard/forgot-password" className="text-xs font-bold text-[var(--primary-strong)] hover:text-[var(--primary)]">
                    Quên mật khẩu?
                  </Link>
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--outline)]" />
                  <input
                    name="password"
                    type="password"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </label>
            </div>

            {resetStatus === "success" && (
              <p className="mt-4 rounded-lg border border-[var(--success)] bg-[var(--success-soft)] p-3 text-sm font-semibold text-[var(--primary-strong)]">
                Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại để tiếp tục.
              </p>
            )}
            {state?.error && <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>}
            {googleAuthErrorMessage && (
              <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">
                {googleAuthErrorMessage}
              </p>
            )}

            <button
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black uppercase tracking-[0.12em] text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.32)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-[0_22px_44px_rgba(242,140,40,0.38)] disabled:pointer-events-none disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Đang đăng nhập..." : "Vào dashboard"}
              <ArrowRight className="h-5 w-5" />
            </button>

            <div className="mt-5 flex flex-col gap-2 text-center text-sm text-[var(--muted-foreground)]">
              <Link href="/dashboard/register" className="font-semibold text-[var(--primary-strong)] hover:text-[var(--primary)]">
                Chưa có tài khoản? Đăng ký và thiết lập quán
              </Link>
              <span className="text-xs">Sau khi đăng nhập, LogiVN tự chuyển về đúng slug của quán.</span>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
