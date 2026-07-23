import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerSessionToken } from "./customer-session-token";
import {
  customerSessionTokenVersion,
  customerSessionTokenHeader,
  isLegacyCustomerSessionFallbackEnabled,
  verifyRemoteCustomerSessionRequest
} from "./customer-session-auth";

const SECRET = "customer-session-secret-material-32-bytes-minimum";
const restaurantId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";

function token(overrides: Partial<{ restaurantId: string; sessionId: string; tokenVersion: number; now: number; ttlSeconds: number }> = {}) {
  return createCustomerSessionToken(
    {
      restaurantId: overrides.restaurantId ?? restaurantId,
      sessionId: overrides.sessionId ?? sessionId,
      scope: "REMOTE",
      tokenVersion: overrides.tokenVersion ?? 1
    },
    { secret: SECRET, now: overrides.now ?? 1_000, ttlSeconds: overrides.ttlSeconds ?? 900 }
  );
}

test("remote customer requests require a verified token bound to tenant, session, scope and version", () => {
  const verified = verifyRemoteCustomerSessionRequest(
    {
      restaurantId,
      sessionId,
      token: token(),
      tokenVersion: 1,
      now: 1_100,
      secret: SECRET
    }
  );

  assert.equal(verified?.sid, sessionId);
  assert.equal(verified?.rid, restaurantId);
  assert.equal(verified?.scope, "REMOTE");
  assert.equal(verified?.tokenVersion, 1);
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: token({ restaurantId: "33333333-3333-4333-8333-333333333333" }), tokenVersion: 1, now: 1_100, secret: SECRET }), null);
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: token({ sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), tokenVersion: 1, now: 1_100, secret: SECRET }), null);
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: token({ tokenVersion: 2 }), tokenVersion: 1, now: 1_100, secret: SECRET }), null);
});

test("remote customer requests fail closed for missing, expired and malformed tokens", () => {
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: "", tokenVersion: 1, now: 1_100, secret: SECRET }), null);
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: token({ now: 1_000, ttlSeconds: 50 }), tokenVersion: 1, now: 1_050, secret: SECRET }), null);
  assert.equal(verifyRemoteCustomerSessionRequest({ restaurantId, sessionId, token: "not-a-token", tokenVersion: 1, now: 1_100, secret: SECRET }), null);
});

test("legacy raw session fallback is disabled unless explicitly enabled", () => {
  assert.equal(isLegacyCustomerSessionFallbackEnabled({}), false);
  assert.equal(isLegacyCustomerSessionFallbackEnabled({ LOGIVN_ALLOW_LEGACY_CUSTOMER_SESSION: "true" }), true);
  assert.equal(isLegacyCustomerSessionFallbackEnabled({ LOGIVN_ALLOW_LEGACY_CUSTOMER_SESSION: "1" }), false);
  assert.equal(customerSessionTokenHeader(), "x-logivn-customer-session-token");
});

test("customer session token version defaults to one and rejects invalid configuration", () => {
  assert.equal(customerSessionTokenVersion({}), 1);
  assert.equal(customerSessionTokenVersion({ LOGIVN_CUSTOMER_SESSION_TOKEN_VERSION: "7" }), 7);
  assert.throws(
    () => customerSessionTokenVersion({ LOGIVN_CUSTOMER_SESSION_TOKEN_VERSION: "0" }),
    /positive integer/
  );
  assert.throws(
    () => customerSessionTokenVersion({ LOGIVN_CUSTOMER_SESSION_TOKEN_VERSION: "latest" }),
    /positive integer/
  );
});
