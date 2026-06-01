import { NextResponse } from "next/server";
import { dashboardLoginPathForNext, safeDashboardNextPath } from "@/lib/auth-flow-routes";
import { buildUrlForAuthReturnHost, getPostLoginDashboardDestination } from "@/lib/auth-post-login";
import {
  exchangeGoogleCodeForTokens,
  getGoogleDirectOAuthStateCookieName,
  isValidGoogleDirectOAuthStateCookie,
  readGoogleDirectOAuthState,
  readGoogleDirectOAuthStateCookie
} from "@/lib/google-direct-oauth";
import {
  cookieNamesFromHeader,
  getHostname,
  isSafeCookieName,
  isSupabaseAuthFlowCookieName,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

function redirectUrl(request: Request, pathOrUrl: string) {
  const response = pathOrUrl.startsWith("http")
    ? NextResponse.redirect(pathOrUrl)
    : NextResponse.redirect(new URL(pathOrUrl, request.url));
  response.headers.set("Cache-Control", "no-store");
  appendExpiredGoogleOAuthStateCookie(response, request);
  appendExpiredAuthFlowCookies(response, request);
  return response;
}

function redirectAuthError(request: Request, authError: string, next: string, returnHost?: string | null) {
  const path = dashboardLoginPathForNext(next, { authError });
  return redirectUrl(request, buildUrlForAuthReturnHost(request, returnHost, path));
}

function authFlowCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseAuthFlowCookieName);
}

function appendExpiredAuthFlowCookies(response: NextResponse, request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const hostname = getHostname(host);
  const secure = requestUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";
  const securePart = secure ? "; Secure" : "";

  authFlowCookieNames(request).forEach((name) => {
    if (!isSafeCookieName(name)) return;

    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${securePart}`
    );

    if (shouldShareCookiesAcrossTenantDomains(hostname)) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.${ROOT_DOMAIN}; SameSite=Lax; Secure`
      );
    }
  });
}

function appendExpiredGoogleOAuthStateCookie(response: NextResponse, request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const hostname = getHostname(host);
  const secure = requestUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";
  const securePart = secure ? "; Secure" : "";
  const cookieName = getGoogleDirectOAuthStateCookieName();

  response.headers.append(
    "Set-Cookie",
    `${cookieName}=; Path=/auth/google; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${securePart}`
  );

  if (shouldShareCookiesAcrossTenantDomains(hostname)) {
    response.headers.append(
      "Set-Cookie",
      `${cookieName}=; Path=/auth/google; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.${ROOT_DOMAIN}; HttpOnly; SameSite=Lax; Secure`
    );
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");
  const code = requestUrl.searchParams.get("code");
  const state = readGoogleDirectOAuthState(requestUrl.searchParams.get("state"));
  const next = safeDashboardNextPath(state?.next || requestUrl.searchParams.get("next"), "/dashboard");
  const returnHost = state?.returnHost ?? null;

  if (providerError) {
    console.warn("[auth/google/callback] Google provider rejected OAuth", {
      providerError,
      providerErrorDescription
    });
    return redirectAuthError(request, "provider", next, returnHost);
  }

  if (!state) {
    console.warn("[auth/google/callback] Missing or invalid signed OAuth state");
    return redirectAuthError(request, "google_state", next);
  }

  const stateCookie = readGoogleDirectOAuthStateCookie(request);
  if (!isValidGoogleDirectOAuthStateCookie(state.state, stateCookie)) {
    console.warn("[auth/google/callback] Missing or invalid OAuth state cookie", {
      hasStateCookie: Boolean(stateCookie)
    });
    return redirectAuthError(request, "google_state", next, returnHost);
  }

  if (!code) {
    console.warn("[auth/google/callback] Missing authorization code");
    return redirectAuthError(request, "missing_code", next, returnHost);
  }

  const tokenResult = await exchangeGoogleCodeForTokens({ code, redirectUri: state.redirectUri });
  if (tokenResult.error || !tokenResult.data?.id_token) {
    console.error("[auth/google/callback] Google token exchange failed", {
      error: tokenResult.error,
      errorDescription: tokenResult.errorDescription
    });
    return redirectAuthError(request, tokenResult.error === "missing_google_config" ? "google_config" : "callback", next, returnHost);
  }

  const supabase = await createServerSupabaseClient({ ignoreAuthSession: true });
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokenResult.data.id_token,
    access_token: tokenResult.data.access_token,
    nonce: state.nonce
  });

  if (error) {
    console.error("[auth/google/callback] Supabase ID token sign-in failed", {
      message: error.message,
      code: "code" in error ? error.code : undefined,
      status: "status" in error ? error.status : undefined
    });
    return redirectAuthError(request, "callback", next, returnHost);
  }

  const user = data.session?.user ?? data.user ?? null;
  if (!data.session?.access_token || !data.session.refresh_token || !user?.id || !user.email) {
    console.error("[auth/google/callback] Missing Supabase session after direct Google login", {
      hasSession: Boolean(data.session),
      hasAccessToken: Boolean(data.session?.access_token),
      hasRefreshToken: Boolean(data.session?.refresh_token),
      hasUser: Boolean(user?.id),
      hasEmail: Boolean(user?.email)
    });
    return redirectAuthError(request, "session", next, returnHost);
  }

  const destination = await getPostLoginDashboardDestination({
    request,
    user: { id: user.id, email: user.email },
    next,
    returnHost
  });

  return redirectUrl(request, destination);
}
