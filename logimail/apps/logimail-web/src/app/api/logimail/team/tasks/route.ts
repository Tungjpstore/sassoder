import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import { createLogimailServiceStore, normalizeUuid, optionalNumberField, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function priorityField(value: string | null) {
  const priority = value ?? 'normal';
  if (!PRIORITIES.has(priority)) throw new Error('invalid_priority');
  return priority;
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const mailboxId = normalizeUuid(stringField(body, 'mailboxId', { required: true }) ?? '', 'mailboxId');
    const mailbox = await resolveAuthorizedMailbox(auth.user, mailboxId);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403);

    const messageUid = optionalNumberField(body, 'messageUid', { min: 0, max: Number.MAX_SAFE_INTEGER });
    const subject = stringField(body, 'subject', { max: 180 });
    const customerEmail = stringField(body, 'customerEmail', { max: 254 })?.toLowerCase() ?? null;
    const internalNote = stringField(body, 'internalNote', { max: 2000 });
    const priority = priorityField(stringField(body, 'priority', { max: 24 }));

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho task.', 503);

    const { data, error } = await serviceStore
      .from('team_mailbox_tasks')
      .insert({
        workspace_id: mailbox.workspaceId,
        mailbox_id: mailbox.id,
        message_uid: messageUid,
        subject,
        customer_email: customerEmail,
        status: 'new',
        priority,
        created_by: auth.user.id,
        internal_note: internalNote,
        metadata: { source: 'logimail-web-api' },
      })
      .select('id,workspace_id,mailbox_id,message_uid,subject,customer_email,status,priority,assigned_to,created_by,due_at,internal_note,metadata,created_at,updated_at')
      .single();

    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);

    await writeAuditLog({
      workspaceId: mailbox.workspaceId,
      actorId: auth.user.id,
      action: 'team.mailbox_task.create',
      targetType: 'team_mailbox_task',
      targetId: data.id,
      metadata: { mailboxId: mailbox.id, messageUid, priority },
    });

    return jsonOk({ task: data }, { status: 201 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
