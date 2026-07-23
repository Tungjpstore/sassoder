import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS,
  createCustomerSessionToken,
  signCustomerSessionToken,
  verifyCustomerSessionToken,
  type CustomerSessionTokenClaims,
  type VerifyCustomerSessionTokenOptions
} from "./customer-session-token";

const SECRET = "customer-session-secret-material-32-bytes-minimum";
const NOW = 1_750_000_000;
const PURPOSE = "logivn.customer-session.v1";

const claims: CustomerSessionTokenClaims = {
  v: 1,
  sid: "session-1",
  rid: "restaurant-1",
  scope: "DINE_IN",
  tableId: "table-1",
  iat: NOW,
  exp: NOW + 300,
  tokenVersion: 4
};

function verify(token: string, overrides: Partial<Parameters<typeof verifyCustomerSessionToken>[1]> = {}) {
  return verifyCustomerSessionToken(token, {
    secret: SECRET,
    restaurantId: "restaurant-1",
    sessionId: "session-1",
    scope: "DINE_IN",
    tableId: "table-1",
    now: NOW,
    tokenVersion: 4,
    ...overrides
  });
}

test("customer session token uses deterministic canonical base64url claims without PII", () => {
  const reordered = {
    tokenVersion: 4,
    exp: NOW + 300,
    iat: NOW,
    tableId: "table-1",
    scope: "DINE_IN" as const,
    rid: "restaurant-1",
    sid: "session-1",
    v: 1 as const
  };

  const first = signCustomerSessionToken(claims, SECRET);
  const second = signCustomerSessionToken(reordered, SECRET);
  assert.equal(first, second);

  const [encodedPayload] = first.split(".");
  assert.match(encodedPayload, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")), claims);
});

test("customer session token signer rejects unknown claims instead of silently stripping them", () => {
  assert.throws(
    () =>
      signCustomerSessionToken(
        { ...claims, customerName: "Must not be signed", customerPhone: "0901000000" },
        SECRET
      ),
    /unknown claims/
  );
});

test("customer session token verifies its tenant, scope, table and token version", () => {
  const token = signCustomerSessionToken(claims, SECRET);
  assert.deepEqual(verify(token), claims);
  assert.equal(verify(token, { restaurantId: "restaurant-2" }), null);
  assert.equal(verify(token, { sessionId: "session-2" }), null);
  assert.equal(verify(token, { scope: "REMOTE", tableId: undefined }), null);
  assert.equal(verify(token, { tableId: "table-2" }), null);
  assert.equal(verify(token, { tokenVersion: 5 }), null);
});

test("customer session token verification requires expected session and token version bindings", () => {
  const token = signCustomerSessionToken(claims, SECRET);
  const base = {
    secret: SECRET,
    restaurantId: "restaurant-1",
    scope: "DINE_IN" as const,
    tableId: "table-1",
    now: NOW
  };
  assert.equal(
    verifyCustomerSessionToken(token, base as unknown as VerifyCustomerSessionTokenOptions),
    null
  );
  assert.equal(
    verifyCustomerSessionToken(
      token,
      { ...base, sessionId: "session-1" } as unknown as VerifyCustomerSessionTokenOptions
    ),
    null
  );
  assert.equal(
    verifyCustomerSessionToken(token, { ...base, sessionId: "", tokenVersion: 4 }),
    null
  );
  assert.equal(
    verifyCustomerSessionToken(token, undefined as unknown as VerifyCustomerSessionTokenOptions),
    null
  );
});

test("customer session token rejects tampering, expiry and future issuance", () => {
  const token = signCustomerSessionToken(claims, SECRET);
  const [payload, signature] = token.split(".");
  const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
  assert.equal(verify(`${tamperedPayload}.${signature}`), null);
  assert.equal(verify(token, { now: claims.exp }), null);

  const futureToken = signCustomerSessionToken({ ...claims, iat: NOW + 1, exp: NOW + 301 }, SECRET);
  assert.equal(verify(futureToken), null);
});

test("customer session token requires a 32-byte secret and valid scope/table claims", () => {
  assert.throws(() => signCustomerSessionToken(claims, "too-short"), /32 bytes/);
  assert.throws(
    () => signCustomerSessionToken({ ...claims, scope: "REMOTE" }, SECRET),
    /REMOTE.*tableId/
  );
  assert.throws(
    () => signCustomerSessionToken({ ...claims, scope: "DINE_IN", tableId: undefined }, SECRET),
    /DINE_IN.*tableId/
  );
});

test("customer session token enforces the 24-hour upper lifetime bound", () => {
  const upperBoundToken = createCustomerSessionToken(
    {
      sessionId: "session-1",
      restaurantId: "restaurant-1",
      scope: "DINE_IN",
      tableId: "table-1",
      tokenVersion: 4
    },
    { secret: SECRET, now: NOW, ttlSeconds: CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS }
  );
  assert.equal(verify(upperBoundToken)?.exp, NOW + CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS);

  assert.throws(
    () =>
      createCustomerSessionToken(
        {
          sessionId: "session-1",
          restaurantId: "restaurant-1",
          scope: "DINE_IN",
          tableId: "table-1",
          tokenVersion: 4
        },
        { secret: SECRET, now: NOW, ttlSeconds: CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS + 1 }
      ),
    /24 hours/
  );
  assert.throws(
    () =>
      signCustomerSessionToken(
        { ...claims, exp: claims.iat + CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS + 1 },
        SECRET
      ),
    /24 hours/
  );

  const forgedLongLivedToken = forgeCustomerSessionToken({
    ...claims,
    exp: claims.iat + CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS + 1
  });
  assert.equal(verify(forgedLongLivedToken), null);
});

test("customer session token rejects malformed, unsupported-version and non-canonical base64url tokens", () => {
  const token = signCustomerSessionToken(claims, SECRET);
  for (const malformed of ["", "payload", `${token}.extra`, `*.${token.split(".")[1]}`]) {
    assert.equal(verify(malformed), null);
  }
  assert.equal(verify(forgeCustomerSessionToken({ ...claims, v: 2 })), null);

  const paddedClaims = { ...claims, sid: "session-12" };
  const canonical = forgeCustomerSessionToken(paddedClaims);
  const [encodedPayload] = canonical.split(".");
  const nonCanonicalPayload = makeNonCanonicalBase64Url(encodedPayload);
  const matchingSignature = signEncodedPayload(nonCanonicalPayload);
  assert.equal(verify(`${nonCanonicalPayload}.${matchingSignature}`, { sessionId: "session-12" }), null);

  const [payload, signature] = token.split(".");
  assert.equal(verify(`${payload}.${makeNonCanonicalBase64Url(signature)}`), null);
});

test("customer session token applies an explicit future issuance skew boundary", () => {
  const token = signCustomerSessionToken({ ...claims, iat: NOW + 5, exp: NOW + 305 }, SECRET);
  assert.deepEqual(verify(token, { now: NOW, maxFutureSkewSeconds: 5 }), {
    ...claims,
    iat: NOW + 5,
    exp: NOW + 305
  });
  assert.equal(verify(token, { now: NOW, maxFutureSkewSeconds: 4 }), null);
});

test("createCustomerSessionToken issues bounded claims from server time", () => {
  const token = createCustomerSessionToken(
    {
      sessionId: "remote-session",
      restaurantId: "restaurant-1",
      scope: "REMOTE",
      tokenVersion: 2
    },
    { secret: SECRET, now: NOW, ttlSeconds: 60 }
  );

  assert.deepEqual(
    verifyCustomerSessionToken(token, {
      secret: SECRET,
      restaurantId: "restaurant-1",
      sessionId: "remote-session",
      scope: "REMOTE",
      now: NOW,
      tokenVersion: 2
    }),
    {
      v: 1,
      sid: "remote-session",
      rid: "restaurant-1",
      scope: "REMOTE",
      iat: NOW,
      exp: NOW + 60,
      tokenVersion: 2
    }
  );
});

function forgeCustomerSessionToken(payload: Record<string, unknown>) {
  const canonicalPayload = JSON.stringify(
    Object.fromEntries(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)))
  );
  const encodedPayload = Buffer.from(canonicalPayload, "utf8").toString("base64url");
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

function signEncodedPayload(encodedPayload: string) {
  return createHmac("sha256", SECRET).update(`${PURPOSE}.${encodedPayload}`, "utf8").digest("base64url");
}

function makeNonCanonicalBase64Url(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const remainder = value.length % 4;
  assert.ok(remainder === 2 || remainder === 3, "test value must contain unused base64url pad bits");
  const lastIndex = alphabet.indexOf(value.at(-1)!);
  assert.ok(lastIndex >= 0 && lastIndex < 63);
  return `${value.slice(0, -1)}${alphabet[lastIndex + 1]}`;
}
