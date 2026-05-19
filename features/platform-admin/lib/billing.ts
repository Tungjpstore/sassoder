import type { BillingAnomaly } from "@/features/platform-admin/types";

export function billingAnomalyActionLabel(anomaly: BillingAnomaly) {
  if (anomaly.key === "premium_trial_subscription") return "Đưa về trial Pro";
  if (anomaly.key === "pending_without_payment") return "Chuẩn hóa trạng thái";
  if (anomaly.key === "pending_payment_missing_policy") return "Bổ sung policy";
  return "Xử lý";
}

export function canResolveBillingAnomaly(anomaly: BillingAnomaly) {
  if (anomaly.key === "pending_payment_missing_policy") return Boolean(anomaly.paymentId);
  return Boolean(anomaly.subscriptionId);
}
