import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createCustomerVpsRealtimeToken } from "./realtime-token";

test("customer realtime token is restricted to one verified order room", () => {
  const previous = process.env.LOGIVN_INTERNAL_API_KEY;
  process.env.LOGIVN_INTERNAL_API_KEY = "internal-realtime-secret";
  try {
    const token = createCustomerVpsRealtimeToken({
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderId: "order-1",
      customerSessionExpiresAt: 2_000,
      now: 1_000,
      ttlSeconds: 300
    });
    const [payloadPart, signature] = token.value.split(".");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;

    assert.deepEqual(payload, {
      scope: "customer_order",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderId: "order-1",
      iat: 1_000,
      exp: 1_300
    });
    assert.equal(signature, createHmac("sha256", process.env.LOGIVN_INTERNAL_API_KEY).update(payloadPart).digest("base64url"));
  } finally {
    if (previous === undefined) delete process.env.LOGIVN_INTERNAL_API_KEY;
    else process.env.LOGIVN_INTERNAL_API_KEY = previous;
  }
});

test("customer realtime token never outlives its customer session", () => {
  const previous = process.env.LOGIVN_INTERNAL_API_KEY;
  process.env.LOGIVN_INTERNAL_API_KEY = "internal-realtime-secret";
  try {
    const token = createCustomerVpsRealtimeToken({
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderId: "order-1",
      customerSessionExpiresAt: 1_120,
      now: 1_000,
      ttlSeconds: 300
    });
    const payload = JSON.parse(Buffer.from(token.value.split(".")[0], "base64url").toString("utf8")) as { exp: number };
    assert.equal(payload.exp, 1_120);
  } finally {
    if (previous === undefined) delete process.env.LOGIVN_INTERNAL_API_KEY;
    else process.env.LOGIVN_INTERNAL_API_KEY = previous;
  }
});
