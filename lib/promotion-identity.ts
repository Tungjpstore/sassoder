import { createHash } from "node:crypto";

export type PromotionChannel = "QR_MENU" | "WEBSITE";

export function normalizePromotionPhone(value?: string | null) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length >= 6 ? normalized : null;
}

function hashPromotionIdentity(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function buildPromotionCustomerKeyHash(input: {
  restaurantId: string;
  channel: PromotionChannel;
  tableId?: string | null;
  customerPhone?: string | null;
  customerSessionId?: string | null;
}) {
  if (input.tableId) {
    return hashPromotionIdentity(["v1", input.restaurantId, input.channel, "table", input.tableId]);
  }

  const phone = normalizePromotionPhone(input.customerPhone);
  if (phone) {
    return hashPromotionIdentity(["v1", input.restaurantId, input.channel, "phone", phone]);
  }

  if (input.customerSessionId) {
    return hashPromotionIdentity(["v1", input.restaurantId, input.channel, "session", input.customerSessionId]);
  }

  return null;
}
