"use client";

import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Minus,
  Lock,
  Mail,
  PartyPopper,
  Plus,
  QrCode,
  Sparkles,
  Star,
  Store,
  Upload
} from "lucide-react";
import { onboardingAction, registerOnboardingAction } from "@/app/dashboard/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { OnboardingCopilotLayer } from "@/components/ai/onboarding-copilot-layer";
import { createSlug } from "@/lib/slug";
import { buildTenantUrl, ROOT_DOMAIN } from "@/lib/tenant-domain";

const businessTypes = [
  { value: "CAFE", label: "Quán cafe", description: "Cà phê, trà, bánh ngọt", hint: "Cafe & Bakery" },
  { value: "RESTAURANT", label: "Quán ăn", description: "Món chính, món kèm, tráng miệng", hint: "Restaurant" },
  { value: "FAST_FOOD", label: "Đồ ăn nhanh", description: "Combo, món lẻ, ăn vặt", hint: "Fast food" },
  { value: "BAR", label: "Bar / pub", description: "Đồ uống, món nhắm", hint: "Bar" },
  { value: "OTHER", label: "Mô hình khác", description: "Tự tuỳ biến sau", hint: "Custom" }
];

const bankSuggestions = ["VCB", "TCB", "ACB", "BIDV", "MB", "VPB", "TPB"];
const draftKey = "logivn:onboarding-draft";
const onboardingSteps = ["Thông tin", "Thực đơn", "Bàn & QR", "Hoàn tất"];
const registerSteps = ["Tài khoản", ...onboardingSteps];
const mapPreviewImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBB8RZcre6xll9lfda0im8Aqid9Zje7w7-YdIQODt5HDtsUTVxDLSC4jm0DiKxgI0Xso2Tcyv3fLjAovZzV-hJH9Vepfj1X-vTbWGMXg1N0GWhuIcMuztTCxDGFoNkB4sCzFqcJPpQlCC_Ew6CjtZgj6_OB2jj3QvM54WNLfXEl4-Aw_T9DafSohQTm_UqIpDcYHNeDW9qymacOTn3Y1Bw14cCFnKRBpLlmPzo6jNDG_RUWYTJnUVLZPn--zCFl0-fUthJbeDF6DxYd";

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";
type Draft = {
  restaurantName: string;
  slug: string;
  slugTouched: boolean;
  businessType: string;
  tableCount: number;
  bankCode: string;
  bankAccount: string;
  bankAccountName: string;
  planCode: "pro" | "premium";
};

const emptyDraft: Draft = {
  restaurantName: "",
  slug: "",
  slugTouched: false,
  businessType: "CAFE",
  tableCount: 24,
  bankCode: "",
  bankAccount: "",
  bankAccountName: "",
  planCode: "pro"
};

type OnboardingFormProps = {
  email?: string;
  mode?: "onboarding" | "register";
  initialPlanCode?: "pro" | "premium";
};

function getSubmitBlockReason(slugState: SlugState, accountReady: boolean) {
  if (!accountReady) {
    return "Vui lòng nhập email hợp lệ và mật khẩu ít nhất 10 ký tự, có chữ hoa và chữ số ở bước tài khoản.";
  }

  if (slugState === "checking") return "LogiVN đang chuẩn bị đường dẫn quán. Vui lòng chờ một chút rồi bấm lại.";
  return "Vui lòng nhập tên quán và số bàn hợp lệ.";
}

export function OnboardingForm({ email = "", mode = "onboarding", initialPlanCode = "pro" }: OnboardingFormProps) {
  const isRegisterMode = mode === "register";
  const activeSteps = isRegisterMode ? registerSteps : onboardingSteps;
  const [state, formAction, pending] = useActionState(isRegisterMode ? registerOnboardingAction : onboardingAction, undefined);
  const [step, setStep] = useState(0);
  const [clientError, setClientError] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [registerEmail, setRegisterEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState(emptyDraft.restaurantName);
  const [slug, setSlug] = useState(emptyDraft.slug);
  const [slugTouched, setSlugTouched] = useState(emptyDraft.slugTouched);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [businessType, setBusinessType] = useState(emptyDraft.businessType);
  const [tableCount, setTableCount] = useState(emptyDraft.tableCount);
  const [bankCode, setBankCode] = useState(emptyDraft.bankCode);
  const [bankAccount, setBankAccount] = useState(emptyDraft.bankAccount);
  const [bankAccountName, setBankAccountName] = useState(emptyDraft.bankAccountName);
  const [planCode, setPlanCode] = useState<"pro" | "premium">(initialPlanCode);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [isPendingSlug, startSlugTransition] = useTransition();

  const previewUrl = useMemo(() => buildTenantUrl(slug || "ten-quan", "/table/ban-1"), [slug]);
  const qrUrl = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(previewUrl)}`,
    [previewUrl]
  );
  const selectedBusiness = businessTypes.find((item) => item.value === businessType) ?? businessTypes[0];
  const setupStep = isRegisterMode ? step - 1 : step;
  const progress = ((step + 1) / activeSteps.length) * 100;

  // AI Copilot state & callbacks
  const aiState = useMemo(
    () => ({
      step: setupStep >= 0 ? setupStep : 0,
      restaurantName,
      slug,
      businessType,
      tableCount,
      planCode,
      bankCode,
      bankAccount
    }),
    [setupStep, restaurantName, slug, businessType, tableCount, planCode, bankCode, bankAccount]
  );
  const handleAiTableCount = useCallback((count: number) => setTableCount(count), []);
  const handleAiBusinessType = useCallback((type: string) => setBusinessType(type), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(draftKey);
        const draft = saved ? ({ ...emptyDraft, ...JSON.parse(saved) } as Draft) : emptyDraft;
        setRestaurantName(draft.restaurantName);
        setSlug(draft.slug);
        setSlugTouched(draft.slugTouched);
        setBusinessType(draft.businessType);
        setTableCount(draft.tableCount);
        setBankCode(draft.bankCode);
        setBankAccount(draft.bankAccount);
        setBankAccountName(draft.bankAccountName);
        setPlanCode(draft.planCode === "premium" ? "premium" : initialPlanCode);
      } finally {
        setDraftLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialPlanCode]);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft: Draft = {
      restaurantName,
      slug,
      slugTouched,
      businessType,
      tableCount,
      bankCode,
      bankAccount,
      bankAccountName,
      planCode
    };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [bankAccount, bankAccountName, bankCode, businessType, draftLoaded, planCode, restaurantName, slug, slugTouched, tableCount]);

  function updateSlug(nextValue: string) {
    setClientError("");
    const nextSlug = createSlug(nextValue);
    setSlug(nextSlug);
    setSlugState(nextSlug.length < 2 ? (nextSlug ? "invalid" : "idle") : "checking");
  }

  useEffect(() => {
    const nextSlug = createSlug(slug);
    if (!nextSlug || nextSlug.length < 2) return;

    const timer = window.setTimeout(() => {
      startSlugTransition(async () => {
        try {
          const response = await fetch(`/api/restaurants/slug?slug=${encodeURIComponent(nextSlug)}`, { cache: "no-store" });
          const json = await response.json();
          setSlugState(json.available ? "available" : "taken");
        } catch {
          setSlugState("invalid");
        }
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [slug]);

  const accountReady = !isRegisterMode || (registerEmail.includes("@") && password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password));
  const canSubmit = accountReady && restaurantName.trim().length >= 2 && tableCount >= 1 && tableCount <= 300;
  const visibleError = clientError || state?.error;
  const canGoNext =
    (isRegisterMode && step === 0 && accountReady) ||
    (setupStep === 0 && restaurantName.trim().length >= 2) ||
    setupStep === 1 ||
    (setupStep === 2 && tableCount >= 1 && tableCount <= 300);

  function nextStep() {
    setClientError("");
    setStep((current) => Math.min(current + 1, activeSteps.length - 1));
  }

  function previousStep() {
    setClientError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  function changeTableCount(delta: number) {
    setTableCount((current) => Math.min(300, Math.max(1, current + delta)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step !== activeSteps.length - 1) return;

    if (!canSubmit) {
      event.preventDefault();
      setClientError(getSubmitBlockReason(slugState, accountReady));
    }
  }

  useEffect(() => {
    if (!state?.redirectTo) return;

    window.localStorage.removeItem(draftKey);
    window.location.assign(state.redirectTo);
  }, [state?.redirectTo]);

  return (
    <>
    <form action={formAction} onSubmit={handleSubmit} className="stitch-onboarding min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {isRegisterMode && (
        <>
          <input type="hidden" name="ownerName" value={ownerName} />
          <input type="hidden" name="email" value={registerEmail} />
          <input type="hidden" name="password" value={password} />
        </>
      )}
      <input type="hidden" name="name" value={restaurantName} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="businessType" value={businessType} />
      <input type="hidden" name="tableCount" value={tableCount} />
      <input type="hidden" name="bankCode" value={bankCode} />
      <input type="hidden" name="bankAccount" value={bankAccount} />
      <input type="hidden" name="bankAccountName" value={bankAccountName} />
      <input type="hidden" name="planCode" value={planCode} />

      <header className="fixed top-0 z-50 w-full border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] shadow-sm backdrop-blur-xl">
        <div className="grid min-h-20 grid-cols-[1fr_auto_1fr] items-center px-6 py-4">
          <div />
          <div className="flex flex-col items-center gap-1">
            <LogiVNLogo href="/" className="h-9" priority />
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">Thiết lập quán</span>
          </div>
          <div className="flex justify-end">
            <Link
              href="/dashboard/login"
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--surface)] px-4 py-2 text-sm font-black text-[var(--primary-strong)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--primary-soft)]"
            >
              {isRegisterMode ? (
                <>
                  <span className="hidden sm:inline">Đã có tài khoản?</span>
                  <span>Đăng nhập</span>
                </>
              ) : (
                "Lưu & thoát"
              )}
            </Link>
          </div>
        </div>
        <div className="h-1 w-full bg-[var(--secondary)]">
          <div className="h-full bg-[var(--primary)] transition-all duration-500 ease-in-out" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-6 pb-36 pt-32 md:px-12">
        {isRegisterMode && step === 0 && (
          <section className="mx-auto max-w-2xl">
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--primary)] bg-[var(--primary-soft)] p-4 shadow-[0_14px_35px_rgba(15,77,58,0.12)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-[var(--primary-strong)]">Bạn đã có tài khoản LogiVN?</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                  Đăng nhập bằng email và mật khẩu, hệ thống sẽ tự mở đúng dashboard của quán.
                </p>
              </div>
              <Link
                href="/dashboard/login"
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] px-5 text-sm font-black text-[#FFF7EB] shadow-[0_12px_28px_rgba(15,77,58,0.22)] transition hover:-translate-y-0.5 hover:bg-[var(--primary-strong)]"
              >
                Đăng nhập
              </Link>
            </div>
            <ProgressLabel step={step} total={activeSteps.length} label={activeSteps[step]} />
            <div className="mb-8">
              <h1 className="mb-2 text-[32px] font-bold leading-10 tracking-normal">Tạo tài khoản quản trị</h1>
              <p className="text-lg leading-7 text-[var(--muted-foreground)]">
                Tài khoản này dùng để quản lý quán, đơn hàng, menu, bàn và thanh toán VietQR. LogiVN sẽ xác thực email trước khi tạo quán.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_10px_30px_rgba(43,43,43,0.08)] backdrop-blur-md">
              <div className="mb-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 sm:grid-cols-2">
                {[
                  {
                    code: "pro",
                    name: "LogiVN Pro",
                    price: "99.000đ/tháng",
                    helper: "QR, đơn realtime, bán online, AI vận hành cơ bản"
                  },
                  {
                    code: "premium",
                    name: "LogiVN Premium",
                    price: "199.000đ/tháng",
                    helper: "Đặt bàn, nhận cọc, AI OCR menu, AI ảnh và báo cáo nâng cao"
                  }
                ].map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => setPlanCode(plan.code as "pro" | "premium")}
                    className={`rounded-lg border p-3 text-left transition ${
                      planCode === plan.code
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--primary)]"
                    }`}
                  >
                    <span className="block text-sm font-black">{plan.name}</span>
                    <span className="mt-1 block text-xs font-bold text-[var(--accent)]">{plan.price} · thử miễn phí 30 ngày</span>
                    <span className="mt-2 block text-xs leading-5 text-[var(--muted-foreground)]">{plan.helper}</span>
                  </button>
                ))}
              </div>
              <a
                href={`/auth/google?next=${encodeURIComponent(`/dashboard/onboarding?plan=${planCode}`)}`}
                className="mb-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-black text-[var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:bg-[var(--primary-soft)]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-container-high)] text-base font-black text-[var(--primary)] shadow-sm">
                  G
                </span>
                Tiếp tục bằng Google
              </a>

              <div className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                <span className="h-px flex-1 bg-[var(--border)]" />
                Hoặc email OTP
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <div className="flex flex-col gap-6">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-5">Họ tên chủ quán</span>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-[var(--outline)]" />
                    <input
                      name="ownerNameInput"
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="Nguyễn Minh Anh"
                      autoComplete="name"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-5">Địa chỉ email</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-[var(--outline)]" />
                    <input
                      name="emailInput"
                      type="email"
                      value={registerEmail}
                      onChange={(event) => {
                        setClientError("");
                        setRegisterEmail(event.target.value);
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="owner@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-5">Mật khẩu</span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-[var(--outline)]" />
                    <input
                      name="passwordInput"
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setClientError("");
                        setPassword(event.target.value);
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="Ít nhất 10 ký tự, có chữ hoa và số"
                      autoComplete="new-password"
                      minLength={10}
                      required
                    />
                  </div>
                </label>
              </div>
            </div>
          </section>
        )}

        {setupStep === 0 && (
          <section className="mx-auto max-w-2xl">
            <ProgressLabel step={step} total={activeSteps.length} label={activeSteps[step]} />
            <div className="mb-8">
              <h1 className="mb-2 text-[32px] font-bold leading-10 tracking-normal">Thông tin cơ bản</h1>
              <p className="text-lg leading-7 text-[var(--muted-foreground)]">
                Bắt đầu với thông tin hiển thị cho khách hàng khi họ quét QR tại bàn.
              </p>
              {!isRegisterMode ? (
                <div className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-1">
                  {[
                    ["pro", "Trial Pro"],
                    ["premium", "Trial Premium"]
                  ].map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setPlanCode(code as "pro" | "premium")}
                      className={`h-10 rounded-lg px-4 text-sm font-black transition ${
                        planCode === code ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_10px_30px_rgba(43,43,43,0.08)] backdrop-blur-md">
              <div className="flex flex-col gap-6">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-5">Tên quán</span>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-[var(--outline)]" />
                    <input
                      name="restaurantNameInput"
                      value={restaurantName}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setRestaurantName(nextName);
                        if (!slugTouched) updateSlug(nextName);
                      }}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="Ví dụ: Phở 24"
                      required
                    />
                  </div>
                </label>

                <div className="rounded-xl border border-[var(--secondary)] bg-[var(--primary-soft)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-sm font-semibold leading-5">Subdomain tự động</span>
                      <p className="mt-2 break-all font-mono text-base font-bold text-[var(--primary)]">
                        https://{slug || "ten-quan"}.{ROOT_DOMAIN}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                        Backend tự sinh từ tên quán. Nếu trùng, hệ thống tự thêm số phía sau để không bị xung đột.
                      </p>
                    </div>
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--primary-strong)]" />
                  </div>
                  <SlugStatus slugState={slugState} isPendingSlug={isPendingSlug} />
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold leading-5">Địa chỉ kinh doanh</span>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-3 h-6 w-6 text-[var(--outline)]" />
                    <textarea
                      className="min-h-28 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] py-3 pl-11 pr-4 text-base leading-6 text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--outline)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="Nhập địa chỉ đầy đủ"
                    />
                  </div>
                  <div className="relative mt-2 h-32 overflow-hidden rounded-lg border border-[var(--border)]/50 bg-[var(--secondary-soft)]">
                    <Image src={mapPreviewImage} alt="Xem trước vị trí quán" fill sizes="640px" className="object-cover opacity-70" />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-[var(--secondary)]/80 to-transparent p-3">
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)]">
                        <MapPin className="h-4 w-4" />
                        Xem trước vị trí
                      </span>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </section>
        )}

        {setupStep === 1 && (
          <section className="relative">
            <div className="pointer-events-none fixed inset-0 -z-0 opacity-40">
              <div className="absolute -left-[10%] -top-[10%] h-[50vw] w-[50vw] rounded-full bg-[var(--secondary)] blur-[100px]" />
              <div className="absolute -bottom-[10%] -right-[10%] h-[40vw] w-[40vw] rounded-full bg-[var(--primary)] opacity-60 blur-[120px]" />
            </div>
            <div className="relative z-10 mb-8 max-w-2xl">
              <ProgressLabel step={step} total={activeSteps.length} label={activeSteps[step]} />
              <h1 className="mb-2 text-[32px] font-bold leading-10 tracking-normal">Thiết lập thực đơn</h1>
              <p className="text-lg leading-7 text-[var(--muted-foreground)]">
                Chọn mô hình quán để LogiVN tự tạo danh mục và món mẫu phù hợp cho ngày đầu vận hành.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
              <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[24px] border border-[var(--border)] bg-[var(--surface)]/75 p-8 text-center shadow-[0_10px_40px_rgba(43,43,43,0.08)] backdrop-blur-2xl lg:col-span-5">
                <div className="flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)]/60 bg-[var(--background)]/30 p-8 transition-colors duration-300 hover:bg-[var(--primary)]/5">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--primary)] shadow-sm">
                    <Upload className="h-8 w-8" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold leading-8">Tải menu PDF</h3>
                  <p className="mb-8 max-w-[270px] text-base leading-6 text-[var(--muted-foreground)]">
                    Có thể dùng AI OCR ở dashboard để đọc menu thật. Bước này tạo sẵn menu mẫu để quán vào vận hành ngay.
                  </p>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-[#FFF7EB] shadow-[0_0_20px_rgba(242,140,40,0.3)]">
                    <Plus className="h-5 w-5" />
                    Chọn sau
                  </span>
                  <span className="mt-4 text-xs font-medium text-[var(--outline)]">Tối đa 10MB (.pdf)</span>
                </div>
              </div>

              <div className="hidden items-center justify-center lg:col-span-2 lg:flex">
                <div className="relative flex h-full items-center justify-center">
                  <div className="absolute h-full w-px bg-gradient-to-b from-transparent via-[var(--border)]/50 to-transparent" />
                  <div className="relative z-10 rounded-full border border-[var(--border)]/40 bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)] shadow-sm">
                    HOẶC
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)]/75 p-6 shadow-[0_10px_40px_rgba(43,43,43,0.08)] backdrop-blur-xl lg:col-span-5">
                <h3 className="mb-1 text-2xl font-bold leading-8">Chọn mô hình quán</h3>
                <p className="mb-6 text-base leading-6 text-[var(--muted-foreground)]">
                  Đây là nền móng để tạo sẵn danh mục, món mẫu và gợi ý vận hành.
                </p>
                <div className="flex flex-col gap-4">
                  {businessTypes.map((item, index) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setBusinessType(item.value)}
                      className={`relative rounded-xl border p-4 text-left shadow-sm transition-all ${
                        businessType === item.value
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[0_0_0_4px_rgba(15,77,58,0.16)]"
                          : "border-[var(--border)]/40 bg-[var(--background)]/80 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <span
                        className={`absolute -left-3 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--background)] text-xs font-medium shadow-sm ${
                          businessType === item.value ? "bg-[var(--primary)] text-[#FFF7EB]" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="block pl-2 text-sm font-semibold text-[var(--outline)]">{item.hint}</span>
                      <span className="mt-1 block pl-2 text-base font-semibold text-[var(--foreground)]">{item.label}</span>
                      <span className="mt-1 block pl-2 text-sm text-[var(--muted-foreground)]">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {setupStep === 2 && (
          <section className="mx-auto max-w-screen-xl">
            <div className="mb-10 text-center md:text-left">
              <ProgressLabel step={step} total={activeSteps.length} label={activeSteps[step]} />
              <h1 className="mb-2 text-[32px] font-bold leading-10 tracking-normal">Bàn, QR & VietQR</h1>
              <p className="text-lg leading-7 text-[var(--muted-foreground)]">Sinh QR riêng cho từng bàn và chuẩn bị tài khoản nhận chuyển khoản.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="relative flex min-h-[340px] flex-col items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] p-6 shadow-[0_10px_30px_rgba(43,43,43,0.08)] md:col-span-5">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--primary-soft)]/40 to-transparent" />
                <div className="relative z-10 w-full text-center">
                  <h2 className="mb-2 text-2xl font-bold leading-8">Tổng số bàn</h2>
                  <p className="mx-auto mb-8 max-w-xs text-base leading-6 text-[var(--muted-foreground)]">
                    Điều chỉnh số bàn đang hoạt động tại quán.
                  </p>
                </div>
                <div className="relative z-10 flex w-full max-w-[270px] items-center justify-between rounded-full border border-[var(--secondary)] bg-[var(--background)] p-2 shadow-inner">
                  <button
                    type="button"
                    onClick={() => changeTableCount(-1)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--border)]/50"
                    aria-label="Giảm số bàn"
                  >
                    <Minus className="h-6 w-6" />
                  </button>
                  <input
                    value={tableCount}
                    onChange={(event) => setTableCount(Math.min(300, Math.max(1, Number(event.target.value) || 1)))}
                    className="w-24 bg-transparent text-center text-[48px] font-extrabold leading-[56px] tracking-normal text-[var(--primary)] outline-none"
                    inputMode="numeric"
                    aria-label="Số bàn"
                  />
                  <button
                    type="button"
                    onClick={() => changeTableCount(1)}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-[#FFF7EB] shadow-[0_0_15px_rgba(15,77,58,0.35)] transition-colors hover:bg-[var(--primary-strong)]"
                    aria-label="Tăng số bàn"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-[340px] flex-col items-center justify-center overflow-hidden rounded-xl bg-[var(--primary)] p-6 shadow-[0_10px_30px_rgba(15,77,58,0.24)] md:col-span-7">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent" />
                <div className="relative z-10 mb-4 flex w-full items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wider text-[#FFF7EB]/90">Live preview</span>
                  <QrCode className="h-6 w-6 text-[#FFF7EB]/70" />
                </div>
                <div className="relative z-10 flex w-full max-w-[300px] flex-col items-center gap-3 rounded-xl bg-[var(--surface-strong)] p-6 shadow-xl ring-1 ring-[var(--border)] backdrop-blur-md">
                  <div className="w-full border-b border-[var(--secondary)] pb-2 text-center text-sm font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                    {restaurantName || "LogiVN Cafe"}
                  </div>
                  <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)]/20 bg-[var(--secondary)] p-2">
                    <Image src={qrUrl} alt="Xem trước QR bàn" width={190} height={190} className="h-full w-full object-cover mix-blend-multiply" />
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-bold leading-8 text-[var(--primary)]">Bàn 14</span>
                    <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Quét để gọi món & thanh toán</p>
                  </div>
                </div>
                <div className="relative z-10 mt-4 flex gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)]/40" />
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)]/40" />
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-[0_10px_30px_rgba(43,43,43,0.08)] backdrop-blur-md md:col-span-12 md:grid-cols-3">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-[var(--primary)]">
                    <Banknote className="h-5 w-5" />
                    <h2 className="font-bold">Thông tin VietQR</h2>
                  </div>
                  <p className="text-sm leading-6 text-[var(--muted-foreground)]">Có thể bỏ qua và bổ sung ở Cài đặt thanh toán sau.</p>
                </div>
                <label className="grid gap-2 text-sm font-semibold">
                  Ngân hàng
                  <input
                    name="bankCodeInput"
                    list="bank-codes"
                    value={bankCode}
                    onChange={(event) => setBankCode(event.target.value.toUpperCase())}
                    className="h-12 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 text-base outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                    placeholder="VCB"
                  />
                  <datalist id="bank-codes">
                    {bankSuggestions.map((bank) => (
                      <option key={bank} value={bank} />
                    ))}
                  </datalist>
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    Số tài khoản
                    <input
                      name="bankAccountInput"
                      inputMode="numeric"
                      value={bankAccount}
                      onChange={(event) => setBankAccount(event.target.value.replace(/\D/g, ""))}
                      className="h-12 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 text-base outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="1234567890"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Chủ tài khoản
                    <input
                      name="bankAccountNameInput"
                      value={bankAccountName}
                      onChange={(event) => setBankAccountName(event.target.value)}
                      className="h-12 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 text-base outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--secondary)]"
                      placeholder="CONG TY ABC"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}

        {setupStep === 3 && (
          <section className="relative flex min-h-[calc(100vh-15rem)] items-center justify-center overflow-hidden">
            <div className="pointer-events-none absolute -left-[10%] -top-[10%] h-[60%] w-[60%] rounded-full bg-[var(--primary-strong)]/30 mix-blend-multiply blur-[100px]" />
            <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] h-[50%] w-[50%] rounded-full bg-[var(--primary-strong)]/20 mix-blend-multiply blur-[100px]" />
            <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-8 rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 text-center shadow-[0_10px_40px_rgba(43,43,43,0.12)] backdrop-blur-xl">
              <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-[var(--primary-strong)] text-[#FFF7EB] shadow-[0_0_40px_rgba(15,77,58,0.3)]">
                <PartyPopper className="h-16 w-16" />
                <div className="absolute -right-4 top-0 rounded-full border border-[#FFF7EB]/20 bg-[var(--primary-strong)] p-2 text-[#FFF7EB] shadow-sm">
                  <Star className="h-5 w-5" />
                </div>
                <div className="absolute -left-5 bottom-4 rounded-full border border-[#FFF7EB]/20 bg-[var(--accent)] p-2 text-[#FFF7EB] shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div>
                <h1 className="text-[48px] font-extrabold leading-[56px] tracking-normal">Sẵn sàng lên sóng!</h1>
                <p className="mx-auto mt-3 max-w-sm text-lg leading-7 text-[var(--muted-foreground)]">
                  Xác nhận lần cuối. Nếu đăng ký bằng email, LogiVN sẽ gửi mã OTP trước khi tạo quán, sinh {tableCount} QR bàn và cấu hình thanh toán.
                </p>
              </div>
              <div className="grid w-full gap-3 text-left text-sm">
                <SummaryRow label="Tên quán" value={restaurantName || "Chưa nhập"} />
                <SummaryRow label="Đường dẫn" value={previewUrl} />
                <SummaryRow label="Mô hình" value={selectedBusiness.label} />
                <SummaryRow label="Gói dùng thử" value={planCode === "premium" ? "LogiVN Premium" : "LogiVN Pro"} />
                <SummaryRow label="Số bàn" value={`${tableCount} bàn`} />
                <SummaryRow label="VietQR" value={bankCode && bankAccount ? `${bankCode} · ${bankAccount}` : "Bổ sung sau"} />
              </div>
              {state?.success && (
                <p className="w-full rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] p-3 text-sm text-[var(--primary-strong)]">
                  {state.success}
                </p>
              )}
              {visibleError && <p className="w-full rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{visibleError}</p>}
            </div>
          </section>
        )}
      </main>

      {visibleError && step !== activeSteps.length - 1 && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)] shadow-lg">
          {visibleError}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-[var(--border)] bg-[var(--surface)]/90 px-4 py-4 shadow-[0_-18px_42px_rgba(43,43,43,0.12)] backdrop-blur-2xl md:px-8">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {step === 0 ? (
            <Link
              href="/"
              className="inline-flex h-14 min-w-[112px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--text-secondary)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary-strong)]"
            >
              <ChevronLeft className="h-5 w-5" />
              <span>Trang chủ</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={previousStep}
              className="inline-flex h-14 min-w-[112px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--text-secondary)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary-strong)]"
            >
              <ChevronLeft className="h-5 w-5" />
              <span>Quay lại</span>
            </button>
          )}

          {step < activeSteps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canGoNext}
              className="inline-flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.32)] transition-all hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-[0_22px_44px_rgba(242,140,40,0.38)] disabled:pointer-events-none disabled:opacity-50"
            >
              <span>{step === activeSteps.length - 2 ? "Xem lại" : "Tiếp tục"}</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending || Boolean(state?.redirectTo)}
              aria-disabled={!canSubmit || pending || Boolean(state?.redirectTo)}
              className={`inline-flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-black text-[#FFF7EB] shadow-[0_18px_36px_rgba(242,140,40,0.32)] transition-all hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] hover:shadow-[0_22px_44px_rgba(242,140,40,0.38)] disabled:pointer-events-none disabled:opacity-50 ${
                !canSubmit && !pending ? "opacity-70" : ""
              }`}
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              <span>{pending ? "Đang tạo quán" : state?.redirectTo ? "Đang mở dashboard" : "Hoàn tất đăng ký"}</span>
            </button>
          )}
        </div>
      </nav>
    </form>
    <OnboardingCopilotLayer
      state={aiState}
      onApplyTableCount={handleAiTableCount}
      onApplyBusinessType={handleAiBusinessType}
    />
    </>
  );
}

function ProgressLabel({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--primary)]">{label}</span>
        <span className="text-sm font-semibold text-[var(--muted-foreground)]">{Math.round(((step + 1) / total) * 100)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--secondary)]">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all duration-500 ease-in-out"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function SlugStatus({ slugState, isPendingSlug }: { slugState: SlugState; isPendingSlug: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
      {(slugState === "checking" || isPendingSlug) && <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />}
      {slugState === "available" && <CheckCircle2 className="h-4 w-4 text-[var(--primary-strong)]" />}
      <span>
        {slugState === "available" && "Đường dẫn còn trống"}
        {slugState === "taken" && "Đường dẫn dự kiến đã trùng, backend sẽ tự thêm số khi tạo quán"}
        {slugState === "invalid" && "Backend sẽ chuẩn hoá lại đường dẫn khi tạo quán"}
        {(slugState === "checking" || isPendingSlug) && "Đang chuẩn bị đường dẫn dự kiến"}
        {slugState === "idle" && "Đường dẫn sẽ tự sinh từ tên quán"}
      </span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-lg border border-[var(--secondary)] bg-[var(--background)] px-4 py-3">
      <span className="shrink-0 text-[var(--muted-foreground)]">{label}</span>
      <strong className="break-all text-right text-[var(--foreground)]">{value}</strong>
    </div>
  );
}
