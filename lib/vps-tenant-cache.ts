import "server-only";

type TenantCacheKey = {
  tenantId: string;
  scope: string;
  identifier: string;
};

type TenantCacheWriteInput<T> = TenantCacheKey & {
  value: T;
  ttlSeconds: number;
};

type TenantCacheInvalidateInput = Omit<TenantCacheKey, "identifier"> & {
  identifier?: string;
};

type TenantCacheResponse<T> = {
  ok?: boolean;
  hit?: boolean;
  value?: T | null;
};

const defaultTimeoutMs = 900;

export async function readVpsTenantCache<T>(input: TenantCacheKey, timeoutMs = defaultTimeoutMs) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY?.trim();
  if (!gatewayUrl || !internalKey || !vpsTenantCacheEnabled()) return null;

  const url = new URL("/cache", gatewayUrl);
  url.searchParams.set("tenantId", input.tenantId);
  url.searchParams.set("scope", input.scope);
  url.searchParams.set("identifier", input.identifier);

  const response = await fetch(url, {
    headers: { "x-logivn-internal-key": internalKey },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  }).catch(() => null);

  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as TenantCacheResponse<T> | null;
  return payload?.ok && payload.hit && payload.value ? payload.value : null;
}

export async function writeVpsTenantCache<T>(input: TenantCacheWriteInput<T>, timeoutMs = defaultTimeoutMs) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY?.trim();
  if (!gatewayUrl || !internalKey || !vpsTenantCacheEnabled()) return false;

  const response = await fetch(new URL("/cache", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  }).catch(() => null);

  return Boolean(response?.ok);
}

export async function invalidateVpsTenantCache(input: TenantCacheInvalidateInput, timeoutMs = defaultTimeoutMs) {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY?.trim();
  if (!gatewayUrl || !internalKey || !vpsTenantCacheEnabled()) return false;

  const response = await fetch(new URL("/cache", gatewayUrl), {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  }).catch(() => null);

  return Boolean(response?.ok);
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL?.trim() || process.env.LOGIVN_API_PUBLIC_URL?.trim() || "";
}

function vpsTenantCacheEnabled() {
  return process.env.LOGIVN_VPS_DASHBOARD_CACHE_ENABLED === "1";
}
