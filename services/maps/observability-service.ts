import { getEstimatedMapProviderCostVnd } from "@/services/maps/provider-policy-service";
import type { GeocodingProvider, MapRequestContext, RouteConfidence, RoutingProvider } from "@/services/maps/types";
import type { Database } from "@/types/supabase";

type ProviderOperation = "geocode" | "reverse" | "route";
type CacheOperation = ProviderOperation | "delivery_quote";

type MapProviderTelemetryEvent = {
  type: "map_provider";
  operation: ProviderOperation;
  provider: GeocodingProvider | RoutingProvider;
  outcome: "success" | "http_error" | "timeout" | "error" | "empty";
  latencyMs: number;
  status?: number;
  context?: MapRequestContext;
};

type MapCacheTelemetryEvent = {
  type: "map_cache";
  operation: CacheOperation;
  namespace: string;
  hit: boolean;
  context?: MapRequestContext;
};

type DeliveryQuoteTelemetryEvent = {
  type: "delivery_quote";
  restaurantId?: string | null;
  restaurantSlug: string;
  accepted: boolean;
  provider: string;
  routeProvider?: string | null;
  confidence?: RouteConfidence | null;
  isEstimated?: boolean | null;
  distanceKm?: number | null;
  fee?: number | null;
  latencyMs: number;
};

function durableTelemetryEnabled() {
  return process.env.MAPS_DB_TELEMETRY_ENABLED !== "false";
}

function telemetryEnabled() {
  return process.env.MAPS_TELEMETRY_ENABLED !== "false";
}

function sampleRate() {
  const value = Number(process.env.MAPS_TELEMETRY_SAMPLE_RATE ?? 0.2);
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(Math.max(value, 0), 1);
}

function durableSampleRate() {
  const value = Number(process.env.MAPS_DB_TELEMETRY_SAMPLE_RATE ?? 0.15);
  if (!Number.isFinite(value)) return 0.15;
  return Math.min(Math.max(value, 0), 1);
}

function shouldEmit(event: MapProviderTelemetryEvent | MapCacheTelemetryEvent | DeliveryQuoteTelemetryEvent) {
  if (!telemetryEnabled()) return false;
  if (event.type === "map_provider" && event.outcome !== "success") return true;
  if (event.type === "delivery_quote" && !event.accepted) return true;
  return Math.random() <= sampleRate();
}

function shouldPersist(event: MapProviderTelemetryEvent | MapCacheTelemetryEvent | DeliveryQuoteTelemetryEvent) {
  if (!durableTelemetryEnabled()) return false;
  if (event.type === "map_provider" && event.outcome !== "success") return true;
  if (event.type === "delivery_quote" && !event.accepted) return true;
  return Math.random() <= durableSampleRate();
}

function emitTelemetry(event: MapProviderTelemetryEvent | MapCacheTelemetryEvent | DeliveryQuoteTelemetryEvent) {
  if (!shouldEmit(event)) return;
  console.info(
    JSON.stringify({
      service: "logivn-map-service",
      timestamp: new Date().toISOString(),
      ...event
    })
  );
}

async function persistMapProviderEvent(event: MapProviderTelemetryEvent) {
  if (!shouldPersist(event)) return;
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const payload: Database["public"]["Tables"]["map_provider_request_logs"]["Insert"] = {
      restaurant_id: event.context?.restaurantId ?? null,
      restaurant_slug: event.context?.restaurantSlug ?? null,
      source: event.context?.source ?? null,
      operation: event.operation,
      provider: event.provider,
      outcome: event.outcome,
      status_code: event.status ?? null,
      latency_ms: event.latencyMs,
      estimated_cost_vnd: getEstimatedMapProviderCostVnd(event.provider, event.operation)
    };
    await createAdminSupabaseClient().from("map_provider_request_logs").insert(payload);
  } catch {
    // Observability must never affect the customer ordering path.
  }
}

async function persistMapCacheEvent(event: MapCacheTelemetryEvent) {
  if (!shouldPersist(event)) return;
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const payload: Database["public"]["Tables"]["map_cache_event_logs"]["Insert"] = {
      restaurant_id: event.context?.restaurantId ?? null,
      restaurant_slug: event.context?.restaurantSlug ?? null,
      source: event.context?.source ?? null,
      operation: event.operation,
      namespace: event.namespace,
      hit: event.hit
    };
    await createAdminSupabaseClient().from("map_cache_event_logs").insert(payload);
  } catch {
    // Observability must never affect the customer ordering path.
  }
}

async function persistDeliveryQuoteEvent(event: DeliveryQuoteTelemetryEvent) {
  if (!shouldPersist(event)) return;
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const payload: Database["public"]["Tables"]["delivery_quote_metric_logs"]["Insert"] = {
      restaurant_slug: event.restaurantSlug,
      restaurant_id: event.restaurantId ?? null,
      accepted: event.accepted,
      provider: event.provider as Database["public"]["Tables"]["delivery_quote_metric_logs"]["Insert"]["provider"],
      route_provider: (event.routeProvider ?? null) as Database["public"]["Tables"]["delivery_quote_metric_logs"]["Insert"]["route_provider"],
      confidence: event.confidence ?? null,
      is_estimated: event.isEstimated ?? null,
      distance_km: event.distanceKm ?? null,
      fee: event.fee ?? null,
      latency_ms: event.latencyMs
    };
    await createAdminSupabaseClient().from("delivery_quote_metric_logs").insert(payload);
  } catch {
    // Observability must never affect the customer ordering path.
  }
}

export function recordMapProviderEvent(event: MapProviderTelemetryEvent) {
  emitTelemetry(event);
  void persistMapProviderEvent(event);
}

export function recordMapCacheEvent(event: MapCacheTelemetryEvent) {
  emitTelemetry(event);
  void persistMapCacheEvent(event);
}

export function recordDeliveryQuoteEvent(event: DeliveryQuoteTelemetryEvent) {
  emitTelemetry(event);
  void persistDeliveryQuoteEvent(event);
}
