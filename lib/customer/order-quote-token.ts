import {
  assertServerRuntime,
  fingerprintJson,
  readVerifiedCanonicalToken,
  signCanonicalToken,
  type JsonValue,
  type TokenSecret
} from "./signed-json-token";

const ORDER_QUOTE_TOKEN_PURPOSE = "logivn.order-quote.v1";
export const ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS = 5 * 60;
const DEFAULT_TTL_SECONDS = ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS;

export type OrderQuoteTokenPayload = JsonValue;
export type OrderingVersion = string | number;

export type OrderQuoteTokenClaims = {
  v: 1;
  quoteId: string;
  restaurantId: string;
  customerSessionId: string;
  orderingVersion: OrderingVersion;
  expectedTotal: number;
  iat: number;
  exp: number;
  payloadFingerprint: string;
};

export type CreateOrderQuoteTokenInput = {
  quoteId: string;
  restaurantId: string;
  customerSessionId: string;
  orderingVersion: OrderingVersion;
  expectedTotal: number;
  payload: unknown;
  issuedAt?: number;
  expiresAt?: number;
};

export type CreateOrderQuoteTokenOptions = {
  secret?: TokenSecret;
  now?: number;
  ttlSeconds?: number;
};

export type VerifyOrderQuoteTokenOptions = {
  secret?: TokenSecret;
  restaurantId: string;
  customerSessionId: string;
  payload: unknown;
  quoteId?: string;
  orderingVersion: OrderingVersion;
  expectedTotal: number;
  now?: number;
  maxFutureSkewSeconds?: number;
};

export function createOrderQuoteToken(
  input: CreateOrderQuoteTokenInput,
  options: CreateOrderQuoteTokenOptions = {}
) {
  assertServerRuntime();
  const iat = input.issuedAt ?? options.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Order quote token lifetime must use positive integer seconds.");
  }
  if (ttlSeconds > ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS) {
    throw new Error("Order quote token lifetime must not exceed 5 minutes.");
  }
  const exp = input.expiresAt ?? iat + ttlSeconds;
  const claims = normalizeOrderQuoteClaims({
    v: 1,
    quoteId: input.quoteId,
    restaurantId: input.restaurantId,
    customerSessionId: input.customerSessionId,
    orderingVersion: input.orderingVersion,
    expectedTotal: input.expectedTotal,
    iat,
    exp,
    payloadFingerprint: fingerprintJson(input.payload as JsonValue)
  });
  return signCanonicalToken(claims as unknown as JsonValue, resolveSecret(options.secret), ORDER_QUOTE_TOKEN_PURPOSE);
}

export function verifyOrderQuoteToken(
  token: string,
  options: VerifyOrderQuoteTokenOptions
): OrderQuoteTokenClaims | null {
  const result = verifyOrderQuoteTokenResult(token, options);
  return result.status === "valid" ? result.claims : null;
}

export type OrderQuoteTokenStaleReason =
  | "EXPIRED"
  | "PAYLOAD_MISMATCH"
  | "ORDERING_VERSION_MISMATCH"
  | "EXPECTED_TOTAL_MISMATCH";

export type OrderQuoteTokenVerificationResult =
  | { status: "valid"; claims: OrderQuoteTokenClaims }
  | { status: "stale"; reason: OrderQuoteTokenStaleReason }
  | { status: "invalid"; reason: "INVALID_TOKEN" };

/** Node/server-only verification; callers must bind the current quote inputs explicitly. */
export function verifyOrderQuoteTokenResult(
  token: string,
  options: VerifyOrderQuoteTokenOptions
): OrderQuoteTokenVerificationResult {
  assertServerRuntime();
  if (!hasValidVerificationBindings(options)) return invalidResult();
  const payload = readVerifiedCanonicalToken(token, resolveSecret(options.secret), ORDER_QUOTE_TOKEN_PURPOSE);
  if (!isPlainRecord(payload) || !hasOnlyClaimKeys(payload)) return invalidResult();

  let claims: OrderQuoteTokenClaims;
  try {
    claims = normalizeOrderQuoteClaims(payload);
  } catch {
    return invalidResult();
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const futureSkew = options.maxFutureSkewSeconds ?? 0;
  if (!isNonNegativeInteger(now) || !isNonNegativeInteger(futureSkew)) return invalidResult();
  if (claims.restaurantId !== options.restaurantId) return invalidResult();
  if (claims.customerSessionId !== options.customerSessionId) return invalidResult();
  if (options.quoteId !== undefined && claims.quoteId !== options.quoteId) return invalidResult();
  if (claims.iat > now + futureSkew) return invalidResult();
  if (claims.exp <= now) return { status: "stale", reason: "EXPIRED" };
  if (claims.orderingVersion !== options.orderingVersion) {
    return { status: "stale", reason: "ORDERING_VERSION_MISMATCH" };
  }
  if (claims.expectedTotal !== options.expectedTotal) {
    return { status: "stale", reason: "EXPECTED_TOTAL_MISMATCH" };
  }
  try {
    if (fingerprintJson(options.payload as JsonValue) !== claims.payloadFingerprint) {
      return { status: "stale", reason: "PAYLOAD_MISMATCH" };
    }
  } catch {
    return invalidResult();
  }
  return { status: "valid", claims };
}

export const classifyOrderQuoteToken = verifyOrderQuoteTokenResult;

function normalizeOrderQuoteClaims(input: Record<string, unknown>): OrderQuoteTokenClaims {
  if (input.v !== 1) throw new Error("Unsupported order quote token version.");
  const quoteId = canonicalIdentifier(input.quoteId, "quoteId");
  const restaurantId = canonicalIdentifier(input.restaurantId, "restaurantId");
  const customerSessionId = canonicalIdentifier(input.customerSessionId, "customerSessionId");
  const orderingVersion = canonicalOrderingVersion(input.orderingVersion);
  if (!isNonNegativeInteger(input.expectedTotal)) {
    throw new Error("Order quote token expectedTotal must be a non-negative integer.");
  }
  if (!isNonNegativeInteger(input.iat) || !isNonNegativeInteger(input.exp) || input.exp <= input.iat) {
    throw new Error("Order quote token lifetime is invalid.");
  }
  if (input.exp - input.iat > ORDER_QUOTE_TOKEN_MAX_TTL_SECONDS) {
    throw new Error("Order quote token lifetime must not exceed 5 minutes.");
  }
  if (typeof input.payloadFingerprint !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.payloadFingerprint)) {
    throw new Error("Order quote token payload fingerprint is invalid.");
  }
  return {
    v: 1,
    quoteId,
    restaurantId,
    customerSessionId,
    orderingVersion,
    expectedTotal: input.expectedTotal,
    iat: input.iat,
    exp: input.exp,
    payloadFingerprint: input.payloadFingerprint
  };
}

function canonicalIdentifier(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`Order quote token ${field} must be a non-empty canonical string.`);
  }
  return value;
}

function canonicalOrderingVersion(value: unknown): OrderingVersion {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && value.length > 0 && value.trim() === value) return value;
  throw new Error("Order quote token orderingVersion must be a canonical string or integer.");
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyClaimKeys(value: Record<string, unknown>) {
  const expected = [
    "customerSessionId",
    "exp",
    "expectedTotal",
    "iat",
    "orderingVersion",
    "payloadFingerprint",
    "quoteId",
    "restaurantId",
    "v"
  ];
  return Object.keys(value).sort().join("|") === expected.join("|");
}

function hasValidVerificationBindings(options: VerifyOrderQuoteTokenOptions | null | undefined) {
  if (!options) return false;
  if (typeof options.payload === "undefined") return false;
  if (!isCanonicalIdentifier(options.restaurantId) || !isCanonicalIdentifier(options.customerSessionId)) return false;
  if (options.quoteId !== undefined && !isCanonicalIdentifier(options.quoteId)) return false;
  try {
    canonicalOrderingVersion(options.orderingVersion);
  } catch {
    return false;
  }
  return isNonNegativeInteger(options.expectedTotal);
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function invalidResult(): OrderQuoteTokenVerificationResult {
  return { status: "invalid", reason: "INVALID_TOKEN" };
}

function resolveSecret(secret?: TokenSecret): TokenSecret {
  const resolved =
    secret ??
    process.env.LOGIVN_ORDER_QUOTE_TOKEN_SECRET ??
    process.env.LOGIVN_CUSTOMER_TOKEN_SECRET;
  if (!resolved) throw new Error("Order quote token secret is required.");
  return resolved;
}
