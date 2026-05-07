import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

export function createSupabaseOAuthCookieName(oauthKey: string) {
  return `sb-${getSupabaseProjectRef()}-oauth-${oauthKey}`;
}

function getSupabaseProjectRef() {
  const { url } = getSupabaseBrowserEnv();

  try {
    return new URL(url).hostname.split(".")[0] || "supabase";
  } catch {
    return "supabase";
  }
}
