import { ROOT_DOMAIN } from "@/lib/tenant-domain";

export const PLATFORM_ADMIN_SUBDOMAIN = "admin";
export const PLATFORM_ADMIN_DOMAIN = `${PLATFORM_ADMIN_SUBDOMAIN}.${ROOT_DOMAIN}`;
export const PLATFORM_ADMIN_ORIGIN = `https://${PLATFORM_ADMIN_DOMAIN}`;
export const PLATFORM_ADMIN_INTERNAL_PREFIX = "/platform-control";

export function normalizePlatformAdminPath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? "/" : normalized.replace(/\/+$/g, "");
}

export function platformAdminInternalPath(path = "/") {
  const normalized = normalizePlatformAdminPath(path);
  return normalized === "/" ? PLATFORM_ADMIN_INTERNAL_PREFIX : `${PLATFORM_ADMIN_INTERNAL_PREFIX}${normalized}`;
}

export function platformAdminUrl(path = "/") {
  return `${PLATFORM_ADMIN_ORIGIN}${normalizePlatformAdminPath(path)}`;
}

export function isPlatformAdminHost(hostname: string | null | undefined) {
  if (!hostname) return false;
  const normalized = hostname.split(":")[0]?.toLowerCase();
  return normalized === PLATFORM_ADMIN_DOMAIN || normalized === "admin.localhost";
}

