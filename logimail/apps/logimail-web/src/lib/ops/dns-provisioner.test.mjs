import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { listZoneRecords, previewDnsPlan, provisionDnsPlan, resolveCloudflareZone } = await import('./dns-provisioner.ts');

async function withFetch(mockFetch, run) {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  globalThis.fetch = mockFetch;
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  try {
    return await run();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('listZoneRecords follows Cloudflare pagination and preserves record ids', async () => {
  const calls = [];
  await withFetch(async (input) => {
    const url = new URL(String(input));
    calls.push(url.searchParams.get('page'));
    const page = Number(url.searchParams.get('page'));
    if (page === 1) {
      return jsonResponse({
        success: true,
        result: Array.from({ length: 100 }, (_, index) => ({
          id: `record-${index + 1}`,
          type: 'TXT',
          name: `host-${index + 1}.x.com`,
          content: `value-${index + 1}`,
          ttl: 300,
        })),
        result_info: { page: 1, total_pages: 2 },
      });
    }
    return jsonResponse({
      success: true,
      result: [{ id: 'record-101', type: 'TXT', name: 'last.x.com', content: 'last', ttl: 300 }],
      result_info: { page: 2, total_pages: 2 },
    });
  }, async () => {
    const records = await listZoneRecords('zone-1');
    assert.equal(records.length, 101);
    assert.equal(records[0].id, 'record-1');
    assert.equal(records[100].id, 'record-101');
  });
  assert.deepEqual(calls, ['1', '2']);
});

test('allowModify updates the selected Cloudflare record by id', async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.pathname + url.search, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname === '/client/v4/zones/zone-1') {
      return jsonResponse({ success: true, result: { id: 'zone-1', name: 'x.com', status: 'active' } });
    }
    if ((init.method ?? 'GET') === 'GET') {
      return jsonResponse({
        success: true,
        result: [{ id: 'spf-record', type: 'TXT', name: 'x.com', content: 'v=spf1 -all', ttl: 300 }],
        result_info: { page: 1, total_pages: 1 },
      });
    }
    return jsonResponse({
      success: true,
      result: { id: 'spf-record', type: 'TXT', name: 'x.com', content: 'v=spf1 ip4:1.2.3.4 -all', ttl: 300 },
    });
  }, async () => {
    const planned = [{ type: 'TXT', name: 'x.com', content: 'v=spf1 ip4:1.2.3.4 -all' }];
    const preview = await previewDnsPlan({ zoneId: 'zone-1', targetDomain: 'x.com', planned });
    const result = await provisionDnsPlan({
      zoneId: 'zone-1',
      targetDomain: 'x.com',
      planned,
      allowModify: true,
      expectedPreviewDigest: preview.digest,
      actor: 'test-admin',
    });
    assert.equal(result.status, 'applied');
    assert.equal(result.updated.length, 1);
    assert.equal(result.updated[0].existing.id, 'spf-record');
    assert.deepEqual(result.rollback.map((action) => action.recordId), ['spf-record']);
  });

  assert.equal(calls.length, 5);
  assert.equal(calls[4].method, 'PUT');
  assert.match(calls[4].url, /\/dns_records\/spf-record$/);
  assert.equal(calls[4].body.content, 'v=spf1 ip4:1.2.3.4 -all');
  assert.equal(calls[4].body.ttl, 300);
});

test('duplicate existing records block writes until explicitly reviewed', async () => {
  const methods = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    methods.push(init.method ?? 'GET');
    if (url.pathname === '/client/v4/zones/zone-1') {
      return jsonResponse({ success: true, result: { id: 'zone-1', name: 'x.com', status: 'active' } });
    }
    return jsonResponse({
      success: true,
      result: [
        { id: 'mx-primary', type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 },
        { id: 'mx-legacy', type: 'MX', name: 'x.com', content: 'mail.legacy.com', priority: 10 },
      ],
      result_info: { page: 1, total_pages: 1 },
    });
  }, async () => {
    const result = await provisionDnsPlan({
      zoneId: 'zone-1',
      targetDomain: 'x.com',
      planned: [{ type: 'MX', name: 'x.com', content: 'mail.x.com', priority: 10 }],
      actor: 'test-admin',
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.skipped[0].id, 'mx-primary');
    assert.deepEqual(result.duplicates.map((record) => record.id), ['mx-legacy']);
  });
  assert.deepEqual(methods, ['GET', 'GET']);
});

test('stale preview digest blocks every write', async () => {
  let dnsRead = 0;
  const methods = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    methods.push(init.method ?? 'GET');
    if (url.pathname === '/client/v4/zones/zone-1') {
      return jsonResponse({ success: true, result: { id: 'zone-1', name: 'x.com', status: 'active' } });
    }
    dnsRead += 1;
    return jsonResponse({
      success: true,
      result: [{ id: 'spf-record', type: 'TXT', name: 'x.com', content: dnsRead === 1 ? 'v=spf1 -all' : 'v=spf1 include:new.example -all' }],
      result_info: { page: 1, total_pages: 1 },
    });
  }, async () => {
    const planned = [{ type: 'TXT', name: 'x.com', content: 'v=spf1 ip4:1.2.3.4 -all' }];
    const preview = await previewDnsPlan({ zoneId: 'zone-1', targetDomain: 'x.com', planned });
    await assert.rejects(() => provisionDnsPlan({
      zoneId: 'zone-1',
      targetDomain: 'x.com',
      planned,
      allowModify: true,
      expectedPreviewDigest: preview.digest,
      actor: 'test-admin',
    }), /dns_preview_stale/);
  });
  assert.equal(methods.includes('PUT'), false);
});

test('create mutations require a preview digest and never reach Cloudflare without it', async () => {
  const methods = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    methods.push(init.method ?? 'GET');
    if (url.pathname === '/client/v4/zones/zone-1') {
      return jsonResponse({ success: true, result: { id: 'zone-1', name: 'x.com', status: 'active' } });
    }
    return jsonResponse({ success: true, result: [], result_info: { page: 1, total_pages: 1 } });
  }, async () => {
    await assert.rejects(() => provisionDnsPlan({
      zoneId: 'zone-1',
      targetDomain: 'x.com',
      planned: [{ type: 'TXT', name: '_dmarc.x.com', content: 'v=DMARC1; p=none' }],
      actor: 'test-admin',
    }), /preview_required/);
  });
  assert.equal(methods.includes('POST'), false);
  assert.equal(methods.includes('PUT'), false);
});

test('single-use guard runs after fresh digest validation and before the first write', async () => {
  const events = [];
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/client/v4/zones/zone-1') {
      return jsonResponse({ success: true, result: { id: 'zone-1', name: 'x.com', status: 'active' } });
    }
    if ((init.method ?? 'GET') === 'GET') {
      return jsonResponse({ success: true, result: [], result_info: { page: 1, total_pages: 1 } });
    }
    events.push('write');
    return jsonResponse({ success: true, result: { id: 'new-record', type: 'TXT', name: '_dmarc.x.com', content: 'v=DMARC1; p=none' } });
  }, async () => {
    const planned = [{ type: 'TXT', name: '_dmarc.x.com', content: 'v=DMARC1; p=none' }];
    const preview = await previewDnsPlan({ zoneId: 'zone-1', targetDomain: 'x.com', planned });
    const result = await provisionDnsPlan({
      zoneId: 'zone-1',
      targetDomain: 'x.com',
      planned,
      expectedPreviewDigest: preview.digest,
      actor: 'test-admin',
      beforeApply: async () => { events.push('consume'); },
    });
    assert.equal(result.status, 'applied');
  });
  assert.deepEqual(events, ['consume', 'write']);
});

test('zone discovery falls back to the parent zone for a customer subdomain', async () => {
  await withFetch(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/client/v4/zones' && url.searchParams.get('name') === 'mail.customer.example.com') {
      return jsonResponse({ success: true, result: [] });
    }
    if (url.pathname === '/client/v4/zones' && url.searchParams.get('name') === 'customer.example.com') {
      return jsonResponse({ success: true, result: [{ id: 'zone-parent', name: 'customer.example.com', status: 'active' }] });
    }
    throw new Error(`unexpected ${url.pathname}${url.search}`);
  }, async () => {
    const zone = await resolveCloudflareZone({ targetDomain: 'mail.customer.example.com' });
    assert.equal(zone.id, 'zone-parent');
  });
});

test('admin DNS provision route rejects client supplied zone and plan', () => {
  const routePath = fileURLToPath(new URL('../../app/api/logimail/admin/domains/[id]/dns-provision/route.ts', import.meta.url));
  const source = readFileSync(routePath, 'utf8');

  assert.match(source, /body\.zoneId !== undefined \|\| body\.planned !== undefined \|\| body\.targetDomain !== undefined/);
  assert.match(source, /buildSafeDnsPlan\(domain\.domain, vpsIp, mailHostname\)/);
  assert.match(source, /expectedPreviewDigest/);
  assert.match(source, /previewDnsPlan/);
  assert.doesNotMatch(source, /stringField\(body, ['"]zoneId['"]/);
  assert.doesNotMatch(source, /plannedFromBody/);
});
