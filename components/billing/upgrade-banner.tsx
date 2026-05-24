"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UpgradeBanner({
  title,
  bullets,
  onUpgrade
}: {
  title: string;
  bullets: string[];
  onUpgrade?: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[rgba(242,140,40,0.18)] bg-[linear-gradient(135deg,rgba(15,77,58,0.06),rgba(242,140,40,0.10),rgba(255,252,246,0.94))] p-5">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[rgba(242,140,40,0.12)] blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(15,77,58,0.12)] bg-white/75 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--primary)]">
            <Sparkles size={14} />
            Upgrade path
          </div>
          <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {bullets.map((bullet) => (
              <span key={bullet} className="rounded-full border border-[var(--border)] bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
                {bullet}
              </span>
            ))}
          </div>
        </div>
        {onUpgrade ? (
          <Button className="shrink-0" onClick={onUpgrade}>
            Nâng cấp Premium
            <ArrowRight size={16} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
