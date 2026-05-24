import "server-only";

import { createHmac } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type PersistentRateLimitInput = {
  tenantId?: string;
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
  const redisAllowed = await checkBackboneRateLimit(input);
  if (redisAllowed !== null) return redisAllowed;

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

async function checkBackboneRateLimit(input: PersistentRateLimitInput) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) return null;

  const response = await fetch(new URL("/rate-limits/check", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify({
      tenantId: input.tenantId ?? "global",
      scope: input.scope,
      identifier: keyHash(input),
      limit: input.limit,
      windowMs: input.windowMs
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(1200)
  }).catch((error) => {
    console.warn("[persistent-rate-limit] Redis backbone unavailable, falling back to Supabase", {
      scope: input.scope,
      error
    });
    return null;
  });

  if (!response) return null;
  if (response.status === 429) return false;
  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as { allowed?: boolean } | null;
  return typeof body?.allowed === "boolean" ? body.allowed : null;
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || "";
}
