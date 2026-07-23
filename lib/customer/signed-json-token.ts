import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type TokenSecret = string | Uint8Array;

export function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Signed customer tokens are server-only APIs.");
  }
}

export function assertTokenSecret(secret: TokenSecret): TokenSecret {
  const bytes = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
  if (bytes.byteLength < 32) {
    throw new Error("Token secret must contain at least 32 bytes.");
  }
  return secret;
}

export function canonicalJson(value: JsonValue): string {
  return serializeCanonicalValue(value, new Set<object>());
}

export function fingerprintJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("base64url");
}

export function signCanonicalToken(payload: JsonValue, secret: TokenSecret, purpose: string): string {
  const encodedPayload = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
  const signature = createSignature(encodedPayload, assertTokenSecret(secret), purpose);
  return `${encodedPayload}.${signature}`;
}

export function readVerifiedCanonicalToken(
  token: string,
  secret: TokenSecret,
  purpose: string
): JsonValue | null {
  assertTokenSecret(secret);
  if (typeof token !== "string") return null;
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [encodedPayload, suppliedSignature] = segments;
  if (!isCanonicalBase64Url(encodedPayload) || !isCanonicalBase64Url(suppliedSignature)) return null;

  const expectedSignature = createSignature(encodedPayload, secret, purpose);
  const expectedBytes = Buffer.from(expectedSignature, "ascii");
  const suppliedBytes = Buffer.from(suppliedSignature, "ascii");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;

  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as JsonValue;
    if (canonicalJson(parsed) !== decoded) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createSignature(encodedPayload: string, secret: TokenSecret, purpose: string) {
  return createHmac("sha256", secret).update(`${purpose}.${encodedPayload}`, "utf8").digest("base64url");
}

function isCanonicalBase64Url(value: string) {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

function serializeCanonicalValue(value: JsonValue, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("Token values must be canonical JSON values.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error("Token values must be JSON-safe.");
  }
  if (ancestors.has(value)) {
    throw new Error("Token values must not contain cycles.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (
        keys.length !== value.length ||
        keys.some((key, index) => key !== String(index)) ||
        Object.getOwnPropertySymbols(value).length > 0
      ) {
        throw new Error("Token arrays must contain only JSON-safe indexed values.");
      }
      return `[${value.map((entry) => serializeCanonicalValue(entry, ancestors)).join(",")}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("Token objects must be plain JSON objects.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Token values must be JSON-safe.");
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonicalValue(value[key], ancestors)}`);
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
