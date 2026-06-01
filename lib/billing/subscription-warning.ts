export const SUBSCRIPTION_EXPIRY_NOTICE_DAYS = 3;

export type SubscriptionExpiryWarning = {
  severity: "danger" | "warning";
  message: string;
};

export function isSubscriptionInRenewalNoticeWindow(daysLeft: number) {
  return daysLeft <= SUBSCRIPTION_EXPIRY_NOTICE_DAYS;
}

export function buildSubscriptionExpiryWarning({
  allowed,
  pendingButStillUsable,
  daysLeft
}: {
  allowed: boolean;
  pendingButStillUsable: boolean;
  daysLeft: number;
}): SubscriptionExpiryWarning | null {
  if (!allowed || pendingButStillUsable || !isSubscriptionInRenewalNoticeWindow(daysLeft)) return null;

  return {
    severity: daysLeft <= 1 ? "danger" : "warning",
    message:
      daysLeft <= 0
        ? "Gói LogiVN hết hạn hôm nay. Vui lòng gia hạn để tránh gián đoạn vận hành."
        : `Gói LogiVN còn ${daysLeft} ngày. Hãy gia hạn sớm để ca bán không bị gián đoạn.`
  };
}
