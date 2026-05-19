export type PromotionUsageLimitEvaluation =
  | {
      available: true;
      remainingTotalUsage: number | null;
      remainingCustomerUsage: number | null;
      reason: null;
    }
  | {
      available: false;
      remainingTotalUsage: number | null;
      remainingCustomerUsage: number | null;
      reason: "total_limit_reached" | "customer_limit_reached";
    };

function remaining(limit: number | null | undefined, used: number | null | undefined) {
  if (!limit || limit <= 0) return null;
  return Math.max(0, limit - Math.max(0, used ?? 0));
}

export function evaluatePromotionUsageLimit(input: {
  totalUsageLimit?: number | null;
  perCustomerUsageLimit?: number | null;
  totalUsed?: number | null;
  customerUsed?: number | null;
}): PromotionUsageLimitEvaluation {
  const remainingTotalUsage = remaining(input.totalUsageLimit, input.totalUsed);
  if (remainingTotalUsage !== null && remainingTotalUsage <= 0) {
    return {
      available: false,
      remainingTotalUsage: 0,
      remainingCustomerUsage: remaining(input.perCustomerUsageLimit, input.customerUsed),
      reason: "total_limit_reached"
    };
  }

  const remainingCustomerUsage = remaining(input.perCustomerUsageLimit, input.customerUsed);
  if (remainingCustomerUsage !== null && remainingCustomerUsage <= 0) {
    return {
      available: false,
      remainingTotalUsage,
      remainingCustomerUsage: 0,
      reason: "customer_limit_reached"
    };
  }

  return {
    available: true,
    remainingTotalUsage,
    remainingCustomerUsage,
    reason: null
  };
}
