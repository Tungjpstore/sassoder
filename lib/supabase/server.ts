import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import { ROOT_DOMAIN } from "@/lib/tenant-domain";
import type { Database } from "@/types/supabase";

type CreateServerSupabaseClientOptions = {
  ignoreAuthSession?: boolean;
  cookieName?: string;
};

function isSupabaseAuthSessionCookie(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token") && !name.includes("code-verifier");
}

function isSupabaseAuthFlowCookie(name: string) {
  return name.startsWith("sb-") && name.includes("code-verifier");
}

function getHostname(host: string) {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0]?.toLowerCase() ?? "";
}

function shouldShareCookiesAcrossTenantDomains(hostname: string) {
  return process.env.VERCEL_ENV === "production" && (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`));
}

function sharedCookieOptions(hostname: string) {
  if (!shouldShareCookiesAcrossTenantDomains(hostname)) return {};

  return {
    domain: `.${ROOT_DOMAIN}`,
    path: "/",
    sameSite: "lax" as const,
    secure: true
  };
}

export async function expireSupabaseAuthSessionCookies() {
  await expireSupabaseCookiesByPredicate(isSupabaseAuthSessionCookie);
}

export async function expireSupabaseAuthFlowCookies() {
  await expireSupabaseCookiesByPredicate(isSupabaseAuthFlowCookie);
}

async function expireSupabaseCookiesByPredicate(predicate: (name: string) => boolean) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const hostname = getHostname(host);
  const cookiesToExpire = cookieStore.getAll().filter((cookie) => predicate(cookie.name));

  cookiesToExpire.forEach((cookie) => {
    try {
      cookieStore.delete(cookie.name);
    } catch {
      cookieStore.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0)
      });
    }

    if (shouldShareCookiesAcrossTenantDomains(hostname)) {
      cookieStore.set(cookie.name, "", {
        ...sharedCookieOptions(hostname),
        maxAge: 0,
        expires: new Date(0)
      });
    }
  });
}

export async function createServerSupabaseClient(options: CreateServerSupabaseClientOptions = {}) {
  const { url, anonKey } = getSupabaseBrowserEnv();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const hostname = getHostname(host);
  const rawCookieHeader = requestHeaders.get("cookie") ?? "";

  function getRequestCookies() {
    const allCookies = cookieStore.getAll();
    const sessionFilteredCookies = options.ignoreAuthSession
      ? allCookies.filter((cookie) => !isSupabaseAuthSessionCookie(cookie.name))
      : allCookies;
    const latestFlowCookies = latestSupabaseAuthFlowCookies(rawCookieHeader);

    if (latestFlowCookies.length === 0) return sessionFilteredCookies;

    return [
      ...latestFlowCookies,
      ...sessionFilteredCookies.filter((cookie) => !isSupabaseAuthFlowCookie(cookie.name))
    ];
  }

  return createServerClient<Database>(url, anonKey, {
    cookieOptions: options.cookieName
      ? {
          name: options.cookieName
        }
      : undefined,
    cookies: {
      getAll() {
        return getRequestCookies();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...sharedCookieOptions(hostname)
            });
          });
        } catch {
          // Server Components cannot set cookies. Server Actions and Route Handlers can.
        }
      }
    }
  });
}

function latestSupabaseAuthFlowCookies(cookieHeader: string) {
  if (!cookieHeader) return [];

  const latestByName = new Map<string, string>();

  cookieHeader.split(";").forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if (!isSupabaseAuthFlowCookie(name)) return;

    latestByName.set(name, value);
  });

  return Array.from(latestByName, ([name, value]) => ({ name, value }));
}
