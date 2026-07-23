import {
  verifyCustomerSessionToken,
  type VerifiedCustomerSessionTokenClaims
} from "./customer-session-token";
import type { TokenSecret } from "./signed-json-token";

const CUSTOMER_SESSION_TOKEN_HEADER = "x-logivn-customer-session-token";

export type RemoteCustomerSessionVerificationInput = {
  restaurantId: string;
  sessionId: string;
  token: string | null | undefined;
  tokenVersion: number;
  secret?: TokenSecret;
  now?: number;
};

export function customerSessionTokenHeader() {
  return CUSTOMER_SESSION_TOKEN_HEADER;
}

export function customerSessionTokenVersion(
  env: Record<string, string | undefined> = process.env
) {
  const raw = env.LOGIVN_CUSTOMER_SESSION_TOKEN_VERSION?.trim();
  if (!raw) return 1;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Customer session token version must be a positive integer.");
  }
  return version;
}

export function readCustomerSessionToken(request: Pick<Request, "headers">) {
  return request.headers.get(CUSTOMER_SESSION_TOKEN_HEADER)?.trim() || null;
}

export function verifyRemoteCustomerSessionRequest(
  input: RemoteCustomerSessionVerificationInput
): VerifiedCustomerSessionTokenClaims | null {
  if (!input.token) return null;
  try {
    return verifyCustomerSessionToken(input.token, {
      restaurantId: input.restaurantId,
      sessionId: input.sessionId,
      scope: "REMOTE",
      tokenVersion: input.tokenVersion,
      secret: input.secret,
      now: input.now
    });
  } catch {
    return null;
  }
}

export function isLegacyCustomerSessionFallbackEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.LOGIVN_ALLOW_LEGACY_CUSTOMER_SESSION === "true";
}
