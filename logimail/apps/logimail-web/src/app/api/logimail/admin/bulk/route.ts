import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { adminServiceError, runBulk, type BulkAction } from '@/lib/admin-service';
import { readJsonObject, stringField } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set<BulkAction>(['enable_registration', 'disable_registration', 'remove_domain', 'lock_mailbox', 'unlock_mailbox']);

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const action = (stringField(body, 'action', { required: true }) ?? '') as BulkAction;
    if (!ACTIONS.has(action)) return jsonError('invalid_action', 'Hành động bulk không hợp lệ.', 400);
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
      return jsonError('invalid_ids', 'ids phải là mảng chuỗi.', 400);
    }
    const result = await runBulk({ action, ids: body.ids as string[], actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ result });
  } catch (error) {
    const mapped = adminServiceError(error);
    return jsonError('bulk_failed', mapped.text, mapped.status);
  }
}
