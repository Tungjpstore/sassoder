import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "lg1";
const SIGNATURE_LENGTH = 12;

export function createSignedToken(secret: string) {
  const nonce = randomBytes(18).toString("base64url");
  const signature = signNonce(nonce, secret);
  return `${TOKEN_PREFIX}_${nonce}${signature}`;
}

export function assertSignedToken(token: string, secret: string) {
  const match =
    token.match(/^lg1_([A-Za-z0-9_-]{24})([A-Za-z0-9_-]{12})$/) ??
    token.match(/^lg1_([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{8,24})$/);
  if (!match) throw new Error("invalid_token_format");

  const [, nonce, signature] = match;
  const expected = signNonce(nonce, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("invalid_token_signature");
  }
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function signNonce(nonce: string, secret: string) {
  return createHmac("sha256", secret).update(nonce).digest("base64url").slice(0, SIGNATURE_LENGTH);
}
