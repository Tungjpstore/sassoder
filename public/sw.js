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

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event.data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = safeNotificationUrl(event.notification.data?.url || event.notification.data?.actionUrl);
  event.waitUntil(focusOrOpenNotificationUrl(targetUrl));
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

async function showPushNotification(pushData) {
  const payload = normalizePushPayload(pushData);
  await setAppBadgeCount(payload.badgeCount);
  return self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    renotify: payload.renotify,
    requireInteraction: payload.requireInteraction,
    vibrate: payload.requireInteraction ? [120, 80, 120] : [80],
    data: payload.data,
    actions: [
      {
        action: "open",
        title: "Mở LogiVN"
      }
    ]
  });
}

function normalizePushPayload(pushData) {
  const raw = parsePushData(pushData);
  const title = compactPushText(raw.title, 90) || "LogiVN";
  const body = compactPushText(raw.body, 140);
  const eventId = compactPushText(raw.data?.eventId, 140);
  const eventType = compactPushText(raw.data?.eventType, 80);
  const tag = compactPushTag(raw.tag || eventId || eventType || "logivn-ops");
  const url = safeNotificationUrl(raw.data?.url || raw.url);
  const badgeCount = Number.isFinite(raw.badgeCount) ? Math.max(0, Math.min(99, Math.trunc(Number(raw.badgeCount)))) : undefined;

  return {
    title,
    body,
    tag,
    icon: safeIconPath(raw.icon, "/icons/icon-192x192.png"),
    badge: safeIconPath(raw.badge, "/icons/icon-96x96.png"),
    badgeCount,
    renotify: Boolean(raw.renotify),
    requireInteraction: Boolean(raw.requireInteraction),
    data: {
      url,
      eventId,
      eventType
    }
  };
}

function parsePushData(pushData) {
  if (!pushData) return {};
  try {
    return pushData.json() || {};
  } catch {
    try {
      return { title: pushData.text() };
    } catch {
      return {};
    }
  }
}

function compactPushText(value, maxLength) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactPushTag(value) {
  if (typeof value !== "string") return "logivn-ops";
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 64) || "logivn-ops";
}

function safeIconPath(value, fallback) {
  if (typeof value !== "string" || !value.startsWith("/icons/")) return fallback;
  return value;
}

function safeNotificationUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "/dashboard";

  try {
    const url = new URL(value.trim(), self.location.origin);
    if (url.origin !== self.location.origin) return "/dashboard";
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (path === "/dashboard" || path.startsWith("/dashboard/") || path.startsWith("/dashboard?")) return path;
    if (path === "/download" || path.startsWith("/download/") || path.startsWith("/download?")) return path;
    return "/dashboard";
  } catch {
    return "/dashboard";
  }
}

async function focusOrOpenNotificationUrl(path) {
  const target = new URL(path, self.location.origin);
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of windowClients) {
    const clientUrl = new URL(client.url);
    if (clientUrl.origin !== target.origin) continue;

    await client.focus();
    if ("navigate" in client && clientUrl.pathname !== target.pathname) {
      return client.navigate(target.href);
    }
    return client;
  }

  return self.clients.openWindow(target.href);
}

async function setAppBadgeCount(count) {
  if (!Number.isFinite(count)) return;

  try {
    if (count === 0 && self.navigator?.clearAppBadge) {
      await self.navigator.clearAppBadge();
      return;
    }
    if (self.navigator?.setAppBadge) {
      await self.navigator.setAppBadge(count);
    }
  } catch {
    // Badging is best-effort and not available on every browser/PWA mode.
  }
}
