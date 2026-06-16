import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  WARMUP_DEFAULT_MULTIPLIER,
  WARMUP_DEFAULT_START,
  advanceWarmup,
  isWarmupComplete,
  scheduledLimitForDay,
  type WarmupPlanShape,
} from '@/lib/deliverability/warmup-schedule';

// Warmup_Scheduler (Requirement 4): create/advance per-domain warm-up plans and
// drive the Sending_Domain's daily send limit from the schedule.

export type WarmupPlan = {
  id: string;
  domainId: string;
  startLimit: number;
  multiplier: number;
  target: number;
  day: number;
  status: 'active' | 'completed' | 'paused';
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('warmup_not_configured');
  return client;
}

type PlanRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  start_limit: number;
  daily_multiplier: number;
  target_limit: number;
  current_day: number;
  status: 'active' | 'completed' | 'paused';
};

function toPlan(row: PlanRow): WarmupPlan {
  return {
    id: row.id,
    domainId: row.domain_id,
    startLimit: row.start_limit,
    multiplier: Number(row.daily_multiplier),
    target: row.target_limit,
    day: row.current_day,
    status: row.status,
  };
}

function shapeOf(row: PlanRow): WarmupPlanShape {
  return { startLimit: row.start_limit, multiplier: Number(row.daily_multiplier), target: row.target_limit, day: row.current_day };
}

async function fetchDomain(domainId: string) {
  const db = store();
  const { data, error } = await db.from('domains').select('id,workspace_id').eq('id', domainId).maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('domain_not_found');
  return data as { id: string; workspace_id: string };
}

/** Upsert today's daily send limit for a Sending_Domain (R4.2). */
async function applyQuotaLimit(domainId: string, workspaceId: string, dailyLimit: number) {
  const db = store();
  const { error } = await db
    .from('domain_quotas')
    .upsert(
      { domain_id: domainId, workspace_id: workspaceId, daily_send_limit: dailyLimit, usage_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() },
      { onConflict: 'domain_id' },
    );
  if (error) throw new Error(supabaseErrorMessage(error));
}

/** Start a warm-up plan for a Sending_Domain (R4.1). */
export async function startWarmupPlan(input: {
  domainId: string;
  target: number;
  startLimit?: number;
  multiplier?: number;
  actor: string;
  actorId?: string | null;
}): Promise<WarmupPlan> {
  const db = store();
  const domain = await fetchDomain(input.domainId);
  const startLimit = input.startLimit ?? WARMUP_DEFAULT_START;
  const multiplier = input.multiplier ?? WARMUP_DEFAULT_MULTIPLIER;
  if (input.target <= 0) throw new Error('invalid_target');

  const { data, error } = await db
    .from('warmup_plans')
    .insert({
      workspace_id: domain.workspace_id,
      domain_id: input.domainId,
      start_limit: startLimit,
      daily_multiplier: multiplier,
      target_limit: input.target,
      current_day: 1,
      status: 'active',
    })
    .select('id,workspace_id,domain_id,start_limit,daily_multiplier,target_limit,current_day,status')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));

  const row = data as PlanRow;
  const dayOneLimit = scheduledLimitForDay(shapeOf(row));
  await applyQuotaLimit(input.domainId, domain.workspace_id, dayOneLimit);

  await writeAuditLog({
    workspaceId: domain.workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.warmup_started',
    targetType: 'domain',
    targetId: input.domainId,
    metadata: { startLimit, multiplier, target: input.target, dayOneLimit },
  });

  return toPlan(row);
}

/** Advance an active plan by one day, applying the new limit; completes at target (R4.2, R4.4). */
export async function advanceWarmupPlan(input: { planId: string; actor: string; actorId?: string | null }): Promise<WarmupPlan> {
  const db = store();
  const { data, error } = await db
    .from('warmup_plans')
    .select('id,workspace_id,domain_id,start_limit,daily_multiplier,target_limit,current_day,status')
    .eq('id', input.planId)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('warmup_plan_not_found');

  const row = data as PlanRow;
  if (row.status !== 'active') return toPlan(row);

  const next = advanceWarmup(shapeOf(row));
  const { error: updateError } = await db
    .from('warmup_plans')
    .update({ current_day: next.day, status: next.status, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (updateError) throw new Error(supabaseErrorMessage(updateError));

  await applyQuotaLimit(row.domain_id, row.workspace_id, next.limit);

  await writeAuditLog({
    workspaceId: row.workspace_id,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.warmup_advanced',
    targetType: 'domain',
    targetId: row.domain_id,
    metadata: { day: next.day, limit: next.limit, status: next.status },
  });

  return { ...toPlan(row), day: next.day, status: next.status };
}

export async function listWarmupPlans(domainId: string): Promise<WarmupPlan[]> {
  const db = store();
  const { data, error } = await db
    .from('warmup_plans')
    .select('id,workspace_id,domain_id,start_limit,daily_multiplier,target_limit,current_day,status')
    .eq('domain_id', domainId)
    .order('started_at', { ascending: false });
  if (error) throw new Error(supabaseErrorMessage(error));
  return ((data ?? []) as PlanRow[]).map(toPlan);
}

/** Advance every active warm-up plan by one day (cron warmup-tick, R4.2). */
export async function advanceAllActiveWarmups(input: { actor: string; actorId?: string | null }): Promise<{ advanced: number; completed: number }> {
  const db = store();
  const { data, error } = await db
    .from('warmup_plans')
    .select('id,status')
    .eq('status', 'active')
    .limit(500);
  if (error) throw new Error(supabaseErrorMessage(error));

  let advanced = 0;
  let completed = 0;
  for (const row of (data ?? []) as Array<{ id: string; status: string }>) {
    const plan = await advanceWarmupPlan({ planId: row.id, actor: input.actor, actorId: input.actorId });
    advanced += 1;
    if (plan.status === 'completed') completed += 1;
  }
  return { advanced, completed };
}

export { isWarmupComplete };

export function warmupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'warmup_error');
  if (message === 'warmup_not_configured') return { status: 503, text: 'Thiếu service role cho warm-up.' };
  if (message === 'domain_not_found') return { status: 404, text: 'Không tìm thấy domain.' };
  if (message === 'warmup_plan_not_found') return { status: 404, text: 'Không tìm thấy warm-up plan.' };
  if (message === 'invalid_target') return { status: 400, text: 'Target limit phải lớn hơn 0.' };
  return { status: 502, text: message };
}
