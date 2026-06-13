import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { adminServiceError, removeDomain, setDomainRegistration, updateDomain } from '@/lib/admin-service';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function boolField(value: unknown) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const body = await readJsonObject(request);
    const actor = actorLabel(admin.user);

    // Pure registration toggle shortcut.
    const registrationOnly = body.registrationEnabled !== undefined && body.mailHostname === undefined && body.status === undefined;
    if (registrationOnly) {
      const enabled = boolField(body.registrationEnabled);
      if (enabled === null) return jsonError('invalid_input', 'registrationEnabled không hợp lệ.', 400);
      const domain = await setDomainRegistration({ domainId, enabled, actor });
      await writeAuditLog({ actorId: admin.user.id, action: enabled ? 'logimail.domain_registration_enabled' : 'logimail.domain_registration_disabled', targetType: 'domain', targetId: domainId });
      return jsonOk({ domain });
    }

    const domain = await updateDomain({
      domainId,
      mailHostname: stringField(body, 'mailHostname', { max: 253 }),
      status: stringField(body, 'status'),
      registrationEnabled: boolField(body.registrationEnabled) ?? undefined,
      actor,
    });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.domain_updated', targetType: 'domain', targetId: domainId });
    return jsonOk({ domain });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = adminServiceError(error);
    return jsonError('admin_domain_failed', mapped.text, mapped.status);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const result = await removeDomain({ domainId, actor: actorLabel(admin.user) });
    await writeAuditLog({ actorId: admin.user.id, action: result.mode === 'deleted' ? 'logimail.domain_deleted' : 'logimail.domain_disabled', targetType: 'domain', targetId: domainId });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = adminServiceError(error);
    return jsonError('admin_domain_failed', mapped.text, mapped.status);
  }
}
