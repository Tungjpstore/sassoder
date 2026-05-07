"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  Copy,
  Gift,
  ImageIcon,
  Loader2,
  Megaphone,
  PenLine,
  Rocket,
  Sparkles,
  Store,
  Utensils,
  Wand2
} from "lucide-react";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type SetupItem = {
  key: string;
  label: string;
  group: string;
  status: "done" | "missing" | "warning";
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  route: string;
  weight: number;
};

type SetupReadiness = {
  score: number;
  completedCount: number;
  totalCount: number;
  criticalMissing: SetupItem[];
  nextActions: SetupItem[];
  items: SetupItem[];
};

type SetupPlanData = {
  summary?: string;
  readinessScore?: number;
  launchBlockers?: string[];
  expressSetup?: Array<{
    title: string;
    why: string;
    where: string;
    estimatedMinutes: number;
    priority: SetupItem["priority"];
  }>;
  aiAutopilot?: Array<{
    feature: string;
    value: string;
    plan: "pro" | "premium" | "any";
  }>;
  customerExperience?: string[];
  ownerMessage?: string;
};

type SetupPlanResponse = {
  provider?: string;
  model?: string;
  text?: string;
  data?: SetupPlanData | null;
  readiness?: SetupReadiness;
};

type DraftKind = "brand_profile" | "menu_blueprint" | "online_delivery" | "reservation_policy" | "promotion_launch" | "voice_ops";

type SetupDraftData = {
  kind?: string;
  title?: string;
  confidence?: number;
  requiresPlan?: "pro" | "premium" | "any";
  route?: string;
  quickWins?: string[];
  draft?: {
    fields?: Array<{ label: string; value: string; copySafe?: boolean }>;
    settings?: Array<{ key: string; value: string | number | boolean; reason: string }>;
    prompts?: Array<{ label: string; prompt: string; warning?: string | null }>;
    checklist?: string[];
  };
  ownerNote?: string;
};

type SetupDraftResponse = {
  provider?: string;
  model?: string;
  data?: SetupDraftData | null;
  config?: {
    kind: DraftKind;
    label: string;
    route: string;
    plan: "pro" | "premium" | "any";
  };
};

type BrandingResponse = {
  provider?: string;
  model?: string;
  data?: {
    slogans?: string[];
    description?: string;
    brandVoice?: string;
    logoPrompt?: string;
    menuHeroPrompt?: string;
  } | null;
};

type ImageResponse = {
  imageUrl?: string | null;
  prompt?: string;
  provider?: string;
  model?: string;
};

const modeOptions = [
  { mode: "audit", label: "Quét toàn bộ", icon: Sparkles },
  { mode: "express", label: "Setup 30 phút", icon: Rocket },
  { mode: "growth", label: "Pro/Premium", icon: Wand2 }
] as const;

const draftOptions = [
  { kind: "brand_profile", label: "Thương hiệu", icon: Store },
  { kind: "menu_blueprint", label: "Khung menu", icon: Utensils },
  { kind: "online_delivery", label: "Giao hàng", icon: Bike },
  { kind: "reservation_policy", label: "Đặt bàn", icon: CheckCircle2 },
  { kind: "promotion_launch", label: "Khuyến mãi", icon: Gift },
  { kind: "voice_ops", label: "Giọng nói", icon: Megaphone }
] as const;

function priorityLabel(priority: SetupItem["priority"]) {
  if (priority === "critical") return "Bắt buộc";
  if (priority === "high") return "Cao";
  if (priority === "medium") return "Vừa";
  return "Thấp";
}

function statusTone(status: SetupItem["status"]) {
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

export function AiSetupStudio({
  readiness,
  restaurantName
}: {
  readiness: SetupReadiness;
  restaurantName: string;
}) {
  const [loadingMode, setLoadingMode] = useState<(typeof modeOptions)[number]["mode"] | null>(null);
  const [loadingDraftKind, setLoadingDraftKind] = useState<DraftKind | null>(null);
  const [focus, setFocus] = useState("");
  const [plan, setPlan] = useState<SetupPlanResponse | null>(null);
  const [draft, setDraft] = useState<SetupDraftResponse | null>(null);
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [imageResult, setImageResult] = useState<ImageResponse | null>(null);
  const [quickLoading, setQuickLoading] = useState<"branding" | "logo" | "menu_preview" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSetupPlan(mode: (typeof modeOptions)[number]["mode"]) {
    setLoadingMode(mode);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/setup-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, focus: focus.trim() || undefined })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<SetupPlanResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa tạo được kế hoạch setup.");
      setPlan(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được AI setup.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function runSetupDraft(kind: DraftKind) {
    setLoadingDraftKind(kind);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/setup-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, focus: focus.trim() || undefined })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<SetupDraftResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa tạo được bản nháp setup.");
      setDraft(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được AI tạo bản nháp.");
    } finally {
      setLoadingDraftKind(null);
    }
  }

  async function runBranding() {
    setQuickLoading("branding");
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/branding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantName,
          tone: focus.trim() || "hiện đại, dễ tin, có tinh thần Việt",
          audience: "khách địa phương, dân văn phòng và nhóm khách quen"
        })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<BrandingResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa tạo được bộ thương hiệu.");
      setBranding(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được AI thương hiệu.");
    } finally {
      setQuickLoading(null);
    }
  }

  async function runImage(kind: "logo" | "menu_preview") {
    setQuickLoading(kind);
    setError(null);
    try {
      const creativePrompt =
        kind === "logo"
          ? branding?.data?.logoPrompt || `Biểu tượng thương hiệu cho ${restaurantName}, không chữ, dễ dùng làm avatar.`
          : branding?.data?.menuHeroPrompt || `Ảnh cover menu cho ${restaurantName}, có khoảng trống để LogiVN chèn chữ.`;
      const response = await fetch("/api/admin/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, restaurantName, prompt: creativePrompt })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ImageResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "AI chưa tạo được ảnh.");
      setImageResult(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được AI tạo ảnh.");
    } finally {
      setQuickLoading(null);
    }
  }

  async function copyText(value?: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  const activeReadiness = plan?.readiness ?? readiness;
  const planData = plan?.data ?? null;
  const draftData = draft?.data ?? null;
  const brandingData = branding?.data ?? null;

  return (
    <section className="dashboard-panel overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-b border-[var(--border)] bg-[var(--soft-surface)] p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">AI Setup Studio</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">{restaurantName}</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Quét cấu hình và biến việc setup thành checklist có thứ tự.</p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary)] text-white">
              <Sparkles size={19} />
            </span>
          </div>

          <div className="mt-5 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Mức sẵn sàng</p>
                <p className="metric-number mt-1 text-3xl font-semibold text-[var(--foreground)]">{activeReadiness.score}%</p>
              </div>
              <p className="text-right text-sm font-semibold text-[var(--muted-foreground)]">
                {activeReadiness.completedCount}/{activeReadiness.totalCount} mục
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--soft-surface)]">
              <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${activeReadiness.score}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {activeReadiness.nextActions.slice(0, 4).map((item) => (
              <Link key={item.key} href={item.route} className="group rounded-xl border border-[var(--border)] bg-white p-3 transition hover:border-[var(--primary)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{item.action}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(item.status)}`}>{priorityLabel(item.priority)}</span>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                  Mở cấu hình
                  <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
              Mục tiêu setup
              <input
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="VD: quán cafe nhỏ, muốn bật QR tại bàn trước rồi mới bật giao hàng..."
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium outline-none focus:border-[var(--primary)]"
              />
            </label>
            <div className="flex items-end gap-2 overflow-x-auto">
              {modeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => void runSetupPlan(option.mode)}
                    disabled={Boolean(loadingMode)}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                  >
                    {loadingMode === option.mode ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">AI thao tác nhanh</p>
                <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                  Tạo kết quả có thể dùng ngay, sau đó mở đúng màn để áp dụng.
                </p>
              </div>
              <div className="flex max-w-full gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => void runBranding()}
                  disabled={Boolean(quickLoading)}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                >
                  {quickLoading === "branding" ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
                  Slogan & mô tả
                </button>
                <button
                  type="button"
                  onClick={() => void runImage("logo")}
                  disabled={Boolean(quickLoading)}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                >
                  {quickLoading === "logo" ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  Tạo logo
                </button>
                <button
                  type="button"
                  onClick={() => void runImage("menu_preview")}
                  disabled={Boolean(quickLoading)}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                >
                  {quickLoading === "menu_preview" ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
                  Ảnh menu preview
                </button>
              </div>
            </div>

            {(brandingData || imageResult) ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {brandingData ? (
                  <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Bộ nội dung thương hiệu</p>
                      <Link href="/dashboard/settings?section=profile" className="text-xs font-semibold text-[var(--primary)]">
                        Áp dụng
                      </Link>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(brandingData.slogans ?? []).slice(0, 3).map((slogan) => (
                        <button
                          key={slogan}
                          type="button"
                          onClick={() => void copyText(slogan)}
                          className="flex items-center justify-between gap-3 rounded-lg bg-[var(--soft-surface)] px-3 py-2 text-left text-sm font-semibold text-[var(--foreground)]"
                        >
                          <span>{slogan}</span>
                          <Copy size={14} className="shrink-0 text-[var(--muted-foreground)]" />
                        </button>
                      ))}
                      {brandingData.description ? (
                        <button
                          type="button"
                          onClick={() => void copyText(brandingData.description)}
                          className="rounded-lg bg-[var(--soft-surface)] px-3 py-2 text-left text-xs leading-5 text-[var(--muted-foreground)]"
                        >
                          {brandingData.description}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {imageResult ? (
                  <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Ảnh AI tạo</p>
                      <button type="button" onClick={() => void copyText(imageResult.imageUrl || imageResult.prompt)} className="text-xs font-semibold text-[var(--primary)]">
                        Copy
                      </button>
                    </div>
                    {imageResult.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageResult.imageUrl} alt="Ảnh AI tạo cho quán" className="mt-3 aspect-video w-full rounded-lg border border-[var(--border)] object-cover" />
                    ) : (
                      <p className="mt-3 rounded-lg bg-[var(--soft-surface)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
                        Chưa có URL ảnh từ provider. Prompt đã sẵn sàng để dùng lại: {imageResult.prompt}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                      {imageResult.provider} · {imageResult.model}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Bản nháp theo khu vực</p>
              <div className="flex max-w-full gap-2 overflow-x-auto">
                {draftOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => void runSetupDraft(option.kind)}
                      disabled={Boolean(loadingDraftKind)}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-60"
                    >
                      {loadingDraftKind === option.kind ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
          ) : null}

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--soft-surface)] text-[var(--primary)]">
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">
                    {planData?.summary || "Kế hoạch AI sẽ xuất hiện ở đây"}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                    {planData?.ownerMessage || "Bấm Quét toàn bộ để AI đọc readiness và tạo lộ trình setup theo dữ liệu quán hiện tại."}
                  </p>
                </div>
              </div>

              {planData?.launchBlockers?.length ? (
                <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <p className="text-sm font-semibold text-orange-800">Chặn bán thật</p>
                  <ul className="mt-2 grid gap-1 text-sm text-orange-800">
                    {planData.launchBlockers.map((blocker) => (
                      <li key={blocker}>- {blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 grid gap-2">
                {(planData?.expressSetup ?? []).slice(0, 5).map((step) => (
                  <Link key={`${step.title}-${step.where}`} href={step.where} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 transition hover:border-[var(--primary)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{step.why}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--border)] bg-white px-2 py-1 text-[10px] font-bold text-[var(--muted-foreground)]">
                        {step.estimatedMinutes} phút
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {!planData?.expressSetup?.length ? (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-medium text-[var(--muted-foreground)]">
                  AI sẽ trả về kế hoạch gồm việc bắt buộc, nơi thao tác và thời gian dự kiến.
                </div>
              ) : null}

              {draftData ? (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                        {draft?.config?.label || "Bản nháp setup"}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-[var(--foreground)]">{draftData.title || "Bản nháp AI"}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{draftData.ownerNote}</p>
                    </div>
                    <Link
                      href={draftData.route || draft?.config?.route || "/dashboard/settings"}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white"
                    >
                      Mở nơi áp dụng
                      <ArrowRight size={14} />
                    </Link>
                  </div>

                  {draftData.quickWins?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draftData.quickWins.slice(0, 4).map((item) => (
                        <span key={item} className="rounded-full border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {(draftData.draft?.fields ?? []).slice(0, 6).map((field, index) => (
                      <div key={`${field.label}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{field.label}</p>
                        <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[var(--foreground)]">{field.value}</p>
                      </div>
                    ))}
                    {(draftData.draft?.settings ?? []).slice(0, 6).map((setting, index) => (
                      <div key={`${setting.key}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[var(--foreground)]">{setting.key}</p>
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-[var(--primary)]">{String(setting.value)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{setting.reason}</p>
                      </div>
                    ))}
                  </div>

                  {draftData.draft?.prompts?.length ? (
                    <div className="mt-3 grid gap-3">
                      {draftData.draft.prompts.slice(0, 3).map((prompt, index) => (
                        <div key={`${prompt.label}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-sm font-semibold text-[var(--foreground)]">{prompt.label}</p>
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[var(--muted-foreground)]">{prompt.prompt}</p>
                          {prompt.warning ? <p className="mt-2 text-xs font-semibold text-orange-700">{prompt.warning}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {draftData.draft?.checklist?.length ? (
                    <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">Checklist trước khi lưu</p>
                      <ul className="mt-2 grid gap-1 text-sm text-[var(--muted-foreground)]">
                        {draftData.draft.checklist.slice(0, 6).map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <aside className="grid content-start gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">AI Autopilot đáng bật</h3>
                <div className="mt-3 grid gap-2">
                  {(planData?.aiAutopilot ?? []).slice(0, 4).map((feature) => (
                    <div key={`${feature.feature}-${feature.plan}`} className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{feature.feature}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{feature.value}</p>
                      <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-[var(--primary)]">{feature.plan}</span>
                    </div>
                  ))}
                  {!planData?.aiAutopilot?.length ? (
                    <p className="text-sm text-[var(--muted-foreground)]">Bấm Pro/Premium để AI gợi ý tính năng đáng tiền theo mô hình quán.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Trải nghiệm khách</h3>
                <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)]">
                  {(planData?.customerExperience ?? activeReadiness.criticalMissing.map((item) => item.action)).slice(0, 4).map((item) => (
                    <p key={item} className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">{item}</p>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {plan?.provider ? (
            <p className="mt-3 text-xs font-medium text-[var(--muted-foreground)]">
              AI provider: {plan.provider} · {plan.model}
            </p>
          ) : null}
          {draft?.provider ? (
            <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
              Draft provider: {draft.provider} · {draft.model}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
