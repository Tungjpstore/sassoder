export const GPS_WARN_ACCURACY_METERS = 2_000;
export const GPS_BLOCK_ACCURACY_METERS = 25_000;

const coordinateLabelPattern = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;

export function looksLikeCoordinateLabel(value: string | null | undefined) {
  return coordinateLabelPattern.test(value ?? "");
}

export function isLikelyCoordinateQuery(value: string | null | undefined) {
  return looksLikeCoordinateLabel(value);
}

export function isLowAccuracyLocation(accuracyMeters: number | null | undefined) {
  return typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters) && accuracyMeters > GPS_WARN_ACCURACY_METERS;
}

export function isUnusableAccuracyLocation(accuracyMeters: number | null | undefined) {
  return typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters) && accuracyMeters > GPS_BLOCK_ACCURACY_METERS;
}

export function formatAccuracyMeters(accuracyMeters: number | null | undefined) {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters)) return null;
  if (accuracyMeters >= 1000) return `~${(accuracyMeters / 1000).toFixed(accuracyMeters >= 10_000 ? 0 : 1)}km`;
  return `~${Math.round(accuracyMeters)}m`;
}
