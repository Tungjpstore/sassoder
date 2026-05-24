import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isPublicDashboardAuthPath, safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { DASHBOARD_SMOKE_SESSION_COOKIE, dashboardSmokeAuthEnabled, parseDashboardSmokeCookie } from "@/lib/dashboard-smoke-auth";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";
import {
  cookieNamesFromHeader,
  getHostname,
  isSupabaseAuthFlowCookieName,
  isSupabaseAuthSessionCookieName,
  isSupabaseCookieName,
  shouldRepairOversizedSupabaseCookieHeader,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { updateSession } from "@/lib/supabase/proxy";
import { getTenantSlugFromHost, ROOT_DOMAIN } from "@/lib/tenant-domain";

const staffSlugLoginPathPattern = /^\/staff\/[a-z0-9-]{2,80}\/login$/;
const staffSubdomainSlugPathPattern = /^\/([a-z0-9-]{2,80})(?:\/login)?$/;

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => isSupabaseAuthSessionCookieName(cookie.name));
}

function hasDashboardSmokeAuthCookie(request: NextRequest) {
  if (!dashboardSmokeAuthEnabled()) return false;
  const secret = process.env.DASHBOARD_SMOKE_AUTH_SECRET;
  if (!secret) return false;

  const parsed = parseDashboardSmokeCookie(request.cookies.get(DASHBOARD_SMOKE_SESSION_COOKIE)?.value);
  return parsed?.secret === secret;
}

function isServerActionRequest(request: NextRequest) {
  return request.method === "POST" && request.headers.has("next-action");
}

function isPrefetchRequest(request: NextRequest) {
  const purpose = request.headers.get("purpose") || request.headers.get("sec-purpose") || "";
  return (
    request.headers.has("next-router-prefetch") ||
    purpose.toLowerCase().includes("prefetch")
  );
}

function isRscRequest(request: NextRequest) {
  return request.headers.has("rsc");
}

function isPrefetchOrRscRequest(request: NextRequest) {
  return isPrefetchRequest(request) || isRscRequest(request);
}

function noStoreNoContent() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function shouldApplyDashboardPageGate(request: NextRequest) {
  return request.method === "GET" || request.method === "HEAD";
}

function shouldBypassProxySessionRefresh(request: NextRequest, pathname: string) {
  return (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    (isPublicDashboardAuthPath(pathname) && !hasSupabaseAuthCookie(request)) ||
    isPublicStaffPath(pathname) ||
    isServerActionRequest(request) ||
    isPrefetchOrRscRequest(request)
  );
}

export function isExpectedAuthSessionRepairError(error: unknown) {
  return isInvalidRefreshTokenError(error);
}

function authTransientCookieNames(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseAuthFlowCookieName);
}

function supabaseCookieNames(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseCookieName);
}

function appendExpiredCookie(response: NextResponse, request: NextRequest, name: string) {
  const secure = request.nextUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";
  const securePart = secure ? "; Secure" : "";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const hostname = getHostname(host);

  response.headers.append(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${securePart}`
  );

  if (process.env.VERCEL_ENV === "production" && (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`))) {
    response.headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.${ROOT_DOMAIN}; SameSite=Lax; Secure`
    );
  }
}

function repairOversizedSupabaseCookieHeader(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = loginRedirectPathForPathname(request.nextUrl.pathname);
  url.search = "";
  url.searchParams.set("session", "cleared");
  url.searchParams.set("reason", "header");
  const next = protectedDashboardNextPath(request);
  if (next && url.pathname === "/dashboard/login") {
    url.searchParams.set("next", next);
  }

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");

  supabaseCookieNames(request).forEach((name) => {
    appendExpiredCookie(response, request, name);
  });

  return response;
}

function repairInvalidSupabaseSession(request: NextRequest, reason = "refresh") {
  const url = request.nextUrl.clone();
  url.pathname = loginRedirectPathForPathname(request.nextUrl.pathname);
  url.search = "";
  url.searchParams.set("session", "cleared");
  url.searchParams.set("reason", reason);
  const next = protectedDashboardNextPath(request);
  if (next && url.pathname === "/dashboard/login") {
    url.searchParams.set("next", next);
  }

  const response = pathnameNeedsLoginRedirect(request.nextUrl.pathname)
    ? NextResponse.redirect(url)
    : NextResponse.next({
        request: {
          headers: request.headers
        }
      });
  response.headers.set("Cache-Control", "no-store");

  supabaseCookieNames(request).forEach((name) => {
    appendExpiredCookie(response, request, name);
  });

  return response;
}

function pathnameNeedsLoginRedirect(pathname: string) {
  return pathname.startsWith("/dashboard") && !isPublicDashboardAuthPath(pathname);
}

function loginRedirectPathForPathname(pathname: string) {
  return pathname.startsWith("/dashboard/staff/mobile") ? "/staff/login" : "/dashboard/login";
}

function protectedDashboardNextPath(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return safeProtectedDashboardNextPath(`${pathname}${request.nextUrl.search}`);
}

function isPublicStaffPath(pathname: string) {
  return pathname === "/staff/login" || staffSlugLoginPathPattern.test(pathname);
}

function appendExpiredTransientCookies(response: NextResponse, request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/auth/")) return response;

  Array.from(new Set(authTransientCookieNames(request))).forEach((name) => {
    appendExpiredCookie(response, request, name);
  });

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0];
  const tenantSlug = getTenantSlugFromHost(host);
  const pathname = request.nextUrl.pathname;
  const cookieHeader = request.headers.get("cookie");

  if (!pathname.startsWith("/auth/clear-session") && shouldRepairOversizedSupabaseCookieHeader(cookieHeader)) {
    return repairOversizedSupabaseCookieHeader(request);
  }

  if (pathname.startsWith("/dashboard") && isPrefetchRequest(request)) {
    return noStoreNoContent();
  }

  if (host === `staff.${ROOT_DOMAIN}` && (pathname === "/" || pathname === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/staff/login";
    return NextResponse.rewrite(url);
  }

  if (host === `staff.${ROOT_DOMAIN}`) {
    const slugMatch = pathname.match(staffSubdomainSlugPathPattern);
    if (slugMatch?.[1]) {
      const url = request.nextUrl.clone();
      url.pathname = `/staff/${slugMatch[1]}/login`;
      return NextResponse.rewrite(url);
    }
  }

  if (
    pathname.startsWith("/dashboard") &&
    !isPublicDashboardAuthPath(pathname) &&
    shouldApplyDashboardPageGate(request) &&
    !hasSupabaseAuthCookie(request) &&
    !hasDashboardSmokeAuthCookie(request) &&
    !isServerActionRequest(request)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = loginRedirectPathForPathname(pathname);
    url.search = "";
    const next = protectedDashboardNextPath(request);
    if (next && url.pathname === "/dashboard/login") {
      url.searchParams.set("next", next);
    }
    return NextResponse.redirect(url);
  }

  if (tenantSlug) {
    const url = request.nextUrl.clone();
    const tenantPath = url.pathname === "/" ? "/menu" : url.pathname;

    if (tenantPath === "/login") {
      url.pathname = "/dashboard/login";
      return NextResponse.rewrite(url);
    }

    if (tenantPath.startsWith("/table/")) {
      url.pathname = `/r/${tenantSlug}${tenantPath}`;
      return NextResponse.rewrite(url);
    }

    if (tenantPath === "/reserve") {
      url.pathname = `/r/${tenantSlug}/reserve`;
      return NextResponse.rewrite(url);
    }

    if (tenantPath === "/menu") {
      url.pathname = `/r/${tenantSlug}`;
      return NextResponse.rewrite(url);
    }
  }

  if (process.env.VERCEL_ENV === "production" && host === `www.${ROOT_DOMAIN}`) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = ROOT_DOMAIN;
    return NextResponse.redirect(url, 308);
  }

  const shouldRedirect =
    process.env.VERCEL_ENV === "production" &&
    host &&
    host !== ROOT_DOMAIN &&
    host.endsWith(".vercel.app");

  if (shouldRedirect) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = ROOT_DOMAIN;
    return NextResponse.redirect(url, 308);
  }

  if (shouldBypassProxySessionRefresh(request, pathname)) {
    const response = NextResponse.next({
      request: {
        headers: request.headers
      }
    });
    return appendExpiredTransientCookies(response, request);
  }

  try {
    const response = await updateSession(request);
    return appendExpiredTransientCookies(response, request);
  } catch (error) {
    if (!isExpectedAuthSessionRepairError(error)) {
      console.error("[proxy] Supabase session refresh failed", {
        pathname,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return appendExpiredTransientCookies(repairInvalidSupabaseSession(request), request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
