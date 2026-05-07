import { getAppUrl } from "@/lib/app-url";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";

const LEGACY_ROOT_DOMAIN = "logi.vn.com";

export function getOAuthCallbackOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = (forwardedHost || request.headers.get("host") || requestUrl.host).toLowerCase();
  const hostname = getHostname(host);

  if (isLocalHost(hostname)) return requestUrl.origin;
  if (hostname === LEGACY_ROOT_DOMAIN) return `https://${LEGACY_ROOT_DOMAIN}`;
  if (hostname === ROOT_DOMAIN) return `https://${ROOT_DOMAIN}`;

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) return `https://${ROOT_DOMAIN}`;

  return getAppUrl();
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getHostname(host: string) {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0] ?? "";
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
