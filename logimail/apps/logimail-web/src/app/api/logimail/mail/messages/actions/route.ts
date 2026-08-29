import { jsonError, jsonOk } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { canModifyMailbox } from '@/lib/mail-access';
import { requireMailSession } from '@/lib/mail-api';
import { applyMailAction, type MailActionKind, type MailFolderKey } from '@/lib/mail-client';
import { readJsonObject, stringField } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLDERS = new Set<MailFolderKey>(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']);
const ACTIONS = new Set<MailActionKind>(['read', 'unread', 'flag', 'unflag', 'trash', 'archive', 'spam', 'restore', 'delete_permanently']);

function parseUids(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('invalid_uids');
  if (value.length === 0 || value.length > 200) throw new Error('invalid_uids');
  const uids = value.map((item) => (typeof item === 'number' ? item : Number(item)));
  if (uids.some((item) => !Number.isInteger(item) || item <= 0)) throw new Error('invalid_uids');
  if (uids.length === 0 || uids.length > 200) throw new Error('invalid_uids');
  return Array.from(new Set(uids));
}

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'write');
  if (!context.ok) return context.response;
  if (!canModifyMailbox(context.mailbox)) return jsonError('forbidden', 'Mailbox này chỉ có quyền đọc.', 403);

  try {
    const body = await readJsonObject(request);
    const folder = (stringField(body, 'folder', { required: true }) ?? '') as MailFolderKey;
    if (!FOLDERS.has(folder)) return jsonError('invalid_folder', 'Thư mục không hợp lệ.', 400);
    const action = (stringField(body, 'action', { required: true }) ?? '') as MailActionKind;
    if (!ACTIONS.has(action)) return jsonError('invalid_action', 'Hành động không hợp lệ.', 400);
    if (action === 'delete_permanently' && request.headers.get('x-logimail-confirm') !== 'I_UNDERSTAND_LOGIMAIL_RISK') {
      return jsonError('confirmation_required', 'Xóa vĩnh viễn cần xác nhận rõ ràng.', 428);
    }
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
    if (error instanceof Error && error.message === 'invalid_restore_source') return jsonError('invalid_restore_source', 'Chỉ có thể khôi phục thư từ Spam, Thùng rác hoặc Lưu trữ.', 400);
    if (error instanceof Error && error.message === 'invalid_permanent_delete_source') return jsonError('invalid_permanent_delete_source', 'Chỉ có thể xóa vĩnh viễn thư đang ở Thùng rác.', 400);
    if (error instanceof Error && error.message === 'invalid_move_target') return jsonError('invalid_move_target', 'Email đã ở trong thư mục đích.', 400);
    if (error instanceof Error && error.message === 'imap_move_unsupported') return jsonError('imap_move_unsupported', 'Máy chủ thư không hỗ trợ di chuyển email an toàn.', 502);
    if (error instanceof Error && error.message === 'imap_permanent_delete_unsupported') return jsonError('imap_permanent_delete_unsupported', 'Máy chủ thư không hỗ trợ xóa vĩnh viễn email an toàn.', 502);
    return jsonError('imap_failed', 'Không thực hiện được thao tác trên máy chủ thư.', 502);
  }
}
