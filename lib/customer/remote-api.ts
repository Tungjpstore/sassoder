/**
 * Thin client API for online (remote) ordering.
 */

export type RemoteAccessParams = {
  restaurantSlug: string;
  customerSessionId: string;
};

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

async function parseJsonEnvelope<T>(response: Response, fallbackError: string): Promise<T> {
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json?.ok || json.data === undefined) {
    throw new Error(json?.error ?? fallbackError);
  }
  return json.data;
}

export async function fetchRemoteOrder<TResult>(orderId: string, access: RemoteAccessParams): Promise<TResult> {
  const params = new URLSearchParams({
    restaurantSlug: access.restaurantSlug,
    customerSessionId: access.customerSessionId
  });
  const response = await fetch(`/api/remote-orders/${orderId}?${params.toString()}`, { cache: "no-store" });
  return parseJsonEnvelope<TResult>(response, "Không tải được trạng thái đơn");
}

export async function fetchRemoteOrderHistory<TOrder>(access: RemoteAccessParams): Promise<TOrder[]> {
  const params = new URLSearchParams({
    restaurantSlug: access.restaurantSlug,
    customerSessionId: access.customerSessionId
  });
  const response = await fetch(`/api/remote-orders/history?${params.toString()}`, { cache: "no-store" });
  const data = await parseJsonEnvelope<{ orders?: TOrder[] } | TOrder[]>(response, "Không tải được lịch sử đơn online");
  if (Array.isArray(data)) return data;
  return data.orders ?? [];
}

export async function markRemoteOrderPaid<TResult>(orderId: string, access: RemoteAccessParams): Promise<TResult> {
  const response = await fetch(`/api/remote-orders/${orderId}/paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug: access.restaurantSlug,
      customerSessionId: access.customerSessionId
    })
  });
  return parseJsonEnvelope<TResult>(response, "Không cập nhật được thanh toán");
}

export async function createRemoteOrderRequest<TResult>(
  access: RemoteAccessParams,
  body: Record<string, unknown>
): Promise<TResult> {
  const response = await fetch("/api/remote-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantSlug: access.restaurantSlug,
      customerSessionId: access.customerSessionId,
      ...body
    })
  });
  return parseJsonEnvelope<TResult>(response, "Không gửi được đơn");
}
