import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid } from '@/lib/logimail-store';
import { authRecordsError, checkAuthRecords } from '@/lib/deliverability/auth-records';
import { checkDomainPtr } from '@/lib/deliverability/ptr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const actor = actorLabel(admin.user);
    const result = await checkAuthRecords({ domainId, actor, actorId: admin.user.id });
    const ptr = await checkDomainPtr({ domainId, actor, actorId: admin.user.id }).catch(() => null);
    return jsonOk({ result, ptr });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = authRecordsError(error);
    return jsonError('auth_check_failed', mapped.text, mapped.status);
  }
}
