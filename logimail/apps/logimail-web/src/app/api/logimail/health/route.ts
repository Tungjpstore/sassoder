import { jsonOk, requireServerConfig } from '@/lib/api-boundary';
import {
  billionMailBridgeMailboxEndpoint,
  billionMailProviderReadiness,
  readBillionMailProviderConfig,
} from '@/lib/billionmail-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RuntimeCheck = {
  status: 'up' | 'down' | 'not_configured';
  latency_ms?: number;
  reason?: 'timeout' | 'unreachable' | `http_${number}`;
};

const DEFAULT_TIMEOUT_MS = 1_500;

function healthTimeoutMs() {
  const configured = Number(process.env.LOGIMAIL_HEALTH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(10_000, Math.max(100, Math.round(configured)));
}

function notConfigured(): RuntimeCheck {
  return { status: 'not_configured' };
}

async function probeHttp(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  accept: (response: Response) => boolean = (response) => response.ok,
): Promise<RuntimeCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
    const latency_ms = Math.max(0, Math.round(performance.now() - startedAt));
    if (accept(response)) return { status: 'up', latency_ms };
    return { status: 'down', latency_ms, reason: `http_${response.status}` };
  } catch {
    const latency_ms = Math.max(0, Math.round(performance.now() - startedAt));
    return {
      status: 'down',
      latency_ms,
      reason: controller.signal.aborted ? 'timeout' : 'unreachable',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function supabaseRuntimeCheck(timeoutMs: number) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) return Promise.resolve(notConfigured());

  let healthUrl: string;
  try {
    healthUrl = new URL('/auth/v1/health', baseUrl).toString();
  } catch {
    return Promise.resolve<RuntimeCheck>({ status: 'down', reason: 'unreachable' });
  }

  return probeHttp(
    healthUrl,
    {
      method: 'GET',
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
    },
    timeoutMs,
  );
}

function billionMailRuntimeCheck(timeoutMs: number) {
  const config = readBillionMailProviderConfig();
  const readiness = billionMailProviderReadiness();
  if (!readiness.ready) return Promise.resolve(notConfigured());

  const url = readiness.mode === 'direct'
    ? config.baseUrl
    : billionMailBridgeMailboxEndpoint(config.bridgeBaseUrl);
  const token = readiness.mode === 'direct' ? config.apiToken : config.bridgeToken;

  return probeHttp(
    url,
    {
      method: 'GET',
      redirect: 'manual',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    },
    timeoutMs,
    (response) => response.status < 500,
  );
}

function cloudflareRuntimeCheck(timeoutMs: number) {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (!token || !zoneId) return Promise.resolve(notConfigured());

  return probeHttp(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    },
    timeoutMs,
  );
}

export async function GET(request: Request) {
  const missing = requireServerConfig([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ZONE_ID',
  ]);
  // The web app's service-role store uses this exact variable name; checking
  // unrelated dashboard key names would report a false-green deployment.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  const billionmail = billionMailProviderReadiness();
  const allMissing = [...missing, ...billionmail.missing];
  const timeoutMs = healthTimeoutMs();
  const [supabase, billionmailRuntime, cloudflare] = await Promise.all([
    supabaseRuntimeCheck(timeoutMs),
    billionMailRuntimeCheck(timeoutMs),
    cloudflareRuntimeCheck(timeoutMs),
  ]);
  const checks = { supabase, billionmail: billionmailRuntime, cloudflare };
  const runtimeReady = Object.values(checks).every((check) => check.status === 'up');

  const detailKey = process.env.LOGIMAIL_HEALTH_DETAIL_KEY?.trim();
  const detailAuthorized = Boolean(detailKey && request.headers.get('x-logimail-health-key') === detailKey);
  const health = {
    service: 'logimail-web-api',
    status: allMissing.length > 0 ? 'not_configured' : runtimeReady ? 'ready' : 'degraded',
    missing: allMissing,
    billionmail: { ready: billionmail.ready, mode: billionmail.mode },
    checks,
  };

  return jsonOk(detailAuthorized ? health : { service: health.service, status: health.status });
}
