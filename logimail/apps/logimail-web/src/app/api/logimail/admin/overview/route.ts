import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { adminServiceError, getApprovalQueue, getDomainControl, getOpsSnapshot, listMailboxes } from '@/lib/admin-service';
import { listActiveSecurityCodes } from '@/lib/security-codes';
import { listAlerts } from '@/lib/ops/alerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;

  try {
    const [queue, domainControl, mailboxes, securityCodes, ops, alerts] = await Promise.all([
      getApprovalQueue(),
      getDomainControl(),
      listMailboxes().catch(() => []),
      listActiveSecurityCodes().catch(() => []),
      getOpsSnapshot().catch(() => null),
      listAlerts(50).catch(() => []),
    ]);
    return jsonOk({
      admin: { email: admin.user.email, role: admin.user.adminRole, fullName: admin.user.fullName },
      queue,
      domainControl,
      mailboxes,
      securityCodes,
      ops,
      alerts,
    });
  } catch (error) {
    const mapped = adminServiceError(error);
    return jsonError('admin_overview_failed', mapped.text, mapped.status);
  }
}
