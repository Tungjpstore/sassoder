"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { loginAction } from "@/app/dashboard/actions";
import {
  AuthAlert,
  AuthCard,
  AuthDivider,
  AuthField,
  AuthHeader,
  AuthScaffold,
  AuthSubmit,
  GoogleButton
} from "@/components/dashboard/auth-v2/auth-scaffold";

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
    google_config: "Google OAuth trực tiếp chưa đủ Client ID/Secret trên môi trường này.",
    google_state: "Phiên đăng nhập Google đã hết hạn hoặc không khớp. Vui lòng bấm đăng nhập lại.",
    provider: "Google đã từ chối hoặc huỷ phiên đăng nhập.",
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
    <AuthScaffold>
      <AuthHeader
        title="Đăng nhập"
        subtitle="Vào buồng lái vận hành quán của bạn."
        meta={tenantSlug ? <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">{tenantHost}</span> : null}
      />

      <AuthCard>
        <GoogleButton href={googleLoginHref} label="Đăng nhập bằng Google" />

        {sessionStatusMessage ? (
          <AuthAlert tone="info" className="mt-4">
            {sessionStatusMessage}
          </AuthAlert>
        ) : null}

        <AuthDivider />

        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <AuthField label="Email" name="email" type="email" defaultValue={initialEmail} placeholder="admin@example.com" autoComplete="email" required />
          <AuthField
            label="Mật khẩu"
            labelAddon={
              <Link href={forgotPasswordHref} className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-jade)] transition hover:text-[var(--d-jade-700)]">
                Quên mật khẩu?
              </Link>
            }
            name="password"
            type="password"
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            required
          />

          {resetStatus === "success" ? <AuthAlert tone="ok">Mật khẩu đã được cập nhật.</AuthAlert> : null}
          {state?.error ? <AuthAlert tone="warn">{state.error}</AuthAlert> : null}

          <AuthSubmit className="mt-2" disabled={pending}>
            {pending ? "Đang đăng nhập..." : "Vào dashboard"}
          </AuthSubmit>
        </form>

        {googleAuthErrorMessage ? (
          <AuthAlert tone="warn" className="mt-4">
            {googleAuthErrorMessage}
          </AuthAlert>
        ) : null}

        <div className="mt-5 flex flex-col gap-1 border-t border-[var(--d-line)] pt-4 text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
          <Link href={staffLoginHref} className="inline-flex min-h-10 items-center justify-center font-semibold text-[var(--d-text-muted)] transition hover:text-[var(--d-text)]">
            Nhân viên vào ca bằng PIN
          </Link>
          <Link href="/dashboard/register" className="inline-flex min-h-10 items-center justify-center font-semibold text-[var(--d-jade)] transition hover:text-[var(--d-jade-700)]">
            Chưa có tài khoản? Đăng ký
          </Link>
        </div>
      </AuthCard>
    </AuthScaffold>
  );
}
