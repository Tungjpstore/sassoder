import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';

// Runbook_Engine (Requirement 12.1): execute named runbook steps in order and
// record the outcome of each step in `runbook_runs`.

export type RunbookStep = {
  key: string;
  label: string;
  run: () => Promise<{ ok: boolean; detail?: string }>;
};

export type StepOutcome = { key: string; label: string; status: 'completed' | 'failed' | 'skipped'; detail?: string };
export type RunbookResult = { runId: string | null; status: 'completed' | 'failed'; steps: StepOutcome[] };

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('runbook_not_configured');
  return client;
}

/**
 * Execute a runbook's steps in defined order, recording each outcome (R12.1).
 * A failed step stops the run; remaining steps are marked skipped.
 */
export async function runRunbook(input: { runbookKey: string; steps: RunbookStep[]; actor: string; actorId?: string | null }): Promise<RunbookResult> {
  const db = store();

  const { data: created, error: createError } = await db
    .from('runbook_runs')
    .insert({ runbook_key: input.runbookKey, actor_id: input.actorId ?? null, status: 'running', steps: [] })
    .select('id')
    .maybeSingle();
  if (createError) throw new Error(supabaseErrorMessage(createError));
  const runId = (created as { id: string } | null)?.id ?? null;

  const outcomes: StepOutcome[] = [];
  let failed = false;

  for (const step of input.steps) {
    if (failed) {
      outcomes.push({ key: step.key, label: step.label, status: 'skipped' });
      continue;
    }
    try {
      const result = await step.run();
      outcomes.push({ key: step.key, label: step.label, status: result.ok ? 'completed' : 'failed', detail: result.detail });
      if (!result.ok) failed = true;
    } catch (error) {
      outcomes.push({ key: step.key, label: step.label, status: 'failed', detail: error instanceof Error ? error.message : 'unknown' });
      failed = true;
    }
  }

  const status: RunbookResult['status'] = failed ? 'failed' : 'completed';
  if (runId) {
    await db.from('runbook_runs').update({ status, steps: outcomes, updated_at: new Date().toISOString() }).eq('id', runId);
  }

  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.runbook_run',
    targetType: 'runbook',
    targetId: input.runbookKey,
    metadata: { runId, status, steps: outcomes.map((outcome) => ({ key: outcome.key, status: outcome.status })) },
  });

  return { runId, status, steps: outcomes };
}

export function runbookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'runbook_error');
  if (message === 'runbook_not_configured') return { status: 503, text: 'Thiếu service role cho runbook.' };
  return { status: 502, text: message };
}
