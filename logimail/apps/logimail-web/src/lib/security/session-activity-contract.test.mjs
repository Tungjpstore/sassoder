import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const helper = readSource('./session-activity.ts');
const apiBoundary = readSource('../api-boundary.ts');
const operationalData = readSource('../logimail-data.ts');

test('session activity helper uses only the server service-role RPC', () => {
  assert.match(helper, /createLogimailServiceStore\(\)/);
  assert.match(helper, /rpc\('touch_auth_session_activity', \{[\s\S]*target_session_id:[\s\S]*target_user_id:/);
  assert.match(helper, /status: 'unavailable'/);
});

test('central API authentication enforces activity after Supabase verifies the user', () => {
  const getUserAt = apiBoundary.indexOf('.auth.getUser(token)');
  const activityAt = apiBoundary.indexOf('await enforceVerifiedSessionActivity');
  const successAt = apiBoundary.indexOf('return { ok: true as const');

  assert.ok(getUserAt >= 0, 'Supabase getUser verification must remain present');
  assert.ok(activityAt > getUserAt && activityAt < successAt, 'activity must be enforced before protected API access');
  assert.match(apiBoundary, /idle_expired[\s\S]*session_expired[\s\S]*401/);
  assert.match(apiBoundary, /session_activity_unavailable[\s\S]*503/);
});

test('server component data enforces activity before any protected table query', () => {
  const getUserAt = operationalData.indexOf('supabase.auth.getUser()');
  const activityAt = operationalData.indexOf('await enforceVerifiedSessionActivity');
  const profileQueryAt = operationalData.indexOf(".from('profiles')");

  assert.ok(getUserAt >= 0, 'Supabase getUser verification must remain present');
  assert.ok(activityAt > getUserAt && activityAt < profileQueryAt, 'activity must be enforced before protected data queries');
  assert.match(operationalData, /supabase\.auth\.getClaims\(\)/);
  assert.match(operationalData, /session_activity_unavailable/);
});
