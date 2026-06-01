import { NextResponse } from "next/server";
import { dashboardLoginPathForNext, safeDashboardNextPath } from "@/lib/auth-flow-routes";
import { getPostLoginDashboardDestination } from "@/lib/auth-post-login";
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

export const dynamic = "force-dynamic";

function redirectUrl(request: Request, pathOrUrl: string, extraCookieNames: string[] = []) {
  const response = pathOrUrl.startsWith("http")
    ? NextResponse.redirect(pathOrUrl)
    : NextResponse.redirect(new URL(pathOrUrl, request.url));
  response.headers.set("Cache-Control", "no-store");
  appendExpiredAuthFlowCookies(response, request, extraCookieNames);
  return response;
}

function redirectAuthError(request: Request, authError: string, next: string, extraCookieNames: string[] = []) {
  const response = NextResponse.redirect(new URL(dashboardLoginPathForNext(next, { authError }), request.url));
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
  const next = safeDashboardNextPath(requestUrl.searchParams.get("next"), "/dashboard");
  const oauthKey = safeOAuthKey(requestUrl.searchParams.get("oauthKey"));
  const cleanupCookieNames = oauthCleanupCookieNames(oauthKey);
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (!code) {
    console.error("[auth/callback] Missing OAuth code", {
      providerError,
      providerErrorDescription
    });
    return redirectAuthError(request, providerError ? "provider" : "missing_code", next, cleanupCookieNames);
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
    return redirectAuthError(request, "callback", next, cleanupCookieNames);
  }

  const { error } = exchangeResult;
  if (error) {
    console.error("[auth/callback] Code exchange failed", {
      message: error.message,
      code: "code" in error ? error.code : undefined,
      status: "status" in error ? error.status : undefined
    });
    return redirectAuthError(request, "callback", next, cleanupCookieNames);
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
      return redirectAuthError(request, "session", next, cleanupCookieNames);
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
      return redirectAuthError(request, "session", next, cleanupCookieNames);
    }

    user = copiedUser ?? user;
  }

  if (!user?.id || !user.email) {
    console.error("[auth/callback] Missing session user", {
      hasUser: Boolean(user?.id),
      hasEmail: Boolean(user?.email)
    });
    return redirectAuthError(request, "session", next, cleanupCookieNames);
  }

  const destination = await getPostLoginDashboardDestination({ request, user: { id: user.id, email: user.email }, next });
  return redirectUrl(request, destination, cleanupCookieNames);
}
