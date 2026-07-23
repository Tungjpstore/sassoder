import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalJson, type JsonValue } from "@/lib/customer/signed-json-token";
import { AppError } from "@/lib/response";
import type { Database, Json } from "@/types/supabase";

const FINANCIAL_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export function buildFinancialStageIdempotencyKey(input: {
  stage: string;
  entityId: string;
  orderStateVersion?: number | null;
  billStateVersion?: number | null;
}) {
  return `phase1:${input.stage}:${input.entityId}:o${input.orderStateVersion ?? "na"}:b${input.billStateVersion ?? "na"}`;
}

type FinancialRpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

type FinancialRpcResponse = Record<string, Json | undefined>;

export function fingerprintFinancialRequest(value: JsonValue) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function mapFinancialRpcError(error: unknown, fallbackMessage: string) {
  const rpcError = (error ?? {}) as FinancialRpcError;
  const code = rpcError.code ?? "";
  const message = rpcError.message ?? "";
  const normalized = `${message} ${rpcError.details ?? ""}`;

  if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(normalized)) {
    return financialAppError("Luồng giao dịch an toàn chưa sẵn sàng. Vui lòng thử lại sau.", 503, "FINANCIAL_RPC_UNAVAILABLE");
  }
  if (code === "40001" || code === "40P01" || /STATE_VERSION_CONFLICT|IDEMPOTENCY_FINGERPRINT_MISMATCH|deadlock detected/i.test(normalized)) {
    return financialAppError("Dữ liệu thanh toán đã thay đổi. Vui lòng tải lại và thử lại.", 409, "FINANCIAL_CONFLICT");
  }
  if (/PROMOTION_USAGE_LIMIT_REACHED|PROMOTION_CUSTOMER_IDENTITY_REQUIRED|PROMOTION_DISCOUNT_MISMATCH|PROMOTION_NOT_CANONICAL|INVALID_RESTAURANT_PROMOTION/i.test(normalized)) {
    return financialAppError("Ưu đãi vừa thay đổi hoặc không còn áp dụng cho đơn này.", 409, "PROMOTION_CONFLICT");
  }
  if (/CANONICAL_MENU_PRICE_MISMATCH|MODIFIER_PRICE_MISMATCH|PAYMENT_AMOUNT_MISMATCH/i.test(normalized)) {
    return financialAppError("Giá món hoặc tổng tiền vừa thay đổi. Vui lòng tải lại giỏ hàng.", 409, "ORDER_PRICE_CONFLICT");
  }
  if (/STOCK_RESERVATION_(?:SHORTAGE|RECIPE_MISSING|CONCURRENCY_CONFLICT)|STOCK_(?:CONSUME|RELEASE)_(?:BALANCE|INGREDIENT|BATCH)_CONFLICT/i.test(normalized)) {
    return financialAppError("Tồn kho vừa thay đổi hoặc không đủ để giữ hàng cho đơn prepaid. Vui lòng thử lại.", 409, "STOCK_RESERVATION_CONFLICT");
  }
  if (/ORDER_NOT_ACCEPTED|BILL_NOT_OPEN|INVALID_(?:BILL|ORDER|PAYMENT)_TRANSITION|INVALID_ORDER_PAYMENT_STATE_FOR_CANCELLATION|CANCELLATION_AFTER_PREPARATION_NOT_ALLOWED/i.test(normalized)) {
    return financialAppError(fallbackMessage, 409, "FINANCIAL_STATE_CONFLICT");
  }
  if (code === "P0002") {
    return financialAppError(fallbackMessage, 404, "FINANCIAL_RESOURCE_NOT_FOUND");
  }
  if (code === "42501") {
    return financialAppError("Bạn không có quyền thực hiện giao dịch này.", 403, "FINANCIAL_FORBIDDEN");
  }
  if (code === "22023" || code === "23503" || code === "P0001") {
    return financialAppError(fallbackMessage, 400, "FINANCIAL_VALIDATION_FAILED");
  }
  return financialAppError(fallbackMessage, 500, "FINANCIAL_RPC_FAILED");
}

export async function createOnlineOrderAtomic(
  client: SupabaseClient<Database>,
  input: {
    restaurantId: string;
    idempotencyKey: string;
    order: JsonValue;
    items: JsonValue;
    actorUserId?: string | null;
  }
) {
  assertFinancialIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintFinancialRequest({
    operation: "create_online_order",
    restaurantId: input.restaurantId,
    order: input.order,
    items: input.items
  });
  const { data, error } = await client.rpc("create_online_order_atomic", {
    p_restaurant_id: input.restaurantId,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_order: input.order as Json,
    p_items: input.items as Json,
    p_actor_user_id: input.actorUserId ?? null
  });

  if (error) throw mapFinancialRpcError(error, "Không tạo được đơn hàng.");
  return requireFinancialRpcResponse(data, "Phản hồi tạo đơn không hợp lệ.");
}

export async function checkoutBillAtomic(
  client: SupabaseClient<Database>,
  input: {
    restaurantId: string;
    billId: string;
    expectedStateVersion: number;
    idempotencyKey: string;
    paymentMethod: "QR" | "CASH";
    actorUserId?: string | null;
  }
) {
  assertFinancialIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintFinancialRequest({
    operation: "checkout_bill",
    restaurantId: input.restaurantId,
    billId: input.billId,
    expectedStateVersion: input.expectedStateVersion,
    paymentMethod: input.paymentMethod
  });
  const { data, error } = await client.rpc("checkout_bill_atomic", {
    p_restaurant_id: input.restaurantId,
    p_bill_id: input.billId,
    p_expected_state_version: input.expectedStateVersion,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_payment_method: input.paymentMethod,
    p_actor_user_id: input.actorUserId ?? null
  });

  if (error) throw mapFinancialRpcError(error, "Không thể bắt đầu thanh toán cho hóa đơn này.");
  return requireFinancialRpcResponse(data, "Phản hồi thanh toán hóa đơn không hợp lệ.");
}

export async function transitionPaymentAtomic(
  client: SupabaseClient<Database>,
  input: {
    restaurantId: string;
    orderId: string;
    billId?: string | null;
    expectedOrderStateVersion: number;
    expectedBillStateVersion?: number | null;
    toStatus: "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
    nextOrderStatus?: "pending" | "ordering" | "waiting_payment" | "waiting_confirm" | "paid" | "completed" | "cancelled" | null;
    paymentMethod: "QR" | "CASH";
    amount: number;
    idempotencyKey: string;
    actorUserId?: string | null;
    rawData?: JsonValue | null;
  }
) {
  assertFinancialIdempotencyKey(input.idempotencyKey);
  const requestFingerprint = fingerprintFinancialRequest({
    operation: "transition_payment",
    restaurantId: input.restaurantId,
    orderId: input.orderId,
    billId: input.billId ?? null,
    expectedOrderStateVersion: input.expectedOrderStateVersion,
    expectedBillStateVersion: input.expectedBillStateVersion ?? null,
    toStatus: input.toStatus,
    nextOrderStatus: input.nextOrderStatus ?? null,
    paymentMethod: input.paymentMethod,
    amount: input.amount,
    rawData: input.rawData ?? null
  });
  const { data, error } = await client.rpc("transition_payment_atomic", {
    p_restaurant_id: input.restaurantId,
    p_order_id: input.orderId,
    p_bill_id: input.billId ?? null,
    p_expected_order_state_version: input.expectedOrderStateVersion,
    p_expected_bill_state_version: input.expectedBillStateVersion ?? null,
    p_to_status: input.toStatus,
    p_next_order_status: input.nextOrderStatus ?? null,
    p_payment_method: input.paymentMethod,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_request_fingerprint: requestFingerprint,
    p_actor_user_id: input.actorUserId ?? null,
    p_raw_data: (input.rawData ?? null) as Json
  });

  if (error) throw mapFinancialRpcError(error, "Không thể cập nhật trạng thái thanh toán.");
  return requireFinancialRpcResponse(data, "Phản hồi chuyển trạng thái thanh toán không hợp lệ.");
}

export async function cancelOrderAtomic(
  client: SupabaseClient<Database>,
  input: {
    restaurantId: string;
    orderId: string;
    actorUserId?: string | null;
  }
) {
  const { data, error } = await client.rpc("cancel_order_atomic", {
    p_restaurant_id: input.restaurantId,
    p_order_id: input.orderId,
    p_actor_user_id: input.actorUserId ?? null
  });

  if (error) throw mapFinancialRpcError(error, "Không thể huỷ đơn hàng an toàn.");
  return requireFinancialRpcResponse(data, "Phản hồi huỷ đơn không hợp lệ.");
}

function assertFinancialIdempotencyKey(value: string) {
  if (!FINANCIAL_IDEMPOTENCY_KEY_RE.test(value)) {
    throw financialAppError("Mã chống gửi trùng không hợp lệ.", 422, "INVALID_IDEMPOTENCY_KEY");
  }
}

function requireFinancialRpcResponse(value: Json | null, message: string): FinancialRpcResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw financialAppError(message, 502, "INVALID_FINANCIAL_RPC_RESPONSE");
  }
  return value as FinancialRpcResponse;
}

function financialAppError(message: string, status: number, code: string) {
  const error = new AppError(message, status) as AppError & { code?: string };
  error.code = code;
  return error;
}
