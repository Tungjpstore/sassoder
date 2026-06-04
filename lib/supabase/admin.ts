import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/supabase";

let adminClient: SupabaseClient<Database> | null = null;

export function createAdminSupabaseClient() {
  if (!adminClient) {
    const { url, serviceRoleKey } = getSupabaseServiceEnv();
    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}

export function createScopedAdminSupabaseClient(headers: Record<string, string>) {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers
    }
  });
}
