"use client";

import type { ReactNode } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import type { BillingFeatureKey } from "@/lib/billing/types";
import { PremiumBadge } from "@/components/billing/premium-badge";
import { QuotaProgress } from "@/components/billing/quota-progress";
import { TrialUsedOverlay } from "@/components/billing/trial-used-overlay";
import { Button } from "@/components/ui/button";
import { useFeature } from "@/hooks/use-feature";

function publicBillingLabel(label: string) {
  return label
    .replace(/AI analytics/gi, "Báo cáo thông minh")
    .replace(/AI marketing/gi, "Marketing thông minh")
    .replace(/AI branding/gi, "Nhận diện thông minh")
    .replace(/AI assistant/gi, "Trợ lý thông minh")
    .replace(/AI chatbot/gi, "Trợ lý hỏi đáp")
    .replace(/AI/g, "Trợ lý thông minh")
    .replace(/quota/gi, "lượt dùng");
}

export function FeatureGate({
  featureKey,
  children,
  previewTitle
}: {
  featureKey: BillingFeatureKey;
  children: ReactNode;
  previewTitle?: string;
}) {
  const { access, blockState, canUse, openUpgrade } = useFeature(featureKey);
  if (canUse) return <>{children}</>;

  if (blockState === "subscription_expired") {
    return (
      <div className="relative overflow-hidden rounded-[24px] border border-[rgba(242,140,40,0.22)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,18,0.06)]">
        <div className="pointer-events-none select-none blur-[2px]">{children}</div>
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,252,246,0.70),rgba(255,247,235,0.94))] p-5 text-center backdrop-blur-sm">
          <div className="max-w-sm">
            <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <LockKeyhole size={18} />
            </span>
            <h3 className="mt-3 text-base font-semibold text-[var(--foreground)]">Gói LogiVN đã hết hạn</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              Gia hạn để mở lại {publicBillingLabel(access.label)} và toàn bộ tính năng đang bị tạm khóa.
            </p>
            <Button className="mt-4" onClick={openUpgrade}>
              Gia hạn ngay
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (blockState === "trial_used") {
    return (
      <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="blur-[2px]">{children}</div>
        <TrialUsedOverlay title={previewTitle ?? access.description} onUpgrade={openUpgrade} />
      </div>
    );
  }

  if (blockState === "quota_exceeded") {
    return (
      <div className="rounded-[24px] border border-[rgba(242,140,40,0.18)] bg-[linear-gradient(180deg,rgba(255,247,235,0.88),rgba(255,252,246,0.98))] p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{publicBillingLabel(access.label)} đã hết lượt dùng</h3>
        <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
          {access.usage ? `${access.usage.used}/${access.usage.limit} ${access.usage.unit}` : "Lượt dùng hiện tại đã hết."}
        </p>
        {access.usage ? (
          <div className="mt-4">
            <QuotaProgress quota={access.usage} />
          </div>
        ) : null}
        <Button className="mt-4" onClick={openUpgrade}>
          Nâng cấp để tăng lượt dùng
        </Button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,18,0.06)] transition duration-300 hover:border-[rgba(242,140,40,0.28)] hover:shadow-[0_30px_80px_rgba(242,140,40,0.12)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(242,140,40,0.18),transparent_60%)]" />
      <div className="pointer-events-none select-none blur-[1.8px]">{children}</div>
      <div className="absolute inset-0 z-[2] flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,252,246,0.58),rgba(255,247,235,0.92))] p-5 text-center backdrop-blur-[2px]">
        <div className="max-w-sm">
          <div className="flex justify-center">
            <PremiumBadge kind={access.badge ?? "PREMIUM"} />
          </div>
          <span className="mx-auto mt-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(242,140,40,0.18)] bg-[rgba(242,140,40,0.10)] text-[var(--accent-strong)]">
            <LockKeyhole size={18} />
          </span>
          <h3 className="mt-3 text-lg font-semibold text-[var(--foreground)]">{publicBillingLabel(access.label)}</h3>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{publicBillingLabel(access.preview ?? access.description)}</p>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
            <span className="inline-flex items-center gap-1">
              <Sparkles size={13} />
              Chỉ dành cho Premium
            </span>
          </div>
          <Button className="mt-4" onClick={openUpgrade}>
            Mở khóa Premium
          </Button>
        </div>
      </div>
    </div>
  );
}
