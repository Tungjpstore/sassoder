import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import { createLogimailServiceStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RULE_ACTIONS = new Set(['label', 'archive', 'mark_read', 'move_spam', 'assign_team']);

function actionField(value: string | null) {
  const action = value ?? 'label';
  if (!RULE_ACTIONS.has(action)) throw new Error('invalid_action');
  return action;
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const mailboxId = normalizeUuid(stringField(body, 'mailboxId', { required: true }) ?? '', 'mailboxId');
    const name = stringField(body, 'name', { required: true, max: 80 }) ?? '';
    const fromContains = stringField(body, 'fromContains', { max: 180 });
    const subjectContains = stringField(body, 'subjectContains', { max: 180 });
    const action = actionField(stringField(body, 'action', { max: 32 }));
    const labelIdRaw = stringField(body, 'labelId', { max: 64 });
    const labelId = labelIdRaw ? normalizeUuid(labelIdRaw, 'labelId') : null;
    if (!fromContains && !subjectContains) throw new Error('missing_condition');

    const mailbox = await resolveAuthorizedMailbox(auth.user, mailboxId);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403);

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho rule.', 503);

    if (labelId) {
      const { data: label, error: labelError } = await serviceStore
        .from('mail_labels')
        .select('id,mailbox_id,user_id')
        .eq('id', labelId)
        .maybeSingle();
      if (labelError) return jsonError('supabase_error', supabaseErrorMessage(labelError), 502);
      if (!label || label.mailbox_id !== mailbox.id || label.user_id !== auth.user.id) return jsonError('label_forbidden', 'Label không thuộc mailbox hiện tại.', 403);
    }

    const { data, error } = await serviceStore
      .from('mail_rules')
      .insert({
        workspace_id: mailbox.workspaceId,
        mailbox_id: mailbox.id,
        user_id: auth.user.id,
        name,
        from_contains: fromContains,
        subject_contains: subjectContains,
        action,
        label_id: labelId,
        enabled: true,
        metadata: { source: 'logimail-web-api', apply_mode: 'metadata_ready' },
      })
      .select('id,workspace_id,mailbox_id,user_id,name,from_contains,subject_contains,action,label_id,enabled,metadata,created_at,updated_at')
      .single();

    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);

    await writeAuditLog({
      workspaceId: mailbox.workspaceId,
      actorId: auth.user.id,
      action: 'mail.rule.create',
      targetType: 'mail_rule',
      targetId: data.id,
      metadata: { mailboxId: mailbox.id, action },
    });

    return jsonOk({ rule: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payload không hợp lệ.';
    return jsonError('invalid_request', message === 'missing_condition' ? 'Cần ít nhất một điều kiện lọc.' : message, 400);
  }
}
