import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./billionmail-provider.ts', import.meta.url), 'utf8');

test('BillionMail calls have a bounded, configurable timeout', () => {
  assert.match(source, /LOGIMAIL_BILLIONMAIL_TIMEOUT_MS/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\)/);
  assert.match(source, /billionmail_provider_error:timeout/);
  assert.match(source, /fetchProvider\(endpoint\(path\)/);
  assert.match(source, /fetchProvider\(billionMailBridgeMailboxEndpoint/);
});
