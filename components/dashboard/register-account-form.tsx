"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { registerAccountAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { PasswordPolicyList } from "@/components/dashboard/password-policy-list";
import { isAuthPasswordPolicySatisfied } from "@/lib/auth-password-policy";

type EmailStatus = "idle" | "checking" | "available" | "registered" | "pending_verification" | "invalid" | "error" | "rate_limited";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function emailStatusCopy(status: EmailStatus) {
  if (status === "checking") return "Đang kiểm tra email...";
  if (status === "available") return "Email này có thể đăng ký.";
  if (status === "registered") return "Email này đã có tài khoản LogiVN.";
  if (status === "pending_verification") return "Email này đang chờ xác thực.";
  if (status === "rate_limited") return "Bạn kiểm tra email hơi nhanh, thử lại sau ít phút.";
  if (status === "error") return "Chưa kiểm tra được email lúc này.";
  return "";
}

export function RegisterAccountForm({ initialPlanCode = "pro" }: { initialPlanCode?: "pro" | "premium" }) {
  const [state, action, pending] = useActionState(registerAccountAction, undefined);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();
  const passwordReady = isAuthPasswordPolicySatisfied(password) && password === confirmPassword;
  const canSubmit = isValidEmail(email) && passwordReady && emailStatus !== "registered" && emailStatus !== "pending_verification";
  const googleNext = `/auth/google?next=${encodeURIComponent(initialPlanCode === "premium" ? "/dashboard/onboarding?plan=premium" : "/dashboard/onboarding?plan=pro")}`;

  const statusTone = useMemo(() => {
    if (emailStatus === "available") return "border-[#b9d7bd] bg-[#edf7eb] text-[#0b5f3d]";
    if (emailStatus === "registered" || emailStatus === "pending_verification" || emailStatus === "rate_limited") {
      return "border-[#ffd3ad] bg-[#fff1e8] text-[#9a4a17]";
    }
    return "border-[#e5d8c4] bg-white/70 text-[#68766b]";
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
    <main className="min-h-screen overflow-hidden bg-[#fff8ec] text-[#102a1f]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(15,77,58,0.11),transparent_34%),radial-gradient(circle_at_92%_12%,rgba(242,140,40,0.08),transparent_24%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col justify-center px-5 py-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <LogiVNLogo href="/" className="h-9" priority />
          <div className="mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-[#0f4d3a] shadow-[0_16px_36px_rgba(15,77,58,0.18)]">
            <Sparkles className="h-5 w-5 text-[#fff8ec]" />
          </div>
          <h1 className="mt-5 text-[28px] font-black tracking-[-0.05em] text-[#102a1f]">Tạo tài khoản</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#647267]">Đăng ký xong, bạn sẽ xác thực email rồi vào onboarding tạo quán.</p>
        </div>

        <div className="w-full rounded-[32px] border border-[#123b2b]/10 bg-[#fffdf8]/92 p-4 shadow-[0_24px_80px_rgba(15,77,58,0.08)] backdrop-blur sm:p-5">

          <a href={googleNext} className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-[#123b2b]/10 bg-white px-5 text-sm font-black text-[#21352a] transition hover:border-[#0f4d3a]/35 hover:bg-white">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm">G</span>
            Tiếp tục với Google
          </a>

          <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#9b8d78]">
            <span className="h-px flex-1 bg-[#dfd2bd]" />
            hoặc đăng ký email
            <span className="h-px flex-1 bg-[#dfd2bd]" />
          </div>

          <form action={action} className="grid gap-3">
            <input type="hidden" name="planCode" value={initialPlanCode} />
            <label className="grid gap-2 text-sm font-bold text-[#21352a]">
              Email
              <span className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a877b]" />
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
                  className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-4 text-sm font-semibold outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                />
              </span>
            </label>

            {emailStatus !== "idle" && emailStatus !== "invalid" ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${statusTone}`}>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{emailStatusCopy(emailStatus)}</span>
                </div>
                {emailStatus === "registered" ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href={`/dashboard/login?email=${encodeURIComponent(normalizedEmail)}`} className="font-black underline">Đăng nhập</Link>
                    <Link href={`/dashboard/forgot-password?email=${encodeURIComponent(normalizedEmail)}`} className="font-black underline">Quên mật khẩu</Link>
                  </div>
                ) : null}
                {emailStatus === "pending_verification" ? (
                  <Link href={`/verify-email?email=${encodeURIComponent(normalizedEmail)}`} className="mt-2 block text-xs font-black underline">
                    Mở trang xác thực
                  </Link>
                ) : null}
              </div>
            ) : null}

            <label className="grid gap-2 text-sm font-bold text-[#21352a]">
              Mật khẩu
              <span className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a877b]" />
                <input
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Mật khẩu"
                  className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-12 text-sm font-semibold outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7a877b]" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <label className="grid gap-2 text-sm font-bold text-[#21352a]">
              Nhập lại mật khẩu
              <span className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a877b]" />
                <input
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-12 text-sm font-semibold outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                />
                <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#7a877b]" aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {password ? <PasswordPolicyList password={password} confirmPassword={confirmPassword} /> : null}

            {state?.error ? (
              <p className="rounded-2xl border border-[#e59665]/30 bg-[#fff1e8] px-4 py-3 text-sm font-semibold text-[#9a4a17]">{state.error}</p>
            ) : null}

            <button
              className="mt-1 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0f4d3a] px-5 text-sm font-black text-[#fffaf1] shadow-[0_16px_36px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              disabled={pending || !canSubmit}
            >
              {pending ? "Đang tạo..." : "Đăng ký"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-5 border-t border-[#123b2b]/10 pt-4 text-center text-sm text-[#68766b]">
            Đã có tài khoản?{" "}
            <Link href="/dashboard/login" className="font-black text-[#c36513]">
              Đăng nhập
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
