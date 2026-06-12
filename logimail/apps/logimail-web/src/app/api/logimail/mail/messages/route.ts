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
    const folder = folderFromUrl(request);
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 40);
    const result = await listMailMessages(context.session, context.mailbox, folder, Number.isFinite(limit) ? limit : 40);
    return jsonOk({ mailbox: context.mailbox, ...result });
  } catch (error) {
    const message = error instanceof Error && error.message === 'invalid_folder' ? 'Thư mục không hợp lệ.' : 'Không đọc được danh sách email IMAP.';
    return jsonError('imap_failed', message, error instanceof Error && error.message === 'invalid_folder' ? 400 : 502);
  }
}
