import assert from 'node:assert/strict';
import test from 'node:test';

import { routeRequest } from '../routes/router.js';
import { getHealth } from './ops-agent-service.js';

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('API health distinguishes missing config from runtime readiness', async () => {
  await withEnv(
    {
      BILLIONMAIL_BASE_URL: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
    },
    async () => {
      const health = await getHealth({ fetchImpl: async () => new Response('{}') });
      assert.equal(health.status, 'not_configured');
      assert.deepEqual(health.missing, [
        'BILLIONMAIL_BASE_URL',
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_ZONE_ID',
      ]);
      assert.deepEqual(health.checks, {
        billionmail: { status: 'not_configured' },
        cloudflare: { status: 'not_configured' },
      });
    },
  );

  await withEnv(
    {
      BILLIONMAIL_BASE_URL: 'http://127.0.0.1:8081',
      BILLIONMAIL_API_TOKEN: 'provider-token',
      CLOUDFLARE_API_TOKEN: 'cf-token',
      CLOUDFLARE_ZONE_ID: 'zone-example',
    },
    async () => {
      const health = await getHealth({ fetchImpl: async () => new Response('{}', { status: 200 }) });
      assert.equal(health.status, 'ready');
      assert.deepEqual(
        Object.fromEntries(Object.entries(health.checks).map(([key, value]) => [key, value.status])),
        { billionmail: 'up', cloudflare: 'up' },
      );
    },
  );
});

test('API health returns degraded after a bounded runtime timeout', async () => {
  await withEnv(
    {
      BILLIONMAIL_BASE_URL: 'http://127.0.0.1:8081',
      BILLIONMAIL_API_TOKEN: 'provider-token',
      CLOUDFLARE_API_TOKEN: 'cf-token',
      CLOUDFLARE_ZONE_ID: 'zone-example',
    },
    async () => {
      const fetchImpl: typeof fetch = async (input, init) => {
        if (String(input).includes('api.cloudflare.com')) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('timed out', 'AbortError')),
              { once: true },
            );
          });
        }
        return new Response('{}', { status: 200 });
      };

      const startedAt = performance.now();
      const health = await getHealth({ fetchImpl, timeoutMs: 100 });
      const elapsedMs = performance.now() - startedAt;

      assert.equal(health.status, 'degraded');
      assert.equal(health.checks.billionmail.status, 'up');
      assert.deepEqual(
        { status: health.checks.cloudflare.status, reason: health.checks.cloudflare.reason },
        { status: 'down', reason: 'timeout' },
      );
      assert.ok(elapsedMs >= 80 && elapsedMs < 1_000, `unexpected health timeout duration: ${elapsedMs}ms`);
    },
  );
});

test('public health response omits dependency and environment details', async () => {
  await withEnv(
    {
      BILLIONMAIL_BASE_URL: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_ZONE_ID: undefined,
    },
    async () => {
      const publicHealth = await routeRequest({ method: 'GET', path: '/api/logimail/health' });
      assert.deepEqual(publicHealth, {
        ok: true,
        service: 'logimail-api',
        status: 'not_configured',
      });

      const detailedHealth = await routeRequest({
        method: 'GET',
        path: '/api/logimail/health',
        healthDetailAuthorized: true,
      });
      assert.ok('missing' in detailedHealth);
      assert.ok('checks' in detailedHealth);
    },
  );
});
