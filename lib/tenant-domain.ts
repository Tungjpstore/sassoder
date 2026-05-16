export const ROOT_DOMAIN = "logivn.com";
export const RESERVED_SUBDOMAINS = new Set(["www", "admin", "dashboard", "app", "api", "static", "assets", "staff"]);

export function getTenantSlugFromHost(host: string | null | undefined) {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname) return null;

  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = hostname.slice(0, -`.${ROOT_DOMAIN}`.length);
    if (!subdomain || subdomain.includes(".") || RESERVED_SUBDOMAINS.has(subdomain)) return null;
    return subdomain;
  }

  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.slice(0, -".localhost".length);
    if (!subdomain || subdomain.includes(".") || RESERVED_SUBDOMAINS.has(subdomain)) return null;
    return subdomain;
  }

  return null;
}

export function buildTenantUrl(slug: string, path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${slug}.${ROOT_DOMAIN}${normalizedPath}`;
}
