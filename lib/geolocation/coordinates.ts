export type GeoCoordinate = {
  lat: number;
  lng: number;
};

export function normalizeCoordinateValue(value: unknown, min: number, max: number) {
  const rawValue = typeof value === "string" ? value.trim() : value;
  if (rawValue === "" || rawValue === null || rawValue === undefined || typeof rawValue === "boolean") return null;

  const coordinate = Number(rawValue);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : null;
}

export function isValidLatitude(value: unknown) {
  return normalizeCoordinateValue(value, -90, 90) !== null;
}

export function isValidLongitude(value: unknown) {
  return normalizeCoordinateValue(value, -180, 180) !== null;
}

export function normalizeCoordinatePair(lat: unknown, lng: unknown): GeoCoordinate | null {
  const normalizedLat = normalizeCoordinateValue(lat, -90, 90);
  const normalizedLng = normalizeCoordinateValue(lng, -180, 180);
  if (normalizedLat === null || normalizedLng === null) return null;

  return {
    lat: normalizedLat,
    lng: normalizedLng
  };
}
