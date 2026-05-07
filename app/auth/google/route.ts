import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getOAuthCallbackOrigin } from "@/lib/auth-redirect-origin";
import { createSupabaseOAuthCookieName } from "@/lib/supabase/oauth";
import { createServerSupabaseClient, expireSupabaseAuthSessionCookies } from "@/lib/supabase/server";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (!value.startsWith("/dashboard")) return "/dashboard";
  return value;
}

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

  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const hasCleanOAuthCookies = url.searchParams.get("_oauth_clean") === "1";
  const oauthKey = safeOAuthKey(url.searchParams.get("oauthKey"));

  if (!hasCleanOAuthCookies) {
    await expireSupabaseAuthSessionCookies();

    const cleanUrl = new URL("/auth/google", request.url);
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
  let oauthResult: Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>;

  try {
    oauthResult = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString()
      }
    });
  } catch (error) {
    console.error("[auth/google] OAuth init exception", {
      message: error instanceof Error ? error.message : String(error),
      callbackOrigin: callbackUrl.origin
    });
    return noStoreRedirect(new URL("/dashboard/login?authError=google_init", request.url));
  }

  const { data, error } = oauthResult;

  if (error || !data.url) {
    console.error("[auth/google] OAuth init failed", {
      message: error?.message,
      callbackOrigin: callbackUrl.origin
    });
    return noStoreRedirect(new URL("/dashboard/login?authError=google_init", request.url));
  }

  return noStoreRedirect(new URL(data.url));
}
