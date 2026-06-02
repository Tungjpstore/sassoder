import { planCatalog } from "@/lib/billing/catalog";
import type { BillingPlanCode } from "@/lib/billing/types";

export const onboardingOperationalTableCap = 300;

export function normalizePlanCode(value?: string | null): BillingPlanCode {
  return value === "premium" ? "premium" : "pro";
}

export function getPlanTableLimit(planCode?: string | null) {
  const normalizedPlanCode = normalizePlanCode(planCode);
  return planCatalog[normalizedPlanCode].entitlements.tables.limit ?? null;
}

export function getOnboardingTableLimit(planCode?: string | null) {
  return getPlanTableLimit(planCode) ?? onboardingOperationalTableCap;
}

export function validateOnboardingTableCount({
  planCode,
  tableCount
}: {
  planCode?: string | null;
  tableCount: number;
}) {
  const normalizedPlanCode = normalizePlanCode(planCode);
  const limit = getOnboardingTableLimit(normalizedPlanCode);
  const plan = planCatalog[normalizedPlanCode];
  const count = Number(tableCount);

  if (!Number.isInteger(count) || count < 1) {
    return {
      ok: false as const,
      planCode: normalizedPlanCode,
      limit,
      message: "Số bàn khởi tạo không hợp lệ."
    };
  }

  if (count > limit) {
    return {
      ok: false as const,
      planCode: normalizedPlanCode,
      limit,
      message: `Gói ${plan.name} giới hạn tối đa ${limit} bàn khi khởi tạo quán. Vui lòng giảm số bàn hoặc chọn gói phù hợp hơn.`
    };
  }

  return {
    ok: true as const,
    planCode: normalizedPlanCode,
    limit
  };
}
