"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { loginAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type LoginFormProps = {
  rootDomain: string;
  tenantSlug?: string;
  authError?: string;
  resetStatus?: string;
  initialEmail?: string;
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

export function LoginForm({ rootDomain, tenantSlug = "", authError, resetStatus, initialEmail = "" }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const tenantHost = tenantSlug ? `${tenantSlug}.${rootDomain}` : rootDomain;
  const googleAuthErrorMessage = getGoogleAuthErrorMessage(authError);

  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8ec] text-[#102a1f]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(15,77,58,0.11),transparent_34%),radial-gradient(circle_at_92%_12%,rgba(242,140,40,0.08),transparent_24%)]" />
      <section className="auth-fade-in relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center px-5 py-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogiVNLogo href="/" className="h-9" priority />
          <div className="mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#0f4d3a] shadow-[0_16px_36px_rgba(15,77,58,0.18)]">
            <ShieldCheck className="h-5 w-5 text-[#fff8ec]" />
          </div>
          <h1 className="mt-5 text-[28px] font-black tracking-[-0.05em]">Đăng nhập</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#657267]">
            {tenantSlug ? `Bạn đang ở ${tenantHost}.` : "Vào đúng dashboard quán bằng phiên quản trị an toàn."}
          </p>
        </div>

          <form
            action={formAction}
            className="w-full rounded-[32px] border border-[#123b2b]/10 bg-[#fffdf8]/92 p-4 shadow-[0_24px_80px_rgba(15,77,58,0.08)] backdrop-blur sm:p-5"
          >
            <a
              href="/auth/google"
              className="mb-4 flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-[#123b2b]/10 bg-white px-5 text-sm font-black text-[#21352a] transition hover:border-[#0f4d3a]/35"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Đăng nhập bằng Google
            </a>

            <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <span className="h-px flex-1 bg-[#123b2b]/10" />
              Hoặc email
              <span className="h-px flex-1 bg-[#123b2b]/10" />
            </div>

            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-semibold">
                Địa chỉ email
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    name="email"
                    type="email"
                    defaultValue={initialEmail}
                    className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-4 text-sm font-semibold leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
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
                    className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-12 text-sm font-semibold leading-6 text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted-foreground)]/50 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
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

            <button
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0f4d3a] px-5 text-sm font-black text-[#FFF7EB] shadow-[0_16px_36px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Đang đăng nhập..." : "Vào dashboard"}
              <ArrowRight className="h-5 w-5" />
            </button>

            <div className="mt-5 flex flex-col gap-2 text-center text-sm text-[var(--muted-foreground)]">
              <Link href="/dashboard/register" className="font-semibold text-[var(--primary-strong)] transition hover:text-[var(--primary)]">
                Chưa có tài khoản? Đăng ký và thiết lập quán
              </Link>
            </div>
          </form>
      </section>
    </main>
  );
}
