import { normalizeVietnameseAddressQuery } from "@/services/maps/vietnamese-address-service";
import type { Coordinate, GeocodingProvider, RouteConfidence } from "@/services/maps/types";

export type AddressQualityLevel = "high" | "medium" | "low";

export type VietnameseAddressParts = {
  houseNumber: string | null;
  street: string | null;
  ward: string | null;
  district: string | null;
  province: string | null;
  alleyHint: string | null;
};

export type AddressQualitySnapshot = {
  level: AddressQualityLevel;
  score: number;
  normalizedAddress: string | null;
  parts: VietnameseAddressParts;
  hasCoordinate: boolean;
  provider?: GeocodingProvider | "manual" | "browser-location" | null;
  routeConfidence?: RouteConfidence | null;
  warnings: string[];
};

const streetPattern = /(?:^|[,\s])(?:đường|duong|phố|pho|quốc lộ|ql|tỉnh lộ|tl)\s+([^,]+)/iu;
const wardPattern = /(?:^|[,\s])(?:phường|phuong|p\.|xã|xa|thị trấn|tt\.)\s+([^,]+)/iu;
const districtPattern = /(?:^|[,\s])(?:quận|quan|q\.|huyện|huyen|h\.|thành phố|tp\.|thị xã|tx\.)\s+([^,]+)/iu;
const provincePattern = /(?:^|[,\s])(?:tỉnh|thành phố|tp\.|tp)\s+([^,]+)/iu;
const alleyPattern = /(?:^|[,\s])(?:hẻm|hem|ngõ|ngo|ngách|kiệt|kiet|sẹc|sẹt|\/)\s*([^,]*)/iu;
const houseNumberPattern = /(?:^|,\s*)(\d+[a-zA-Z]?(?:[\/-]\d+[a-zA-Z]?)*)\b/;

function cleanPart(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function extractMatch(pattern: RegExp, address: string) {
  return cleanPart(address.match(pattern)?.[1]);
}

export function parseVietnameseAddressParts(address: string | null | undefined): VietnameseAddressParts {
  const normalizedAddress = normalizeVietnameseAddressQuery(address ?? "");
  return {
    houseNumber: cleanPart(normalizedAddress.match(houseNumberPattern)?.[1]),
    street: extractMatch(streetPattern, normalizedAddress),
    ward: extractMatch(wardPattern, normalizedAddress),
    district: extractMatch(districtPattern, normalizedAddress),
    province: extractMatch(provincePattern, normalizedAddress),
    alleyHint: cleanPart(normalizedAddress.match(alleyPattern)?.[0])
  };
}

function hasCoordinate(coordinate: Partial<Coordinate> | null | undefined) {
  return typeof coordinate?.lat === "number" && Number.isFinite(coordinate.lat) && typeof coordinate?.lng === "number" && Number.isFinite(coordinate.lng);
}

function scoreAddress({
  normalizedAddress,
  parts,
  coordinate,
  routeConfidence
}: {
  normalizedAddress: string;
  parts: VietnameseAddressParts;
  coordinate?: Partial<Coordinate> | null;
  routeConfidence?: RouteConfidence | null;
}) {
  let score = hasCoordinate(coordinate) ? 35 : 0;
  if (normalizedAddress.length >= 12) score += 10;
  if (parts.houseNumber) score += 12;
  if (parts.street) score += 16;
  if (parts.ward) score += 12;
  if (parts.district) score += 12;
  if (parts.province) score += 8;
  if (parts.alleyHint) score += 5;
  if (routeConfidence === "high") score += 8;
  if (routeConfidence === "medium") score += 4;
  return Math.min(100, score);
}

function qualityLevel(score: number): AddressQualityLevel {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function buildWarnings(parts: VietnameseAddressParts, coordinate: Partial<Coordinate> | null | undefined, score: number) {
  const warnings: string[] = [];
  if (!hasCoordinate(coordinate)) warnings.push("Thiếu tọa độ khách, cần geocode trước khi quote chính xác.");
  if (!parts.houseNumber) warnings.push("Thiếu số nhà hoặc số hẻm.");
  if (!parts.street) warnings.push("Thiếu tên đường.");
  if (!parts.ward) warnings.push("Thiếu phường/xã.");
  if (!parts.district) warnings.push("Thiếu quận/huyện.");
  if (score < 50) warnings.push("Địa chỉ còn mơ hồ, dễ lệch vị trí trong hẻm/đường nhỏ.");
  return warnings;
}

export function analyzeVietnameseDeliveryAddress({
  address,
  coordinate,
  provider,
  routeConfidence
}: {
  address?: string | null;
  coordinate?: Partial<Coordinate> | null;
  provider?: AddressQualitySnapshot["provider"];
  routeConfidence?: RouteConfidence | null;
}): AddressQualitySnapshot {
  const normalizedAddress = normalizeVietnameseAddressQuery(address ?? "");
  const parts = parseVietnameseAddressParts(normalizedAddress);
  const score = scoreAddress({ normalizedAddress, parts, coordinate, routeConfidence });
  return {
    level: qualityLevel(score),
    score,
    normalizedAddress: normalizedAddress || null,
    parts,
    hasCoordinate: hasCoordinate(coordinate),
    provider: provider ?? null,
    routeConfidence: routeConfidence ?? null,
    warnings: buildWarnings(parts, coordinate, score)
  };
}
