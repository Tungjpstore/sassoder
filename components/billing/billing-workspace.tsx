"use client";

import { BarChart3, ImageIcon, WandSparkles } from "lucide-react";
import { planCatalog } from "@/lib/billing/catalog";
import type { ResolvedEntitlementSnapshot } from "@/lib/billing/types";
import { AIQuotaWidget } from "@/components/billing/ai-quota-widget";
import { BillingCard } from "@/components/billing/billing-card";
import { EntitlementProvider } from "@/components/billing/entitlement-provider";
import { FeatureGate } from "@/components/billing/feature-gate";
import { PlanComparisonTable } from "@/components/billing/plan-comparison-table";
import { PremiumBadge } from "@/components/billing/premium-badge";
import { UpgradeBanner } from "@/components/billing/upgrade-banner";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import { useUpgradeFlow } from "@/stores/use-upgrade-flow";

export function BillingWorkspace({
  snapshot
}: {
  snapshot: ResolvedEntitlementSnapshot;
}) {
  const open = useUpgradeFlow((state) => state.open);
  const plan = planCatalog[snapshot.planCode];
  const quotas = [
    snapshot.quotas.ai_menu_generation,
    snapshot.quotas.ai_chatbot,
    snapshot.quotas.ai_image_generation ?? snapshot.quotas.ai_image_generation_trial,
    snapshot.quotas.export_pdf
  ].filter(Boolean);

  return (
    <EntitlementProvider snapshot={snapshot}>
      <div className="grid gap-4">
        <UpgradeBanner
          title={snapshot.planCode === "premium" ? "Bạn đang ở gói cao nhất hiện tại" : "Mở khóa báo cáo thông minh, marketing thông minh và tự động hóa nâng cao"}
          bullets={snapshot.planCode === "premium" ? plan.highlights : planCatalog.premium.highlights}
          onUpgrade={snapshot.planCode === "premium" ? undefined : () => open({ source: "billing_banner" })}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <AIQuotaWidget quotas={quotas} />
          <BillingCard className="bg-[linear-gradient(180deg,rgba(15,77,58,0.06),rgba(255,252,246,0.94))]">
            <PremiumBadge kind={snapshot.planCode === "premium" ? "PREMIUM" : "PRO"} />
            <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{snapshot.planName}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">{plan.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {plan.highlights.map((item) => (
                <span key={item} className="rounded-full border border-[var(--border)] bg-white/80 px-3 py-1.5 text-sm font-semibold text-[var(--foreground)]">
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-5 text-sm font-semibold text-[var(--muted-foreground)]">Còn lại {snapshot.daysLeft} ngày trong chu kỳ hiện tại.</p>
          </BillingCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureGate featureKey="ai_analytics" previewTitle="Báo cáo thông minh giúp chủ quán nhìn ra xu hướng doanh thu và hành vi khách ngay trong bảng quản lý.">
            <BillingCard>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <BarChart3 size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Báo cáo thông minh</p>
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Dự báo doanh thu, insight khách và tín hiệu chậm bàn</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--foreground)]">Doanh thu tối nay có xu hướng tăng 18% nếu giữ combo trà đào.</div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-sm font-semibold text-[var(--foreground)]">Khách 19:00-20:00 có tỷ lệ gọi thêm món tráng miệng cao hơn 1.4x.</div>
              </div>
            </BillingCard>
          </FeatureGate>

          <FeatureGate featureKey="ai_marketing" previewTitle="Marketing thông minh tạo ý tưởng chiến dịch và thông điệp theo đúng bối cảnh quán Việt.">
            <BillingCard>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(242,140,40,0.12)] text-[var(--accent-strong)]">
                  <WandSparkles size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Marketing thông minh</p>
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Chiến dịch, ưu đãi và copy tăng conversion</p>
                </div>
              </div>
              <div className="mt-4 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,77,58,0.10),rgba(242,140,40,0.10))] p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">“Mưa chiều, trà nóng và bánh mới ra lò”</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">LogiVN đề xuất chiến dịch nhỏ cho khung 15:00-18:00 cùng lời mời mua thêm nhẹ nhàng.</p>
              </div>
            </BillingCard>
          </FeatureGate>

          <FeatureGate featureKey="ai_image_generation" previewTitle="Studio hình ảnh tạo ảnh món và banner ưu đãi ngay trong bảng quản lý.">
            <BillingCard>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(21,77,119,0.10)] text-[#154D77]">
                  <ImageIcon size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Studio hình ảnh</p>
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Tạo ảnh món, hero banner và visual ưu đãi</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {["Ảnh món signature", "Poster combo sáng", "Visual loyalty", "Banner cuối tuần"].map((label) => (
                  <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                    <div className="aspect-[4/3] rounded-xl bg-[linear-gradient(135deg,rgba(15,77,58,0.10),rgba(242,140,40,0.16))]" />
                    <p className="mt-2 text-xs font-semibold text-[var(--foreground)]">{label}</p>
                  </div>
                ))}
              </div>
            </BillingCard>
          </FeatureGate>
        </div>

        <PlanComparisonTable />
      </div>
      <UpgradeModal />
    </EntitlementProvider>
  );
}
