import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getHostname, sharedSupabaseCookieOptions } from "@/lib/supabase/cookie-guards";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseBrowserEnv();
  const hostname = getHostname(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host);
  const cookieOverrides = sharedSupabaseCookieOptions(hostname);
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: {
            headers: request.headers
          }
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set({
            name,
            value,
            ...options,
            ...cookieOverrides
          });
        });
      }
    }
  });

  await supabase.auth.getClaims();
  return response;
}
