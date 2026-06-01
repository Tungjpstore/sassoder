import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getOAuthCallbackOrigin } from "@/lib/auth-redirect-origin";
import { dashboardLoginPathForNext, safeDashboardNextPath } from "@/lib/auth-flow-routes";
import {
  cookieNamesFromHeader,
  getHostname,
  isSupabaseAuthFlowCookieName,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { createSupabaseOAuthCookieName } from "@/lib/supabase/oauth";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

function isPrefetchRequest(request: Request) {
  const purpose = request.headers.get("purpose") || request.headers.get("sec-purpose") || "";
  return request.headers.has("next-router-prefetch") || request.headers.has("rsc") || purpose.toLowerCase().includes("prefetch");
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function legacySupabaseOAuthEnabled() {
  return process.env.GOOGLE_LEGACY_SUPABASE_OAUTH_ENABLED === "1";
}

function authFlowCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseAuthFlowCookieName);
}

function createOAuthKey() {
  return randomUUID().replaceAll("-", "").slice(0, 16);
}

function safeOAuthKey(value: string | null) {
  return value && /^[a-z0-9]{16}$/.test(value) ? value : createOAuthKey();
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

  if (!legacySupabaseOAuthEnabled()) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const url = new URL(request.url);
  const next = safeDashboardNextPath(url.searchParams.get("next"), "/dashboard");
  const googleInitErrorPath = dashboardLoginPathForNext(next, { authError: "google_init" });
  const hasCleanOAuthCookies = url.searchParams.get("_oauth_clean") === "1";
  const oauthKey = safeOAuthKey(url.searchParams.get("oauthKey"));

  if (!hasCleanOAuthCookies) {
    await expireSupabaseAuthSessionCookies();

    const cleanUrl = new URL("/auth/google/supabase", request.url);
    cleanUrl.searchParams.set("next", next);
    cleanUrl.searchParams.set("_oauth_clean", "1");
    cleanUrl.searchParams.set("oauthKey", oauthKey);
    const response = noStoreRedirect(cleanUrl);
    appendExpiredAuthFlowCookies(response, request);
    return response;
  }

  const callbackUrl = new URL("/auth/callback", getOAuthCallbackOrigin(request));
  callbackUrl.searchParams.set("next", next);
  callbackUrl.searchParams.set("oauthKey", oauthKey);

  const supabase = await createServerSupabaseClient({
    ignoreAuthSession: true,
    cookieName: createSupabaseOAuthCookieName(oauthKey)
  });

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString()
      }
    });

    if (error || !data.url) {
      console.error("[auth/google/supabase] OAuth init failed", {
        message: error?.message,
        callbackOrigin: callbackUrl.origin
      });
      return noStoreRedirect(new URL(googleInitErrorPath, request.url));
    }

    return noStoreRedirect(new URL(data.url));
  } catch (error) {
    console.error("[auth/google/supabase] OAuth init exception", {
      message: error instanceof Error ? error.message : String(error),
      callbackOrigin: callbackUrl.origin
    });
    return noStoreRedirect(new URL(googleInitErrorPath, request.url));
  }
}
