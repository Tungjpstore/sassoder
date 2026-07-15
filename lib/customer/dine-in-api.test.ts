import assert from "node:assert/strict";
import test from "node:test";
import { createDineInOrder, fetchDineInOrderHistory, markDineInOrderPaid } from "./dine-in-api";

const access = {
  restaurantSlug: "demo",
  tableId: "table-1",
  customerSessionId: "11111111-1111-4111-8111-111111111111",
  tableAccessToken: "abcdef0123456789abcdef0123456789abcdef01"
};

test("fetchDineInOrderHistory builds query and unwraps envelope", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true, data: { orders: [{ id: "o1" }] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const orders = await fetchDineInOrderHistory<{ id: string }>(access);
    assert.equal(orders[0]?.id, "o1");
    assert.match(calls[0]?.url ?? "", /\/api\/orders\/history\?/);
    assert.match(calls[0]?.url ?? "", /restaurantSlug=demo/);
    assert.match(calls[0]?.url ?? "", /tableAccessToken=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createDineInOrder posts cart payload and surfaces API errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false, error: "Món hết" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        createDineInOrder(access, {
          idempotencyKey: "k1",
          items: [{ menuItemId: "m1", quantity: 1 }]
        }),
      /Món hết/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("markDineInOrderPaid posts to paid endpoint", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true, data: { order: { id: "o1", status: "waiting_confirm" } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const result = await markDineInOrderPaid<{ order: { id: string } }>("o1", access);
    assert.equal(result.order.id, "o1");
    assert.equal(calls[0]?.url, "/api/orders/o1/paid");
    assert.equal(calls[0]?.init?.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
