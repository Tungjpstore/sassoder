import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import { createLogimailServiceStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function colorField(value: string | null) {
  const color = value ?? '#0F4D3A';
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('invalid_color');
  return color.toUpperCase();
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const mailboxId = normalizeUuid(stringField(body, 'mailboxId', { required: true }) ?? '', 'mailboxId');
    const name = stringField(body, 'name', { required: true, max: 48 }) ?? '';
    const color = colorField(stringField(body, 'color', { max: 7 }));
    const mailbox = await resolveAuthorizedMailbox(auth.user, mailboxId);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403);

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho label.', 503);

    const { data, error } = await serviceStore
      .from('mail_labels')
      .insert({ workspace_id: mailbox.workspaceId, mailbox_id: mailbox.id, user_id: auth.user.id, name, color })
      .select('id,workspace_id,mailbox_id,user_id,name,color,created_at,updated_at')
      .single();

    if (error) {
      if (error.code === '23505') return jsonError('label_exists', 'Label này đã tồn tại trong mailbox.', 409);
      return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    }

    await writeAuditLog({
      workspaceId: mailbox.workspaceId,
      actorId: auth.user.id,
      action: 'mail.label.create',
      targetType: 'mail_label',
      targetId: data.id,
      metadata: { mailboxId: mailbox.id, name },
    });

    return jsonOk({ label: data }, { status: 201 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
