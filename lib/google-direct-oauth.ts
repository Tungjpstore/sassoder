import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getAppUrl } from "@/lib/app-url";
import { safeDashboardNextPath } from "@/lib/auth-flow-routes";
import { getSafeAuthReturnHost } from "@/lib/auth-post-login";
import { getHostname } from "@/lib/supabase/cookie-guards";

const googleAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const stateMaxAgeMs = 5 * 60 * 1000;
const googleOAuthStateCookieName = "logivn_google_oauth_state";

type GoogleOAuthState = {
  state: string;
  nonce: string;
  next: string;
  returnHost: string;
  redirectUri: string;
  createdAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleAuthorizeRequest = {
  authorizeUrl: URL;
  stateCookie: {
    name: string;
    value: string;
    maxAge: number;
  };
};

export function getGoogleDirectOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGoogleDirectCallbackUrl(request: Request) {
  const requestUrl = new URL(request.url);
  const hostname = getHostname(requestUrl.host);

  if (isLocalHost(hostname)) return new URL("/auth/google/callback", requestUrl.origin).toString();
  return `${getAppUrl()}/auth/google/callback`;
}

export function buildGoogleDirectAuthorizeUrl(request: Request, next: string) {
  return buildGoogleDirectAuthorizeRequest(request, next)?.authorizeUrl ?? null;
}

export function buildGoogleDirectAuthorizeRequest(request: Request, next: string): GoogleAuthorizeRequest | null {
  const config = getGoogleDirectOAuthConfig();
  if (!config) return null;

  const redirectUri = getGoogleDirectCallbackUrl(request);
  const payload: GoogleOAuthState = {
    state: randomToken(),
    nonce: randomToken(),
    next: safeDashboardNextPath(next, "/dashboard"),
    returnHost: getSafeAuthReturnHost(request),
    redirectUri,
    createdAt: Date.now()
  };
  const state = encodeSignedState(payload);
  const stateCookie = createGoogleDirectOAuthStateCookie(payload.state);
  if (!state || !stateCookie) return null;

  const url = new URL(googleAuthorizeUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", hashGoogleOAuthNonce(payload.nonce));
  if (shouldPromptAccountSelection(request)) url.searchParams.set("prompt", "select_account");
  url.searchParams.set("include_granted_scopes", "true");

  return { authorizeUrl: url, stateCookie };
}

export function readGoogleDirectOAuthState(value: string | null) {
  if (!value) return null;
  const payload = decodeSignedState(value);
  if (!payload) return null;
  if (!payload.state || !payload.nonce || !payload.redirectUri || !payload.returnHost) return null;
  if (Date.now() - payload.createdAt > stateMaxAgeMs) return null;
  return payload;
}

export function getGoogleDirectOAuthStateCookieName() {
  return googleOAuthStateCookieName;
}

export function readGoogleDirectOAuthStateCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return readCookieValue(cookieHeader, googleOAuthStateCookieName);
}

export function isValidGoogleDirectOAuthStateCookie(stateValue: string, cookieValue: string | null) {
  if (!stateValue || !cookieValue) return false;
  const [cookieState, signature] = cookieValue.split(".");
  if (!cookieState || !signature) return false;
  if (!safeEqual(cookieState, stateValue)) return false;
  const expected = signState(`google-oauth-cookie:${cookieState}`);
  return Boolean(expected && safeEqual(signature, expected));
}

export async function exchangeGoogleCodeForTokens({ code, redirectUri }: { code: string; redirectUri: string }) {
  const config = getGoogleDirectOAuthConfig();
  if (!config) {
    return { data: null, error: "missing_google_config" } as const;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  let response: Response;
  try {
    response = await fetch(googleTokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json"
      },
      body,
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : String(error) } as const;
  }

  const payload = (await response.json().catch(() => null)) as GoogleTokenResponse | null;
  if (!response.ok || !payload?.id_token) {
    return {
      data: null,
      error: payload?.error || `google_token_http_${response.status}`,
      errorDescription: payload?.error_description
    } as const;
  }

  return { data: payload, error: null } as const;
}

function encodeSignedState(payload: GoogleOAuthState) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signState(body);
  if (!signature) return null;
  return `${body}.${signature}`;
}

function decodeSignedState(value: string) {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = signState(body);
  if (!expected) return null;
  if (!safeEqual(signature, expected)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleOAuthState;
  } catch {
    return null;
  }
}

function signState(value: string) {
  const secret = googleOAuthStateSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function hashGoogleOAuthNonce(nonce: string) {
  return createHash("sha256").update(nonce).digest("hex");
}

function googleOAuthStateSecret() {
  const configured = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim();
  if (configured) return configured;
  if (requiresExplicitGoogleOAuthStateSecret()) return null;

  return (
    process.env.AUTH_RATE_LIMIT_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "logivn-local-google-oauth-state"
  );
}

function createGoogleDirectOAuthStateCookie(state: string) {
  const signature = signState(`google-oauth-cookie:${state}`);
  if (!signature) return null;
  return {
    name: googleOAuthStateCookieName,
    value: `${state}.${signature}`,
    maxAge: Math.floor(stateMaxAgeMs / 1000)
  };
}

function shouldPromptAccountSelection(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("prompt") === "select_account" || url.searchParams.get("select_account") === "1";
}

function requiresExplicitGoogleOAuthStateSecret() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production" ||
    process.env.GOOGLE_DIRECT_OAUTH_STRICT === "1"
  );
}

function readCookieValue(cookieHeader: string, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    if (trimmed.slice(0, separatorIndex) !== name) continue;
    return trimmed.slice(separatorIndex + 1);
  }

  return null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
