"use client";

import { LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PremiumBadge } from "@/components/billing/premium-badge";

export function LockedCard({
  title,
  description,
  preview,
  onUpgrade
}: {
  title: string;
  description: string;
  preview?: string;
  onUpgrade?: () => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(15,23,18,0.06)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(242,140,40,0.16),transparent_60%)]" />
      <div className="flex items-center justify-between gap-3">
        <PremiumBadge kind="PREMIUM" />
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(242,140,40,0.18)] bg-[rgba(242,140,40,0.08)] text-[var(--accent-strong)]">
          <LockKeyhole size={18} />
        </span>
      </div>

      <div className="mt-5 space-y-2">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-sm font-medium leading-6 text-[var(--muted-foreground)]">{description}</p>
      </div>

      <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(15,77,58,0.06),rgba(255,247,235,0.8))] p-4">
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)]/90 p-4 blur-[1.5px]">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Sparkles size={15} className="text-[var(--accent)]" />
            Preview
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{preview ?? "Xem trước cảm giác premium của tính năng này ngay trong dashboard."}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Chỉ dành cho Premium</p>
        {onUpgrade ? (
          <Button variant="secondary" onClick={onUpgrade}>
            Nâng cấp
          </Button>
        ) : null}
      </div>
    </article>
  );
}
