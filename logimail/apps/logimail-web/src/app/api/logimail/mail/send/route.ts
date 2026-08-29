import { jsonError, jsonOk } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { canSendFromMailbox } from '@/lib/mail-access';
import { requireMailSession } from '@/lib/mail-api';
import { sendMailThroughMailbox, validateSendInput, type SendMailAttachment } from '@/lib/mail-client';
import { antiAbuseError, enforceMailboxSendRate } from '@/lib/anti-abuse';
import { createLogimailServiceStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_ENCODED_BYTES = Math.ceil(10 * 1024 * 1024 * 4 / 3) + 4;

function publicSendError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'send_failed');
  if (message === 'missing_recipients') return 'Cần ít nhất một người nhận.';
  if (message === 'invalid_recipient') return 'Địa chỉ người nhận không hợp lệ.';
  if (message === 'missing_body') return 'Nội dung email chưa được nhập.';
  if (message === 'body_too_large') return 'Nội dung email quá lớn.';
  if (message === 'too_many_attachments') return 'Chỉ gửi tối đa 10 tệp trong một email.';
  if (message === 'attachments_too_large') return 'Tổng dung lượng tệp vượt quá 10MB.';
  if (message === 'invalid_attachment' || message === 'invalid_attachment_type') return 'Tệp đính kèm không hợp lệ.';
  if (message === 'quota_exceeded') return 'Domain đã dùng hết hạn mức gửi thư hôm nay.';
  if (message === 'quota_not_configured' || message === 'sending_domain_not_found') return 'Domain gửi thư chưa được cấu hình quota an toàn.';
  if (message === 'send_rate_exceeded') return 'Mailbox đã đạt giới hạn gửi thư trong một giờ và đã được tạm dừng.';
  return 'Không gửi được email qua SMTP.';
}

function attachmentsField(value: unknown): SendMailAttachment[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('invalid_attachment');
  if (value.length > MAX_ATTACHMENT_COUNT) throw new Error('too_many_attachments');
  let encodedBytes = 0;
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_attachment');
    const attachment = item as Record<string, unknown>;
    if (typeof attachment.filename !== 'string' || typeof attachment.contentType !== 'string' || typeof attachment.contentBase64 !== 'string') {
      throw new Error('invalid_attachment');
    }
    if (attachment.filename.length > 180 || attachment.contentType.length > 120) throw new Error('invalid_attachment');
    encodedBytes += attachment.contentBase64.length;
    if (encodedBytes > MAX_ATTACHMENT_ENCODED_BYTES) throw new Error('attachments_too_large');
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
    const draftIdRaw = stringField(body, 'draftId', { max: 64 });
    const draftId = draftIdRaw ? normalizeUuid(draftIdRaw, 'draftId') : null;
    const input = {
      to: stringField(body, 'to', { required: true, max: 2000 }) ?? '',
      cc: stringField(body, 'cc', { max: 2000 }) ?? undefined,
      bcc: stringField(body, 'bcc', { max: 2000 }) ?? undefined,
      subject: stringField(body, 'subject', { max: 180 }) ?? '',
      text: stringField(body, 'text', { required: true, max: 200000 }) ?? '',
      inReplyTo: stringField(body, 'inReplyTo', { max: 4000 }) ?? undefined,
      references: stringField(body, 'references', { max: 4000 }) ?? undefined,
      attachments: attachmentsField(body.attachments),
    } satisfies Parameters<typeof sendMailThroughMailbox>[2];
    // Invalid compose payloads must not consume a mailbox's anti-abuse budget.
    validateSendInput(input);

    let sendRate: Awaited<ReturnType<typeof enforceMailboxSendRate>>;
    try {
      sendRate = await enforceMailboxSendRate({
        mailboxId: context.mailbox.id,
        workspaceId: context.mailbox.workspaceId,
        actor: context.auth.user.email ?? context.auth.user.id,
        actorId: context.auth.user.id,
      });
    } catch (error) {
      const mapped = antiAbuseError(error);
      return jsonError('send_rate_unavailable', mapped.text, mapped.status);
    }
    if (!sendRate.allowed) return jsonError('send_rate_exceeded', publicSendError(new Error('send_rate_exceeded')), 429);

    const result = await sendMailThroughMailbox(context.session, context.mailbox, input);

    const serviceStore = createLogimailServiceStore();
    let draftCleanup: { status: 'sent' | 'retained' | 'not_requested' | 'failed' } = { status: draftId ? 'failed' : 'not_requested' };
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

      if (draftId && (result.rejected.length > 0 || result.accepted.length === 0)) {
        draftCleanup = { status: 'retained' };
      } else if (draftId) {
        const { data: finalizedDraft, error: draftError } = await serviceStore
          .from('mail_drafts')
          .update({ status: 'sent' })
          .eq('id', draftId)
          .eq('user_id', context.auth.user.id)
          .eq('mailbox_id', context.mailbox.id)
          .eq('status', 'draft')
          .select('id')
          .maybeSingle();
        if (draftError || !finalizedDraft) {
          console.warn('[logimail-mail-send] draft cleanup failed', draftError ? supabaseErrorMessage(draftError) : 'draft_not_found');
        } else {
          draftCleanup = { status: 'sent' };
        }
      }
    } else if (draftId && (result.rejected.length > 0 || result.accepted.length === 0)) {
      draftCleanup = { status: 'retained' };
    }

    await writeAuditLog({
      workspaceId: context.mailbox.workspaceId,
      actorId: context.auth.user.id,
      action: 'mail.native_send',
      targetType: 'mailbox',
      targetId: context.mailbox.id,
      metadata: {
        messageId: result.messageId,
        acceptedCount: result.accepted.length,
        rejectedCount: result.rejected.length,
        attachmentCount: result.attachmentCount,
        quotaCommitStatus: result.quotaCommit.status,
        draftCleanupStatus: draftCleanup.status,
      },
    });

    return jsonOk({ sent: true, result, draftCleanup }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'smtp_failed');
    const status = message === 'quota_exceeded' ? 429 : message === 'quota_not_configured' || message === 'sending_domain_not_found' ? 503 : 400;
    return jsonError(message === 'quota_exceeded' ? 'quota_exceeded' : 'smtp_failed', publicSendError(error), status);
  }
}
