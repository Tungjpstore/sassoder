import "server-only";

import { createHmac } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type PersistentRateLimitInput = {
  scope: string;
  identifier: string;
  ip: string;
  limit: number;
  windowMs: number;
};

function rateLimitSecret() {
  return (
    process.env.AUTH_RATE_LIMIT_SECRET?.trim() ||
    process.env.PLATFORM_ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "logivn-local-persistent-rate-limit"
  );
}

function keyHash(input: PersistentRateLimitInput) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${input.scope}:${input.identifier.toLowerCase()}:${input.ip}`)
    .digest("hex");
}

export async function checkPersistentRateLimit(input: PersistentRateLimitInput) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase.rpc("check_auth_rate_limit", {
    p_key_hash: keyHash(input),
    p_scope: input.scope,
    p_limit: input.limit,
    p_window_seconds: Math.max(1, Math.ceil(input.windowMs / 1000))
  });

  if (error) {
    console.error("[persistent-rate-limit] Supabase RPC failed", {
      scope: input.scope,
      code: error.code,
      message: error.message
    });
    return process.env.VERCEL_ENV !== "production";
  }

  return data === true;
}
