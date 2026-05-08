"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, QrCode, ShieldCheck, Store } from "lucide-react";
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

const trustItems = [
  { icon: Store, label: "Tách dữ liệu quán", desc: "Mỗi quán một subdomain riêng" },
  { icon: QrCode, label: "QR theo từng bàn", desc: "Quét để gọi món & thanh toán" },
  { icon: ShieldCheck, label: "Phiên an toàn", desc: "Tự động đăng xuất phiên cũ" }
];

export function LoginForm({ rootDomain, tenantSlug = "", authError, resetStatus }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const tenantHost = tenantSlug ? `${tenantSlug}.${rootDomain}` : rootDomain;
  const googleAuthErrorMessage = getGoogleAuthErrorMessage(authError);

  return (
    <main className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--primary)]/8 blur-[120px]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/6 blur-[120px]" />
        <div className="pointer-events-none absolute -left-32 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[var(--primary)]/5 blur-[100px]" />

        {/* Header */}
        <header className="relative z-10 flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3 backdrop-blur-xl sm:px-8">
          <LogiVNLogo href="/" className="h-9" priority />
          <Link
            href="/dashboard/register"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-4 text-sm font-bold text-[var(--primary-strong)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-[var(--glow-primary)]"
          >
            Tạo quán mới
          </Link>
        </header>

        {/* Centered content */}
        <section className="auth-fade-in relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
          {/* Logo mark */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] shadow-[var(--glow-primary)]">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-center text-2xl font-black tracking-tight sm:text-3xl">Đăng nhập quản trị</h1>
            <p className="text-center text-sm leading-6 text-[var(--muted-foreground)]">
              {tenantSlug ? `Bạn đang ở ${tenantHost}.` : "Nhập email và mật khẩu, LogiVN tự mở đúng quán."}
            </p>
          </div>

          {/* Glass card */}
          <form
            action={formAction}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-[var(--shadow-lift)] ring-1 ring-[var(--primary)]/5 backdrop-blur-2xl sm:p-8"
          >
            {/* Google OAuth */}
            <a
              href="/auth/google"
              className="mb-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 text-sm font-bold text-[var(--foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/30 hover:shadow-[var(--glow-primary)]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Đăng nhập bằng Google
            </a>

            {/* Divider */}
            <div className="mb-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              Hoặc email
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {/* Fields */}
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold">
                Địa chỉ email
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    name="email"
                    type="email"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                    placeholder="admin@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                <span className="flex items-center justify-between gap-3">
                  Mật khẩu
                  <Link href="/dashboard/forgot-password" className="text-xs font-bold text-[var(--primary-strong)] transition hover:text-[var(--primary)]">
                    Quên mật khẩu?
                  </Link>
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-12 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted-foreground)]/50 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            </div>

            {/* Status messages */}
            {resetStatus === "success" && (
              <p className="mt-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-3 text-sm font-semibold text-[var(--primary-strong)]">
                Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại để tiếp tục.
              </p>
            )}
            {state?.error && <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{state.error}</p>}
            {googleAuthErrorMessage && (
              <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">
                {googleAuthErrorMessage}
              </p>
            )}

            {/* CTA */}
            <button
              className="login-cta-glow mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-base font-black uppercase tracking-[0.1em] text-white shadow-[var(--glow-primary)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(52,211,153,0.25)] disabled:pointer-events-none disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Đang đăng nhập..." : "Vào dashboard"}
              <ArrowRight className="h-5 w-5" />
            </button>

            {/* Footer links */}
            <div className="mt-5 flex flex-col gap-2 text-center text-sm text-[var(--muted-foreground)]">
              <Link href="/dashboard/register" className="font-semibold text-[var(--primary-strong)] transition hover:text-[var(--primary)]">
                Chưa có tài khoản? Đăng ký và thiết lập quán
              </Link>
            </div>
          </form>

          {/* Trust badges - always visible */}
          <div className="grid w-full grid-cols-3 gap-3">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-3 text-center backdrop-blur-sm sm:p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="text-[11px] font-bold leading-4 text-[var(--foreground)] sm:text-xs">{item.label}</p>
                  <p className="hidden text-[10px] leading-4 text-[var(--muted-foreground)] sm:block">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
