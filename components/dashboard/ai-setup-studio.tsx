"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Copy, ImageIcon, Loader2, PenLine, Sparkles } from "lucide-react";
import { applyAiSetupBrandAction } from "@/app/dashboard/actions";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string };

type SetupReadiness = {
  score: number;
};

type BrandingResponse = {
  provider?: string;
  model?: string;
  data?: {
    slogans?: string[];
    description?: string;
    brandVoice?: string;
    logoPrompt?: string;
  } | null;
};

type ImageResponse = {
  imageUrl?: string | null;
  prompt?: string;
  provider?: string;
  model?: string;
};

export function AiSetupStudio({
  readiness,
  restaurantName
}: {
  readiness: SetupReadiness;
  restaurantName: string;
}) {
  const [brandBrief, setBrandBrief] = useState("");
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [selectedSlogan, setSelectedSlogan] = useState("");
  const [logoDraft, setLogoDraft] = useState<ImageResponse | null>(null);
  const [loading, setLoading] = useState<"brand" | "logo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyState, applyBrandAction, applyingBrand] = useActionState(applyAiSetupBrandAction, undefined);

  const brandingData = branding?.data ?? null;
  const slogans = brandingData?.slogans?.filter(Boolean).slice(0, 3) ?? [];
  const activeSlogan = selectedSlogan || slogans[0] || "";
  const description = brandingData?.description ?? "";
  const logoUrl = logoDraft?.imageUrl ?? "";
  const canApplyText = Boolean(activeSlogan || description);
  const canApplyLogo = Boolean(logoUrl);

  async function runBranding() {
    setLoading("brand");
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/branding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantName,
          tone: brandBrief.trim() || "hiện đại, dễ tin, ấm áp, hợp quán F&B Việt Nam",
          audience: "khách địa phương, dân văn phòng, gia đình và khách quen"
        })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<BrandingResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa tạo được bộ nhận diện.");
      setBranding(result.data);
      setSelectedSlogan(result.data.data?.slogans?.[0] ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được nhận diện thương hiệu.");
    } finally {
      setLoading(null);
    }
  }

  async function runLogo() {
    setLoading("logo");
    setError(null);
    try {
      const prompt = brandingData?.logoPrompt || `Biểu tượng logo vuông cho ${restaurantName}, không chữ nhỏ, dễ dùng làm avatar quán F&B Việt Nam.`;
      const response = await fetch("/api/admin/ai/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "logo", restaurantName, prompt })
      });
      const result = (await response.json().catch(() => null)) as ApiResponse<ImageResponse> | null;
      if (!result || !result.ok) throw new Error(result?.error || "Chưa tạo được logo.");
      setLogoDraft(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được logo.");
    } finally {
      setLoading(null);
    }
  }

  async function copyText(value?: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  void readiness;

  return (
    <section className="dashboard-panel overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,77,58,0.1),rgba(242,140,40,0.08))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Studio nhận diện</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{restaurantName}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              Tạo slogan, mô tả và logo rồi áp dụng trực tiếp vào hồ sơ quán. Không còn bản nháp dài dòng.
            </p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[var(--glow-primary)]">
            <Sparkles size={20} />
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.8fr)]">
        <div className="grid content-start gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
            Hướng thương hiệu
            <textarea
              value={brandBrief}
              onChange={(event) => setBrandBrief(event.target.value)}
              placeholder="VD: quán phở gia đình, sạch, nhanh, ấm cúng, muốn logo tối giản và slogan dễ nhớ..."
              className="min-h-28 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium leading-6 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void runBranding()}
              disabled={Boolean(loading)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white shadow-[var(--glow-primary)] transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {loading === "brand" ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
              {brandingData ? "Tạo lại slogan" : "Tạo slogan"}
            </button>
            <button
              type="button"
              onClick={() => void runLogo()}
              disabled={Boolean(loading)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] disabled:opacity-60"
            >
              {loading === "logo" ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              {logoDraft ? "Tạo lại logo" : "Tạo logo"}
            </button>
          </div>

          {error ? (
            <p className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-strong)]">{error}</p>
          ) : null}

          {brandingData ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--foreground)]">Chọn slogan</p>
                <button type="button" onClick={() => void copyText(description)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">
                  <Copy size={13} />
                  Copy mô tả
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {slogans.map((slogan) => {
                  const active = activeSlogan === slogan;
                  return (
                    <button
                      key={slogan}
                      type="button"
                      onClick={() => setSelectedSlogan(slogan)}
                      className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                        active
                          ? "bg-[var(--primary)] text-white"
                          : "border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)] hover:border-[var(--primary)]"
                      }`}
                    >
                      <span>{slogan}</span>
                      {active ? <CheckCircle2 size={15} className="shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
              {description ? <p className="mt-3 rounded-xl bg-[var(--soft-surface)] px-3 py-3 text-sm leading-6 text-[var(--muted-foreground)]">{description}</p> : null}
            </div>
          ) : null}
        </div>

        <form action={applyBrandAction} className="grid content-start gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <input type="hidden" name="brandSlogan" value={activeSlogan} />
          <input type="hidden" name="brandDescription" value={description} />
          <input type="hidden" name="logoUrl" value={logoUrl} />

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)]">
            <div className="grid place-items-center bg-[linear-gradient(135deg,#0f4d3a,#174f43_50%,#f28c28)] p-6">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo gợi ý" className="h-28 w-28 rounded-3xl border-4 border-white/80 bg-white object-cover shadow-[0_20px_50px_rgba(15,77,58,0.24)]" />
              ) : (
                <span className="grid h-28 w-28 place-items-center rounded-3xl border-4 border-white/60 bg-white/20 text-white">
                  <ImageIcon size={34} />
                </span>
              )}
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Preview hồ sơ</p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{restaurantName}</h3>
              <p className="mt-2 text-base font-semibold text-[var(--primary)]">{activeSlogan || "Slogan sẽ hiện ở đây"}</p>
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--muted-foreground)]">
                {description || "Mô tả thương hiệu sẽ được lưu vào hồ sơ quán sau khi bạn áp dụng."}
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <button
              type="submit"
              name="includeLogo"
              value="false"
              disabled={applyingBrand || !canApplyText}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
            >
              {applyingBrand ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Áp dụng slogan + mô tả
            </button>
            <button
              type="submit"
              name="includeLogo"
              value="true"
              disabled={applyingBrand || !canApplyLogo}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] disabled:opacity-50"
            >
              {applyingBrand ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              Áp dụng cả logo
            </button>
          </div>

          {applyState?.success ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{applyState.success}</p>
          ) : null}
          {applyState?.error ? (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">{applyState.error}</p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
