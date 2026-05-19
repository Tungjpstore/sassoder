import type { Json } from "@/types/supabase";

export type DeliveryQuoteSnapshotInsight = {
  tone: "neutral" | "green" | "yellow" | "blue" | "red";
  label: string;
  detail: string;
  badges: string[];
  addressQualityLevel: "high" | "medium" | "low" | null;
  deliveryAreaStatus: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function firstString(values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function zoneLabel(status: string | null) {
  if (status === "inside_custom_area") return "Trong vùng giao";
  if (status === "outside_allowed") return "Ngoài vùng chính";
  if (status === "outside_requires_confirmation") return "Cần xác nhận";
  if (status === "outside_blocked") return "Ngoài vùng giao";
  if (status === "excluded") return "Vùng loại trừ";
  return null;
}

function qualityLabel(level: string | null) {
  if (level === "high") return "Địa chỉ rõ";
  if (level === "medium") return "Địa chỉ khá rõ";
  if (level === "low") return "Địa chỉ mơ hồ";
  return null;
}

export function resolveDeliveryQuoteSnapshotInsight(snapshot: Json | null | undefined): DeliveryQuoteSnapshotInsight | null {
  const root = asRecord(snapshot);
  if (!root) return null;

  const addressQuality = asRecord(root.addressQuality);
  const deliveryArea = asRecord(root.deliveryArea);
  const pricing = asRecord(root.pricing);
  const pricingSnapshot = asRecord(pricing?.snapshot);
  const qualityLevel = asString(addressQuality?.level) as DeliveryQuoteSnapshotInsight["addressQualityLevel"];
  const qualityScore = asNumber(addressQuality?.score);
  const zoneStatus = asString(deliveryArea?.status);
  const routeProvider = firstString([root.routeProvider, root.provider]);
  const confidence = asString(root.confidence);
  const distanceKm = asNumber(root.distanceKm);
  const etaMinutes = asNumber(root.etaMinutes);
  const fee = asNumber(pricing?.deliveryFee);
  const freeShippingApplied = pricingSnapshot?.freeShippingApplied === true;

  const badges = [
    qualityLabel(qualityLevel),
    zoneLabel(zoneStatus),
    routeProvider,
    confidence ? `Tin cậy ${confidence}` : null,
    distanceKm !== null ? `${distanceKm.toFixed(1)} km` : null,
    etaMinutes !== null ? `${Math.round(etaMinutes)} phút` : null,
    freeShippingApplied ? "Freeship" : fee !== null ? `${fee.toLocaleString("vi-VN")}đ ship` : null
  ].filter((item): item is string => Boolean(item));

  if (zoneStatus === "excluded" || zoneStatus === "outside_blocked") {
    return {
      tone: "red",
      label: zoneStatus === "excluded" ? "Vùng loại trừ" : "Ngoài vùng giao",
      detail: asString(root.reason) ?? "Đơn giao nằm ngoài vùng tự động nhận.",
      badges,
      addressQualityLevel: qualityLevel ?? null,
      deliveryAreaStatus: zoneStatus
    };
  }

  if (zoneStatus === "outside_requires_confirmation" || qualityLevel === "low" || confidence === "low" || root.isEstimated === true) {
    return {
      tone: "yellow",
      label: zoneStatus === "outside_requires_confirmation" ? "Cần xác nhận vùng giao" : "Cần kiểm tra địa chỉ",
      detail:
        firstString(Array.isArray(addressQuality?.warnings) ? addressQuality.warnings : []) ??
        asString(root.reason) ??
        "Địa chỉ hoặc tuyến giao cần nhân viên kiểm tra trước khi điều phối.",
      badges,
      addressQualityLevel: qualityLevel ?? null,
      deliveryAreaStatus: zoneStatus
    };
  }

  return {
    tone: qualityLevel === "medium" ? "blue" : "green",
    label: qualityLevel === "medium" ? "Quote ổn, kiểm tra hẻm" : "Quote giao hàng tốt",
    detail: "Khoảng cách, vùng giao và phí ship đã được snapshot khi khách đặt.",
    badges,
    addressQualityLevel: qualityLevel ?? null,
    deliveryAreaStatus: zoneStatus
  };
}
