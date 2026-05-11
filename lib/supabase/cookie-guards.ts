import { ROOT_DOMAIN } from "@/lib/tenant-domain";

export const SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES = 12_000;
export const SUPABASE_COOKIE_CHUNK_SCAN_LIMIT = 8;

export function isSafeCookieName(name: string) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
}

export function isSupabaseCookieName(name: string) {
  return name.startsWith("sb-") && isSafeCookieName(name);
}

export function isSupabaseAuthSessionCookieName(name: string) {
  return isSupabaseCookieName(name) && name.includes("-auth-token") && !name.includes("code-verifier");
}

export function isSupabaseAuthFlowCookieName(name: string) {
  return isSupabaseCookieName(name) && (name.includes("code-verifier") || name.includes("-oauth-"));
}

export function isCookieChunkForBase(name: string, baseName: string) {
  if (name === baseName) return true;
  if (!name.startsWith(`${baseName}.`)) return false;
  return /^[0-9]+$/.test(name.slice(baseName.length + 1));
}

export function chunkedCookieNames(baseName: string, chunkLimit = SUPABASE_COOKIE_CHUNK_SCAN_LIMIT) {
  return [baseName, ...Array.from({ length: chunkLimit }, (_, index) => `${baseName}.${index}`)];
}

export function cookieNamesFromHeader(cookieHeader: string, predicate: (name: string) => boolean) {
  if (!cookieHeader) return [];

  return Array.from(
    new Set(
      cookieHeader
        .split(";")
        .map((part) => part.trim().split("=")[0] ?? "")
        .filter((name) => name.length > 0 && predicate(name))
    )
  );
}

export function isCookieHeaderOverRepairBudget(cookieHeader: string | null) {
  return (cookieHeader?.length ?? 0) > SUPABASE_COOKIE_REPAIR_THRESHOLD_BYTES;
}

export function getHostname(host: string) {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0]?.toLowerCase() ?? "";
}

export function shouldShareCookiesAcrossTenantDomains(hostname: string) {
  return process.env.VERCEL_ENV === "production" && (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`));
}

export function sharedSupabaseCookieOptions(hostname: string) {
  if (!shouldShareCookiesAcrossTenantDomains(hostname)) return {};

  return {
    domain: `.${ROOT_DOMAIN}`,
    path: "/",
    sameSite: "lax" as const,
    secure: true
  };
}
