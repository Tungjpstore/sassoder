import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { adminServiceError, getAutoApprovalRules, setAutoApprovalRules } from '@/lib/admin-service';
import { writeAuditLog } from '@/lib/audit-log';
import { readJsonObject } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  return jsonOk({ rules: getAutoApprovalRules() });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const rules = setAutoApprovalRules({
      account: body.account === true,
      domain: body.domain === true,
      mailbox: body.mailbox === true,
    });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.auto_rules_updated', targetType: 'config', targetId: 'auto_approval', metadata: { rules } });
    return jsonOk({ rules });
  } catch (error) {
    const mapped = adminServiceError(error);
    return jsonError('auto_rules_failed', mapped.text, mapped.status);
  }
}
