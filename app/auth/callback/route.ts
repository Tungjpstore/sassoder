import { NextResponse } from "next/server";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import { createSupabaseOAuthCookieName } from "@/lib/supabase/oauth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";
import { consumeRegistrationIntentForUser, getRestaurantForUser } from "@/services/restaurant-service";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (!value.startsWith("/dashboard")) return "/dashboard";
  return value;
}

function redirectUrl(request: Request, pathOrUrl: string) {
  const response = pathOrUrl.startsWith("http")
    ? NextResponse.redirect(pathOrUrl)
    : NextResponse.redirect(new URL(pathOrUrl, request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function redirectAuthError(request: Request, authError: string) {
  const url = new URL("/dashboard/login", request.url);
  url.searchParams.set("authError", authError);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  appendExpiredAuthFlowCookies(response, request);
  return response;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeOAuthKey(value: string | null) {
  return value && /^[a-z0-9]{16}$/.test(value) ? value : null;
}

function getHostname(host: string) {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0]?.toLowerCase() ?? "";
}

function shouldShareCookiesAcrossTenantDomains(hostname: string) {
  return process.env.VERCEL_ENV === "production" && (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`));
}

function authFlowCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const names = cookieHeader
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter((name) => name?.startsWith("sb-") && name.includes("code-verifier") && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name));

  return Array.from(new Set(names));
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
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const oauthKey = safeOAuthKey(requestUrl.searchParams.get("oauthKey"));
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (!code) {
    console.error("[auth/callback] Missing OAuth code", {
      providerError,
      providerErrorDescription
    });
    return redirectAuthError(request, providerError ? "provider" : "missing_code");
  }

  const supabase = await createServerSupabaseClient({
    ignoreAuthSession: true,
    cookieName: oauthKey ? createSupabaseOAuthCookieName(oauthKey) : undefined
  });
  let exchangeResult: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>;

  try {
    exchangeResult = await supabase.auth.exchangeCodeForSession(code);
  } catch (error) {
    const message = errorMessage(error);
    console.error("[auth/callback] Code exchange exception", { message });
    return redirectAuthError(request, "callback");
  }

  const { error } = exchangeResult;
  if (error) {
    console.error("[auth/callback] Code exchange failed", {
      message: error.message,
      code: "code" in error ? error.code : undefined,
      status: "status" in error ? error.status : undefined
    });
    return redirectAuthError(request, "callback");
  }

  const session = exchangeResult.data.session;
  if (oauthKey && session?.access_token && session.refresh_token) {
    const defaultSupabase = await createServerSupabaseClient({ ignoreAuthSession: true });
    const { error: sessionCopyError } = await defaultSupabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });

    if (sessionCopyError) {
      console.error("[auth/callback] Session copy failed", {
        message: sessionCopyError.message,
        code: "code" in sessionCopyError ? sessionCopyError.code : undefined,
        status: "status" in sessionCopyError ? sessionCopyError.status : undefined
      });
      return redirectAuthError(request, "session");
    }
  }

  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;

  try {
    userResult = await supabase.auth.getUser();
  } catch (error) {
    const message = errorMessage(error);
    console.error("[auth/callback] User read exception", { message });
    return redirectAuthError(request, "session");
  }

  const {
    data: { user },
    error: userError
  } = userResult;

  if (userError || !user?.id || !user.email) {
    console.error("[auth/callback] Missing session user", {
      message: userError?.message,
      hasUser: Boolean(user?.id),
      hasEmail: Boolean(user?.email)
    });
    return redirectAuthError(request, "session");
  }

  const restaurant =
    (await consumeRegistrationIntentForUser({ userId: user.id, email: user.email })) ??
    (await getRestaurantForUser(user.id, user.email));

  if (restaurant) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return redirectUrl(request, getDashboardDestinationForHost(restaurant.slug, host));
  }

  return redirectUrl(request, next === "/dashboard" ? "/dashboard/onboarding" : next);
}
