import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { adminServiceError, approveRequest, rejectRequest, type ApprovalRequestType } from '@/lib/admin-service';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUEST_TYPES = new Set<ApprovalRequestType>(['account', 'domain', 'mailbox']);

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'admin-requests', 30, 60_000);
  if (limited) return limited;

  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;

  try {
    const body = await readJsonObject(request);
    const type = (stringField(body, 'type', { required: true }) ?? '') as ApprovalRequestType;
    if (!REQUEST_TYPES.has(type)) return jsonError('invalid_type', 'Loại yêu cầu không hợp lệ.', 400);
    const requestId = normalizeUuid(stringField(body, 'requestId', { required: true }) ?? '', 'requestId');
    const action = stringField(body, 'action', { required: true });
    const actor = actorLabel(admin.user);

    if (action === 'approve') {
      const result = await approveRequest({ type, requestId, actor });
      await writeAuditLog({ actorId: admin.user.id, action: `logimail.${type}_request_approved`, targetType: `${type}_request`, targetId: requestId, metadata: { reviewedFrom: 'domain.logivn.com' } });
      return jsonOk({ result });
    }
    if (action === 'reject') {
      const reason = stringField(body, 'reason', { max: 300 });
      const result = await rejectRequest({ type, requestId, actor, reason });
      await writeAuditLog({ actorId: admin.user.id, action: `logimail.${type}_request_rejected`, targetType: `${type}_request`, targetId: requestId, metadata: { reason, reviewedFrom: 'domain.logivn.com' } });
      return jsonOk({ result });
    }
    return jsonError('invalid_action', 'Hành động phải là approve hoặc reject.', 400);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = adminServiceError(error);
    return jsonError('admin_request_failed', mapped.text, mapped.status);
  }
}
