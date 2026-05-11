export type LegacySubscriptionStatus =
  | "trialing"
  | "pending_payment"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled"
  | "expired";

export type LegacyPlanSnapshot = {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
};

export type LegacySubscriptionSnapshot = {
  id: string;
  plan_id: string;
  status: LegacySubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LegacyPaymentSnapshot = {
  id: string;
  plan_id: string | null;
  months: number;
};

export type BillingAction = "renew" | "upgrade" | "downgrade";

export type PaymentPolicySummary = {
  billingAction: BillingAction;
  policyKey:
    | "renew_extend_window"
    | "upgrade_from_trial"
    | "upgrade_immediate_credit"
    | "switch_immediate_expired"
    | "downgrade_requires_end_of_cycle";
  effectiveAt: string | null;
  summary: string;
  isImmediate: boolean;
};

export type ConfirmedSubscriptionTransition = {
  planId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  metadata: Record<string, unknown>;
};

export function addPreciseDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getSubscriptionWindowEnd(subscription: Pick<LegacySubscriptionSnapshot, "current_period_end" | "trial_ends_at">) {
  return subscription.current_period_end || subscription.trial_ends_at;
}

export function isSubscriptionUsable(subscription: Pick<LegacySubscriptionSnapshot, "status" | "current_period_end" | "trial_ends_at">, now = new Date()) {
  const accessEnd = getSubscriptionWindowEnd(subscription);
  const accessEndValue = accessEnd ?? null;
  const hasCurrentWindow = accessEndValue ? new Date(accessEndValue).getTime() >= now.getTime() : true;

  if (subscription.status === "active" || subscription.status === "trialing") {
    return hasCurrentWindow;
  }

  if (subscription.status === "pending_payment") {
    if (!accessEndValue) return false;
    return new Date(accessEndValue).getTime() >= now.getTime();
  }

  return false;
}

export function getBillingAction(currentPlan: LegacyPlanSnapshot, targetPlan: LegacyPlanSnapshot): BillingAction {
  if (targetPlan.id === currentPlan.id) return "renew";
  return targetPlan.monthly_price > currentPlan.monthly_price ? "upgrade" : "downgrade";
}

export function buildPaymentPolicySummary({
  subscription,
  currentPlan,
  targetPlan,
  months,
  now = new Date()
}: {
  subscription: LegacySubscriptionSnapshot;
  currentPlan: LegacyPlanSnapshot;
  targetPlan: LegacyPlanSnapshot;
  months: number;
  now?: Date;
}): PaymentPolicySummary {
  const billingAction = getBillingAction(currentPlan, targetPlan);
  const usableNow = isSubscriptionUsable(subscription, now);
  const windowEnd = getSubscriptionWindowEnd(subscription);

  if (billingAction === "renew") {
    return {
      billingAction,
      policyKey: "renew_extend_window",
      effectiveAt: windowEnd,
      summary: "Gia hạn sẽ nối tiếp ngay sau kỳ hiện tại, không làm mất số ngày còn lại.",
      isImmediate: false
    };
  }

  if (!usableNow) {
    return {
      billingAction,
      policyKey: "switch_immediate_expired",
      effectiveAt: now.toISOString(),
      summary: `Gói ${targetPlan.name} sẽ mở ngay sau khi LogiVN xác minh thanh toán.`,
      isImmediate: true
    };
  }

  if (billingAction === "upgrade") {
    if (subscription.status === "trialing") {
      return {
        billingAction,
        policyKey: "upgrade_from_trial",
        effectiveAt: now.toISOString(),
        summary: `Nâng cấp từ trial sẽ mở ${targetPlan.name} ngay sau xác minh và bắt đầu chu kỳ trả phí mới.`,
        isImmediate: true
      };
    }

    return {
      billingAction,
      policyKey: "upgrade_immediate_credit",
      effectiveAt: now.toISOString(),
      summary: `Nâng cấp sẽ mở ${targetPlan.name} ngay sau xác minh. Phần giá trị còn lại của gói cũ được quy đổi sang số ngày tương ứng của gói mới.`,
      isImmediate: true
    };
  }

  return {
    billingAction,
    policyKey: "downgrade_requires_end_of_cycle",
    effectiveAt: windowEnd,
    summary: "Chuyển xuống gói thấp hơn chỉ nên áp dụng khi kỳ hiện tại kết thúc để tránh mất quyền đang còn hiệu lực.",
    isImmediate: false
  };
}

export function computeConfirmedSubscriptionTransition({
  subscription,
  payment,
  currentPlan,
  targetPlan,
  now = new Date()
}: {
  subscription: LegacySubscriptionSnapshot;
  payment: LegacyPaymentSnapshot;
  currentPlan: LegacyPlanSnapshot;
  targetPlan: LegacyPlanSnapshot;
  now?: Date;
}): ConfirmedSubscriptionTransition {
  const billingAction = getBillingAction(currentPlan, targetPlan);
  const nowIso = now.toISOString();
  const currentWindowEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const hasCurrentWindow = Boolean(currentWindowEnd && currentWindowEnd.getTime() > now.getTime());
  const months = Math.max(1, Number(payment.months) || 1);
  const metadata = subscription.metadata ?? {};

  if (billingAction === "downgrade" && isSubscriptionUsable(subscription, now)) {
    throw new Error("Downgrade while the current cycle is still active must be scheduled at period end.");
  }

  if (billingAction === "renew") {
    const basePeriod = hasCurrentWindow && currentWindowEnd ? currentWindowEnd : now;
    return {
      planId: currentPlan.id,
      currentPeriodStart: subscription.current_period_start ?? nowIso,
      currentPeriodEnd: addMonths(basePeriod, months).toISOString(),
      metadata: {
        ...metadata,
        billingAction,
        lastPaymentId: payment.id,
        lastPaymentConfirmedAt: nowIso
      }
    };
  }

  if (!isSubscriptionUsable(subscription, now)) {
    return {
      planId: targetPlan.id,
      currentPeriodStart: nowIso,
      currentPeriodEnd: addMonths(now, months).toISOString(),
      metadata: {
        ...metadata,
        billingAction,
        lastPaymentId: payment.id,
        lastPaymentConfirmedAt: nowIso,
        switchedFromPlanId: subscription.plan_id,
        switchedToPlanId: targetPlan.id
      }
    };
  }

  if (subscription.status === "trialing") {
    return {
      planId: targetPlan.id,
      currentPeriodStart: nowIso,
      currentPeriodEnd: addMonths(now, months).toISOString(),
      metadata: {
        ...metadata,
        billingAction,
        lastPaymentId: payment.id,
        lastPaymentConfirmedAt: nowIso,
        switchedFromPlanId: subscription.plan_id,
        switchedToPlanId: targetPlan.id,
        trialConvertedAt: nowIso
      }
    };
  }

  const activeWindowEnd = currentWindowEnd ?? now;
  const remainingDays = Math.max(0, (activeWindowEnd.getTime() - now.getTime()) / 86_400_000);
  const convertedCreditDays =
    currentPlan.monthly_price > 0 && targetPlan.monthly_price > 0
      ? Math.max(0, Math.floor((remainingDays * currentPlan.monthly_price) / targetPlan.monthly_price))
      : 0;
  const paidWindowEnd = addPreciseDays(addMonths(now, months), convertedCreditDays);

  return {
    planId: targetPlan.id,
    currentPeriodStart: nowIso,
    currentPeriodEnd: paidWindowEnd.toISOString(),
    metadata: {
      ...metadata,
      billingAction,
      lastPaymentId: payment.id,
      lastPaymentConfirmedAt: nowIso,
      switchedFromPlanId: subscription.plan_id,
      switchedToPlanId: targetPlan.id,
      convertedCreditDays,
      convertedFromRemainingDays: Math.ceil(remainingDays)
    }
  };
}
