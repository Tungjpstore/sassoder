import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type UntypedSupabase = {
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type StockReservationResult = Record<string, unknown>;

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

function assertIdempotencyKey(value: string) {
  if (!IDEMPOTENCY_KEY_RE.test(value)) {
    throw new AppError("Mã chống gửi trùng cho nghiệp vụ kho không hợp lệ.", 422);
  }
}

function mapReservationError(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/PGRST202|42883|could not find the function/i.test(`${error?.code ?? ""} ${message}`)) {
    throw new AppError("Luồng giữ tồn kho chưa sẵn sàng. Hãy chạy migration Phase 2 trước khi tiếp tục.", 503);
  }
  if (/SHORTAGE|not enough|RECIPE_MISSING/i.test(message)) {
    throw new AppError("Không đủ tồn kho hoặc món chưa có định mức để giữ hàng cho đơn prepaid.", 409);
  }
  if (/TENANT_SCOPE|ORDER_NOT_FOUND|PREPAID_ONLY|NOT_ELIGIBLE/i.test(message)) {
    throw new AppError("Đơn prepaid không hợp lệ hoặc không thuộc nhà hàng này.", 409);
  }
  if (/CONCURRENCY|BALANCE_CONFLICT|INGREDIENT_CONFLICT|BATCH_CONFLICT/i.test(message)) {
    throw new AppError("Tồn kho vừa thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  throw new AppError(fallback, 500);
}

async function callReservationRpc(
  functionName: "reserve_order_stock" | "consume_order_stock" | "release_order_stock",
  args: Record<string, unknown>,
  fallback: string
): Promise<StockReservationResult> {
  const { data, error } = await (createAdminSupabaseClient() as unknown as UntypedSupabase).rpc(functionName, args);
  if (error) mapReservationError(error, fallback);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AppError("Phản hồi giữ tồn kho không hợp lệ.", 502);
  }
  return data as StockReservationResult;
}

export function reservePrepaidOrderStock(input: {
  restaurantId: string;
  orderId: string;
  idempotencyKey: string;
  actorUserId?: string | null;
}) {
  assertIdempotencyKey(input.idempotencyKey);
  return callReservationRpc(
    "reserve_order_stock",
    {
      target_restaurant_id: input.restaurantId,
      target_order_id: input.orderId,
      target_idempotency_key: input.idempotencyKey,
      target_actor_user_id: input.actorUserId ?? null
    },
    "Không thể giữ tồn kho cho đơn prepaid."
  );
}

export function consumePrepaidOrderStock(input: {
  restaurantId: string;
  orderId: string;
  idempotencyKey: string;
  actorUserId?: string | null;
}) {
  assertIdempotencyKey(input.idempotencyKey);
  return callReservationRpc(
    "consume_order_stock",
    {
      target_restaurant_id: input.restaurantId,
      target_order_id: input.orderId,
      target_idempotency_key: input.idempotencyKey,
      target_actor_user_id: input.actorUserId ?? null
    },
    "Không thể chuyển tồn kho đã giữ sang tiêu thụ."
  );
}

export function releasePrepaidOrderStock(input: {
  restaurantId: string;
  orderId: string;
  idempotencyKey: string;
  actorUserId?: string | null;
  reason?: string;
}) {
  assertIdempotencyKey(input.idempotencyKey);
  return callReservationRpc(
    "release_order_stock",
    {
      target_restaurant_id: input.restaurantId,
      target_order_id: input.orderId,
      target_idempotency_key: input.idempotencyKey,
      target_actor_user_id: input.actorUserId ?? null,
      target_reason: input.reason ?? "order_cancelled"
    },
    "Không thể trả lại tồn kho đang giữ cho đơn prepaid."
  );
}
