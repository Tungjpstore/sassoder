import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('./migrations/20260722150000_logimail_audit_actor_detach.sql', import.meta.url), 'utf8');

test('audit actor detach migration preserves immutable fields', () => {
  assert.match(migration, /drop rule if exists logimail_audit_logs_no_update/i);
  assert.match(migration, /old\.actor_id is not null/i);
  assert.match(migration, /new\.actor_id is null/i);
  for (const field of ['id', 'workspace_id', 'action', 'target_type', 'target_id', 'metadata', 'created_at']) {
    assert.match(migration, new RegExp(`old\\.${field}\\s+is not distinct from new\\.${field}`, 'i'));
  }
  assert.match(migration, /do instead nothing/i);
});
