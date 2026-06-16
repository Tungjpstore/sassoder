// Read-only verification that the deliverability/multidomain objects exist in the
// remote `logimail` schema. Reads env from .env.local (keys never printed).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('MISSING_ENV');
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false }, db: { schema: 'logimail' } });

const tables = [
  'encryption_keys',
  'dkim_selectors',
  'domain_quotas',
  'warmup_plans',
  'suppression_list',
  'alerts',
  'runbook_runs',
  'seed_placement_tests',
];

let ok = 0;
for (const table of tables) {
  const { error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`MISSING ${table}: ${error.message}`);
  } else {
    ok += 1;
    console.log(`OK ${table}`);
  }
}

// Check new columns on domains.
const { error: domErr } = await db.from('domains').select('id,parent_domain_id,stream_type,bimi_status,mta_sts_status,sending_ip').limit(1);
console.log(domErr ? `MISSING domains.new_columns: ${domErr.message}` : 'OK domains.new_columns');

// Check mailboxes.credential_key_version.
const { error: mbErr } = await db.from('mailboxes').select('id,credential_key_version').limit(1);
console.log(mbErr ? `MISSING mailboxes.credential_key_version: ${mbErr.message}` : 'OK mailboxes.credential_key_version');

console.log(`\nRESULT ${ok}/${tables.length} new tables present`);
process.exit(ok === tables.length ? 0 : 1);
