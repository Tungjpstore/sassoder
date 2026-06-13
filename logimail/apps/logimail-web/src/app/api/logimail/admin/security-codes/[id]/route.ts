import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { writeAuditLog } from '@/lib/audit-log';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { publicSecurityCodeError, revokeSecurityCode, rotateSecurityCode } from '@/lib/security-codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const codeId = normalizeUuid(id, 'codeId');
    const body = await readJsonObject(request).catch(() => ({}));
    const action = stringField(body as Record<string, unknown>, 'action') ?? 'rotate';
    const actor = actorLabel(admin.user);

    if (action === 'revoke') {
      const result = await revokeSecurityCode({ codeId, actor });
      await writeAuditLog({ actorId: admin.user.id, action: 'logimail.security_code_revoked', targetType: 'security_code', targetId: codeId });
      return jsonOk({ result });
    }
    const result = await rotateSecurityCode({ codeId, actor });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.security_code_rotated', targetType: 'security_code', targetId: codeId });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    if (error instanceof Error && (error.message === 'security_code_not_found' || error.message === 'security_code_inactive')) {
      return jsonError('security_code_unavailable', 'Mã bảo mật không còn hiệu lực để thao tác.', 409);
    }
    return jsonError('security_code_failed', publicSecurityCodeError(error), 400);
  }
}
