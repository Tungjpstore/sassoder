import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  DEFAULT_SEND_RATE_LIMIT_PER_HOUR,
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

async function reserveMailboxSendRate(mailboxId: string, threshold: number): Promise<SendRateCheck> {
  const db = store();
  const { data, error } = await db.rpc('reserve_mailbox_send_rate', {
    target_mailbox_id: mailboxId,
    threshold,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  const row = Array.isArray(data) ? (data[0] as { allowed?: boolean; count_in_window?: number } | undefined) : undefined;
  if (!row) throw new Error('anti_abuse_reservation_failed');
  return {
    allowed: row.allowed === true,
    count: typeof row.count_in_window === 'number' ? row.count_in_window : 0,
    threshold,
    paused: false,
  };
}

async function pauseMailbox(input: { mailboxId: string; workspaceId?: string | null; count: number; actor: string; actorId?: string | null }) {
  const db = store();

  // Only the request that transitions active -> locked emits the alert/audit.
  const { data: locked, error: lockError } = await db
    .from('mailboxes')
    .update({ status: 'locked' })
    .eq('id', input.mailboxId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (lockError) throw new Error(supabaseErrorMessage(lockError));
  if (!locked) return false;

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
  return true;
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
  const reservation = await reserveMailboxSendRate(input.mailboxId, threshold);
  if (!reservation.allowed) {
    const paused = await pauseMailbox({
      mailboxId: input.mailboxId,
      workspaceId: input.workspaceId,
      count: reservation.count,
      actor: input.actor,
      actorId: input.actorId,
    });
    return { ...reservation, paused };
  }
  return reservation;
}

export function antiAbuseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'anti_abuse_error');
  if (message === 'anti_abuse_not_configured') return { status: 503, text: 'Thiếu service role cho anti-abuse.' };
  if (message === 'anti_abuse_reservation_failed') return { status: 503, text: 'Không thể xác nhận giới hạn gửi thư.' };
  return { status: 502, text: message };
}

export { DEFAULT_SEND_RATE_LIMIT_PER_HOUR, isSendRateExceeded } from '@/lib/security/abuse';
