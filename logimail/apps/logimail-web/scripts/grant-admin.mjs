// One-off: grant tung@logivn.com the highest LogiMail privilege (owner) and
// ensure it can sign in to domain.logivn.com.
//
// Usage (from apps/logimail-web):
//   node scripts/grant-admin.mjs [password]
// Reads Supabase creds from .env.local.

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return env;
}

const env = loadEnv(new URL('../.env.local', import.meta.url));
const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const EMAIL = 'tung@logivn.com';
const PASSWORD = process.argv[2] || `Lm-${randomBytes(9).toString('base64url')}`;
const FULL_NAME = 'Tung';

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'logimail' },
});

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function ensureAuthUser() {
  const { data, error } = await auth.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
    app_metadata: { role: 'owner', logimail_account_status: 'approved' },
  });
  if (!error && data.user) return { user: data.user, created: true };

  const existing = await findUserByEmail(EMAIL);
  if (!existing) throw error || new Error('Could not create or find user');
  const { data: updated, error: updateError } = await auth.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { ...(existing.user_metadata || {}), full_name: FULL_NAME },
    app_metadata: { ...(existing.app_metadata || {}), role: 'owner', logimail_account_status: 'approved' },
  });
  if (updateError) throw updateError;
  return { user: updated.user, created: false };
}

async function ensureProfile(userId) {
  const { error } = await db.from('profiles').upsert(
    { id: userId, email: EMAIL, full_name: FULL_NAME, role: 'owner', account_status: 'approved', updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`profiles upsert: ${error.message}`);
}

async function ensureWorkspace(userId) {
  const { data: owned, error: ownedError } = await db.from('workspaces').select('id,slug').eq('owner_id', userId).limit(1).maybeSingle();
  if (ownedError) throw new Error(`workspaces read: ${ownedError.message}`);
  let workspaceId = owned?.id;

  if (!workspaceId) {
    const slug = `tung-${randomBytes(3).toString('hex')}`;
    const { data: created, error: createError } = await db
      .from('workspaces')
      .insert({ name: 'LogiVN', slug, owner_id: userId, plan: 'internal', status: 'active' })
      .select('id,slug')
      .single();
    if (createError) throw new Error(`workspaces insert: ${createError.message}`);
    workspaceId = created.id;
  }

  const { error: memberError } = await db
    .from('workspace_members')
    .upsert({ workspace_id: workspaceId, user_id: userId, role: 'owner' }, { onConflict: 'workspace_id,user_id' });
  if (memberError) throw new Error(`workspace_members upsert: ${memberError.message}`);

  await db.from('quotas').upsert({ workspace_id: workspaceId }, { onConflict: 'workspace_id' }).then(({ error }) => {
    if (error) console.warn(`[warn] quotas upsert: ${error.message}`);
  });

  return workspaceId;
}

(async () => {
  try {
    const { user, created } = await ensureAuthUser();
    console.log(`[auth] ${created ? 'created' : 'updated'} user ${EMAIL} (id=${user.id})`);
    await ensureProfile(user.id);
    console.log('[profiles] role=owner, account_status=approved');
    const workspaceId = await ensureWorkspace(user.id);
    console.log(`[workspace] owner workspace=${workspaceId}`);
    console.log('\n================ DONE ================');
    console.log(`Email   : ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log('Role    : owner (highest)  ·  status: approved');
    console.log('Login   : domain.logivn.com (localhost:3100/)');
    console.log('=====================================');
  } catch (error) {
    console.error('FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
