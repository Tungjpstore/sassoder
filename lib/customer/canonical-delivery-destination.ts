const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_MAX_DISTANCE_METERS = 100;

export type DeliveryCoordinates = {
  lat: number;
  lng: number;
};

export type DeliveryCoordinateInput = {
  lat?: number | null;
  lng?: number | null;
};

export type CanonicalDeliveryDestinationIssueCode =
  | "ADDRESS_EMPTY"
  | "COORDINATE_REPRESENTATION_CONFLICT"
  | "COORDINATES_INCOMPLETE"
  | "LATITUDE_OUT_OF_RANGE"
  | "LONGITUDE_OUT_OF_RANGE"
  | "RESOLVED_DESTINATION_REQUIRED"
  | "RESOLVED_COORDINATES_INCOMPLETE"
  | "RESOLVED_LATITUDE_OUT_OF_RANGE"
  | "RESOLVED_LONGITUDE_OUT_OF_RANGE"
  | "INVALID_DISTANCE_THRESHOLD"
  | "COORDINATES_MISMATCH";

export type CanonicalDeliveryDestinationIssue = {
  code: CanonicalDeliveryDestinationIssueCode;
  distanceMeters?: number;
  thresholdMeters?: number;
};

export type CanonicalDeliveryDestinationInput = {
  canonicalAddress?: string | null;
  address?: string | null;
  suppliedCoordinates?: DeliveryCoordinateInput | null;
  resolvedCoordinates?: DeliveryCoordinateInput | null;
  suppliedPoint?: DeliveryCoordinateInput | null;
  resolvedPoint?: DeliveryCoordinateInput | null;
  lat?: number | null;
  lng?: number | null;
  maxDistanceMeters?: number;
};

export type CanonicalDeliveryDestinationResult = {
  ok: boolean;
  valid: boolean;
  issues: CanonicalDeliveryDestinationIssue[];
  canonicalAddress: string;
  suppliedCoordinates?: DeliveryCoordinates;
  resolvedCoordinates?: DeliveryCoordinates;
  distanceMeters?: number;
  canonicalDestination?: {
    canonicalAddress: string;
    coordinates?: DeliveryCoordinates;
  };
};

export function validateCanonicalDeliveryDestination(
  input: CanonicalDeliveryDestinationInput
): CanonicalDeliveryDestinationResult {
  const issues: CanonicalDeliveryDestinationIssue[] = [];
  const rawAddress = input.canonicalAddress;
  const canonicalAddress = typeof rawAddress === "string" ? rawAddress.trim().replace(/\s+/g, " ") : "";
  if (!canonicalAddress) issues.push({ code: "ADDRESS_EMPTY" });

  const rootCoordinates = rootCoordinateInput(input);
  const suppliedRepresentations = [
    input.suppliedCoordinates !== undefined,
    input.suppliedPoint !== undefined,
    rootCoordinates !== undefined
  ].filter(Boolean).length;
  const resolvedRepresentations = [
    input.resolvedCoordinates !== undefined,
    input.resolvedPoint !== undefined
  ].filter(Boolean).length;
  if (suppliedRepresentations > 1 || resolvedRepresentations > 1) {
    issues.push({ code: "COORDINATE_REPRESENTATION_CONFLICT" });
  }
  const suppliedInput = input.suppliedCoordinates !== undefined
    ? input.suppliedCoordinates
    : input.suppliedPoint !== undefined
      ? input.suppliedPoint
      : rootCoordinates;
  const resolvedInput = input.resolvedCoordinates !== undefined
    ? input.resolvedCoordinates
    : input.resolvedPoint;
  const supplied = validatePoint(suppliedInput, false, issues);
  const resolved = validatePoint(resolvedInput, true, issues);
  if (hasCompleteCoordinateInput(suppliedInput) && !hasAnyCoordinate(resolvedInput)) {
    issues.push({ code: "RESOLVED_DESTINATION_REQUIRED" });
  }

  const threshold = input.maxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS;
  const validThreshold = typeof threshold === "number" && Number.isFinite(threshold) && threshold >= 0;
  if (!validThreshold) issues.push({ code: "INVALID_DISTANCE_THRESHOLD" });

  let distanceMeters: number | undefined;
  if (supplied && resolved && validThreshold) {
    distanceMeters = haversineDistanceMeters(supplied, resolved);
    if (!Number.isFinite(distanceMeters) || distanceMeters > threshold) {
      issues.push({
        code: "COORDINATES_MISMATCH",
        distanceMeters,
        thresholdMeters: threshold
      });
    }
  }

  const canonicalDestination = issues.length === 0 && canonicalAddress
    ? {
        canonicalAddress,
        ...(resolved ? { coordinates: resolved } : {})
      }
    : undefined;

  return {
    ok: issues.length === 0,
    valid: issues.length === 0,
    issues,
    canonicalAddress,
    ...(supplied ? { suppliedCoordinates: supplied } : {}),
    ...(resolved ? { resolvedCoordinates: resolved } : {}),
    ...(distanceMeters === undefined ? {} : { distanceMeters }),
    ...(canonicalDestination ? { canonicalDestination } : {})
  };
}

export const validateDeliveryDestination = validateCanonicalDeliveryDestination;

export function haversineDistanceMeters(a: DeliveryCoordinates, b: DeliveryCoordinates) {
  const lat1 = degreesToRadians(a.lat);
  const lat2 = degreesToRadians(b.lat);
  const deltaLat = degreesToRadians(b.lat - a.lat);
  const deltaLng = degreesToRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const clampedHaversine = Math.min(1, Math.max(0, haversine));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(
    Math.sqrt(clampedHaversine),
    Math.sqrt(1 - clampedHaversine)
  );
}

function validatePoint(
  point: DeliveryCoordinateInput | null | undefined,
  resolved: boolean,
  issues: CanonicalDeliveryDestinationIssue[]
): DeliveryCoordinates | undefined {
  if (!point) return undefined;
  const hasLat = point.lat !== undefined && point.lat !== null;
  const hasLng = point.lng !== undefined && point.lng !== null;
  if (!hasLat && !hasLng) return undefined;
  if (hasLat !== hasLng) {
    issues.push({ code: resolved ? "RESOLVED_COORDINATES_INCOMPLETE" : "COORDINATES_INCOMPLETE" });
    return undefined;
  }

  const lat = point.lat;
  const lng = point.lng;
  let valid = true;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    issues.push({ code: resolved ? "RESOLVED_LATITUDE_OUT_OF_RANGE" : "LATITUDE_OUT_OF_RANGE" });
    valid = false;
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    issues.push({ code: resolved ? "RESOLVED_LONGITUDE_OUT_OF_RANGE" : "LONGITUDE_OUT_OF_RANGE" });
    valid = false;
  }
  if (!valid || typeof lat !== "number" || typeof lng !== "number") return undefined;
  return { lat, lng };
}

function rootCoordinateInput(input: CanonicalDeliveryDestinationInput) {
  if (input.lat === undefined && input.lng === undefined) return undefined;
  return { lat: input.lat, lng: input.lng };
}

function hasAnyCoordinate(point: DeliveryCoordinateInput | null | undefined) {
  return Boolean(point && (point.lat !== undefined && point.lat !== null || point.lng !== undefined && point.lng !== null));
}

function hasCompleteCoordinateInput(point: DeliveryCoordinateInput | null | undefined) {
  return Boolean(
    point &&
    point.lat !== undefined &&
    point.lat !== null &&
    point.lng !== undefined &&
    point.lng !== null
  );
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
