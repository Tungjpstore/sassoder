"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";

type LoginFormProps = {
  rootDomain: string;
  tenantSlug?: string;
  authError?: string;
  resetStatus?: string;
  sessionStatus?: string;
  initialEmail?: string;
  nextPath?: string;
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

function getSessionStatusMessage(sessionStatus?: string) {
  if (sessionStatus === "forced") return "Phiên làm việc đã bị quản lý đăng xuất. Vui lòng đăng nhập lại để tiếp tục ca.";
  if (sessionStatus === "cleared") return "Phiên cũ đã được dọn sạch. Bạn có thể đăng nhập lại an toàn.";
  return null;
}

export function LoginForm({ rootDomain, tenantSlug = "", authError, resetStatus, sessionStatus, initialEmail = "", nextPath = "" }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const tenantHost = tenantSlug ? `${tenantSlug}.${rootDomain}` : rootDomain;
  const googleAuthErrorMessage = getGoogleAuthErrorMessage(authError);
  const sessionStatusMessage = getSessionStatusMessage(sessionStatus);
  const staffLoginHref = tenantSlug ? `/staff/${encodeURIComponent(tenantSlug)}/login` : "/staff/login";
  const googleLoginHref = nextPath ? `/auth/google?next=${encodeURIComponent(nextPath)}` : "/auth/google";
  const forgotPasswordParams = new URLSearchParams();
  if (initialEmail) forgotPasswordParams.set("email", initialEmail);
  if (nextPath) forgotPasswordParams.set("next", nextPath);
  const forgotPasswordHref = forgotPasswordParams.size > 0 ? `/dashboard/forgot-password?${forgotPasswordParams.toString()}` : "/dashboard/forgot-password";

  useEffect(() => {
    if (state?.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state?.redirectTo]);

  return (
    <main className="dashboard-auth-page min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
      <section className="auth-fade-in dashboard-auth-shell mx-auto flex min-h-svh w-full max-w-[400px] flex-col justify-center px-4 py-6 sm:px-5">
        <div className="mb-4 flex flex-col items-center text-center">
          <LogiVNLogo href="/" className="h-10" priority />
          <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">Đăng nhập</h1>
          {tenantSlug ? <p className="mt-2 text-xs font-bold text-[#667085]">{tenantHost}</p> : null}
        </div>

        <div className="dashboard-auth-card w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5">
          <a
            href={googleLoginHref}
            className="mb-4 flex h-12 w-full items-center justify-center gap-3 rounded-md border border-[#d8dee9] bg-white px-5 text-sm font-black text-[#1f2937] transition hover:border-[#0F4D3A]/45 hover:bg-[#f8fbff]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Đăng nhập bằng Google
          </a>

          {sessionStatusMessage ? (
            <p className="mb-4 rounded-md border border-[#0F4D3A]/20 bg-[#eef7f2] p-3 text-sm font-bold leading-5 text-[#0F4D3A]">{sessionStatusMessage}</p>
          ) : null}

          <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#98a2b3]">
            <span className="h-px flex-1 bg-[#d8dee9]" />
            hoặc
            <span className="h-px flex-1 bg-[#d8dee9]" />
          </div>

          <form action={formAction}>
            <input type="hidden" name="next" value={nextPath} />
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-semibold">
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={initialEmail}
                  className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                <span className="flex items-center justify-between gap-3">
                  Mật khẩu
                  <Link href={forgotPasswordHref} className="inline-flex min-h-12 items-center text-xs font-bold text-[#0F4D3A] transition hover:text-[#0b3d2e]">
                    Quên mật khẩu?
                  </Link>
                </span>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 pr-14 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-0.5 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition hover:bg-[#eef3f9] hover:text-[#111827]"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </label>
            </div>

            {resetStatus === "success" ? (
              <p className="mt-4 rounded-md border border-[#0F4D3A]/25 bg-[#eef7f2] p-3 text-sm font-semibold text-[#0F4D3A]">Mật khẩu đã được cập nhật.</p>
            ) : null}
            {state?.error ? <p className="mt-4 rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p> : null}

            <button
              className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Đang đăng nhập..." : "Vào dashboard"}
            </button>
          </form>

          {googleAuthErrorMessage ? <p className="mt-4 rounded-md border border-[#F28C28]/35 bg-[#fff7ed] p-3 text-sm font-semibold text-[#9a4a17]">{googleAuthErrorMessage}</p> : null}

          <div className="dashboard-auth-action-row mt-5 flex flex-col gap-2 text-center text-sm text-[#667085]">
            <Link href={staffLoginHref} className="inline-flex min-h-11 items-center justify-center font-semibold text-[#475467] transition hover:text-[#111827]">
              Nhân viên vào ca bằng PIN
            </Link>
            <Link href="/dashboard/register" className="inline-flex min-h-11 items-center justify-center font-semibold text-[#0F4D3A] transition hover:text-[#0b3d2e]">
              Chưa có tài khoản? Đăng ký
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
