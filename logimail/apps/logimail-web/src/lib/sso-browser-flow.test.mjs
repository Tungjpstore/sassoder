import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const client = readSource('./sso-client.ts');
const flow = readSource('../components/sso-flow.tsx');

function functionSource(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test('browser handoff never carries a PKCE verifier or auth token in its redirect URL', () => {
  const start = functionSource(client, 'export async function startSsoTransfer', 'export async function consumeSsoTransfer');
  assert.match(start, /JSON\.stringify\(\{[\s\S]*?target,[\s\S]*?next:[\s\S]*?state,[\s\S]*?codeChallenge/);
  assert.doesNotMatch(start, /verifier|refresh_token/);
  assert.match(start, /destination\.hash/);
  assert.match(start, /window\.location\.replace\(destination\.toString\(\)\)/);
});

test('target consumes only the one-time ticket and sanitizes the returned path', () => {
  const consume = functionSource(client, 'export async function consumeSsoTransfer', 'export async function logoutCurrentOrigin');
  assert.match(consume, /body: JSON\.stringify\(\{ ticket \}\)/);
  assert.doesNotMatch(consume, /verifier|token_hash|access_token|refresh_token/);
  assert.match(consume, /safeNextPath\(result\.next\)/);
});

test('browser clears handoff query data and guards effects against development replays', () => {
  assert.match(flow, /window\.history\.replaceState\(null, '', window\.location\.pathname\)/);
  assert.match(flow, /const started = useRef\(false\)/);
  assert.match(flow, /const consumed = useRef\(false\)/);
  assert.ok(flow.indexOf('clearQueryString();', flow.indexOf('export function SsoCompleteFlow'))
    < flow.indexOf('consumeSsoTransfer(ticket)', flow.indexOf('export function SsoCompleteFlow')));
});

test('logout revokes on each origin before relaying through the peer host', () => {
  const logout = functionSource(client, 'export async function logoutCurrentOrigin', 'export function nextGlobalLogoutUrl');
  assert.match(logout, /\/api\/logimail\/auth\/sso\/revoke/);
  assert.ok(logout.indexOf('await Promise.allSettled(tasks)') < logout.indexOf('supabase.auth.signOut()'));
  assert.match(flow, /logoutCurrentOrigin\(\)\.finally\(\(\) => \{/);
  assert.match(flow, /nextLogoutPageUrl\(relayFrom\)/);
});
