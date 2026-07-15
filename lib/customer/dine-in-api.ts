/**
 * Thin client API for dine-in ordering. Keeps fetch contracts out of the monolit UI.
 */

export type DineInAccessParams = {
  restaurantSlug: string;
  tableId: string;
  tableAccessToken?: string | null;
  customerSessionId: string;
};

export type DineInApiError = Error & { status?: number };

type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

async function parseJsonEnvelope<T>(response: Response, fallbackError: string): Promise<T> {
  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!json?.ok || json.data === undefined) {
    const error = new Error(json?.error ?? fallbackError) as DineInApiError;
    error.status = response.status;
    throw error;
  }
  return json.data;
}

function accessBody(access: DineInAccessParams) {
  return {
    restaurantSlug: access.restaurantSlug,
    tableId: access.tableId,
    tableAccessToken: access.tableAccessToken ?? undefined,
    customerSessionId: access.customerSessionId
  };
}

export async function fetchDineInOrderHistory<TOrder>(access: DineInAccessParams): Promise<TOrder[]> {
  const params = new URLSearchParams({
    restaurantSlug: access.restaurantSlug,
    tableId: access.tableId,
    customerSessionId: access.customerSessionId
  });
  if (access.tableAccessToken) params.set("tableAccessToken", access.tableAccessToken);

  const response = await fetch(`/api/orders/history?${params.toString()}`, { cache: "no-store" });
  const data = await parseJsonEnvelope<{ orders?: TOrder[] }>(response, "Không tải được lịch sử gọi món");
  return data.orders ?? [];
}

export async function createDineInOrder<TResult>(
  access: DineInAccessParams,
  input: {
    customerNote?: string;
    promotionCode?: string;
    idempotencyKey: string;
    items: Array<{
      menuItemId: string;
      quantity: number;
      note?: string;
      modifiers?: Array<{ groupId: string; optionId: string; quantity?: number }>;
    }>;
  }
): Promise<TResult> {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...accessBody(access),
      customerNote: input.customerNote,
      promotionCode: input.promotionCode,
      idempotencyKey: input.idempotencyKey,
      items: input.items
    })
  });
  return parseJsonEnvelope<TResult>(response, "Không gửi được đơn hàng");
}

export async function checkoutDineInOrder<TResult>(
  orderId: string,
  access: DineInAccessParams,
  paymentMethod: "QR" | "CASH"
): Promise<TResult> {
  const response = await fetch(`/api/orders/${orderId}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...accessBody(access),
      paymentMethod
    })
  });
  return parseJsonEnvelope<TResult>(response, "Không tạo được yêu cầu thanh toán");
}

export async function markDineInOrderPaid<TResult>(orderId: string, access: DineInAccessParams): Promise<TResult> {
  const response = await fetch(`/api/orders/${orderId}/paid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accessBody(access))
  });
  return parseJsonEnvelope<TResult>(response, "Không cập nhật được thanh toán");
}

export async function callDineInStaff(
  access: DineInAccessParams,
  message = "Khách cần nhân viên hỗ trợ tại bàn."
): Promise<unknown> {
  const response = await fetch("/api/service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...accessBody(access),
      message
    })
  });
  return parseJsonEnvelope(response, "Không gọi được nhân viên");
}
