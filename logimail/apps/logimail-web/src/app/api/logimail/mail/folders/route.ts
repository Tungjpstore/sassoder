import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { listMailFolders } from '@/lib/mail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;
  try {
    const folders = await listMailFolders(context.session, context.mailbox);
    return jsonOk({ mailbox: context.mailbox, folders });
  } catch {
    return jsonError('imap_failed', 'Không đọc được danh sách thư mục IMAP.', 502);
  }
}
