export type DeliveryZonePoint = {
  lat: number;
  lng: number;
};

export type DeliveryExclusionZone = {
  id?: string;
  name?: string;
  areaKm2?: number;
  polygon?: DeliveryZonePoint[];
};

export type DeliveryZoneEvaluation = {
  status: "radius" | "inside_custom_area" | "outside_allowed" | "outside_requires_confirmation" | "outside_blocked" | "excluded";
  accepted: boolean;
  reason: string | null;
  outsideCustomArea: boolean;
  matchedExclusionName: string | null;
};

export function pointInDeliveryPolygon(point: DeliveryZonePoint, polygon: DeliveryZonePoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function evaluateDeliveryZone({
  destination,
  mode,
  polygon,
  exclusionZones,
  allowOutsideDeliveryArea,
  requireOutsideAreaConfirmation
}: {
  destination: DeliveryZonePoint;
  mode: string;
  polygon: DeliveryZonePoint[];
  exclusionZones: DeliveryExclusionZone[];
  allowOutsideDeliveryArea: boolean;
  requireOutsideAreaConfirmation: boolean;
}): DeliveryZoneEvaluation {
  const matchedExclusion = exclusionZones.find((zone) => zone.polygon && zone.polygon.length >= 3 && pointInDeliveryPolygon(destination, zone.polygon));
  if (matchedExclusion) {
    const name = matchedExclusion.name || "Khu vực này";
    return {
      status: "excluded",
      accepted: false,
      reason: `${name} đang nằm trong vùng loại trừ giao hàng.`,
      outsideCustomArea: false,
      matchedExclusionName: name
    };
  }

  const outsideCustomArea = mode === "CUSTOM" && polygon.length >= 3 && !pointInDeliveryPolygon(destination, polygon);
  if (!outsideCustomArea) {
    return {
      status: mode === "CUSTOM" && polygon.length >= 3 ? "inside_custom_area" : "radius",
      accepted: true,
      reason: null,
      outsideCustomArea: false,
      matchedExclusionName: null
    };
  }

  if (!allowOutsideDeliveryArea) {
    return {
      status: "outside_blocked",
      accepted: false,
      reason: "Địa chỉ này chưa nằm trong vùng giao hàng tùy chỉnh của quán.",
      outsideCustomArea: true,
      matchedExclusionName: null
    };
  }

  if (requireOutsideAreaConfirmation) {
    return {
      status: "outside_requires_confirmation",
      accepted: false,
      reason: "Địa chỉ nằm ngoài vùng giao chính, quán cần xác nhận thủ công trước khi nhận đơn.",
      outsideCustomArea: true,
      matchedExclusionName: null
    };
  }

  return {
    status: "outside_allowed",
    accepted: true,
    reason: null,
    outsideCustomArea: true,
    matchedExclusionName: null
  };
}
