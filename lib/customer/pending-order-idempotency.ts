export type PendingOrderIdempotency = {
  fingerprint: string;
  idempotencyKey: string;
  createdAt: number;
};

export const PENDING_ORDER_IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;

type IdempotencyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUsablePendingOrder(value: unknown, now: number): value is PendingOrderIdempotency {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<PendingOrderIdempotency>;
  return (
    typeof record.fingerprint === "string" &&
    isUuid(record.idempotencyKey) &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    now - record.createdAt < PENDING_ORDER_IDEMPOTENCY_TTL_MS
  );
}

export function pendingOrderIdempotencyStorageKey(scope: "dine-in" | "remote", ...parts: string[]) {
  return ["logivn", scope, "pending-order", ...parts].join(":");
}

export function readPendingOrderIdempotency(storage: IdempotencyStorage, key: string, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null") as unknown;
    if (isUsablePendingOrder(parsed, now)) return parsed;
  } catch {
    // Corrupt storage should never block ordering.
  }

  storage.removeItem(key);
  return null;
}

export function clearPendingOrderIdempotency(storage: IdempotencyStorage, key: string) {
  storage.removeItem(key);
}

export function resolvePendingOrderIdempotency(input: {
  storage: IdempotencyStorage;
  storageKey: string;
  fingerprint: string;
  createId: () => string;
  now?: number;
}): PendingOrderIdempotency {
  const now = input.now ?? Date.now();
  const current = readPendingOrderIdempotency(input.storage, input.storageKey, now);
  const next =
    current?.fingerprint === input.fingerprint
      ? current
      : {
          fingerprint: input.fingerprint,
          idempotencyKey: input.createId(),
          createdAt: now
        };

  input.storage.setItem(input.storageKey, JSON.stringify(next));
  return next;
}
