import { jsonError } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { getMailAttachment, parseMessageRouteId } from '@/lib/mail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const session = await requireMailSession(request, 'read');
  if (!session.ok) return session.response;

  const { id, index } = await context.params;
  const parsed = parseMessageRouteId(id);
  if (!parsed) return jsonError('invalid_message_id', 'Mã email không hợp lệ.', 400);

  const attachmentIndex = Number(index);
  if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex > 50) {
    return jsonError('invalid_attachment_index', 'Chỉ số tệp đính kèm không hợp lệ.', 400);
  }

  try {
    const attachment = await getMailAttachment(session.session, session.mailbox, parsed.folder, parsed.uid, attachmentIndex);
    if (!attachment) return jsonError('attachment_not_found', 'Không tìm thấy tệp đính kèm.', 404);

    const body = new Uint8Array(attachment.content);
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': attachment.contentType,
        'content-length': String(body.byteLength),
        'content-disposition': `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return jsonError('imap_failed', 'Không tải được tệp đính kèm từ máy chủ thư.', 502);
  }
}
