import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_ORDER_IDEMPOTENCY_TTL_MS,
  clearPendingOrderIdempotency,
  pendingOrderIdempotencyStorageKey,
  readPendingOrderIdempotency,
  resolvePendingOrderIdempotency
} from "./pending-order-idempotency";

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

test("pending order idempotency reuses the same key for the same fingerprint", () => {
  const storage = fakeStorage();
  const storageKey = pendingOrderIdempotencyStorageKey("remote", "restaurant-1");
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

  const first = resolvePendingOrderIdempotency({
    storage,
    storageKey,
    fingerprint: "cart-a",
    createId: () => ids.shift()!,
    now: 1000
  });
  const retry = resolvePendingOrderIdempotency({
    storage,
    storageKey,
    fingerprint: "cart-a",
    createId: () => ids.shift()!,
    now: 2000
  });

  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.equal(ids.length, 1);
});

test("pending order idempotency rotates when the cart fingerprint changes or expires", () => {
  const storage = fakeStorage();
  const storageKey = pendingOrderIdempotencyStorageKey("dine-in", "restaurant-1", "table-1");
  let count = 0;
  const createId = () => `${++count}`.padStart(8, "0") + "-1111-4111-8111-111111111111";

  const first = resolvePendingOrderIdempotency({ storage, storageKey, fingerprint: "cart-a", createId, now: 1000 });
  const changed = resolvePendingOrderIdempotency({ storage, storageKey, fingerprint: "cart-b", createId, now: 2000 });
  const expired = resolvePendingOrderIdempotency({
    storage,
    storageKey,
    fingerprint: "cart-b",
    createId,
    now: 2000 + PENDING_ORDER_IDEMPOTENCY_TTL_MS
  });

  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
  assert.notEqual(expired.idempotencyKey, changed.idempotencyKey);
});

test("pending order idempotency clears corrupt storage", () => {
  const storage = fakeStorage();
  const storageKey = pendingOrderIdempotencyStorageKey("remote", "restaurant-1");

  storage.setItem(storageKey, "{broken");
  assert.equal(readPendingOrderIdempotency(storage, storageKey), null);
  assert.equal(storage.getItem(storageKey), null);

  storage.setItem(storageKey, JSON.stringify({ fingerprint: "cart-a", idempotencyKey: "bad", createdAt: 1000 }));
  assert.equal(readPendingOrderIdempotency(storage, storageKey, 2000), null);
  assert.equal(storage.getItem(storageKey), null);

  clearPendingOrderIdempotency(storage, storageKey);
  assert.equal(storage.getItem(storageKey), null);
});
