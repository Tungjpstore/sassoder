import type { BillingBadgeKind } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

const labels: Record<BillingBadgeKind, string> = {
  PREMIUM: "PREMIUM",
  PRO: "PRO",
  AI: "AI",
  NEW: "NEW",
  BETA: "BETA"
};

export function PremiumBadge({
  kind = "PREMIUM",
  className
}: {
  kind?: BillingBadgeKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
        kind === "PREMIUM" && "border-[#F28C28]/20 bg-[linear-gradient(135deg,rgba(242,140,40,0.18),rgba(15,77,58,0.18))] text-[#A94E08]",
        kind === "PRO" && "border-[#0F4D3A]/20 bg-[rgba(15,77,58,0.10)] text-[#0F4D3A]",
        kind === "AI" && "border-[#154D77]/20 bg-[rgba(21,77,119,0.10)] text-[#154D77]",
        kind === "NEW" && "border-[#F28C28]/20 bg-[rgba(242,140,40,0.10)] text-[#C36C12]",
        kind === "BETA" && "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]",
        className
      )}
    >
      {labels[kind]}
    </span>
  );
}
