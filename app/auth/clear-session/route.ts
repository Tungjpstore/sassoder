import { NextResponse } from "next/server";
import {
  cookieNamesFromHeader,
  getHostname,
  isSupabaseCookieName,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard/login?session=cleared";
  if (!value.startsWith("/dashboard") && !isSafeStaffLoginPath(value) && value !== "/") return "/dashboard/login?session=cleared";
  return value;
}

function isSafeStaffLoginPath(value: string) {
  return value === "/staff/login" || /^\/staff\/[a-z0-9-]{2,80}\/login(?:[?#].*)?$/.test(value);
}

function cookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieNamesFromHeader(cookieHeader, isSupabaseCookieName);
}

function appendExpiredCookie(response: NextResponse, request: Request, name: string) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const hostname = getHostname(host);
  const secure = requestUrl.protocol === "https:" || process.env.VERCEL_ENV === "production";
  const securePart = secure ? "; Secure" : "";

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
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL(safeNextPath(requestUrl.searchParams.get("next")), request.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Clear-Site-Data", '"cookies"');

  cookieNames(request).forEach((name) => {
    appendExpiredCookie(response, request, name);
  });

  return response;
}
