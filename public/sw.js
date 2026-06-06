const CACHE_PREFIX = "logivn-pwa";
const CACHE_VERSION = "v2";
const STATIC_CACHE = `${CACHE_PREFIX}:${CACHE_VERSION}:static`;
const DOCUMENT_CACHE = `${CACHE_PREFIX}:${CACHE_VERSION}:documents`;
const OFFLINE_URL = "/offline";

const STATIC_ASSET_PATHS = new Set([
  "/favicon.ico",
  "/favicon-48x48.png",
  "/icon-192.png",
  "/icon.png",
  "/apple-icon.png",
  "/manifest.webmanifest",
  OFFLINE_URL,
  "/dashboard-background-desktop.png",
  "/dashboard-background-mobile.png"
]);

const STATIC_ASSET_PREFIXES = ["/_next/static/", "/icons/", "/brand/logivn/", "/customer/order-flow/", "/onboarding/flow/"];
const PUBLIC_DOCUMENT_PATHS = new Set(["/", "/download", "/demo", "/pricing", "/waitlist", "/blog", "/giai-phap", "/so-sanh", "/dia-phuong"]);
const PUBLIC_DOCUMENT_PREFIXES = ["/download/", "/blog/", "/giai-phap/", "/so-sanh/", "/dia-phuong/"];
const DENY_PATHS = new Set(["/staff/change-password"]);
const DENY_PATH_PREFIXES = ["/api/", "/auth/", "/dashboard", "/platform-control", "/_next/image"];
const SENSITIVE_SEARCH_PARAMS = ["access_token", "checkout", "code", "email", "next", "orderId", "otp", "payment", "reservationId", "session", "state", "t", "token"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(["/favicon.ico", "/favicon-48x48.png", "/icon-192.png", "/icon.png", "/apple-icon.png", "/manifest.webmanifest", OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== DOCUMENT_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (shouldBypassCache(request, url)) return;

  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
  }
});

function shouldBypassCache(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (hasSensitiveSearchParams(url)) return true;
  if (hasSensitiveRequestHeaders(request.headers)) return true;
  if (DENY_PATHS.has(url.pathname)) return true;
  return DENY_PATH_PREFIXES.some((prefix) => matchesPathPrefix(url.pathname, prefix));
}

function hasSensitiveSearchParams(url) {
  return SENSITIVE_SEARCH_PARAMS.some((param) => url.searchParams.has(param));
}

function hasSensitiveRequestHeaders(headers) {
  return Boolean(headers.get("authorization") || hasSensitiveCookieHeader(headers.get("cookie") || ""));
}

function hasSensitiveCookieHeader(cookieHeader) {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => (part.trim().split("=")[0] || ""))
    .some((name) => name === "logivn-dashboard-smoke" || name.startsWith("sb-") || name.includes("auth-token") || name.includes("code-verifier"));
}

function isStaticAssetPath(pathname) {
  return STATIC_ASSET_PATHS.has(pathname) || STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicDocumentPath(pathname) {
  return PUBLIC_DOCUMENT_PATHS.has(pathname) || PUBLIC_DOCUMENT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function matchesPathPrefix(pathname, prefix) {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigation(request, url) {
  if (!isPublicDocumentPath(url.pathname)) {
    return fetch(request).catch(() => caches.match(OFFLINE_URL));
  }

  const cache = await caches.open(DOCUMENT_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || caches.match(OFFLINE_URL);
  }
}

function isCacheableResponse(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}
