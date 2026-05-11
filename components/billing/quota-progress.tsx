import type { QuotaSnapshot } from "@/lib/billing/types";
import { computeQuotaPercent } from "@/lib/billing/quotas";
import { UsageBar } from "@/components/billing/usage-bar";

function publicQuotaLabel(label: string) {
  return label
    .replace(/AI analytics/gi, "Báo cáo thông minh")
    .replace(/AI marketing/gi, "Marketing thông minh")
    .replace(/AI branding/gi, "Nhận diện thông minh")
    .replace(/AI assistant/gi, "Trợ lý thông minh")
    .replace(/AI chatbot/gi, "Trợ lý hỏi đáp")
    .replace(/AI/g, "Trợ lý thông minh")
    .replace(/Export PDF/gi, "Xuất báo cáo PDF");
}

function publicQuotaWindow(window: string) {
  if (window === "monthly") return "hằng tháng";
  if (window === "lifetime") return "một lần";
  return window;
}

export function QuotaProgress({ quota }: { quota: QuotaSnapshot }) {
  const percent = computeQuotaPercent(quota);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{publicQuotaLabel(quota.label)}</p>
          <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
            {quota.limit === null ? "Không giới hạn" : `${quota.used}/${quota.limit} ${quota.unit}`} · {publicQuotaWindow(quota.window)}
          </p>
        </div>
        <p className="text-sm font-black text-[var(--primary)]">{quota.limit === null ? "∞" : `${percent}%`}</p>
      </div>
      <UsageBar value={percent} className="mt-3" />
      {quota.resetLabel ? <p className="mt-2 text-xs font-medium text-[var(--muted-foreground)]">{quota.resetLabel}</p> : null}
    </div>
  );
}
