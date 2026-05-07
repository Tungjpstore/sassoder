"use client";

import type { OrderDto } from "@/types/domain";

const cacheTtlMs = 6_000;

let cachedKitchenOrders: { expiresAt: number; data: OrderDto[] } | null = null;
let inFlightKitchenOrders: Promise<OrderDto[]> | null = null;

export function readCachedKitchenOrders() {
  if (!cachedKitchenOrders) return null;
  if (cachedKitchenOrders.expiresAt <= Date.now()) {
    cachedKitchenOrders = null;
    return null;
  }
  return cachedKitchenOrders.data;
}

export function writeCachedKitchenOrders(data: OrderDto[]) {
  cachedKitchenOrders = {
    data,
    expiresAt: Date.now() + cacheTtlMs
  };
}

export async function fetchKitchenOrders({ force = false }: { force?: boolean } = {}) {
  const cached = force ? null : readCachedKitchenOrders();
  if (cached) return cached;

  if (!force && inFlightKitchenOrders) return inFlightKitchenOrders;

  inFlightKitchenOrders = fetch("/api/admin/kitchen", {
    cache: "no-store",
    headers: {
      "x-logivn-client-cache": "1"
    }
  })
    .then(async (response) => {
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được hàng đợi bếp");
      const data = json.data as OrderDto[];
      writeCachedKitchenOrders(data);
      return data;
    })
    .finally(() => {
      inFlightKitchenOrders = null;
    });

  return inFlightKitchenOrders;
}

export function prefetchKitchenOrders() {
  void fetchKitchenOrders().catch(() => undefined);
}
