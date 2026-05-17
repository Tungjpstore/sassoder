"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { registerAccountAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const statusTone = useMemo(() => {
    if (emailStatus === "available") return "border-[#0F4D3A]/20 bg-[#eef7f2] text-[#0F4D3A]";
    if (emailStatus === "registered" || emailStatus === "pending_verification" || emailStatus === "delivery_unavailable" || emailStatus === "rate_limited") {
      return "border-[#F28C28]/35 bg-[#fff7ed] text-[#9a4a17]";
    }
    return "border-[#d8dee9] bg-[#f8fafc] text-[#667085]";
  }, [emailStatus]);

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
    <main className="dashboard-auth-page min-h-svh overflow-x-hidden bg-[#f7f8fa] text-[#111827]">
      <section className="dashboard-auth-shell relative mx-auto flex min-h-svh w-full max-w-[420px] flex-col justify-center px-4 py-6 sm:px-5">
        <div className="mb-4 flex flex-col items-center text-center">
          <LogiVNLogo href="/" className="h-10" priority />
          <h1 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[#111827]">{planContext.headline}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">{planContext.description}</p>
        </div>

        <div className="dashboard-auth-card w-full rounded-lg border border-[#d8dee9] bg-white p-4 sm:p-5">
          <div className="dashboard-auth-action-row mb-4 flex items-center justify-between gap-3 text-sm">
            <p className="truncate text-sm font-black text-[#111827]">{planContext.name}</p>
            <Link href="/pricing" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-3 text-xs font-black text-[#0F4D3A] transition hover:bg-[#eef7f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4D3A]/20">
              Đổi
            </Link>
          </div>

          <a
            href={googleNext}
            className="flex h-12 items-center justify-center gap-3 rounded-md border border-[#d8dee9] bg-white px-5 text-sm font-black text-[#1f2937] transition hover:border-[#0F4D3A]/45 hover:bg-[#f8fbff]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Tiếp tục với Google
          </a>

          <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#98a2b3]">
            <span className="h-px flex-1 bg-[#d8dee9]" />
            hoặc
            <span className="h-px flex-1 bg-[#d8dee9]" />
          </div>

          <form action={action} className="grid gap-3">
            <input type="hidden" name="planCode" value={initialPlanCode} />
            <input type="hidden" name="source" value={initialSource || ""} />
            <input type="hidden" name="variant" value={initialVariant || ""} />
            <input type="hidden" name="restaurantName" value={initialRestaurantName || ""} />
            <input type="hidden" name="businessType" value={initialBusinessType || ""} />
            <input type="hidden" name="pilotGoal" value={initialPilotGoal || ""} />

              <label className="grid gap-2 text-sm font-semibold text-[#344054]">
                Email
                <input
                  name="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailStatus("idle");
                  }}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="email của bạn"
                  className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                />
              </label>

              {emailStatus !== "idle" && emailStatus !== "invalid" ? (
                <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${statusTone}`}>
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
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <Link href={loginHref} className="inline-flex min-h-11 items-center font-black underline">
                        Đăng nhập
                      </Link>
                      <Link href={forgotPasswordHref} className="inline-flex min-h-11 items-center font-black underline">
                        Quên mật khẩu
                      </Link>
                    </div>
                  ) : null}
                  {emailStatus === "pending_verification" ? (
                    <Link href={verifyEmailHref} className="mt-2 inline-flex min-h-11 items-center text-xs font-black underline">
                      Mở trang xác thực
                    </Link>
                  ) : null}
                  {emailStatus === "delivery_unavailable" ? (
                    <p className="mt-2 text-xs font-bold leading-5">
                      Vui lòng cấu hình Resend trước khi tạo tài khoản bằng email.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <label className="grid gap-2 text-sm font-semibold text-[#344054]">
                Mật khẩu
                <span className="relative">
                  <input
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mật khẩu"
                    className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 pr-14 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-0.5 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition hover:bg-[#eef3f9] hover:text-[#111827]"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#344054]">
                Nhập lại mật khẩu
                <span className="relative">
                  <input
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    className="h-12 w-full rounded-md border border-[#d8dee9] bg-[#f8fafc] px-3 pr-14 text-sm font-semibold leading-6 text-[#111827] outline-none transition placeholder:text-[#98a2b3] focus:border-[#0F4D3A]/70 focus:bg-white focus:ring-2 focus:ring-[#0F4D3A]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-0.5 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-md text-[#667085] transition hover:bg-[#eef3f9] hover:text-[#111827]"
                    aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </span>
              </label>

              {password ? <PasswordPolicyList password={password} confirmPassword={confirmPassword} /> : null}

              {state?.error ? (
                <p className="rounded-md border border-[#F28C28]/35 bg-[#fff7ed] px-4 py-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p>
              ) : null}

              <button
                className="mt-1 flex h-12 items-center justify-center rounded-md bg-[#0F4D3A] px-5 text-sm font-black text-white transition hover:bg-[#0b3d2e] disabled:pointer-events-none disabled:opacity-50"
                disabled={pending || !canSubmit}
              >
                {pending ? "Đang tạo..." : planContext.cta}
              </button>
            </form>

            <p className="mt-5 border-t border-[#e5e7eb] pt-4 text-center text-sm text-[#667085]">
              Đã có tài khoản?{" "}
              <Link href={buildDashboardLoginPath({ next: onboardingNext })} className="inline-flex min-h-11 items-center font-black text-[#0F4D3A]">
                Đăng nhập
              </Link>
            </p>
        </div>
      </section>
    </main>
  );
}
