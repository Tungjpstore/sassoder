import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { adminServiceError, checkDomainDns } from '@/lib/admin-service';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeUuid } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const domain = await checkDomainDns({ domainId, actor: actorLabel(admin.user) });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.domain_dns_checked', targetType: 'domain', targetId: domainId });
    return jsonOk({ domain });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = adminServiceError(error);
    return jsonError('admin_dns_failed', mapped.text, mapped.status);
  }
}
