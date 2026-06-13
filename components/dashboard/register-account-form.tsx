"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { registerAccountAction } from "@/app/dashboard/actions";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
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
import { buildDashboardLoginPath, buildForgotPasswordPath, buildOnboardingIntentPath } from "@/lib/auth-onboarding-intent";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";

type EmailStatus = "idle" | "checking" | "available" | "registered" | "pending_verification" | "delivery_unavailable" | "invalid" | "error" | "rate_limited";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function emailStatusCopy(status: EmailStatus) {
  if (status === "checking") return "Đang kiểm tra email...";
  if (status === "available") return "Email này có thể đăng ký.";
  if (status === "registered") return "Email này đã có tài khoản LogiVN.";
  if (status === "pending_verification") return "Email này đang chờ xác thực.";
  if (status === "delivery_unavailable") return "Email hợp lệ, nhưng hệ thống gửi mã xác thực chưa sẵn sàng.";
  if (status === "rate_limited") return "Bạn kiểm tra email hơi nhanh, thử lại sau ít phút.";
  if (status === "error") return "Chưa kiểm tra được email lúc này, bạn vẫn có thể tiếp tục.";
  return "";
}

function getSignupPlanContext(planCode: "pro" | "premium") {
  if (planCode === "premium") {
    return {
      name: "LogiVN Premium",
      headline: "Tạo quán trong vài phút",
      description: "Xác thực email rồi mở dashboard với đặt bàn, báo cáo sâu và công cụ vận hành nâng cao.",
      cta: "Bắt đầu miễn phí"
    };
  }

  return {
    name: "LogiVN Pro",
    headline: "Tạo quán trong vài phút",
    description: "Tạo tài khoản, xác thực OTP và thiết lập QR ordering đầu tiên cho quán của bạn.",
    cta: "Tạo quán ngay"
  };
}

function emailStatusBlocksSubmit(status: EmailStatus) {
  return status === "registered" || status === "pending_verification" || status === "delivery_unavailable";
}

function emailStatusTone(status: EmailStatus): "ok" | "warn" | "info" {
  if (status === "available") return "ok";
  if (status === "registered" || status === "pending_verification" || status === "delivery_unavailable" || status === "rate_limited") return "warn";
  return "info";
}

type RegisterAccountFormProps = {
  initialPlanCode?: "pro" | "premium";
  initialSource?: string;
  initialVariant?: string;
  initialContact?: string;
  initialRestaurantName?: string;
  initialBusinessType?: string;
  initialPilotGoal?: string;
};

function isEmailLike(value: string | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

export function RegisterAccountForm({
  initialPlanCode = "pro",
  initialSource,
  initialVariant,
  initialContact,
  initialRestaurantName,
  initialBusinessType,
  initialPilotGoal
}: RegisterAccountFormProps) {
  const [state, action, pending] = useActionState(registerAccountAction, undefined);
  const [email, setEmail] = useState(isEmailLike(initialContact) ? initialContact!.trim().toLowerCase() : "");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const normalizedEmail = email.trim().toLowerCase();
  const passwordReady = isAuthPasswordPolicySatisfied(password) && password === confirmPassword;
  const canSubmit = isValidEmail(email) && passwordReady && !emailStatusBlocksSubmit(emailStatus);
  const onboardingNext = buildOnboardingIntentPath({
    plan: initialPlanCode,
    source: initialSource,
    variant: initialVariant,
    pilotGoal: initialPilotGoal
  });
  const googleNext = `/auth/google?next=${encodeURIComponent(onboardingNext)}`;
  const loginHref = buildDashboardLoginPath({ email: normalizedEmail, next: onboardingNext });
  const forgotPasswordHref = buildForgotPasswordPath({ email: normalizedEmail, next: onboardingNext });
  const verifyEmailHref = `/dashboard/verify-email?email=${encodeURIComponent(normalizedEmail)}&next=${encodeURIComponent(onboardingNext)}`;
  const planContext = getSignupPlanContext(initialPlanCode);
  const showEmailStatus = emailStatus !== "idle" && emailStatus !== "invalid";

  useEffect(() => {
    if (state?.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state?.redirectTo]);

  useEffect(() => {
    if (!email || !isValidEmail(email)) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEmailStatus("checking");
      try {
        const response = await fetch("/api/auth/email-status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
          signal: controller.signal
        });
        const payload = (await response.json()) as { status?: EmailStatus };
        setEmailStatus(payload.status ?? "error");
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[register] email status check failed", error);
          setEmailStatus("error");
        }
      }
    }, 420);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [email, normalizedEmail]);

  return (
    <AuthScaffold>
      <AuthHeader title={planContext.headline} subtitle={planContext.description} />

      <AuthCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{planContext.name}</p>
          <Link
            href="/pricing"
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[var(--d-r-md)] px-3 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-jade)] transition hover:bg-[var(--d-primary-soft)]"
          >
            Đổi gói
          </Link>
        </div>

        <GoogleButton href={googleNext} label="Tiếp tục với Google" />

        <AuthDivider />

        <form action={action} className="grid gap-3">
          <input type="hidden" name="planCode" value={initialPlanCode} />
          <input type="hidden" name="source" value={initialSource || ""} />
          <input type="hidden" name="variant" value={initialVariant || ""} />
          <input type="hidden" name="restaurantName" value={initialRestaurantName || ""} />
          <input type="hidden" name="businessType" value={initialBusinessType || ""} />
          <input type="hidden" name="pilotGoal" value={initialPilotGoal || ""} />

          <AuthField
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="email của bạn"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailStatus("idle");
            }}
          />

          {showEmailStatus ? (
            <AuthAlert tone={emailStatusTone(emailStatus)}>
              <div className="flex items-start gap-2">
                {emailStatus === "checking" ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                ) : emailStatus === "available" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{emailStatusCopy(emailStatus)}</span>
              </div>
              {emailStatus === "registered" ? (
                <div className="mt-2 flex flex-wrap gap-3 text-[length:var(--d-fs-xs)]">
                  <Link href={loginHref} className="inline-flex min-h-9 items-center font-bold underline">
                    Đăng nhập
                  </Link>
                  <Link href={forgotPasswordHref} className="inline-flex min-h-9 items-center font-bold underline">
                    Quên mật khẩu
                  </Link>
                </div>
              ) : null}
              {emailStatus === "pending_verification" ? (
                <Link href={verifyEmailHref} className="mt-2 inline-flex min-h-9 items-center text-[length:var(--d-fs-xs)] font-bold underline">
                  Mở trang xác thực
                </Link>
              ) : null}
              {emailStatus === "delivery_unavailable" ? (
                <p className="mt-2 text-[length:var(--d-fs-xs)] font-semibold leading-5">Vui lòng cấu hình Resend trước khi tạo tài khoản bằng email.</p>
              ) : null}
            </AuthAlert>
          ) : null}

          <AuthField
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <AuthField
            label="Nhập lại mật khẩu"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          {password ? <PasswordPolicyList password={password} confirmPassword={confirmPassword} /> : null}

          {state?.error ? <AuthAlert tone="warn">{state.error}</AuthAlert> : null}

          <AuthSubmit className="mt-1" disabled={pending || !canSubmit}>
            {pending ? "Đang tạo..." : planContext.cta}
          </AuthSubmit>
        </form>

        <p className="mt-5 border-t border-[var(--d-line)] pt-4 text-center text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
          Đã có tài khoản?{" "}
          <Link href={buildDashboardLoginPath({ next: onboardingNext })} className="inline-flex min-h-9 items-center font-bold text-[var(--d-jade)]">
            Đăng nhập
          </Link>
        </p>
      </AuthCard>
    </AuthScaffold>
  );
}
