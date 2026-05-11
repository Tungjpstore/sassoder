"use client";

import { X } from "lucide-react";
import { featureCatalog, planCatalog } from "@/lib/billing/catalog";
import { PremiumBadge } from "@/components/billing/premium-badge";
import { Button } from "@/components/ui/button";
import { useUpgradeFlow } from "@/stores/use-upgrade-flow";

export function UpgradeModal() {
  const { isOpen, featureKey, source, close } = useUpgradeFlow();
  if (!isOpen) return null;

  const feature = featureKey ? featureCatalog[featureKey] : null;
  const premium = planCatalog.premium;
  const upgradeTarget = "/dashboard/settings?section=billing#billing-upgrade-plans";

  function handleUpgradeClick() {
    close();

    window.setTimeout(() => {
      const billingPageOpen = window.location.pathname === "/dashboard/settings" && window.location.search.includes("section=billing");
      if (!billingPageOpen) {
        window.location.assign(upgradeTarget);
        return;
      }

      window.history.replaceState(null, "", upgradeTarget);
      const premiumPlan = document.getElementById("billing-plan-premium");
      if (premiumPlan instanceof HTMLDetailsElement) premiumPlan.open = true;
      document.getElementById("billing-upgrade-plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(9,12,10,0.38)] p-3 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_40px_100px_rgba(15,23,18,0.22)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <PremiumBadge kind="PREMIUM" />
            <h3 className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{feature?.upgradeHeadline ?? "Mở khóa trải nghiệm Premium"}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted-foreground)]">
              {feature ? feature.description : premium.summary}
              {source ? " · Gợi ý dựa trên nhu cầu bạn vừa mở." : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="space-y-3">
              {(feature?.upgradeBullets ?? premium.highlights).map((bullet) => (
                <div key={bullet} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                  {bullet}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-[rgba(242,140,40,0.18)] bg-[linear-gradient(180deg,rgba(15,77,58,0.06),rgba(255,247,235,0.92))] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Premium</p>
            <h4 className="mt-2 text-xl font-semibold text-[var(--foreground)]">{premium.name}</h4>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{premium.summary}</p>
            <p className="mt-5 text-3xl font-semibold text-[var(--foreground)]">199.000đ<span className="text-sm font-medium text-[var(--muted-foreground)]">/tháng</span></p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={handleUpgradeClick}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-[0_16px_36px_rgba(242,140,40,0.24)] transition hover:-translate-y-0.5 hover:bg-[var(--accent-strong)]"
              >
                Đi tới nâng cấp
              </button>
              <Button variant="ghost" onClick={close}>
                Để sau
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
