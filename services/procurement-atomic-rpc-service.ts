import { createHash } from "node:crypto";
import { AppError } from "@/lib/response";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue | undefined };

type InventoryRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

type InventoryRpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

const INVENTORY_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export function fingerprintInventoryRequest(value: CanonicalValue) {
  return createHash("sha256").update(canonicalInventoryJson(value), "utf8").digest("hex");
}

export async function receivePurchaseOrderAtomic(
  client: InventoryRpcClient,
  input: {
    restaurantId: string;
    purchaseOrderId: string;
    actorUserId: string;
    idempotencyKey: string;
    receivedAt: string;
    lines: Array<{
      purchaseOrderLineId: string;
      receivedQuantity: number;
      unitCost?: number;
      expirationDate?: string;
      batchCode?: string;
      note?: string;
    }>;
  }
) {
  assertInventoryIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintInventoryRequest({
    operation: "receive_purchase_order",
    restaurantId: input.restaurantId,
    purchaseOrderId: input.purchaseOrderId,
    lines: input.lines
  });
  const { data, error } = await client.rpc("receive_purchase_order_atomic", {
    p_restaurant_id: input.restaurantId,
    p_purchase_order_id: input.purchaseOrderId,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_actor_user_id: input.actorUserId,
    p_received_at: input.receivedAt,
    p_lines: input.lines
  });

  if (error) throw mapProcurementRpcError(error, "Không thể nhận hàng purchase order.");
  return requireInventoryRpcResponse(data);
}

export async function applyInventoryCountAtomic(
  client: InventoryRpcClient,
  input: {
    restaurantId: string;
    actorUserId: string;
    idempotencyKey: string;
    title: string;
    locationId: string | null;
    note: string | null;
    lines: Array<{
      ingredientId: string;
      countedQuantity: number;
      locationId?: string;
      note?: string;
    }>;
  }
) {
  assertInventoryIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintInventoryRequest({
    operation: "apply_inventory_count",
    restaurantId: input.restaurantId,
    title: input.title,
    locationId: input.locationId,
    note: input.note,
    lines: input.lines
  });
  const { data, error } = await client.rpc("apply_inventory_count_atomic", {
    p_restaurant_id: input.restaurantId,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_title: input.title,
    p_location_id: input.locationId,
    p_note: input.note,
    p_actor_user_id: input.actorUserId,
    p_lines: input.lines
  });

  if (error) throw mapProcurementRpcError(error, "Không thể áp dụng kiểm kê kho.");
  return requireInventoryRpcResponse(data);
}

export async function createBranchTransferAtomic(
  client: InventoryRpcClient,
  input: {
    restaurantId: string;
    actorUserId: string;
    idempotencyKey: string;
    fromLocationId: string;
    toLocationId: string;
    note: string | null;
    lines: Array<{
      ingredientId: string;
      quantity: number;
      unit?: string;
      batchId?: string;
      note?: string;
    }>;
  }
) {
  assertInventoryIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintInventoryRequest({
    operation: "create_branch_transfer",
    restaurantId: input.restaurantId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    note: input.note,
    lines: input.lines
  });
  const { data, error } = await client.rpc("create_branch_transfer_atomic", {
    p_restaurant_id: input.restaurantId,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_from_location_id: input.fromLocationId,
    p_to_location_id: input.toLocationId,
    p_note: input.note,
    p_actor_user_id: input.actorUserId,
    p_lines: input.lines
  });

  if (error) throw mapProcurementRpcError(error, "Không thể tạo điều chuyển kho.");
  return requireInventoryRpcResponse(data);
}

export async function processBranchTransferAtomic(
  client: InventoryRpcClient,
  input: {
    restaurantId: string;
    transferId: string;
    action: "approve" | "dispatch" | "receive" | "cancel";
    actorUserId: string;
    idempotencyKey: string;
    note: string | null;
    lines: Array<{ lineId: string; receivedQuantity: number; note?: string }> | null;
  }
) {
  assertInventoryIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintInventoryRequest({
    operation: "process_branch_transfer",
    restaurantId: input.restaurantId,
    transferId: input.transferId,
    action: input.action,
    note: input.note,
    lines: input.lines
  });
  const { data, error } = await client.rpc("process_branch_transfer_atomic", {
    p_restaurant_id: input.restaurantId,
    p_transfer_id: input.transferId,
    p_action: input.action,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_actor_user_id: input.actorUserId,
    p_note: input.note,
    p_lines: input.lines
  });

  if (error) throw mapProcurementRpcError(error, "Không thể cập nhật điều chuyển kho.");
  return requireInventoryRpcResponse(data);
}

export function mapProcurementRpcError(error: unknown, fallbackMessage: string) {
  const rpcError = (error ?? {}) as InventoryRpcError;
  const code = rpcError.code ?? "";
  const normalized = `${rpcError.message ?? ""} ${rpcError.details ?? ""}`;

  if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(normalized)) {
    return inventoryAppError(
      "Luồng nghiệp vụ kho nguyên tử chưa sẵn sàng. Vui lòng thử lại sau.",
      503,
      "INVENTORY_RPC_UNAVAILABLE"
    );
  }
  if (
    code === "40001" ||
    code === "40P01" ||
    /INVENTORY_IDEMPOTENCY_FINGERPRINT_MISMATCH|PURCHASE_ORDER_OVER_RECEIPT|deadlock detected/i.test(normalized)
  ) {
    return inventoryAppError("Dữ liệu kho đã thay đổi. Vui lòng tải lại và thử lại.", 409, "INVENTORY_CONFLICT");
  }
  if (/RESTAURANT_SCOPE_MISMATCH|BRANCH_SCOPE_MISMATCH/i.test(normalized) || code === "42501") {
    return inventoryAppError("Bạn không có quyền thực hiện nghiệp vụ kho này.", 403, "INVENTORY_FORBIDDEN");
  }
  if (code === "P0002") {
    return inventoryAppError(fallbackMessage, 404, "INVENTORY_RESOURCE_NOT_FOUND");
  }
  if (code === "22023" || code === "23503" || code === "P0001") {
    return inventoryAppError(fallbackMessage, 400, "INVENTORY_VALIDATION_FAILED");
  }
  return inventoryAppError(fallbackMessage, 500, "INVENTORY_RPC_FAILED");
}

function canonicalInventoryJson(value: CanonicalValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalInventoryJson).join(",")}]`;

  const entries = Object.entries(value)
    .filter((entry): entry is [string, CanonicalValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalInventoryJson(item)}`).join(",")}}`;
}

function assertInventoryIdempotencyKey(value: string) {
  if (!INVENTORY_IDEMPOTENCY_KEY_RE.test(value)) {
    throw inventoryAppError("Mã chống gửi trùng không hợp lệ.", 422, "INVALID_INVENTORY_IDEMPOTENCY_KEY");
  }
}

function requireInventoryRpcResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw inventoryAppError("Phản hồi nghiệp vụ kho không hợp lệ.", 502, "INVALID_INVENTORY_RPC_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function inventoryAppError(message: string, status: number, code: string) {
  const error = new AppError(message, status) as AppError & { code?: string };
  error.code = code;
  return error;
}
