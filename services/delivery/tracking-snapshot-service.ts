import { calculateDistance, estimateTravelTime } from "@/services/maps/distance-service";
import type { Coordinate } from "@/services/maps/types";
import type { DeliveryStatus } from "@/types/domain";

export type DeliveryTrackingSnapshot = {
  state: "pending" | "assigned" | "moving" | "stale" | "arriving" | "completed" | "unavailable";
  label: string;
  detail: string;
  courierDistanceToCustomerKm: number | null;
  courierEtaMinutes: number | null;
  locationAgeMinutes: number | null;
  locationIsStale: boolean;
};

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

type NullableCoordinate = {
  lat?: number | null;
  lng?: number | null;
};

function hasCoordinate(value: NullableCoordinate | null | undefined): value is Coordinate {
  return typeof value?.lat === "number" && Number.isFinite(value.lat) && typeof value?.lng === "number" && Number.isFinite(value.lng);
}

export function buildDeliveryTrackingSnapshot({
  deliveryStatus,
  destination,
  courierLocation,
  capturedAt,
  now = new Date()
}: {
  deliveryStatus?: DeliveryStatus | null;
  destination?: NullableCoordinate | null;
  courierLocation?: NullableCoordinate | null;
  capturedAt?: string | null;
  now?: Date;
}): DeliveryTrackingSnapshot {
  if (deliveryStatus === "delivered") {
    return {
      state: "completed",
      label: "Đã giao xong",
      detail: "Đơn đã được đánh dấu hoàn tất.",
      courierDistanceToCustomerKm: null,
      courierEtaMinutes: null,
      locationAgeMinutes: null,
      locationIsStale: false
    };
  }

  if (!hasCoordinate(destination) || !hasCoordinate(courierLocation)) {
    return {
      state: deliveryStatus === "out_for_delivery" ? "assigned" : "pending",
      label: deliveryStatus === "out_for_delivery" ? "Đang chờ GPS tài xế" : "Chưa có vị trí tài xế",
      detail: "Khi tài xế gửi vị trí, hệ thống sẽ ước tính khoảng cách còn lại.",
      courierDistanceToCustomerKm: null,
      courierEtaMinutes: null,
      locationAgeMinutes: null,
      locationIsStale: false
    };
  }

  const ageMinutes = minutesSince(capturedAt, now);
  const locationIsStale = ageMinutes !== null && ageMinutes > 10;
  const distanceKm = calculateDistance(courierLocation, destination);
  const etaMinutes = estimateTravelTime(distanceKm, { urbanSpeedKph: 18, minimumMinutes: 3 });
  const arriving = distanceKm <= 0.7 && !locationIsStale;

  if (locationIsStale) {
    return {
      state: "stale",
      label: "GPS tài xế đã cũ",
      detail: `Vị trí gần nhất cách đây ${ageMinutes} phút. ETA có thể lệch.`,
      courierDistanceToCustomerKm: distanceKm,
      courierEtaMinutes: etaMinutes,
      locationAgeMinutes: ageMinutes,
      locationIsStale
    };
  }

  return {
    state: arriving ? "arriving" : "moving",
    label: arriving ? "Tài xế sắp đến" : "Tài xế đang di chuyển",
    detail: `Còn khoảng ${distanceKm.toFixed(1)} km, ước tính ${etaMinutes} phút.`,
    courierDistanceToCustomerKm: distanceKm,
    courierEtaMinutes: etaMinutes,
    locationAgeMinutes: ageMinutes,
    locationIsStale
  };
}
