import { NextRequest, NextResponse } from "next/server";
import { getTenantSlugFromHost, ROOT_DOMAIN } from "@/lib/tenant-domain";

const publicDashboardPaths = new Set([
  "/dashboard/login",
  "/dashboard/register",
  "/dashboard/setup",
  "/dashboard/verify-email",
  "/dashboard/forgot-password",
  "/dashboard/reset-password"
]);

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token") && !cookie.name.includes("code-verifier"));
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0];
  const tenantSlug = getTenantSlugFromHost(host);
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/dashboard") && !publicDashboardPaths.has(pathname) && !hasSupabaseAuthCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (tenantSlug) {
    const url = request.nextUrl.clone();
    const pathname = url.pathname === "/" ? "/menu" : url.pathname;

    if (pathname === "/login") {
      url.pathname = "/dashboard/login";
      return NextResponse.rewrite(url);
    }

    if (pathname.startsWith("/table/")) {
      url.pathname = `/r/${tenantSlug}${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === "/menu") {
      url.pathname = `/r/${tenantSlug}`;
      return NextResponse.rewrite(url);
    }

    return NextResponse.next();
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

  if (!shouldRedirect) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.host = ROOT_DOMAIN;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
