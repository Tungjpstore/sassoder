import { jsonError, jsonOk } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { requireMailSession } from '@/lib/mail-api';
import { applyMailAction, type MailActionKind, type MailFolderKey } from '@/lib/mail-client';
import { readJsonObject, stringField } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLDERS = new Set<MailFolderKey>(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
const ACTIONS = new Set<MailActionKind>(['read', 'unread', 'flag', 'unflag', 'trash', 'archive', 'spam']);

function parseUids(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('invalid_uids');
  const uids = value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isInteger(item) && item > 0);
  if (uids.length === 0 || uids.length > 200) throw new Error('invalid_uids');
  return uids;
}

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'write');
  if (!context.ok) return context.response;

  try {
    const body = await readJsonObject(request);
    const folder = (stringField(body, 'folder', { required: true }) ?? '') as MailFolderKey;
    if (!FOLDERS.has(folder)) return jsonError('invalid_folder', 'Thư mục không hợp lệ.', 400);
    const action = (stringField(body, 'action', { required: true }) ?? '') as MailActionKind;
    if (!ACTIONS.has(action)) return jsonError('invalid_action', 'Hành động không hợp lệ.', 400);
    const uids = parseUids(body.uids);

    const result = await applyMailAction(context.session, context.mailbox, folder, uids, action);
    await writeAuditLog({
      workspaceId: context.mailbox.workspaceId,
      actorId: context.auth.user.id,
      action: `mail.action_${action}`,
      targetType: 'mailbox',
      targetId: context.mailbox.id,
      metadata: { folder, count: result.affected },
    });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_uids') return jsonError('invalid_uids', 'Danh sách email không hợp lệ.', 400);
    return jsonError('imap_failed', 'Không thực hiện được thao tác trên máy chủ thư.', 502);
  }
}
