import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import {
  getHostname,
  isCookieChunkForBase,
  isSupabaseAuthFlowCookieName,
  isSupabaseAuthSessionCookieName,
  sharedSupabaseCookieOptions,
  shouldShareCookiesAcrossTenantDomains
} from "@/lib/supabase/cookie-guards";
import type { Database } from "@/types/supabase";

type CreateServerSupabaseClientOptions = {
  ignoreAuthSession?: boolean;
  cookieName?: string;
  suppressAuthSessionCookieWrites?: boolean;
};

export async function expireSupabaseAuthSessionCookies() {
  await expireSupabaseCookiesByPredicate(isSupabaseAuthSessionCookieName);
}

export async function expireSupabaseAuthFlowCookies() {
  await expireSupabaseCookiesByPredicate(isSupabaseAuthFlowCookieName);
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
        ...sharedSupabaseCookieOptions(hostname),
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
      ? allCookies.filter((cookie) => !isSupabaseAuthSessionCookieName(cookie.name))
      : allCookies;
    const latestFlowCookies = latestSupabaseAuthFlowCookies(rawCookieHeader);

    if (latestFlowCookies.length === 0) return sessionFilteredCookies;

    return [
      ...latestFlowCookies,
      ...sessionFilteredCookies.filter((cookie) => !isSupabaseAuthFlowCookieName(cookie.name))
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
          cookiesToSet
            .filter(({ name, value }) => !shouldSuppressAuthCookieWrite(name, value, options))
            .forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                ...sharedSupabaseCookieOptions(hostname)
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
    if (!isSupabaseAuthFlowCookieName(name)) return;

    latestByName.set(name, value);
  });

  return Array.from(latestByName, ([name, value]) => ({ name, value }));
}

function shouldSuppressAuthCookieWrite(name: string, value: string, options: CreateServerSupabaseClientOptions) {
  if (!options.suppressAuthSessionCookieWrites || value === "") return false;
  if (isSupabaseAuthSessionCookieName(name)) return true;
  return options.cookieName ? isCookieChunkForBase(name, options.cookieName) : false;
}
