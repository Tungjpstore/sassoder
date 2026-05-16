"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
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

function getSignupPlanContext(planCode: "pro" | "premium") {
  if (planCode === "premium") {
    return {
      code: "premium",
      name: "LogiVN Premium",
      price: "199K",
      badge: "AI + vận hành sâu",
      headline: "Bắt đầu Premium để mở nhiều đòn bẩy vận hành hơn ngay từ onboarding.",
      description:
        "Phù hợp với quán muốn dùng AI assistant, đặt bàn, báo cáo sâu, nhân sự và tồn kho sau khi đưa QR ordering vào thực tế.",
      benefits: ["AI insight cho doanh thu và giờ cao điểm", "Đặt bàn, nhận cọc và báo cáo nâng cao", "Sẵn sàng mở rộng quy trình nhân sự, tồn kho"]
    };
  }

  return {
    code: "pro",
    name: "LogiVN Pro",
    price: "99K",
    badge: "Khởi động nhanh",
    headline: "Bắt đầu Pro để đưa QR ordering vào quán trong vài bước.",
    description:
      "Phù hợp với quán cafe, trà sữa, nhà hàng nhỏ muốn thay menu giấy, nhận order tại bàn và theo dõi đơn trên dashboard.",
    benefits: ["QR ordering và order tại bàn", "Dashboard quản lý đơn theo thời gian thực", "Dùng thử trước, nâng cấp khi quán cần thêm"]
  };
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
  const planContext = getSignupPlanContext(initialPlanCode);

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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(15,77,58,0.12),transparent_30%),radial-gradient(circle_at_92%_12%,rgba(242,140,40,0.1),transparent_24%)]" />
      <section className="relative mx-auto grid min-h-screen w-full max-w-[1040px] items-center gap-6 px-5 py-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="order-2 lg:order-1">
          <div className="hidden lg:block">
            <LogiVNLogo href="/" className="h-11" priority />
          </div>
          <div className="mt-8 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#0f4d3a]/10 bg-white/70 px-4 text-xs font-black uppercase tracking-normal text-[#c36513]">
            <Sparkles className="h-4 w-4" />
            {planContext.badge}
          </div>
          <h1 className="mt-5 max-w-[560px] text-[36px] font-black leading-[1.02] tracking-normal text-[#102a1f] sm:text-[48px]">
            {planContext.headline}
          </h1>
          <p className="mt-4 max-w-[520px] text-[15px] font-semibold leading-7 text-[#647267]">{planContext.description}</p>

          <div className="mt-6 rounded-[30px] border border-[#123b2b]/10 bg-[#fffdf8]/80 p-5 shadow-[0_20px_60px_rgba(15,77,58,0.08)] backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-[#c36513]">Gói đang chọn</p>
                <h2 className="mt-2 text-2xl font-black text-[#102a1f]">{planContext.name}</h2>
              </div>
              <strong className="rounded-2xl bg-[#0f4d3a] px-4 py-3 text-xl font-black text-[#fff8ec]">
                {planContext.price}
                <span className="text-xs font-bold opacity-80">/ tháng</span>
              </strong>
            </div>

            <div className="mt-5 grid gap-3">
              {planContext.benefits.map((benefit) => (
                <div className="flex items-start gap-3 text-sm font-bold leading-6 text-[#214032]" key={benefit}>
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#0f4d3a]" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3 border-t border-[#123b2b]/10 pt-4 text-sm font-bold text-[#68766b]">
              <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#0f4d3a]/[0.07] px-3">
                <ShieldCheck className="h-4 w-4 text-[#0f4d3a]" />
                Dùng thử trước
              </span>
              <span className="inline-flex min-h-9 items-center rounded-full bg-[#f28c28]/10 px-3 text-[#9a4a17]">
                Không cần thẻ tín dụng
              </span>
              <Link href="/pricing" className="inline-flex min-h-11 items-center px-3 font-black text-[#c36513] underline">
                Đổi gói
              </Link>
            </div>
          </div>
        </div>

        <div className="order-1 w-full lg:order-2">
          <div className="mb-5 text-center lg:hidden">
            <LogiVNLogo href="/" className="mx-auto h-11" priority />
          </div>

          <div className="w-full rounded-[32px] border border-[#123b2b]/10 bg-[#fffdf8]/92 p-4 shadow-[0_24px_80px_rgba(15,77,58,0.1)] backdrop-blur sm:p-5">
            <div className="mb-5 rounded-[24px] bg-[#0f4d3a] p-5 text-[#fff8ec]">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-white/12 px-3 py-2 text-xs font-black uppercase tracking-normal">
                  {planContext.code.toUpperCase()}
                </span>
              </div>
              <h2 className="mt-4 text-[28px] font-black leading-tight tracking-normal">Tạo tài khoản LogiVN</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#fff8ec]/75">
                Đăng ký xong, bạn xác thực email rồi vào onboarding tạo quán, menu và bàn đầu tiên.
              </p>
            </div>

            <a
              href={googleNext}
              className="flex h-12 items-center justify-center gap-3 rounded-2xl border border-[#123b2b]/10 bg-white px-5 text-sm font-black text-[#21352a] transition hover:border-[#0f4d3a]/35 hover:bg-white"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm">G</span>
              Tiếp tục với Google
            </a>

            <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-normal text-[#9b8d78]">
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
                      <Link href={`/dashboard/login?email=${encodeURIComponent(normalizedEmail)}`} className="inline-flex min-h-11 items-center font-black underline">
                        Đăng nhập
                      </Link>
                      <Link href={`/dashboard/forgot-password?email=${encodeURIComponent(normalizedEmail)}`} className="inline-flex min-h-11 items-center font-black underline">
                        Quên mật khẩu
                      </Link>
                    </div>
                  ) : null}
                  {emailStatus === "pending_verification" ? (
                    <Link href={`/verify-email?email=${encodeURIComponent(normalizedEmail)}`} className="mt-2 inline-flex min-h-11 items-center text-xs font-black underline">
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
                    className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-14 text-sm font-semibold outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-[#7a877b] transition hover:bg-[#0f4d3a]/5 hover:text-[#102a1f]"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                    className="h-12 w-full rounded-2xl border border-[#123b2b]/12 bg-[#fffdf8] pl-11 pr-14 text-sm font-semibold outline-none transition placeholder:text-[#7c877b]/55 focus:border-[#0f4d3a]/70 focus:ring-2 focus:ring-[#0f4d3a]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl text-[#7a877b] transition hover:bg-[#0f4d3a]/5 hover:text-[#102a1f]"
                    aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                {pending ? "Đang tạo..." : "Tạo tài khoản và vào onboarding"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-5 border-t border-[#123b2b]/10 pt-4 text-center text-sm text-[#68766b]">
              Đã có tài khoản?{" "}
              <Link href="/dashboard/login" className="inline-flex min-h-11 items-center font-black text-[#c36513]">
                Đăng nhập
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
