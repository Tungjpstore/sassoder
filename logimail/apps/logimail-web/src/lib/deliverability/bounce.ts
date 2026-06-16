import 'server-only';

import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import { writeAuditLog } from '@/lib/audit-log';
import {
  classifyBounce,
  shouldSuppress,
  suppressionReasonFor,
  type BounceType,
} from '@/lib/deliverability/bounce-classify';

// Bounce_Processor + Suppression_List (Requirement 5): classify bounce/complaint
// events, dedupe by provider_message_id, suppress hard/complaint recipients, and
// gate the send path against the suppression list.

export type ProcessBounceInput = {
  workspaceId: string;
  recipientEmail: string;
  senderEmail?: string | null;
  subject?: string | null;
  mailboxId?: string | null;
  domainId?: string | null;
  eventType?: string | null;
  smtpCode?: string | number | null;
  reason?: string | null;
  providerMessageId?: string | null;
  actor?: string;
  actorId?: string | null;
};

export type ProcessBounceResult = {
  inserted: boolean;
  deduped: boolean;
  bounceType: BounceType;
  suppressed: boolean;
};

function store() {
  const client = createLogimailServiceStore();
  if (!client) throw new Error('bounce_not_configured');
  return client;
}

export async function processBounceEvent(input: ProcessBounceInput): Promise<ProcessBounceResult> {
  const db = store();
  const recipient = input.recipientEmail.toLowerCase();
  const bounceType = classifyBounce({ eventType: input.eventType, smtpCode: input.smtpCode, reason: input.reason });

  // Dedupe by provider_message_id (R5.2).
  if (input.providerMessageId) {
    const { data: existing, error: dedupeError } = await db
      .from('bounce_events')
      .select('id')
      .eq('provider_message_id', input.providerMessageId)
      .maybeSingle();
    if (dedupeError) throw new Error(supabaseErrorMessage(dedupeError));
    if (existing) return { inserted: false, deduped: true, bounceType, suppressed: false };
  }

  const { data, error } = await db
    .from('bounce_events')
    .insert({
      workspace_id: input.workspaceId,
      mailbox_id: input.mailboxId ?? null,
      domain_id: input.domainId ?? null,
      recipient_email: recipient,
      sender_email: input.senderEmail?.toLowerCase() ?? null,
      subject: input.subject ?? null,
      bounce_type: bounceType,
      smtp_code: input.smtpCode != null ? String(input.smtpCode) : null,
      reason: input.reason ?? null,
      provider_message_id: input.providerMessageId ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Unique index race on provider_message_id -> treat as dedupe (R5.2).
    if (error.code === '23505') return { inserted: false, deduped: true, bounceType, suppressed: false };
    throw new Error(supabaseErrorMessage(error));
  }

  const eventId = (data as { id: string } | null)?.id ?? null;

  // Suppress hard bounces and complaints (R5.3).
  let suppressed = false;
  const reason = suppressionReasonFor(bounceType);
  if (shouldSuppress(bounceType) && reason) {
    const { error: suppressError } = await db
      .from('suppression_list')
      .upsert(
        { workspace_id: input.workspaceId, recipient_email: recipient, reason, source_event_id: eventId },
        { onConflict: 'workspace_id,recipient_email' },
      );
    if (suppressError) throw new Error(supabaseErrorMessage(suppressError));
    suppressed = true;
  }

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor ?? 'bounce-processor',
    action: 'logimail.bounce_processed',
    targetType: 'bounce_event',
    targetId: eventId,
    metadata: { bounceType, recipient, suppressed, providerMessageId: input.providerMessageId ?? null },
  });

  return { inserted: true, deduped: false, bounceType, suppressed };
}

/** True when a recipient is on the workspace suppression list (R5.4). */
export async function isRecipientSuppressed(workspaceId: string, email: string): Promise<boolean> {
  const db = store();
  const { data, error } = await db
    .from('suppression_list')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('recipient_email', email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return Boolean(data);
}

/** Return the subset of recipients that are suppressed for the workspace (R5.4). */
export async function findSuppressedRecipients(workspaceId: string, recipients: string[]): Promise<string[]> {
  if (recipients.length === 0) return [];
  const db = store();
  const normalized = recipients.map((value) => value.toLowerCase());
  const { data, error } = await db
    .from('suppression_list')
    .select('recipient_email')
    .eq('workspace_id', workspaceId)
    .in('recipient_email', normalized);
  if (error) throw new Error(supabaseErrorMessage(error));
  return ((data ?? []) as Array<{ recipient_email: string }>).map((row) => row.recipient_email);
}

export async function addSuppression(input: { workspaceId: string; email: string; actor: string; actorId?: string | null }) {
  const db = store();
  const { error } = await db
    .from('suppression_list')
    .upsert({ workspace_id: input.workspaceId, recipient_email: input.email.toLowerCase(), reason: 'manual' }, { onConflict: 'workspace_id,recipient_email' });
  if (error) throw new Error(supabaseErrorMessage(error));
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.suppression_added',
    targetType: 'suppression',
    targetId: input.email.toLowerCase(),
    metadata: { reason: 'manual' },
  });
  return { ok: true as const };
}

/** Remove a recipient from the suppression list so future sends are allowed (R5.5). */
export async function removeSuppression(input: { workspaceId: string; email: string; actor: string; actorId?: string | null }) {
  const db = store();
  const { error } = await db
    .from('suppression_list')
    .delete()
    .eq('workspace_id', input.workspaceId)
    .eq('recipient_email', input.email.toLowerCase());
  if (error) throw new Error(supabaseErrorMessage(error));
  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? input.actor,
    action: 'logimail.suppression_removed',
    targetType: 'suppression',
    targetId: input.email.toLowerCase(),
    metadata: {},
  });
  return { ok: true as const };
}

export async function listSuppression(workspaceId: string, limit = 200) {
  const db = store();
  const { data, error } = await db
    .from('suppression_list')
    .select('id,recipient_email,reason,created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as Array<{ id: string; recipient_email: string; reason: string; created_at: string }>;
}

export function bounceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'bounce_error');
  if (message === 'bounce_not_configured') return { status: 503, text: 'Thiếu service role cho bounce/suppression.' };
  return { status: 502, text: message };
}
