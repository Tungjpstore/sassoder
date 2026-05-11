"use client";

import type { OrderDto, ServiceRequestDto } from "@/types/domain";

export type ActionCenterSnapshot = {
  orders: OrderDto[];
  requests: ServiceRequestDto[];
  fetchedAt: number;
  features?: {
    orderRealtime: boolean;
    staffCall: boolean;
  };
};

const cacheTtlMs = 8_000;

const cachedActionCenters = new Map<string, { expiresAt: number; data: ActionCenterSnapshot }>();
const inFlightActionCenters = new Map<string, Promise<ActionCenterSnapshot>>();

export function readCachedActionCenter(restaurantId: string) {
  const cached = cachedActionCenters.get(restaurantId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cachedActionCenters.delete(restaurantId);
    return null;
  }
  return cached.data;
}

export function writeCachedActionCenter(restaurantId: string, data: ActionCenterSnapshot) {
  cachedActionCenters.set(restaurantId, {
    data,
    expiresAt: Date.now() + cacheTtlMs
  });
}

export async function fetchActionCenter({
  restaurantId,
  force = false
}: {
  restaurantId: string;
  force?: boolean;
}) {
  const cached = force ? null : readCachedActionCenter(restaurantId);
  if (cached) return cached;

  const inFlight = inFlightActionCenters.get(restaurantId);
  if (inFlight) return inFlight;

  const request = fetch("/api/admin/action-center", {
    cache: "no-store",
    headers: {
      "x-logivn-client-cache": "1"
    }
  })
    .then(async (response) => {
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được luồng vận hành");

      const payload = json.data as Omit<ActionCenterSnapshot, "fetchedAt">;
      const snapshot: ActionCenterSnapshot = {
        orders: payload.orders ?? [],
        requests: payload.requests ?? [],
        features: payload.features,
        fetchedAt: Date.now()
      };
      writeCachedActionCenter(restaurantId, snapshot);
      return snapshot;
    })
    .finally(() => {
      inFlightActionCenters.delete(restaurantId);
    });

  inFlightActionCenters.set(restaurantId, request);
  return request;
}
