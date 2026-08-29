import { createHash } from 'node:crypto';
import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { canSendFromMailbox, resolveAuthorizedMailbox } from '@/lib/mail-access';
import { createLogimailServiceStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bodyFingerprint(value: string | null) {
  if (!value) return { preview: null, sha256: null };
  const normalized = value.replace(/\s+/g, ' ').trim();
  return {
    preview: normalized ? normalized.slice(0, 240) : null,
    sha256: createHash('sha256').update(value).digest('hex'),
  };
}

function attachmentCount(value: unknown) {
  if (value === undefined || value === null) return 0;
  if (Array.isArray(value)) return Math.min(value.length, 10);
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10) return value;
  throw new Error('invalid_attachment_count');
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const draftIdRaw = stringField(body, 'draftId', { max: 64 });
    const draftId = draftIdRaw ? normalizeUuid(draftIdRaw, 'draftId') : null;
    const mailboxKey = stringField(body, 'mailboxId', { max: 254 }) ?? stringField(body, 'from', { max: 254 });
    const mailbox = await resolveAuthorizedMailbox(auth.user, mailboxKey);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403);
    if (!canSendFromMailbox(mailbox)) return jsonError('forbidden', 'Mailbox này chưa cấp quyền soạn/gửi email cho tài khoản hiện tại.', 403);

    const text = stringField(body, 'text', { max: 200000 });
    const fingerprint = bodyFingerprint(text);
    const payload = {
      workspace_id: mailbox.workspaceId,
      mailbox_id: mailbox.id,
      user_id: auth.user.id,
      to_email: stringField(body, 'to', { max: 2000 }),
      cc: stringField(body, 'cc', { max: 2000 }),
      bcc: stringField(body, 'bcc', { max: 2000 }),
      subject: stringField(body, 'subject', { max: 180 }),
      body_preview: fingerprint.preview,
      body_sha256: fingerprint.sha256,
      attachment_count: attachmentCount(body.attachments ?? body.attachmentCount),
      in_reply_to: stringField(body, 'inReplyTo', { max: 4000 }),
      references_header: stringField(body, 'references', { max: 4000 }),
      status: 'draft',
    };

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho draft.', 503);

    const query = draftId
      ? serviceStore
        .from('mail_drafts')
        .update(payload)
        .eq('id', draftId)
        .eq('user_id', auth.user.id)
        .eq('mailbox_id', mailbox.id)
        .eq('status', 'draft')
        .select('id,workspace_id,mailbox_id,user_id,to_email,cc,bcc,subject,body_preview,body_sha256,attachment_count,in_reply_to,references_header,status,updated_at,created_at')
        .maybeSingle()
      : serviceStore
        .from('mail_drafts')
        .insert(payload)
        .select('id,workspace_id,mailbox_id,user_id,to_email,cc,bcc,subject,body_preview,body_sha256,attachment_count,in_reply_to,references_header,status,updated_at,created_at')
        .single();

    const { data, error } = await query;
    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    if (!data) return jsonError('not_found', 'Không tìm thấy draft hoặc draft không thuộc tài khoản này.', 404);

    await writeAuditLog({
      workspaceId: mailbox.workspaceId,
      actorId: auth.user.id,
      action: draftId ? 'mail.draft.update' : 'mail.draft.create',
      targetType: 'mail_draft',
      targetId: data.id,
      metadata: { mailboxId: mailbox.id, hasBodyHash: Boolean(fingerprint.sha256), attachmentCount: payload.attachment_count },
    });

    return jsonOk({ draft: data }, { status: draftId ? 200 : 201 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
