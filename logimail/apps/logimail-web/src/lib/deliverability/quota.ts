import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';

// Quota is reserved before SMTP. The database RPC increments only while the
// row is under its limit, preventing parallel requests from oversending.

export type QuotaDecision = {
  allowed: boolean;
  reason?: 'quota_exceeded' | 'quota_not_configured' | 'sending_domain_not_found';
  used: number;
  limit: number | null;
};

type QuotaReservationRow = { allowed: boolean; used: number; daily_limit: number };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('quota_not_configured');
  return client;
}

/** Resolve the active Sending_Domain id for a from-address (domain part). */
export async function resolveSendingDomainId(email: string): Promise<{ domainId: string; workspaceId: string } | null> {
  const domainName = email.split('@')[1]?.toLowerCase();
  if (!domainName) return null;
  const db = store();
  const { data, error } = await db
    .from('domains')
    .select('id,workspace_id')
    .eq('domain', domainName)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return null;
  return { domainId: (data as { id: string }).id, workspaceId: (data as { workspace_id: string }).workspace_id };
}

/** Atomically reserve one send from a configured domain quota. */
export async function reserveDomainQuota(domainId: string): Promise<QuotaDecision> {
  const db = store();
  const { data, error } = await db.rpc('reserve_domain_send_quota', { target_domain_id: domainId });
  if (error) throw new Error(supabaseErrorMessage(error));

  const row = Array.isArray(data) ? (data[0] as QuotaReservationRow | undefined) : undefined;
  if (!row) return { allowed: false, reason: 'quota_not_configured', used: 0, limit: null };
  if (row.allowed) return { allowed: true, used: row.used, limit: row.daily_limit };
  return {
    allowed: false,
    reason: row.daily_limit > 0 ? 'quota_exceeded' : 'quota_not_configured',
    used: row.used,
    limit: row.daily_limit || null,
  };
}

/**
 * Reserve the sending budget before handing the message to SMTP. Missing or
 * inactive domains fail closed instead of silently becoming unlimited senders.
 */
export async function enforceSendingQuota(fromEmail: string): Promise<QuotaDecision & { domainId: string | null; workspaceId: string | null }> {
  const resolved = await resolveSendingDomainId(fromEmail);
  if (!resolved) return { allowed: false, reason: 'sending_domain_not_found', used: 0, limit: null, domainId: null, workspaceId: null };
  const decision = await reserveDomainQuota(resolved.domainId);
  return { ...decision, domainId: resolved.domainId, workspaceId: resolved.workspaceId };
}
