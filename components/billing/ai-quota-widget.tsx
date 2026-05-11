import type { QuotaSnapshot } from "@/lib/billing/types";
import { BillingCard } from "@/components/billing/billing-card";
import { QuotaProgress } from "@/components/billing/quota-progress";

export function AIQuotaWidget({ quotas }: { quotas: QuotaSnapshot[] }) {
  return (
    <BillingCard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Lượt sử dụng</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Theo dõi lượt trợ lý và xuất báo cáo</h3>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {quotas.map((quota) => (
          <QuotaProgress key={quota.key} quota={quota} />
        ))}
      </div>
    </BillingCard>
  );
}
