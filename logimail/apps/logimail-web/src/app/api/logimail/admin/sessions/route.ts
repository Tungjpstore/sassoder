import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { isMfaEnabled, revokeUserSessions, sessionManagerError, SESSION_IDLE_TIMEOUT_MS } from '@/lib/security/session';
import { readAalClaim } from '@/lib/security/session-policy';

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
    const result = await revokeUserSessions({ userId, actorId: admin.user.id });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = sessionManagerError(error);
    return jsonError('sessions_failed', mapped.text, mapped.status);
  }
}
