import "server-only";

import { createHash } from "node:crypto";
import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeOperationalEvent } from "@/services/operational-observability-service";

type StaffOperationStatus = "started" | "completed" | "failed";

type StaffOperationTarget = {
  targetStaffMemberId?: string | null;
  targetUserId?: string | null;
};

type StaffOperationRunInput = StaffOperationTarget & {
  restaurantId: string;
  actorUserId?: string | null;
  operationType: string;
  operationKey: string;
  requestPayload: unknown;
};

type StaffOperationRow = StaffOperationTarget & {
  id: string;
  operation_key: string;
  operation_type: string;
  status: StaffOperationStatus;
  request_hash: string | null;
  result_payload: Record<string, unknown> | null;
};

type StaffOperationHandle = {
  id: string;
  operationKey: string;
  operationType: string;
};

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;
const OPERATION_TYPE_PATTERN = /^[a-z0-9_.:-]{3,80}$/;
const FALLBACK_KEY_WINDOW_MS = 2 * 60 * 1000;

function stableJson(value: unknown): string {
  if (typeof value === "undefined") return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isDuplicateKeyError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" || /staff_operation_requests_restaurant_operation_key_uidx/i.test(error?.message ?? "");
}

function assertOperationType(operationType: string) {
  if (!OPERATION_TYPE_PATTERN.test(operationType)) {
    throw new AppError("Loại thao tác nhân sự không hợp lệ.", 400);
  }
}

function assertOperationKey(operationKey: string) {
  if (!OPERATION_KEY_PATTERN.test(operationKey)) {
    throw new AppError("Mã chống trùng thao tác nhân sự không hợp lệ.", 400);
  }
}

function normalizeExplicitOperationKey(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const operationKey = value.trim();
  return operationKey.length > 0 ? operationKey : null;
}

export function createStaffOperationKey({
  formData,
  restaurantId,
  actorUserId,
  operationType,
  requestPayload,
  now = Date.now()
}: {
  formData?: FormData;
  restaurantId: string;
  actorUserId?: string | null;
  operationType: string;
  requestPayload: unknown;
  now?: number;
}) {
  const explicitKey = normalizeExplicitOperationKey(formData?.get("operationKey") ?? null);
  if (explicitKey) {
    assertOperationKey(explicitKey);
    return explicitKey;
  }

  const timeBucket = Math.floor(now / FALLBACK_KEY_WINDOW_MS);
  const keyMaterial = stableJson({ actorUserId, operationType, requestPayload, restaurantId, timeBucket });
  return `srv:${sha256(keyMaterial)}`;
}

export function hashStaffOperationPayload(value: unknown) {
  return sha256(stableJson(value));
}

function operationSelectColumns() {
  return "id,operation_key,operation_type,status,request_hash,result_payload,target_staff_member_id,target_user_id";
}

async function findExistingOperation({
  supabase,
  restaurantId,
  operationType,
  operationKey
}: {
  supabase: any;
  restaurantId: string;
  operationType: string;
  operationKey: string;
}) {
  const { data, error } = await supabase
    .from("staff_operation_requests")
    .select(operationSelectColumns())
    .eq("restaurant_id", restaurantId)
    .eq("operation_type", operationType)
    .eq("operation_key", operationKey)
    .maybeSingle();

  if (error) throw new AppError(error.message, 400);
  return data as StaffOperationRow | null;
}

async function beginStaffOperation(input: StaffOperationRunInput) {
  assertOperationType(input.operationType);
  assertOperationKey(input.operationKey);

  const supabase = createAdminSupabaseClient() as any;
  const requestHash = hashStaffOperationPayload(input.requestPayload);
  const payload = {
    restaurant_id: input.restaurantId,
    operation_key: input.operationKey,
    operation_type: input.operationType,
    actor_user_id: input.actorUserId ?? null,
    target_staff_member_id: input.targetStaffMemberId ?? null,
    target_user_id: input.targetUserId ?? null,
    status: "started" as StaffOperationStatus,
    request_hash: requestHash
  };

  const { data, error } = await supabase
    .from("staff_operation_requests")
    .insert(payload)
    .select(operationSelectColumns())
    .single();

  if (!error && data) {
    return { mode: "started" as const, handle: toHandle(data as StaffOperationRow) };
  }

  if (!isDuplicateKeyError(error)) {
    throw new AppError(error?.message ?? "Không tạo được khóa an toàn cho thao tác nhân sự.", 400);
  }

  const existing = await findExistingOperation({
    supabase,
    restaurantId: input.restaurantId,
    operationType: input.operationType,
    operationKey: input.operationKey
  });

  if (!existing) throw new AppError("Thao tác nhân sự đang bị tranh chấp. Vui lòng thử lại.", 409);
  if (existing.request_hash && existing.request_hash !== requestHash) {
    throw new AppError("Mã thao tác đã được dùng cho nội dung khác. Vui lòng tải lại màn hình và thử lại.", 409);
  }
  if (existing.status === "completed") {
    return { mode: "replay" as const, result: existing.result_payload ?? {} };
  }
  if (existing.status === "started") {
    throw new AppError("Thao tác nhân sự này đang được xử lý. Vui lòng chờ kết quả trước khi bấm lại.", 409);
  }

  throw new AppError("Thao tác nhân sự trước đó đã lỗi. Vui lòng tải lại màn hình và thực hiện lại.", 409);
}

function toHandle(row: StaffOperationRow): StaffOperationHandle {
  return {
    id: row.id,
    operationKey: row.operation_key,
    operationType: row.operation_type
  };
}

async function completeStaffOperation(handle: StaffOperationHandle, resultPayload: Record<string, unknown>) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("staff_operation_requests")
    .update({
      status: "completed",
      result_payload: resultPayload,
      error_message: null
    })
    .eq("id", handle.id)
    .eq("status", "started");

  if (error) throw new AppError(error.message, 400);
}

async function failStaffOperation(handle: StaffOperationHandle, error: unknown) {
  const supabase = createAdminSupabaseClient() as any;
  const errorMessage = error instanceof Error ? error.message : "unknown";

  const result = await supabase
    .from("staff_operation_requests")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 500)
    })
    .eq("id", handle.id)
    .eq("status", "started");

  if (result.error) {
    writeOperationalEvent({
      area: "audit",
      event: "staff_operation_failure_record_failed",
      status: "error",
      metadata: {
        operationKey: handle.operationKey,
        operationType: handle.operationType,
        error: result.error.message
      }
    });
  }
}

export async function runStaffOperation<T extends Record<string, unknown>>(
  input: StaffOperationRunInput,
  handler: () => Promise<T>,
  options?: {
    persistResult?: (result: T) => Record<string, unknown>;
  }
) {
  const operation = await beginStaffOperation(input);
  if (operation.mode === "replay") return operation.result as T;

  try {
    const result = await handler();
    await completeStaffOperation(operation.handle, options?.persistResult ? options.persistResult(result) : result);
    return result;
  } catch (error) {
    await failStaffOperation(operation.handle, error);
    throw error;
  }
}
