import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  BOUNCE_RATE_THRESHOLD,
  bounceRate,
  elapsedMs,
  isBounceRateBreached,
  isPendingOverdue,
  slaTargetMs,
  type RequestType,
} from '@/lib/ops/sla';

// Alerting_Service + SLA_Tracker (Requirement 11): raise bounce-rate and
// SLA-breach alerts, and record request resolution time.

const REQUEST_SOURCES: Record<RequestType, { table: string; select: string }> = {
  // Account requests are platform-scoped and do not have workspace_id.
  account: { table: 'account_requests', select: 'id,created_at' },
  domain: { table: 'domain_requests', select: 'id,workspace_id,created_at' },
  mailbox: { table: 'mailbox_requests', select: 'id,workspace_id,created_at' },
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('alerting_not_configured');
  return client;
}

export async function raiseOperationalAlert(input: {
  workspaceId?: string | null;
  kind: 'bounce_rate' | 'sla_breach' | 'anti_abuse' | 'dns' | 'deliverability';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const db = store();
  const { error } = await db.from('alerts').insert({
    workspace_id: input.workspaceId ?? null,
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

/** Scan hard-bounce rate over the last 24h and alert when it exceeds 5% (R11.2). */
export async function scanBounceRate(): Promise<{ rate: number; breached: boolean; hardBounces: number; sent: number }> {
  const db = store();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: hardCount, error: bounceError }, { count: sentCount, error: sentError }] = await Promise.all([
    db.from('bounce_events').select('id', { count: 'exact', head: true }).in('bounce_type', ['hard', 'complaint']).gte('created_at', since),
    db.from('email_send_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if (bounceError) throw new Error(supabaseErrorMessage(bounceError));
  if (sentError) throw new Error(supabaseErrorMessage(sentError));

  const hardBounces = hardCount ?? 0;
  const sent = sentCount ?? 0;
  const rate = bounceRate(hardBounces, sent);
  const breached = isBounceRateBreached(hardBounces, sent);

  if (breached) {
    await raiseOperationalAlert({
      kind: 'bounce_rate',
      severity: 'critical',
      message: `Tỉ lệ hard-bounce 24h là ${(rate * 100).toFixed(1)}% (> ${(BOUNCE_RATE_THRESHOLD * 100).toFixed(0)}%).`,
      metadata: { rate, hardBounces, sent, threshold: BOUNCE_RATE_THRESHOLD },
    });
  }

  return { rate, breached, hardBounces, sent };
}

/** Scan pending requests and raise SLA-breach alerts for overdue ones (R11.4). */
export async function scanPendingSla(): Promise<{ breaches: Array<{ type: RequestType; id: string }> }> {
  const db = store();
  const now = Date.now();
  const breaches: Array<{ type: RequestType; id: string }> = [];

  for (const type of Object.keys(REQUEST_SOURCES) as RequestType[]) {
    const source = REQUEST_SOURCES[type];
    const { data, error } = await db
      .from(source.table)
      .select(source.select)
      .eq('status', 'pending')
      .limit(500);
    if (error) throw new Error(supabaseErrorMessage(error));

    for (const row of (data ?? []) as unknown as Array<{ id: string; workspace_id?: string | null; created_at: string }>) {
      if (isPendingOverdue(row.created_at, type, now)) {
        breaches.push({ type, id: row.id });
        await raiseOperationalAlert({
          workspaceId: row.workspace_id ?? null,
          kind: 'sla_breach',
          severity: 'warning',
          message: `Yêu cầu ${type} ${row.id} quá hạn SLA (${slaTargetMs(type) / 3_600_000}h).`,
          metadata: { type, requestId: row.id, createdAt: row.created_at, targetMs: slaTargetMs(type) },
        });
      }
    }
  }

  return { breaches };
}

/** Record the resolution time of a request (R11.3). */
export async function recordSlaResolution(input: { type: RequestType; requestId: string; createdAt: string; resolvedAt?: string; actorId?: string | null }): Promise<{ elapsedMs: number }> {
  const elapsed = elapsedMs(input.createdAt, input.resolvedAt ?? new Date().toISOString());
  await writeAuditLog({
    actorId: input.actorId ?? 'sla-tracker',
    action: 'logimail.sla_resolution',
    targetType: input.type,
    targetId: input.requestId,
    metadata: { elapsedMs: elapsed, targetMs: slaTargetMs(input.type), withinSla: elapsed <= slaTargetMs(input.type) },
  });
  return { elapsedMs: elapsed };
}

export async function listAlerts(limit = 100) {
  const db = store();
  const { data, error } = await db
    .from('alerts')
    .select('id,workspace_id,kind,severity,message,metadata,resolved_at,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Mark an alert resolved (R11). */
export async function resolveAlert(input: { alertId: string; actorId?: string | null }): Promise<void> {
  const db = store();
  const { error } = await db
    .from('alerts')
    .update({ resolved_at: new Date().toISOString(), resolved_by: input.actorId ?? null })
    .eq('id', input.alertId);
  if (error) throw new Error(supabaseErrorMessage(error));
}

export function alertingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'alerting_error');
  if (message === 'alerting_not_configured') return { status: 503, text: 'Thiếu service role cho alerting.' };
  return { status: 502, text: message };
}
