import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';

// Multi_Domain_Manager (Requirement 18, 20): list sending domains with per-domain
// score + usage, adjust per-domain limits, and assign/route stream types.

export type StreamType = 'transactional' | 'marketing';

export type SendingDomainView = {
  id: string;
  domain: string;
  workspaceId: string;
  workspaceName: string | null;
  status: string;
  streamType: StreamType;
  parentDomainId: string | null;
  score: number | null;
  dailyLimit: number | null;
  usedToday: number;
};

const PAGE_SIZE_CAP = 100;

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('multi_domain_not_configured');
  return client;
}

/** List sending domains paginated at 100, ordered by domain name (R18.1, R18.5). */
export async function listSendingDomains(input: { page?: number; pageSize?: number } = {}): Promise<{ domains: SendingDomainView[]; page: number; pageSize: number; hasMore: boolean }> {
  const db = store();
  const pageSize = Math.min(PAGE_SIZE_CAP, Math.max(1, input.pageSize ?? PAGE_SIZE_CAP));
  const page = Math.max(1, input.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // fetch one extra to detect hasMore

  const { data, error } = await db
    .from('domains')
    .select('id,workspace_id,domain,status,stream_type,parent_domain_id')
    .order('domain', { ascending: true })
    .range(from, to);
  if (error) throw new Error(supabaseErrorMessage(error));

  const rows = (data ?? []) as Array<{ id: string; workspace_id: string; domain: string; status: string; stream_type: StreamType; parent_domain_id: string | null }>;
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const domainIds = pageRows.map((row) => row.id);
  const workspaceIds = Array.from(new Set(pageRows.map((row) => row.workspace_id)));

  const [quotaRes, scoreRes, workspaceRes] = await Promise.all([
    domainIds.length ? db.from('domain_quotas').select('domain_id,daily_send_limit,used_today').in('domain_id', domainIds) : Promise.resolve({ data: [], error: null }),
    domainIds.length ? db.from('deliverability_checks').select('domain_id,score,created_at').in('domain_id', domainIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    workspaceIds.length ? db.from('workspaces').select('id,name').in('id', workspaceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [quotaRes, scoreRes, workspaceRes]) {
    if (result.error) throw new Error(supabaseErrorMessage(result.error));
  }

  const quotaByDomain = new Map((((quotaRes.data ?? []) as Array<{ domain_id: string; daily_send_limit: number; used_today: number }>)).map((row) => [row.domain_id, row]));
  const workspaceById = new Map((((workspaceRes.data ?? []) as Array<{ id: string; name: string }>)).map((row) => [row.id, row.name]));
  const latestScore = new Map<string, number>();
  for (const row of (scoreRes.data ?? []) as Array<{ domain_id: string; score: number }>) {
    if (!latestScore.has(row.domain_id)) latestScore.set(row.domain_id, row.score); // first = newest (ordered desc)
  }

  const domains: SendingDomainView[] = pageRows.map((row) => {
    const quota = quotaByDomain.get(row.id);
    return {
      id: row.id,
      domain: row.domain,
      workspaceId: row.workspace_id,
      workspaceName: workspaceById.get(row.workspace_id) ?? null,
      status: row.status,
      streamType: row.stream_type,
      parentDomainId: row.parent_domain_id,
      score: latestScore.has(row.id) ? latestScore.get(row.id)! : null,
      dailyLimit: quota?.daily_send_limit ?? null,
      usedToday: quota?.used_today ?? 0,
    };
  });

  return { domains, page, pageSize, hasMore };
}

/** Change the daily send limit for exactly one domain (R18.4). */
export async function setDomainDailyLimit(input: { domainId: string; dailyLimit: number; actor: string; actorId?: string | null }): Promise<void> {
  if (!Number.isInteger(input.dailyLimit) || input.dailyLimit < 0) throw new Error('invalid_daily_limit');
  const db = store();

  const { data: domain, error: domainError } = await db.from('domains').select('id,workspace_id').eq('id', input.domainId).maybeSingle();
  if (domainError) throw new Error(supabaseErrorMessage(domainError));
  if (!domain) throw new Error('domain_not_found');

  const { error } = await db
    .from('domain_quotas')
    .upsert(
      { domain_id: input.domainId, workspace_id: (domain as { workspace_id: string }).workspace_id, daily_send_limit: input.dailyLimit, updated_at: new Date().toISOString() },
      { onConflict: 'domain_id' },
    );
  if (error) throw new Error(supabaseErrorMessage(error));

  await writeAuditLog({
    workspaceId: (domain as { workspace_id: string }).workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.domain_limit_changed',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { dailyLimit: input.dailyLimit },
  });
}

/** Assign a stream type to a sending (sub)domain (R20.1). */
export async function assignStreamType(input: { domainId: string; streamType: StreamType; actor: string; actorId?: string | null }): Promise<void> {
  const db = store();
  const { error } = await db.from('domains').update({ stream_type: input.streamType, updated_at: new Date().toISOString() }).eq('id', input.domainId);
  if (error) throw new Error(supabaseErrorMessage(error));
  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.stream_type_assigned',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { streamType: input.streamType },
  });
}

/**
 * Resolve the sending domain for a message stream (R20.2). Prefers a child
 * subdomain whose stream_type matches; falls back to the root domain.
 */
export async function resolveStreamDomain(input: { rootDomainId: string; streamType: StreamType }): Promise<{ domainId: string; domain: string } | null> {
  const db = store();
  const { data, error } = await db
    .from('domains')
    .select('id,domain,stream_type,parent_domain_id')
    .or(`id.eq.${input.rootDomainId},parent_domain_id.eq.${input.rootDomainId}`);
  if (error) throw new Error(supabaseErrorMessage(error));

  const rows = (data ?? []) as Array<{ id: string; domain: string; stream_type: StreamType; parent_domain_id: string | null }>;
  const child = rows.find((row) => row.parent_domain_id === input.rootDomainId && row.stream_type === input.streamType);
  if (child) return { domainId: child.id, domain: child.domain };
  const root = rows.find((row) => row.id === input.rootDomainId);
  return root ? { domainId: root.id, domain: root.domain } : null;
}

export function multiDomainError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'multi_domain_error');
  if (message === 'multi_domain_not_configured') return { status: 503, text: 'Thiếu service role cho multi-domain.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  if (message === 'invalid_daily_limit') return { status: 400, text: 'Daily limit không hợp lệ.' };
  return { status: 502, text: message };
}
