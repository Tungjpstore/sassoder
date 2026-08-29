import { assertBillionMailReady } from './billionmail-service.js';
import { assertCloudflareReady } from './cloudflare-dns-service.js';

export type RuntimeHealthCheck = {
  status: 'up' | 'down' | 'not_configured';
  latency_ms?: number;
  reason?: 'timeout' | 'unreachable' | `http_${number}`;
};

type HealthOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 1_500;

function healthTimeoutMs(override?: number) {
  const configured = override ?? Number(process.env.LOGIMAIL_HEALTH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(10_000, Math.max(100, Math.round(configured)));
}

function notConfigured(): RuntimeHealthCheck {
  return { status: 'not_configured' };
}

async function probeHttp(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  accept: (response: Response) => boolean = (response) => response.ok,
): Promise<RuntimeHealthCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
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

function probeBillionMail(fetchImpl: typeof fetch, timeoutMs: number) {
  const readiness = assertBillionMailReady();
  const baseUrl = process.env.BILLIONMAIL_BASE_URL?.trim();
  if (!readiness.ready || !baseUrl) return Promise.resolve(notConfigured());

  const apiToken = process.env.BILLIONMAIL_API_TOKEN?.trim() || process.env.BILLIONMAIL_API_KEY?.trim();
  return probeHttp(
    fetchImpl,
    baseUrl,
    {
      method: 'GET',
      redirect: 'manual',
      headers: apiToken ? { authorization: `Bearer ${apiToken}` } : undefined,
    },
    timeoutMs,
    (response) => response.status < 500,
  );
}

function probeCloudflare(fetchImpl: typeof fetch, timeoutMs: number) {
  const readiness = assertCloudflareReady();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  if (!readiness.ready || !token || !zoneId) return Promise.resolve(notConfigured());

  return probeHttp(
    fetchImpl,
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    },
    timeoutMs,
  );
}

export async function getHealth(options: HealthOptions = {}) {
  const billionmail = assertBillionMailReady();
  const cloudflare = assertCloudflareReady();
  const missing = [
    ...billionmail.missing.map((key) => key === 'baseUrl' ? 'BILLIONMAIL_BASE_URL' : key),
    ...cloudflare.missing,
  ];
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = healthTimeoutMs(options.timeoutMs);
  const [billionmailRuntime, cloudflareRuntime] = await Promise.all([
    probeBillionMail(fetchImpl, timeoutMs),
    probeCloudflare(fetchImpl, timeoutMs),
  ]);
  const checks = { billionmail: billionmailRuntime, cloudflare: cloudflareRuntime };
  const runtimeReady = Object.values(checks).every((check) => check.status === 'up');

  return {
    ok: true,
    service: 'logimail-api',
    status: missing.length > 0 ? 'not_configured' : runtimeReady ? 'ready' : 'degraded',
    missing,
    billionmail,
    cloudflare,
    checks,
  };
}
