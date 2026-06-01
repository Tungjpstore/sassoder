import "server-only";

import { safeProtectedDashboardNextPath } from "@/lib/auth-flow-routes";
import { getDashboardDestinationForHost } from "@/lib/dashboard-destination";
import { getHostname } from "@/lib/supabase/cookie-guards";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";
import { consumeRegistrationIntentForUser, getRestaurantForUser } from "@/services/restaurant-service";

const LEGACY_ROOT_DOMAIN = "logi.vn.com";

type AuthenticatedUser = {
  id: string;
  email: string;
};

export function getSafeAuthReturnHost(request: Request) {
  const requestUrl = new URL(request.url);
  const host =
    normalizeTrustedAuthHost(request.headers.get("x-forwarded-host")) ??
    normalizeTrustedAuthHost(request.headers.get("host")) ??
    normalizeTrustedAuthHost(requestUrl.host);

  return host ?? ROOT_DOMAIN;
}

export function buildUrlForAuthReturnHost(request: Request, host: string | null | undefined, pathOrUrl: string) {
  if (!host || pathOrUrl.startsWith("http")) return pathOrUrl;

  const hostname = getHostname(host);
  const protocol = isLocalHost(hostname) ? new URL(request.url).protocol : "https:";
  return new URL(pathOrUrl, `${protocol}//${host}`).toString();
}

export async function getPostLoginDashboardDestination({
  request,
  user,
  next,
  returnHost
}: {
  request: Request;
  user: AuthenticatedUser;
  next: string;
  returnHost?: string | null;
}) {
  const host = returnHost || getSafeAuthReturnHost(request);
  const restaurant =
    (await consumeRegistrationIntentForUser({ userId: user.id, email: user.email })) ??
    (await getRestaurantForUser(user.id, user.email));

  if (restaurant) {
    const protectedNext = safeProtectedDashboardNextPath(next);
    if (protectedNext && protectedNext !== "/dashboard") {
      return buildUrlForAuthReturnHost(request, returnHost, protectedNext);
    }
    return buildUrlForAuthReturnHost(request, returnHost, getDashboardDestinationForHost(restaurant.slug, host));
  }

  const destination = next === "/dashboard" ? "/dashboard/onboarding" : next;
  return buildUrlForAuthReturnHost(request, returnHost, destination);
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeTrustedAuthHost(value: string | null) {
  const host = firstHeaderValue(value)?.toLowerCase();
  if (!host || /[\s/@]/.test(host)) return null;

  const parsed = parseHostWithOptionalPort(host);
  if (!parsed) return null;

  if (isLocalHost(parsed.hostname)) return parsed.host;
  if (parsed.port) return null;
  if (isAllowedAuthHostname(parsed.hostname)) return parsed.hostname;
  return null;
}

function parseHostWithOptionalPort(host: string) {
  if (host.startsWith("[")) {
    const match = /^\[([^\]]+)\](?::([0-9]{1,5}))?$/.exec(host);
    if (!match || !isValidPort(match[2])) return null;
    return { hostname: match[1], port: match[2] ?? "", host };
  }

  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(host);
  if (!match || !isValidPort(match[2])) return null;
  return { hostname: match[1], port: match[2] ?? "", host };
}

function isValidPort(port: string | undefined) {
  if (!port) return true;
  const value = Number(port);
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function isAllowedAuthHostname(hostname: string) {
  if (!hasValidDnsHostname(hostname)) return false;
  return hostname === ROOT_DOMAIN || hostname === LEGACY_ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
}

function hasValidDnsHostname(hostname: string) {
  return hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
