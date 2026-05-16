import { MapApiError } from "@/services/maps/errors";
import { checkMapRateLimit } from "@/services/maps/rate-limit-service";
import { recordMapProviderEvent } from "@/services/maps/observability-service";
import type { Coordinate, GeocodingProvider, MapRequestContext, RoutingProvider } from "@/services/maps/types";

type ProviderOperation = "geocode" | "reverse" | "route";

const pendingRequests = new Map<string, Promise<unknown>>();
const providerCircuit = new Map<string, { failures: number; openUntil: number }>();

export async function withRequestDedupe<T>(key: string, loader: () => Promise<T>) {
  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader().finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

export function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function getNumberEnv(name: string, fallback: number) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getGoongApiKey() {
  return getEnv("GOONG_API_KEY");
}

export function getMapboxAccessToken() {
  return getEnv("MAPBOX_ACCESS_TOKEN") || getEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
}

export function getGeocodingCountryCodes() {
  const configured = getEnv("MAPS_GEOCODER_COUNTRY_CODES") || getEnv("MAPS_COUNTRY_CODES") || "vn";
  const normalized = configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.includes("*")) return [];
  return normalized.filter((item) => /^[a-z]{2}$/.test(item));
}

export function getGeocodingCountryParam() {
  const countries = getGeocodingCountryCodes();
  return countries.length > 0 ? countries.join(",") : "";
}

export function getGeocodingLanguage() {
  return getEnv("MAPS_GEOCODER_LANGUAGE") || "vi";
}

export function getGeocodingScopeKey() {
  return `${getGeocodingCountryParam() || "global"}:${getGeocodingLanguage()}`;
}

export function parseProviderList<TProvider extends string>(value: string, allowed: readonly TProvider[]) {
  const allowedSet = new Set<string>(allowed);
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is TProvider => allowedSet.has(item));
}

export function uniqueProviders<TProvider extends string>(providers: TProvider[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}

function circuitKey(provider: string, operation: ProviderOperation) {
  return `${operation}:${provider}`;
}

export function isCircuitOpen(provider: string, operation: ProviderOperation) {
  const state = providerCircuit.get(circuitKey(provider, operation));
  return Boolean(state && state.openUntil > Date.now());
}

export function recordProviderResult(provider: string, operation: ProviderOperation, ok: boolean) {
  const key = circuitKey(provider, operation);
  if (ok) {
    providerCircuit.delete(key);
    return;
  }

  const current = providerCircuit.get(key);
  const failures = (current?.failures ?? 0) + 1;
  providerCircuit.set(key, {
    failures,
    openUntil: failures >= getNumberEnv("MAPS_CIRCUIT_FAILURE_THRESHOLD", 3)
      ? Date.now() + getNumberEnv("MAPS_CIRCUIT_COOLDOWN_MS", 30_000)
      : 0
  });
}

export async function fetchJson<T>(
  url: URL | string,
  init?: RequestInit & {
    timeoutMs?: number;
    telemetry?: {
      operation: ProviderOperation;
      provider: GeocodingProvider | RoutingProvider;
      context?: MapRequestContext;
    };
  }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 4000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init?.headers
      },
      cache: "no-store"
    });

    if (!response.ok) {
      if (init?.telemetry) {
        recordMapProviderEvent({
          type: "map_provider",
          ...init.telemetry,
          outcome: "http_error",
          status: response.status,
          latencyMs: Date.now() - startedAt
        });
      }
      return null;
    }

    if (init?.telemetry) {
      recordMapProviderEvent({
        type: "map_provider",
        ...init.telemetry,
        outcome: "success",
        status: response.status,
        latencyMs: Date.now() - startedAt
      });
    }
    return (await response.json()) as T;
  } catch (error) {
    if (init?.telemetry) {
      recordMapProviderEvent({
        type: "map_provider",
        ...init.telemetry,
        outcome: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "error",
        latencyMs: Date.now() - startedAt
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeLabel(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

export function toCoordinate(lat: unknown, lng: unknown): Coordinate | null {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return null;
  return { lat: nextLat, lng: nextLng };
}

export async function assertDistributedMapRateLimit(key: string, limit = 24, windowMs = 60_000) {
  const result = await checkMapRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new MapApiError("Bạn đang thao tác bản đồ quá nhanh. Vui lòng thử lại sau vài giây.", 429, "MAP_RATE_LIMITED");
  }
  return result;
}
