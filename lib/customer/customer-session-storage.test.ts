import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_SESSION_TTL_MS,
  createCustomerSessionId,
  dineInCustomerSessionStorageKey,
  readCustomerSessionId,
  remoteCustomerSessionStorageKey,
  resolveOrCreateCustomerSessionId,
  resolveOrCreateRemoteCustomerSessionId,
  writeCustomerSessionId
} from "./customer-session-storage";

function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    }
  };
  (globalThis as { window?: { localStorage: typeof storage } }).window = { localStorage: storage };
  return storage;
}

test("customer session keys are scoped by restaurant and table", () => {
  assert.equal(dineInCustomerSessionStorageKey("r1", "t1"), "logivn:customer-session:r1:t1");
  assert.equal(remoteCustomerSessionStorageKey("r1"), "logivn-remote-session:r1");
});

test("createCustomerSessionId returns UUID-shaped ids", () => {
  const id = createCustomerSessionId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("resolveOrCreateCustomerSessionId reuses valid stored session and expires old ones", () => {
  installMemoryStorage();
  const key = dineInCustomerSessionStorageKey("rest", "table");
  const first = resolveOrCreateCustomerSessionId(key);
  assert.equal(resolveOrCreateCustomerSessionId(key), first);

  writeCustomerSessionId(key, first);
  // Force expiry by rewriting with old timestamp.
  window.localStorage.setItem(key, JSON.stringify({ id: first, createdAt: Date.now() - CUSTOMER_SESSION_TTL_MS - 1 }));
  assert.equal(readCustomerSessionId(key), null);
  const next = resolveOrCreateCustomerSessionId(key);
  assert.notEqual(next, first);
});

test("remote session reuses bare UUID storage format", () => {
  installMemoryStorage();
  const first = resolveOrCreateRemoteCustomerSessionId("rest-1");
  assert.equal(resolveOrCreateRemoteCustomerSessionId("rest-1"), first);
  assert.equal(window.localStorage.getItem(remoteCustomerSessionStorageKey("rest-1")), first);
});
