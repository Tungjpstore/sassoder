import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOMER_SESSION_TTL_MS,
  createCustomerSessionId,
  dineInCustomerSessionStorageKey,
  readCustomerSessionId,
  remoteCustomerSessionStorageKey,
  resolveOrCreateRemoteCustomerSession,
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

test("remote session uses the same 24-hour envelope as dine-in sessions", () => {
  installMemoryStorage();
  const first = resolveOrCreateRemoteCustomerSessionId("rest-1");
  assert.equal(resolveOrCreateRemoteCustomerSessionId("rest-1"), first);

  const raw = window.localStorage.getItem(remoteCustomerSessionStorageKey("rest-1"));
  assert.ok(raw);
  const stored = JSON.parse(raw) as { id?: string; createdAt?: number };
  assert.equal(stored.id, first);
  assert.equal(typeof stored.createdAt, "number");
});

test("remote session rotates legacy bare UUIDs and expired envelopes", () => {
  installMemoryStorage();
  const key = remoteCustomerSessionStorageKey("rest-1");
  const legacy = "11111111-1111-4111-8111-111111111111";
  window.localStorage.setItem(key, legacy);

  const migrated = resolveOrCreateRemoteCustomerSessionId("rest-1");
  assert.notEqual(migrated, legacy);

  window.localStorage.setItem(
    key,
    JSON.stringify({ id: migrated, createdAt: Date.now() - CUSTOMER_SESSION_TTL_MS - 1 })
  );
  assert.notEqual(resolveOrCreateRemoteCustomerSessionId("rest-1"), migrated);
});

test("signed remote sessions are issued by the server and reused until token expiry", async () => {
  installMemoryStorage();
  const issued = {
    restaurantId: "rest-1",
    customerSessionId: "11111111-1111-4111-8111-111111111111",
    token: "signed.customer.session",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    tokenVersion: 1
  };
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true, data: issued }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };

  const first = await resolveOrCreateRemoteCustomerSession("rest-1", "restaurant-one", { fetchImpl });
  const second = await resolveOrCreateRemoteCustomerSession("rest-1", "restaurant-one", { fetchImpl });

  assert.deepEqual(first, { id: issued.customerSessionId, token: issued.token, expiresAt: issued.expiresAt });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test("signed remote sessions rotate expired and unsigned storage", async () => {
  installMemoryStorage();
  const key = remoteCustomerSessionStorageKey("rest-1");
  window.localStorage.setItem(key, JSON.stringify({
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: Date.now(),
    token: "",
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  }));
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      ok: true,
      data: {
        customerSessionId: "22222222-2222-4222-8222-222222222222",
        token: "replacement.token",
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  };

  const session = await resolveOrCreateRemoteCustomerSession("rest-1", "restaurant-one", { fetchImpl });
  assert.equal(session.id, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls, 1);
});
