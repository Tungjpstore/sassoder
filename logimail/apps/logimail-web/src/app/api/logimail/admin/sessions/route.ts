import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { isMfaEnabled, revokeUserSessions, sessionManagerError, SESSION_IDLE_TIMEOUT_MS } from '@/lib/security/session';
import { readAalClaim } from '@/lib/security/session-policy';
import { writeAuditLog } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const mfaEnabled = await isMfaEnabled(admin.user.id);
    return jsonOk({
      session: { userId: admin.user.id, email: admin.user.email, aal: readAalClaim(admin.token), mfaEnabled, idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS },
    });
  } catch (error) {
    const mapped = sessionManagerError(error);
    return jsonError('sessions_failed', mapped.text, mapped.status);
  }
}

export async function DELETE(request: Request) {
  // Dangerous: revoking sessions forces re-authentication.
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const userId = normalizeUuid(stringField(body, 'userId', { required: true }) ?? '', 'userId');
    const token = stringField(body, 'token', { required: true, max: 8192 }) ?? '';
    const result = await revokeUserSessions({ userId, token, actor: actorLabel(admin.user), actorId: admin.user.id });
    await writeAuditLog({ actorId: admin.user.id, action: 'logimail.session_revoke_requested', targetType: 'user', targetId: userId });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = sessionManagerError(error);
    return jsonError('sessions_failed', mapped.text, mapped.status);
  }
}
