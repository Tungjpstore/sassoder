import {
  assertServerRuntime,
  readVerifiedCanonicalToken,
  signCanonicalToken,
  type JsonValue,
  type TokenSecret
} from "./signed-json-token";

/** Node/server-only API; keep signed customer session claims out of browser bundles. */
const CUSTOMER_SESSION_TOKEN_PURPOSE = "logivn.customer-session.v1";
const verifiedCustomerSessionTokenBrand: unique symbol = Symbol("verified-customer-session-token");
export const CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_TTL_SECONDS = CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS;

export type CustomerSessionScope = "REMOTE" | "DINE_IN";

export type CustomerSessionTokenClaims = {
  v: 1;
  sid: string;
  rid: string;
  scope: CustomerSessionScope;
  tableId?: string;
  iat: number;
  exp: number;
  tokenVersion: number;
};

export type VerifiedCustomerSessionTokenClaims = Readonly<CustomerSessionTokenClaims> & {
  readonly [verifiedCustomerSessionTokenBrand]: true;
};

export type CreateCustomerSessionTokenInput = {
  sessionId: string;
  restaurantId: string;
  scope: CustomerSessionScope;
  tableId?: string;
  tokenVersion: number;
};

export type CreateCustomerSessionTokenOptions = {
  secret?: TokenSecret;
  now?: number;
  ttlSeconds?: number;
};

export type VerifyCustomerSessionTokenOptions = {
  secret?: TokenSecret;
  restaurantId: string;
  sessionId: string;
  scope: CustomerSessionScope;
  tableId?: string;
  tokenVersion: number;
  now?: number;
  maxFutureSkewSeconds?: number;
};

export function createCustomerSessionToken(
  input: CreateCustomerSessionTokenInput,
  options: CreateCustomerSessionTokenOptions = {}
) {
  assertServerRuntime();
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!isNonNegativeInteger(now) || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Customer session token times must be positive integer seconds.");
  }
  if (ttlSeconds > CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS) {
    throw new Error("Customer session token lifetime must not exceed 24 hours.");
  }
  return signCustomerSessionToken(
    {
      v: 1,
      sid: input.sessionId,
      rid: input.restaurantId,
      scope: input.scope,
      ...(input.tableId === undefined ? {} : { tableId: input.tableId }),
      iat: now,
      exp: now + ttlSeconds,
      tokenVersion: input.tokenVersion
    },
    resolveSecret(options.secret)
  );
}

export function signCustomerSessionToken(
  input: CustomerSessionTokenClaims & Record<string, unknown>,
  secret?: TokenSecret
) {
  assertServerRuntime();
  if (!hasOnlyKnownClaimKeys(input)) {
    throw new Error("Customer session token contains unknown claims.");
  }
  const claims = normalizeCustomerSessionClaims(input);
  return signCanonicalToken(claims as unknown as JsonValue, resolveSecret(secret), CUSTOMER_SESSION_TOKEN_PURPOSE);
}

export function verifyCustomerSessionToken(
  token: string,
  options: VerifyCustomerSessionTokenOptions
): VerifiedCustomerSessionTokenClaims | null {
  assertServerRuntime();
  if (
    !isCanonicalIdentifier(options?.restaurantId) ||
    !isCanonicalIdentifier(options?.sessionId) ||
    (options?.scope !== "REMOTE" && options?.scope !== "DINE_IN") ||
    !Number.isInteger(options?.tokenVersion) ||
    options.tokenVersion < 1
  ) {
    return null;
  }
  const payload = readVerifiedCanonicalToken(token, resolveSecret(options.secret), CUSTOMER_SESSION_TOKEN_PURPOSE);
  if (!isPlainRecord(payload)) return null;

  let claims: CustomerSessionTokenClaims;
  try {
    claims = normalizeCustomerSessionClaims(payload);
  } catch {
    return null;
  }
  if (!hasOnlyClaimKeys(payload, claims.scope)) return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const futureSkew = options.maxFutureSkewSeconds ?? 0;
  if (!isNonNegativeInteger(now) || !isNonNegativeInteger(futureSkew)) return null;
  if (claims.exp <= now || claims.iat > now + futureSkew) return null;
  if (claims.rid !== options.restaurantId || claims.scope !== options.scope) return null;
  if (claims.sid !== options.sessionId || claims.tokenVersion !== options.tokenVersion) return null;
  if (claims.scope === "DINE_IN" && claims.tableId !== options.tableId) return null;
  if (claims.scope === "REMOTE" && options.tableId !== undefined) return null;

  return markVerifiedClaims(claims);
}

export function isVerifiedCustomerSessionTokenClaims(
  value: unknown
): value is VerifiedCustomerSessionTokenClaims {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { [verifiedCustomerSessionTokenBrand]?: unknown })[verifiedCustomerSessionTokenBrand] === true
  );
}

function normalizeCustomerSessionClaims(input: Record<string, unknown>): CustomerSessionTokenClaims {
  if (input.v !== 1) throw new Error("Unsupported customer session token version.");
  const sid = canonicalIdentifier(input.sid, "sid");
  const rid = canonicalIdentifier(input.rid, "rid");
  if (input.scope !== "REMOTE" && input.scope !== "DINE_IN") {
    throw new Error("Customer session token scope is invalid.");
  }
  const scope = input.scope;
  const iat = input.iat;
  const exp = input.exp;
  const tokenVersion = input.tokenVersion;
  if (!isNonNegativeInteger(iat) || !isNonNegativeInteger(exp) || exp <= iat) {
    throw new Error("Customer session token lifetime is invalid.");
  }
  if (exp - iat > CUSTOMER_SESSION_TOKEN_MAX_TTL_SECONDS) {
    throw new Error("Customer session token lifetime must not exceed 24 hours.");
  }
  if (typeof tokenVersion !== "number" || !Number.isInteger(tokenVersion) || tokenVersion < 1) {
    throw new Error("Customer session tokenVersion must be a positive integer.");
  }

  if (scope === "REMOTE") {
    if (input.tableId !== undefined) throw new Error("REMOTE customer session tokens must not include tableId.");
    return { v: 1, sid, rid, scope, iat, exp, tokenVersion };
  }

  if (input.tableId === undefined) throw new Error("DINE_IN customer session tokens require tableId.");
  const tableId = canonicalIdentifier(input.tableId, "tableId");
  return { v: 1, sid, rid, scope, tableId, iat, exp, tokenVersion };
}

function canonicalIdentifier(value: unknown, field: string) {
  if (!isCanonicalIdentifier(value)) {
    throw new Error(`Customer session token ${field} must be a non-empty canonical string.`);
  }
  return value;
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyClaimKeys(value: Record<string, unknown>, scope: CustomerSessionScope) {
  const expected = scope === "DINE_IN"
    ? ["exp", "iat", "rid", "scope", "sid", "tableId", "tokenVersion", "v"]
    : ["exp", "iat", "rid", "scope", "sid", "tokenVersion", "v"];
  return Object.keys(value).sort().join("|") === expected.join("|");
}

function hasOnlyKnownClaimKeys(value: Record<string, unknown>) {
  const known = new Set(["exp", "iat", "rid", "scope", "sid", "tableId", "tokenVersion", "v"]);
  return Object.keys(value).every((key) => known.has(key));
}

function resolveSecret(secret?: TokenSecret): TokenSecret {
  const resolved =
    secret ??
    process.env.LOGIVN_CUSTOMER_SESSION_TOKEN_SECRET ??
    process.env.LOGIVN_CUSTOMER_TOKEN_SECRET;
  if (!resolved) throw new Error("Customer session token secret is required.");
  return resolved;
}

function markVerifiedClaims(claims: CustomerSessionTokenClaims): VerifiedCustomerSessionTokenClaims {
  Object.defineProperty(claims, verifiedCustomerSessionTokenBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return Object.freeze(claims) as VerifiedCustomerSessionTokenClaims;
}
