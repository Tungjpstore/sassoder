import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteOrderRequest, fetchRemoteOrder, fetchRemoteOrderHistory, markRemoteOrderPaid } from "./remote-api";

const access = {
  restaurantSlug: "restaurant-one",
  customerSessionId: "11111111-1111-4111-8111-111111111111",
  customerSessionToken: "signed.customer.session"
};

test("remote customer APIs attach the signed customer session token", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  try {
    await fetchRemoteOrder("order-1", access);
    await fetchRemoteOrderHistory(access);
    await markRemoteOrderPaid("order-1", access);
    await createRemoteOrderRequest(access, { fulfillmentType: "PICKUP" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.equal(new Headers(request.init?.headers).get("x-logivn-customer-session-token"), access.customerSessionToken);
  }
});
