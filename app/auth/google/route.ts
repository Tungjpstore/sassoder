import { NextResponse } from "next/server";
import { dashboardLoginPathForNext, safeDashboardNextPath } from "@/lib/auth-flow-routes";
import { buildGoogleDirectAuthorizeRequest } from "@/lib/google-direct-oauth";
import {
  cookieNamesFromHeader,
  getHostname,
  isSupabaseAuthFlowCookieName,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { expireSupabaseAuthFlowCookies, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

function isPrefetchRequest(request: Request) {
  const purpose = request.headers.get("purpose") || request.headers.get("sec-purpose") || "";
  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.has("rsc") ||
    purpose.toLowerCase().includes("prefetch")
  );
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function setGoogleOAuthStateCookie(response: NextResponse, request: Request, stateCookie: { name: string; value: string; maxAge: number }) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const hostname = getHostname(host);
  const secure = requestUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";

  response.cookies.set(stateCookie.name, stateCookie.value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/auth/google",
    maxAge: stateCookie.maxAge,
    ...(shouldShareCookiesAcrossTenantDomains(hostname) ? { domain: `.${ROOT_DOMAIN}` } : {})
  });
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

export async function GET(request: Request) {
  if (isPrefetchRequest(request)) {
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const url = new URL(request.url);
  const next = safeDashboardNextPath(url.searchParams.get("next"), "/dashboard");
  const googleConfigErrorPath = dashboardLoginPathForNext(next, { authError: "google_config" });

  await expireSupabaseAuthSessionCookies();
  await expireSupabaseAuthFlowCookies();

  const authorizeRequest = buildGoogleDirectAuthorizeRequest(request, next);
  if (!authorizeRequest) {
    console.error("[auth/google] Missing Google direct OAuth configuration", {
      hasClientId: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
      hasStateSecret: Boolean(process.env.GOOGLE_OAUTH_STATE_SECRET)
    });

    const response = noStoreRedirect(new URL(googleConfigErrorPath, request.url));
    appendExpiredAuthFlowCookies(response, request);
    return response;
  }

  const response = noStoreRedirect(authorizeRequest.authorizeUrl);
  setGoogleOAuthStateCookie(response, request, authorizeRequest.stateCookie);
  appendExpiredAuthFlowCookies(response, request);
  return response;
}
