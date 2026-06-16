import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  DEFAULT_SEND_RATE_LIMIT_PER_HOUR,
  isSendRateExceeded,
  sendRateWindowStart,
} from '@/lib/security/abuse';

// Anti_Abuse_Service (Requirement 16.3–16.4): when a mailbox exceeds the send-rate
// threshold within the trailing hour, pause its sending (status -> locked), raise
// an `anti_abuse` alert, and record an audit entry.

export type SendRateCheck = {
  allowed: boolean;
  count: number;
  threshold: number;
  paused: boolean;
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('anti_abuse_not_configured');
  return client;
}

async function countSendsInWindow(mailboxId: string): Promise<number> {
  const db = store();
  const { count, error } = await db
    .from('email_send_logs')
    .select('id', { count: 'exact', head: true })
    .eq('mailbox_id', mailboxId)
    .gte('created_at', sendRateWindowStart());
  if (error) throw new Error(supabaseErrorMessage(error));
  return count ?? 0;
}

async function pauseMailbox(input: { mailboxId: string; workspaceId?: string | null; count: number; actor: string; actorId?: string | null }) {
  const db = store();

  // Pause sending by locking the mailbox (R16.3).
  const { error: lockError } = await db
    .from('mailboxes')
    .update({ status: 'locked' })
    .eq('id', input.mailboxId);
  if (lockError) throw new Error(supabaseErrorMessage(lockError));

  // Raise an anti-abuse alert (R16.3).
  await db.from('alerts').insert({
    workspace_id: input.workspaceId ?? null,
    kind: 'anti_abuse',
    severity: 'critical',
    message: `Mailbox ${input.mailboxId} vượt ngưỡng gửi ${input.count} thư/giờ và đã bị tạm dừng.`,
    metadata: { mailboxId: input.mailboxId, count: input.count, threshold: DEFAULT_SEND_RATE_LIMIT_PER_HOUR },
  });

  // Record the triggering action (R16.4).
  await writeAuditLog({
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.anti_abuse_paused',
    targetType: 'mailbox',
    targetId: input.mailboxId,
    metadata: { count: input.count, threshold: DEFAULT_SEND_RATE_LIMIT_PER_HOUR, endpoint: 'send' },
  });
}

/**
 * Check (and enforce) the per-mailbox send-rate budget before a send. When the
 * threshold is reached the mailbox is paused, an alert + audit entry are written,
 * and `allowed=false` is returned so the caller can abort the send.
 */
export async function enforceMailboxSendRate(input: {
  mailboxId: string;
  workspaceId?: string | null;
  actor: string;
  actorId?: string | null;
  threshold?: number;
}): Promise<SendRateCheck> {
  const threshold = input.threshold ?? DEFAULT_SEND_RATE_LIMIT_PER_HOUR;
  const count = await countSendsInWindow(input.mailboxId);

  if (isSendRateExceeded(count, threshold)) {
    await pauseMailbox({ mailboxId: input.mailboxId, workspaceId: input.workspaceId, count, actor: input.actor, actorId: input.actorId });
    return { allowed: false, count, threshold, paused: true };
  }

  return { allowed: true, count, threshold, paused: false };
}

export function antiAbuseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'anti_abuse_error');
  if (message === 'anti_abuse_not_configured') return { status: 503, text: 'Thiếu service role cho anti-abuse.' };
  return { status: 502, text: message };
}

export { DEFAULT_SEND_RATE_LIMIT_PER_HOUR, isSendRateExceeded } from '@/lib/security/abuse';
