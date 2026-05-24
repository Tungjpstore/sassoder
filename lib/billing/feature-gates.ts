import { AppError } from "@/lib/response";
import type { BillingFeatureKey, ResolvedEntitlementSnapshot } from "@/lib/billing/types";

export function getFeatureAccess(snapshot: ResolvedEntitlementSnapshot, featureKey: BillingFeatureKey) {
  return snapshot.features[featureKey];
}

export function assertServerFeatureAccess(snapshot: ResolvedEntitlementSnapshot, featureKey: BillingFeatureKey) {
  const access = getFeatureAccess(snapshot, featureKey);
  if (snapshot.status === "expired") {
    throw new AppError("Gói LogiVN đã hết hạn. Vui lòng gia hạn để tiếp tục dùng tính năng này.", 402);
  }

  if (access.state === "active") return access;

  if (access.state === "quota_exceeded") {
    throw new AppError(`${access.label} đã hết quota. Vui lòng nâng cấp hoặc chờ kỳ reset tiếp theo.`, 402);
  }

  if (access.state === "trial_used") {
    throw new AppError(`Bạn đã dùng thử ${access.label}. Vui lòng nâng cấp để tiếp tục.`, 402);
  }

  throw new AppError(`${access.label} chỉ khả dụng trên gói Premium.`, 402);
}

export function buildMiddlewareGateKey(featureKey?: BillingFeatureKey) {
  return featureKey ? `feature:${featureKey}` : "subscription";
}
