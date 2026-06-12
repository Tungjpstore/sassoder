import { createClient } from '@supabase/supabase-js';

type AuditLogInput = {
  workspaceId?: string | null;
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

function createAuditStore(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'logimail',
    },
  });
}

let auditStore: ReturnType<typeof createAuditStore> | null = null;

function getAuditStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceRoleKey) return null;

  if (!auditStore) {
    auditStore = createAuditStore(url, serviceRoleKey);
  }

  return auditStore;
}

export async function writeAuditLog(input: AuditLogInput) {
  const store = getAuditStore();
  if (!store) return { ok: false as const, skipped: 'not_configured' };

  const { error } = await store.from('audit_logs').insert({
    workspace_id: input.workspaceId ?? null,
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn('[logimail:audit] write failed', { code: error.code, message: error.message });
    return { ok: false as const, skipped: 'supabase_error' };
  }

  return { ok: true as const };
}
