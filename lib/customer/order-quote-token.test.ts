import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS,
  createOrderQuoteToken,
  verifyOrderQuoteToken,
  verifyOrderQuoteTokenResult,
  type OrderQuoteTokenPayload,
  type VerifyOrderQuoteTokenOptions
} from "./order-quote-token";

const SECRET = "order-quote-secret-material-32-bytes-minimum";
const NOW = 1_750_000_000;
const PURPOSE = "logivn.order-quote.v1";
const ORDERING_VERSION = 3;
const EXPECTED_TOTAL = 120000;

const payload: OrderQuoteTokenPayload = {
  currency: "VND",
  subtotal: 120000,
  items: [{ id: "item-1", quantity: 2 }],
  delivery: { address: "12 Nguyen Hue", lat: 10.77, lng: 106.7 }
};

test("order quote token fingerprints canonical JSON payloads", () => {
  const token = createOrderQuoteToken(
    {
      quoteId: "quote-1",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      payload
    },
    { secret: SECRET, now: NOW, ttlSeconds: 120 }
  );
  const verified = verifyOrderQuoteToken(token, {
    secret: SECRET,
    restaurantId: "restaurant-1",
    customerSessionId: "session-1",
    payload,
    orderingVersion: ORDERING_VERSION,
    expectedTotal: EXPECTED_TOTAL,
    now: NOW
  });
  assert.equal(verified?.quoteId, "quote-1");
  assert.equal(verified?.payloadFingerprint.length, 43);
  assert.equal(verified?.expectedTotal, EXPECTED_TOTAL);

  const reorderedPayload = {
    delivery: { lng: 106.7, address: "12 Nguyen Hue", lat: 10.77 },
    items: [{ quantity: 2, id: "item-1" }],
    subtotal: 120000,
    currency: "VND"
  };
  assert.equal(
    verifyOrderQuoteToken(token, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      payload: reorderedPayload,
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      now: NOW
    })?.quoteId,
    "quote-1"
  );
});

test("order quote token rejects tampering, expiry and wrong restaurant or session", () => {
  const token = createOrderQuoteToken(
    {
      quoteId: "quote-1",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderingVersion: "v3",
      expectedTotal: EXPECTED_TOTAL,
      payload
    },
    { secret: SECRET, now: NOW, ttlSeconds: 120 }
  );
  const [encodedPayload, signature] = token.split(".");
  const tampered = `${encodedPayload.slice(0, -1)}${encodedPayload.endsWith("A") ? "B" : "A"}.${signature}`;
  assert.equal(
    verifyOrderQuoteToken(tampered, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      payload,
      orderingVersion: "v3",
      expectedTotal: EXPECTED_TOTAL,
      now: NOW
    }),
    null
  );
  assert.equal(
    verifyOrderQuoteToken(token, {
      secret: SECRET,
      restaurantId: "restaurant-2",
      customerSessionId: "session-1",
      payload,
      orderingVersion: "v3",
      expectedTotal: EXPECTED_TOTAL,
      now: NOW
    }),
    null
  );
  assert.equal(
    verifyOrderQuoteToken(token, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      customerSessionId: "session-2",
      payload,
      orderingVersion: "v3",
      expectedTotal: EXPECTED_TOTAL,
      now: NOW
    }),
    null
  );
  assert.equal(
    verifyOrderQuoteToken(token, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      payload,
      orderingVersion: "v3",
      expectedTotal: EXPECTED_TOTAL,
      now: NOW + 120
    }),
    null
  );
});

test("order quote token rejects payloads that are not canonical JSON values", () => {
  assert.throws(
    () =>
      createOrderQuoteToken(
        {
          quoteId: "quote-1",
          restaurantId: "restaurant-1",
          customerSessionId: "session-1",
          orderingVersion: 3,
          expectedTotal: EXPECTED_TOTAL,
          payload: { broken: Number.NaN }
        },
        { secret: SECRET, now: NOW, ttlSeconds: 120 }
      ),
    /canonical JSON/
  );
  assert.throws(
    () =>
      createOrderQuoteToken(
        {
          quoteId: "quote-1",
          restaurantId: "restaurant-1",
          customerSessionId: "session-1",
          orderingVersion: 3,
          expectedTotal: EXPECTED_TOTAL,
          payload: { broken: undefined }
        },
        { secret: SECRET, now: NOW, ttlSeconds: 120 }
      ),
    /JSON-safe/
  );
  assert.throws(
    () =>
      createOrderQuoteToken(
        {
          quoteId: "quote-1",
          restaurantId: "restaurant-1",
          customerSessionId: "session-1",
          orderingVersion: 3,
          expectedTotal: EXPECTED_TOTAL,
          payload: Array(1)
        },
        { secret: SECRET, now: NOW, ttlSeconds: 120 }
      ),
    /JSON-safe/
  );
});

test("order quote verification requires exact payload, ordering version and expected total", () => {
  const token = createOrderQuoteToken(
    {
      quoteId: "quote-1",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      payload
    },
    { secret: SECRET, now: NOW, ttlSeconds: 120 }
  );
  const base = {
    secret: SECRET,
    restaurantId: "restaurant-1",
    customerSessionId: "session-1",
    payload,
    orderingVersion: ORDERING_VERSION,
    expectedTotal: EXPECTED_TOTAL,
    now: NOW
  };
  assert.equal(verifyOrderQuoteToken(token, { ...base, payload: { ...payload, subtotal: 119999 } }), null);
  assert.equal(verifyOrderQuoteToken(token, { ...base, orderingVersion: 4 }), null);
  assert.equal(verifyOrderQuoteToken(token, { ...base, expectedTotal: EXPECTED_TOTAL + 1 }), null);
  assert.equal(
    verifyOrderQuoteToken(
      token,
      omit(base, "payload") as unknown as VerifyOrderQuoteTokenOptions
    ),
    null
  );
  assert.equal(
    verifyOrderQuoteToken(
      token,
      omit(base, "orderingVersion") as unknown as VerifyOrderQuoteTokenOptions
    ),
    null
  );
  assert.equal(
    verifyOrderQuoteToken(
      token,
      omit(base, "expectedTotal") as unknown as VerifyOrderQuoteTokenOptions
    ),
    null
  );
});

test("order quote token enforces non-negative integer totals and a five-minute maximum lifetime", () => {
  for (const expectedTotal of [-1, 1.5]) {
    assert.throws(
      () =>
        createOrderQuoteToken(
          {
            quoteId: "quote-1",
            restaurantId: "restaurant-1",
            customerSessionId: "session-1",
            orderingVersion: ORDERING_VERSION,
            expectedTotal,
            payload
          },
          { secret: SECRET, now: NOW, ttlSeconds: 120 }
        ),
      /expectedTotal/
    );
  }
  assert.equal(ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS, 300);
  assert.throws(
    () =>
      createOrderQuoteToken(
        {
          quoteId: "quote-1",
          restaurantId: "restaurant-1",
          customerSessionId: "session-1",
          orderingVersion: ORDERING_VERSION,
          expectedTotal: EXPECTED_TOTAL,
          payload
        },
        { secret: SECRET, now: NOW, ttlSeconds: ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS + 1 }
      ),
    /5 minutes/
  );

  const token = createOrderQuoteToken(
    {
      quoteId: "quote-1",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      payload
    },
    { secret: SECRET, now: NOW, ttlSeconds: ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS }
  );
  const claims = decodeClaims(token);
  const oversizedToken = forgeQuoteToken({ ...claims, exp: claims.iat + ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS + 1 });
  assert.equal(
    verifyOrderQuoteToken(oversizedToken, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      payload,
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      now: NOW
    }),
    null
  );
});

test("order quote result distinguishes stale quote bindings from invalid tokens", () => {
  const token = createOrderQuoteToken(
    {
      quoteId: "quote-1",
      restaurantId: "restaurant-1",
      customerSessionId: "session-1",
      orderingVersion: ORDERING_VERSION,
      expectedTotal: EXPECTED_TOTAL,
      payload
    },
    { secret: SECRET, now: NOW, ttlSeconds: 120 }
  );
  const base = {
    secret: SECRET,
    restaurantId: "restaurant-1",
    customerSessionId: "session-1",
    payload,
    orderingVersion: ORDERING_VERSION,
    expectedTotal: EXPECTED_TOTAL,
    now: NOW
  };
  assert.equal(verifyOrderQuoteTokenResult(token, base).status, "valid");
  assert.deepEqual(verifyOrderQuoteTokenResult(token, { ...base, expectedTotal: EXPECTED_TOTAL + 1 }), {
    status: "stale",
    reason: "EXPECTED_TOTAL_MISMATCH"
  });
  assert.deepEqual(verifyOrderQuoteTokenResult(token, { ...base, orderingVersion: 4 }), {
    status: "stale",
    reason: "ORDERING_VERSION_MISMATCH"
  });
  assert.deepEqual(verifyOrderQuoteTokenResult(token, { ...base, now: NOW + 120 }), {
    status: "stale",
    reason: "EXPIRED"
  });
  const [encodedPayload, signature] = token.split(".");
  const tampered = `${encodedPayload.slice(0, -1)}${encodedPayload.endsWith("A") ? "B" : "A"}.${signature}`;
  assert.deepEqual(verifyOrderQuoteTokenResult(tampered, base), {
    status: "invalid",
    reason: "INVALID_TOKEN"
  });
});

function omit<T extends Record<string, unknown>, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function decodeClaims(token: string) {
  const [encodedPayload] = token.split(".");
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    iat: number;
    exp: number;
    [key: string]: unknown;
  };
}

function forgeQuoteToken(claims: Record<string, unknown>) {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(claims).sort(([left], [right]) => left.localeCompare(right)))
  );
  const encodedPayload = Buffer.from(canonical, "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(`${PURPOSE}.${encodedPayload}`, "utf8")
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}
