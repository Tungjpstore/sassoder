import { NextResponse } from "next/server";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import {
  chunkedCookieNames,
  cookieNamesFromHeader,
  getHostname,
  isSafeCookieName,
  isSupabaseAuthFlowCookieName,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { createSupabaseOAuthCookieName } from "@/lib/supabase/oauth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";
import { consumeRegistrationIntentForUser, getRestaurantForUser } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (!value.startsWith("/dashboard")) return "/dashboard";
  return value;
}

function redirectUrl(request: Request, pathOrUrl: string, extraCookieNames: string[] = []) {
  const response = pathOrUrl.startsWith("http")
    ? NextResponse.redirect(pathOrUrl)
    : NextResponse.redirect(new URL(pathOrUrl, request.url));
  response.headers.set("Cache-Control", "no-store");
  appendExpiredAuthFlowCookies(response, request, extraCookieNames);
  return response;
}

function redirectAuthError(request: Request, authError: string, extraCookieNames: string[] = []) {
  const url = new URL("/dashboard/login", request.url);
  url.searchParams.set("authError", authError);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  appendExpiredAuthFlowCookies(response, request, extraCookieNames);
  return response;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeOAuthKey(value: string | null) {
  return value && /^[a-z0-9]{16}$/.test(value) ? value : null;
}

function authFlowCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseAuthFlowCookieName);
}

function oauthCleanupCookieNames(oauthKey: string | null) {
  if (!oauthKey) return [];
  const baseName = createSupabaseOAuthCookieName(oauthKey);
  return [
    ...chunkedCookieNames(baseName),
    ...chunkedCookieNames(`${baseName}-auth-token`),
    `${baseName}-code-verifier`
  ];
}

function appendExpiredAuthFlowCookies(response: NextResponse, request: Request, extraCookieNames: string[] = []) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const hostname = getHostname(host);
  const secure = requestUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";
  const securePart = secure ? "; Secure" : "";

  Array.from(new Set([...authFlowCookieNames(request), ...extraCookieNames])).forEach((name) => {
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const oauthKey = safeOAuthKey(requestUrl.searchParams.get("oauthKey"));
  const cleanupCookieNames = oauthCleanupCookieNames(oauthKey);
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (!code) {
    console.error("[auth/callback] Missing OAuth code", {
      providerError,
      providerErrorDescription
    });
    return redirectAuthError(request, providerError ? "provider" : "missing_code", cleanupCookieNames);
  }

  const supabase = await createServerSupabaseClient({
    ignoreAuthSession: true,
    cookieName: oauthKey ? createSupabaseOAuthCookieName(oauthKey) : undefined,
    suppressAuthSessionCookieWrites: Boolean(oauthKey)
  });
  let exchangeResult: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;

  try {
    exchangeResult = await supabase.auth.exchangeCodeForSession(code);
  } catch (error) {
    const message = errorMessage(error);
    console.error("[auth/callback] Code exchange exception", { message });
    return redirectAuthError(request, "callback", cleanupCookieNames);
  }

  const { error } = exchangeResult;
  if (error) {
    console.error("[auth/callback] Code exchange failed", {
      message: error.message,
      code: "code" in error ? error.code : undefined,
      status: "status" in error ? error.status : undefined
    });
    return redirectAuthError(request, "callback", cleanupCookieNames);
  }

  const session = exchangeResult.data.session;
  let user = session?.user ?? exchangeResult.data.user ?? null;

  if (oauthKey) {
    if (!session?.access_token || !session.refresh_token) {
      console.error("[auth/callback] Missing exchanged OAuth session", {
        hasSession: Boolean(session),
        hasAccessToken: Boolean(session?.access_token),
        hasRefreshToken: Boolean(session?.refresh_token),
        hasUser: Boolean(user?.id),
        hasEmail: Boolean(user?.email)
      });
      return redirectAuthError(request, "session", cleanupCookieNames);
    }

    const defaultSupabase = await createServerSupabaseClient({ ignoreAuthSession: true });
    const {
      data: { user: copiedUser },
      error: sessionCopyError
    } = await defaultSupabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });

    if (sessionCopyError) {
      console.error("[auth/callback] Session copy failed", {
        message: sessionCopyError.message,
        code: "code" in sessionCopyError ? sessionCopyError.code : undefined,
        status: "status" in sessionCopyError ? sessionCopyError.status : undefined
      });
      return redirectAuthError(request, "session", cleanupCookieNames);
    }

    user = copiedUser ?? user;
  }

  if (!user?.id || !user.email) {
    console.error("[auth/callback] Missing session user", {
      hasUser: Boolean(user?.id),
      hasEmail: Boolean(user?.email)
    });
    return redirectAuthError(request, "session", cleanupCookieNames);
  }

  const restaurant =
    (await consumeRegistrationIntentForUser({ userId: user.id, email: user.email })) ??
    (await getRestaurantForUser(user.id, user.email));

  if (restaurant) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return redirectUrl(request, getDashboardDestinationForHost(restaurant.slug, host), cleanupCookieNames);
  }

  return redirectUrl(request, next === "/dashboard" ? "/dashboard/onboarding" : next, cleanupCookieNames);
}
