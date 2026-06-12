import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { getMailMessage, parseMessageRouteId } from '@/lib/mail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const sessionContext = await requireMailSession(request, 'read');
  if (!sessionContext.ok) return sessionContext.response;
  const params = await context.params;
  const parsed = parseMessageRouteId(params.id);
  if (!parsed) return jsonError('invalid_message_id', 'Mã email không hợp lệ.', 400);

  try {
    const message = await getMailMessage(sessionContext.session, sessionContext.mailbox, parsed.folder, parsed.uid);
    if (!message) return jsonError('message_not_found', 'Không tìm thấy email trong thư mục này.', 404);
    return jsonOk({ mailbox: sessionContext.mailbox, message });
  } catch {
    return jsonError('imap_failed', 'Không đọc được nội dung email IMAP.', 502);
  }
}
