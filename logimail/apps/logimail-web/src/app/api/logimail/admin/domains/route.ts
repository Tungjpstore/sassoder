import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { adminServiceError, createDomain } from '@/lib/admin-service';
import { listSendingDomains, multiDomainError } from '@/lib/multi-domain';
import { writeAuditLog } from '@/lib/audit-log';
import { readJsonObject, stringField } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '100');
    const result = await listSendingDomains({ page: Number.isFinite(page) ? page : 1, pageSize: Number.isFinite(pageSize) ? pageSize : 100 });
    return jsonOk(result);
  } catch (error) {
    const mapped = multiDomainError(error);
    return jsonError('domains_list_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const domain = stringField(body, 'domain', { required: true, max: 253 }) ?? '';
    const mailHostname = stringField(body, 'mailHostname', { max: 253 });
    const workspaceId = stringField(body, 'workspaceId', { max: 64 });
    const registrationEnabled = body.registrationEnabled === false ? false : true;

    const result = await createDomain({ domain, mailHostname, workspaceId, registrationEnabled, actor: actorLabel(admin.user) });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.domain_created', targetType: 'domain', targetId: result.id, metadata: { domain: result.domain } });
    return jsonOk({ domain: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Domain hoặc mail host không hợp lệ.', 400);
    const mapped = adminServiceError(error);
    return jsonError('admin_domain_failed', mapped.text, mapped.status);
  }
}
