import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { consumeQuota, isQuotaExceeded, quotaAfterReset, type QuotaState } from '@/lib/deliverability/warmup-schedule';

// Per-Sending_Domain quota enforcement (Requirement 4.3, 18.3, 20.2 / Property 6, 9).
// A missing quota row means "no configured limit" -> sends are allowed.

export type QuotaDecision = { allowed: boolean; reason?: 'quota_exceeded'; used: number; limit: number | null };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('quota_not_configured');
  return client;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve the Sending_Domain id for a from-address (domain part). */
export async function resolveSendingDomainId(email: string): Promise<{ domainId: string; workspaceId: string } | null> {
  const domainName = email.split('@')[1]?.toLowerCase();
  if (!domainName) return null;
  const db = store();
  const { data, error } = await db.from('domains').select('id,workspace_id').eq('domain', domainName).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return null;
  return { domainId: (data as { id: string }).id, workspaceId: (data as { workspace_id: string }).workspace_id };
}

type QuotaRow = { domain_id: string; workspace_id: string; daily_send_limit: number; used_today: number; usage_date: string };

async function fetchQuota(domainId: string): Promise<QuotaRow | null> {
  const db = store();
  const { data, error } = await db
    .from('domain_quotas')
    .select('domain_id,workspace_id,daily_send_limit,used_today,usage_date')
    .eq('domain_id', domainId)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data as QuotaRow | null) ?? null;
}

/**
 * Check whether the Sending_Domain may send now (R4.3, R18.3). Resets the daily
 * counter when the usage date rolled over. Does NOT mutate usage — call
 * `commitDomainQuotaUsage` after a successful send.
 */
export async function checkDomainQuota(domainId: string): Promise<QuotaDecision> {
  const row = await fetchQuota(domainId);
  if (!row) return { allowed: true, used: 0, limit: null };

  const state: QuotaState = { dailyLimit: row.daily_send_limit, usedToday: row.used_today, usageDate: row.usage_date };
  const reset = quotaAfterReset(state, todayUtc());
  if (isQuotaExceeded(reset)) return { allowed: false, reason: 'quota_exceeded', used: reset.usedToday, limit: reset.dailyLimit };
  return { allowed: true, used: reset.usedToday, limit: reset.dailyLimit };
}

/** Increment `used_today` after a successful send, resetting on date rollover. */
export async function commitDomainQuotaUsage(domainId: string): Promise<void> {
  const db = store();
  const row = await fetchQuota(domainId);
  if (!row) return; // no configured quota

  const today = todayUtc();
  const state: QuotaState = { dailyLimit: row.daily_send_limit, usedToday: row.used_today, usageDate: row.usage_date };
  const { state: next } = consumeQuota(state, today);

  const { error } = await db
    .from('domain_quotas')
    .update({ used_today: next.usedToday, usage_date: next.usageDate, updated_at: new Date().toISOString() })
    .eq('domain_id', domainId);
  if (error) throw new Error(supabaseErrorMessage(error));
}

/**
 * Enforce quota for a from-address before sending. Returns a decision; the caller
 * commits usage on success. Domains without a quota row are always allowed.
 */
export async function enforceSendingQuota(fromEmail: string): Promise<QuotaDecision & { domainId: string | null; workspaceId: string | null }> {
  const resolved = await resolveSendingDomainId(fromEmail);
  if (!resolved) return { allowed: true, used: 0, limit: null, domainId: null, workspaceId: null };
  const decision = await checkDomainQuota(resolved.domainId);
  return { ...decision, domainId: resolved.domainId, workspaceId: resolved.workspaceId };
}
