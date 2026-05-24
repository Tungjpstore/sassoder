import type { QuotaSnapshot } from "@/lib/billing/types";

export function computeQuotaPercent(quota: QuotaSnapshot) {
  if (quota.limit === null || quota.limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((quota.used / quota.limit) * 100)));
}

export function isQuotaExceeded(quota: QuotaSnapshot | undefined) {
  if (!quota || quota.limit === null) return false;
  return quota.used >= quota.limit;
}
