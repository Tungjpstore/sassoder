import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { listMailMessages, type MailFolderKey } from '@/lib/mail-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedFolders = new Set(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);

function folderFromUrl(request: Request): MailFolderKey {
  const folder = new URL(request.url).searchParams.get('folder') ?? 'inbox';
  if (!allowedFolders.has(folder)) throw new Error('invalid_folder');
  return folder as MailFolderKey;
}

export async function GET(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;
  try {
    const url = new URL(request.url);
    const folder = folderFromUrl(request);
    const limitRaw = Number(url.searchParams.get('limit') ?? 40);
    const pageRaw = Number(url.searchParams.get('page') ?? 0);
    const query = url.searchParams.get('q')?.trim() || undefined;
    const result = await listMailMessages(context.session, context.mailbox, folder, Number.isFinite(limitRaw) ? limitRaw : 40, {
      page: Number.isFinite(pageRaw) ? pageRaw : 0,
      query,
    });
    return jsonOk({ mailbox: context.mailbox, ...result });
  } catch (error) {
    const message = error instanceof Error && error.message === 'invalid_folder' ? 'Thư mục không hợp lệ.' : 'Không đọc được danh sách email IMAP.';
    return jsonError('imap_failed', message, error instanceof Error && error.message === 'invalid_folder' ? 400 : 502);
  }
}
