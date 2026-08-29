import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('./migrations/20260722141519_logimail_atomic_send_quota.sql', import.meta.url),
  'utf8',
);

test('active domains receive a bounded quota row before fail-closed sends', () => {
  assert.match(migration, /insert into logimail\.domain_quotas[\s\S]*?from logimail\.domains[\s\S]*?where status = 'active'/i);
  assert.match(migration, /create or replace function logimail\.reserve_domain_send_quota\(target_domain_id uuid\)/i);
  assert.match(migration, /return query select false, 0, 0/i);
});

test('domain quota reservation is atomic and mailbox rate reservation is bounded', () => {
  assert.match(migration, /update logimail\.domain_quotas[\s\S]*?used_today = case/i);
  assert.match(migration, /case when usage_date < current_date then 0 else used_today end\) < daily_send_limit/i);
  assert.match(migration, /create or replace function logimail\.reserve_mailbox_send_rate\(\s*target_mailbox_id uuid,\s*threshold integer/i);
  assert.match(migration, /send_rate_window_count < threshold/i);
  assert.match(migration, /status = 'active'/i);
});

test('send reservation RPCs are service-role only', () => {
  assert.match(migration, /revoke all on function logimail\.reserve_domain_send_quota\(uuid\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function logimail\.reserve_domain_send_quota\(uuid\) to service_role;/i);
  assert.match(migration, /revoke all on function logimail\.reserve_mailbox_send_rate\(uuid, integer\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function logimail\.reserve_mailbox_send_rate\(uuid, integer\) to service_role;/i);
});
