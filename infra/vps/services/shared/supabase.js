import { createClient } from "@supabase/supabase-js";
import { readEnv, requiredEnv } from "./env.js";

let client;

export function supabaseAdmin() {
  if (!client) {
    client = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          "x-application-name": "logivn-vps"
        }
      }
    });
  }

  return client;
}

export function hasSupabaseConfig() {
  return Boolean(readEnv("NEXT_PUBLIC_SUPABASE_URL") && readEnv("SUPABASE_SERVICE_ROLE_KEY"));
}
