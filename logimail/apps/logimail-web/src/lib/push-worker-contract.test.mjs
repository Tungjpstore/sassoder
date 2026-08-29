import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(here, '../../scripts/logimail-push-worker.ts'), 'utf8');

test('push worker revalidates subscription access before sending mailbox metadata', () => {
  assert.match(worker, /from\('mailbox_permissions'\)\.select\('mailbox_id,user_id'\)/);
  assert.match(worker, /from\('profiles'\)\.select\('id,email,account_status'\)/);
  assert.match(worker, /explicitPermissionKeys/);
  assert.match(worker, /profile\?\.account_status === 'approved'/);
  assert.match(worker, /const authorizedTargets = subscriptionTargets\.filter/);
  assert.match(worker, /groupPushTargets\(authorizedTargets\)/);
  assert.match(worker, /afterUid: checkpoint\.last_seen_uid/);
  assert.match(worker, /slice\(0, MAX_NOTIFICATIONS_PER_MAILBOX\)/);
  assert.match(worker, /lastSeenUid,/);
  assert.match(worker, /uidValidity/);
});
