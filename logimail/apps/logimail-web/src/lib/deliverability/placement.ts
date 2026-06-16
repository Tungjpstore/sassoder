import 'server-only';

import { randomUUID } from 'node:crypto';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';

// Placement_Tester (Requirement 7): seed-list inbox placement testing. The seed
// list is configured via env (LOGIMAIL_SEED_LIST, comma-separated). Without it the
// service returns a configuration error and sends nothing.

export type PlacementFolder = 'inbox' | 'spam' | 'missing';
export type PlacementResult = { provider: string; folder: PlacementFolder };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('placement_not_configured');
  return client;
}

/** Configured seed list (R7.4). Empty/missing -> configuration error. */
export function loadSeedList(): string[] {
  const raw = process.env.LOGIMAIL_SEED_LIST?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes('@'));
}

/** Inbox placement rate = inbox / total (0..1). */
export function computeInboxRate(results: PlacementResult[]): number {
  if (results.length === 0) return 0;
  const inbox = results.filter((result) => result.folder === 'inbox').length;
  return inbox / results.length;
}

/**
 * Start a placement test: validate the seed list, create a unique marker, and
 * persist a pending `seed_placement_tests` row. Returns the marker + seed
 * addresses for the caller to send the test message to (R7.1).
 */
export async function startPlacementTest(input: { domainId: string; workspaceId: string; actor: string; actorId?: string | null }): Promise<{ testId: string; marker: string; seeds: string[] }> {
  const seeds = loadSeedList();
  if (seeds.length === 0) throw new Error('seed_list_not_configured'); // R7.4

  const db = store();
  const marker = `logimail-seed-${randomUUID()}`;

  const { data, error } = await db
    .from('seed_placement_tests')
    .insert({ workspace_id: input.workspaceId, domain_id: input.domainId, marker, status: 'pending', created_by: input.actorId ?? null })
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));

  const testId = (data as { id: string }).id;

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.placement_started',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { testId, marker, seedCount: seeds.length },
  });

  return { testId, marker, seeds };
}

/**
 * Record collected placement results (R7.2, R7.3): per-provider folder, compute
 * inbox rate, persist on the test row and append the rate to the related
 * `deliverability_checks` notes.
 */
export async function recordPlacementResults(input: {
  testId: string;
  domainId: string;
  workspaceId: string;
  results: PlacementResult[];
  actor: string;
  actorId?: string | null;
}): Promise<{ inboxRate: number }> {
  const db = store();
  const inboxRate = computeInboxRate(input.results);

  const { error } = await db
    .from('seed_placement_tests')
    .update({ results: input.results, inbox_rate: inboxRate, status: 'collected', updated_at: new Date().toISOString() })
    .eq('id', input.testId);
  if (error) throw new Error(supabaseErrorMessage(error));

  // Append the placement rate to the latest deliverability check notes (R7.3).
  const note = `Placement test ${input.testId}: inbox ${(inboxRate * 100).toFixed(1)}% (${input.results.map((r) => `${r.provider}=${r.folder}`).join(', ')})`;
  await db.from('deliverability_checks').insert({
    workspace_id: input.workspaceId,
    domain_id: input.domainId,
    score: Math.round(inboxRate * 100),
    notes: note,
  });

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.placement_collected',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { testId: input.testId, inboxRate, results: input.results },
  });

  return { inboxRate };
}

/** Mark pending placement tests older than `staleHours` as failed (cron, R7). */
export async function collectStalePlacementTests(staleHours = 48): Promise<{ pending: number; expired: number }> {
  const db = store();
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('seed_placement_tests')
    .select('id,created_at')
    .eq('status', 'pending')
    .limit(500);
  if (error) throw new Error(supabaseErrorMessage(error));

  const rows = (data ?? []) as Array<{ id: string; created_at: string }>;
  const stale = rows.filter((row) => row.created_at < cutoff);
  for (const row of stale) {
    await db.from('seed_placement_tests').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', row.id);
  }
  return { pending: rows.length, expired: stale.length };
}

export function placementError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'placement_error');
  if (message === 'placement_not_configured') return { status: 503, text: 'Thiếu service role cho placement test.' };
  if (message === 'seed_list_not_configured') return { status: 400, text: 'Chưa cấu hình seed-list (LOGIMAIL_SEED_LIST).' };
  return { status: 502, text: message };
}
