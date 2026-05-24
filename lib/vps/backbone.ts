import "server-only";

import { AppError } from "@/lib/response";

type LockInput = {
  tenantId: string;
  scope: "payment" | "order" | "inventory" | "reservation";
  resourceId: string;
  ttlMs?: number;
};

type LockResponse = {
  acquired?: boolean;
  key?: string;
  token?: string;
};

export async function withVpsDistributedLock<T>(input: LockInput, fn: () => Promise<T>) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;

  if (!gatewayUrl || !internalKey) {
    if (process.env.VERCEL_ENV === "production" || process.env.LOGIVN_ENV === "production") {
      throw new AppError("Hạ tầng khóa giao dịch chưa được cấu hình.", 503);
    }
    console.warn("[vps-lock] skipped outside production: missing gateway or internal key", input);
    return fn();
  }

  const lock = await acquireLock(gatewayUrl, internalKey, input);
  if (!lock.acquired || !lock.key || !lock.token) {
    throw new AppError("Thao tác đang được xử lý. Vui lòng thử lại sau.", 409);
  }

  const releaseToken = { key: lock.key, token: lock.token };

  try {
    return await fn();
  } finally {
    await releaseLock(gatewayUrl, internalKey, releaseToken).catch((error) => {
      console.error("[vps-lock] release failed", { key: lock.key, error });
    });
  }
}

async function acquireLock(gatewayUrl: string, internalKey: string, input: LockInput) {
  const response = await fetch(new URL("/locks/acquire", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify({
      tenantId: input.tenantId,
      key: lockKey(input),
      ttlMs: input.ttlMs ?? 30_000
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(1500)
  });

  if (response.status === 423) return { acquired: false };
  if (!response.ok) throw new AppError("Không kiểm tra được khóa giao dịch.", 503);
  return (await response.json()) as LockResponse;
}

async function releaseLock(gatewayUrl: string, internalKey: string, lock: Required<Pick<LockResponse, "key" | "token">>) {
  await fetch(new URL("/locks/release", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify(lock),
    cache: "no-store",
    signal: AbortSignal.timeout(1500)
  });
}

function lockKey(input: LockInput) {
  return ["lock", "tenant", safe(input.tenantId), safe(input.scope), safe(input.resourceId)].join(":");
}

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 160);
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || "";
}
