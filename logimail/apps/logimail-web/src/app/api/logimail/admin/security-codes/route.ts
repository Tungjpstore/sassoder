import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { writeAuditLog } from '@/lib/audit-log';
import { readJsonObject, stringField, optionalNumberField } from '@/lib/logimail-store';
import { createSecurityCode, listActiveSecurityCodes, publicSecurityCodeError, type SecurityCodePurpose } from '@/lib/security-codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PURPOSES = new Set<SecurityCodePurpose>(['account_signup', 'password_reset']);

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    return jsonOk({ codes: await listActiveSecurityCodes() });
  } catch (error) {
    return jsonError('security_codes_failed', publicSecurityCodeError(error), 502);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const purpose = (stringField(body, 'purpose') ?? 'account_signup') as SecurityCodePurpose;
    if (!PURPOSES.has(purpose)) return jsonError('invalid_purpose', 'Loại mã không hợp lệ.', 400);
    const ttlHours = optionalNumberField(body, 'ttlHours', { min: 1, max: 168 }) ?? 24;
    const domain = stringField(body, 'domain', { max: 253 });

    const result = await createSecurityCode({ domain, purpose, ttlHours, createdBy: actorLabel(admin.user), metadata: { source: 'domain.logivn.com' } });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.security_code_created', targetType: 'security_code', targetId: result.row.id, metadata: { purpose, domain } });
    return jsonOk({ code: result.code, id: result.row.id, domain: result.row.domain, expiresAt: result.row.expires_at }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    return jsonError('security_code_failed', publicSecurityCodeError(error), 400);
  }
}
