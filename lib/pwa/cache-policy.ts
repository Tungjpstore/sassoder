export const PWA_CACHE_PREFIX = "logivn-pwa";
export const PWA_CACHE_VERSION = "v2";

export const PWA_STATIC_ASSET_PATHS = [
  "/favicon.ico",
  "/favicon-48x48.png",
  "/icon-192.png",
  "/icon.png",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/offline",
  "/dashboard-background-desktop.png",
  "/dashboard-background-mobile.png"
] as const;

export const PWA_STATIC_ASSET_PREFIXES = [
  "/_next/static/",
  "/icons/",
  "/brand/logivn/",
  "/customer/order-flow/",
  "/onboarding/flow/"
] as const;

export const PWA_PUBLIC_DOCUMENT_PATHS = ["/", "/download", "/demo", "/pricing", "/waitlist", "/blog", "/giai-phap", "/so-sanh", "/dia-phuong"] as const;

export const PWA_PUBLIC_DOCUMENT_PREFIXES = ["/download/", "/blog/", "/giai-phap/", "/so-sanh/", "/dia-phuong/"] as const;

export const PWA_DENY_PATHS = ["/staff/change-password"] as const;

export const PWA_DENY_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/dashboard",
  "/platform-control",
  "/_next/image"
] as const;

export const PWA_SENSITIVE_SEARCH_PARAMS = [
  "access_token",
  "checkout",
  "code",
  "email",
  "next",
  "orderId",
  "otp",
  "payment",
  "reservationId",
  "session",
  "state",
  "t",
  "token"
] as const;

type PwaCacheRequest = {
  url: string;
  method?: string;
  headers?: Headers | Record<string, string | undefined>;
};

export function isStaticPwaAssetPath(pathname: string) {
  return PWA_STATIC_ASSET_PATHS.includes(pathname as (typeof PWA_STATIC_ASSET_PATHS)[number]) || PWA_STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isPublicPwaDocumentPath(pathname: string) {
  return PWA_PUBLIC_DOCUMENT_PATHS.includes(pathname as (typeof PWA_PUBLIC_DOCUMENT_PATHS)[number]) || PWA_PUBLIC_DOCUMENT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function hasSensitivePwaSearchParams(url: URL) {
  return PWA_SENSITIVE_SEARCH_PARAMS.some((param) => url.searchParams.has(param));
}

export function hasSensitivePwaHeaders(headers?: PwaCacheRequest["headers"]) {
  return Boolean(getHeader(headers, "authorization") || hasSensitiveCookieHeader(getHeader(headers, "cookie")));
}

export function shouldBypassPwaCache(request: PwaCacheRequest, appOrigin = "https://logivn.com") {
  const method = request.method ?? "GET";
  if (method.toUpperCase() !== "GET") return true;

  const url = new URL(request.url, appOrigin);
  if (url.origin !== appOrigin) return true;
  if (hasSensitivePwaSearchParams(url)) return true;
  if (hasSensitivePwaHeaders(request.headers)) return true;
  if (PWA_DENY_PATHS.includes(url.pathname as (typeof PWA_DENY_PATHS)[number])) return true;
  return PWA_DENY_PATH_PREFIXES.some((prefix) => matchesPwaPathPrefix(url.pathname, prefix));
}

export function shouldCachePwaStaticAsset(request: PwaCacheRequest, appOrigin = "https://logivn.com") {
  if (shouldBypassPwaCache(request, appOrigin)) return false;
  return isStaticPwaAssetPath(new URL(request.url, appOrigin).pathname);
}

export function shouldCachePwaDocument(request: PwaCacheRequest, appOrigin = "https://logivn.com") {
  if (shouldBypassPwaCache(request, appOrigin)) return false;
  return isPublicPwaDocumentPath(new URL(request.url, appOrigin).pathname);
}

function matchesPwaPathPrefix(pathname: string, prefix: string) {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getHeader(headers: PwaCacheRequest["headers"], name: string) {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) ?? "";

  const headerName = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return headerName ? headers[headerName] ?? "" : "";
}

function hasSensitiveCookieHeader(cookieHeader: string) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => part.trim().split("=")[0] ?? "")
    .some((name) => name === "logivn-dashboard-smoke" || name.startsWith("sb-") || name.includes("auth-token") || name.includes("code-verifier"));
}
