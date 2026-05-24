import { recordMapCacheEvent } from "@/services/maps/observability-service";
import { readSharedCache, writeSharedCache } from "@/services/maps/cache-service";
import type { DeliveryQuoteInput } from "@/services/delivery-service";

const pendingQuotes = new Map<string, Promise<unknown>>();

function compactHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function roundCoordinate(value: number | undefined) {
  if (!Number.isFinite(value)) return "none";
  return Number(value).toFixed(5);
}

export function buildDeliveryQuoteCacheKey(restaurantSlug: string, input: DeliveryQuoteInput) {
  const normalizedAddress = input.deliveryAddress?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return [
    "delivery_quote",
    restaurantSlug,
    Math.round(Number(input.subtotal) || 0),
    roundCoordinate(input.deliveryLat),
    roundCoordinate(input.deliveryLng),
    compactHash(normalizedAddress)
  ].join(":");
}

export async function withDeliveryQuoteCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = Number(process.env.DELIVERY_QUOTE_CACHE_TTL_MS ?? 25_000)
) {
  const cached = await readSharedCache<T>("delivery_quote", key);
  recordMapCacheEvent({ type: "map_cache", operation: "delivery_quote", namespace: "delivery_quote", hit: cached.hit });
  if (cached.hit) return cached.value;

  const pending = pendingQuotes.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader()
    .then((value) => {
      void writeSharedCache("delivery_quote", key, value, Math.min(Math.max(ttlMs, 0), 120_000));
      return value;
    })
    .finally(() => pendingQuotes.delete(key));

  pendingQuotes.set(key, request);
  return request;
}
