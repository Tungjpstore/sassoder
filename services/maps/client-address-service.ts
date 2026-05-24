import type { AddressAutocompletePrediction, Coordinate, GeocodingResult } from "@/services/maps/types";

type PredictionRequest = {
  query: string;
  limit?: number;
  sessionToken: string;
  location?: Coordinate | null;
  signal?: AbortSignal;
};

type PlaceDetailRequest = {
  sessionToken: string;
  signal?: AbortSignal;
};

function isFiniteCoordinate(value: unknown) {
  return Number.isFinite(Number(value));
}

function predictionHasCoordinate(prediction: AddressAutocompletePrediction) {
  return isFiniteCoordinate(prediction.lat) && isFiniteCoordinate(prediction.lng);
}

function paramsFromPredictionRequest(request: PredictionRequest) {
  const params = new URLSearchParams({
    q: request.query,
    limit: String(request.limit ?? 5),
    sessionToken: request.sessionToken
  });

  if (request.location) {
    params.set("lat", String(request.location.lat));
    params.set("lng", String(request.location.lng));
  }

  return params;
}

function predictionToGeocodingResult(prediction: AddressAutocompletePrediction): GeocodingResult {
  if (!predictionHasCoordinate(prediction)) {
    throw new Error("Gợi ý này cần được lấy chi tiết trước khi dùng.");
  }

  return {
    id: prediction.id,
    provider: prediction.provider,
    address: prediction.address,
    label: prediction.label,
    shortLabel: prediction.shortLabel,
    countryCode: prediction.countryCode ?? null,
    lat: Number(prediction.lat),
    lng: Number(prediction.lng)
  };
}

export function createMapSessionToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `logivn-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export async function fetchAddressPredictions(request: PredictionRequest) {
  const response = await fetch(`/api/maps/autocomplete?${paramsFromPredictionRequest(request).toString()}`, {
    cache: "no-store",
    signal: request.signal
  });
  const json = (await response.json()) as {
    ok?: boolean;
    data?: { predictions?: AddressAutocompletePrediction[] };
    error?: string;
  };

  if (!json.ok) throw new Error(json.error ?? "Không tìm được địa chỉ.");
  return json.data?.predictions ?? [];
}

export async function resolveAddressPrediction(
  prediction: AddressAutocompletePrediction,
  request: PlaceDetailRequest
) {
  if (predictionHasCoordinate(prediction)) return predictionToGeocodingResult(prediction);
  if (!prediction.placeId) throw new Error("Gợi ý chưa có mã địa chỉ để lấy chi tiết.");

  const params = new URLSearchParams({
    placeId: prediction.placeId,
    sessionToken: request.sessionToken
  });
  const response = await fetch(`/api/maps/place-detail?${params.toString()}`, {
    cache: "no-store",
    signal: request.signal
  });
  const json = (await response.json()) as {
    ok?: boolean;
    data?: GeocodingResult;
    error?: string;
  };

  if (!json.ok || !json.data) throw new Error(json.error ?? "Không lấy được tọa độ địa chỉ.");
  return json.data;
}
