import { jsonError, jsonOk } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { canSendFromMailbox } from '@/lib/mail-access';
import { requireMailSession } from '@/lib/mail-api';
import { sendMailThroughMailbox, type SendMailAttachment } from '@/lib/mail-client';
import { createLogimailServiceStore, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'send_failed');
  if (message === 'missing_recipients') return 'Cần ít nhất một người nhận.';
  if (message === 'invalid_recipient') return 'Địa chỉ người nhận không hợp lệ.';
  if (message === 'missing_body') return 'Nội dung email chưa được nhập.';
  if (message === 'body_too_large') return 'Nội dung email quá lớn.';
  if (message === 'too_many_attachments') return 'Chỉ gửi tối đa 10 tệp trong một email.';
  if (message === 'attachments_too_large') return 'Tổng dung lượng tệp vượt quá 10MB.';
  if (message === 'invalid_attachment' || message === 'invalid_attachment_type') return 'Tệp đính kèm không hợp lệ.';
  return 'Không gửi được email qua SMTP.';
}

function attachmentsField(value: unknown): SendMailAttachment[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('invalid_attachment');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_attachment');
    const attachment = item as Record<string, unknown>;
    if (typeof attachment.filename !== 'string' || typeof attachment.contentType !== 'string' || typeof attachment.contentBase64 !== 'string') {
      throw new Error('invalid_attachment');
    }
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      contentBase64: attachment.contentBase64,
    };
  });
}

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'write');
  if (!context.ok) return context.response;
  if (!canSendFromMailbox(context.mailbox)) return jsonError('forbidden', 'Mailbox này chưa cấp quyền gửi email cho tài khoản hiện tại.', 403);

  try {
    const body = await readJsonObject(request);
    const result = await sendMailThroughMailbox(context.session, context.mailbox, {
      to: stringField(body, 'to', { required: true, max: 2000 }) ?? '',
      cc: stringField(body, 'cc', { max: 2000 }) ?? undefined,
      bcc: stringField(body, 'bcc', { max: 2000 }) ?? undefined,
      subject: stringField(body, 'subject', { max: 180 }) ?? '',
      text: stringField(body, 'text', { required: true, max: 200000 }) ?? '',
      inReplyTo: stringField(body, 'inReplyTo', { max: 4000 }) ?? undefined,
      references: stringField(body, 'references', { max: 4000 }) ?? undefined,
      attachments: attachmentsField(body.attachments),
    });

    const serviceStore = createLogimailServiceStore();
    if (serviceStore) {
      const { error } = await serviceStore.from('email_send_logs').insert({
        workspace_id: context.mailbox.workspaceId,
        mailbox_id: context.mailbox.id,
        from_email: context.mailbox.emailAddress,
        to_email: result.accepted.join(', '),
        subject: result.subject,
        status: result.rejected.length ? 'deferred' : 'sent',
        provider_message_id: result.messageId,
        error_message: result.rejected.length ? `Rejected: ${result.rejected.join(', ')}` : null,
      });
      if (error) console.warn('[logimail-mail-send] send log failed', supabaseErrorMessage(error));
    }

    await writeAuditLog({
      workspaceId: context.mailbox.workspaceId,
      actorId: context.auth.user.id,
      action: 'mail.native_send',
      targetType: 'mailbox',
      targetId: context.mailbox.id,
      metadata: { messageId: result.messageId, acceptedCount: result.accepted.length, rejectedCount: result.rejected.length, attachmentCount: result.attachmentCount },
    });

    return jsonOk({ sent: true, result }, { status: 201 });
  } catch (error) {
    return jsonError('smtp_failed', publicSendError(error), 400);
  }
}
