import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { optionalNumberField, readJsonObject } from '@/lib/logimail-store';
import { keyRotationError, rotateCredentialKeys } from '@/lib/security/key-rotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Dangerous: re-encrypts stored credentials; requires the confirm header.
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request).catch(() => ({}));
    const batchSize = optionalNumberField(body as Record<string, unknown>, 'batchSize', { min: 1, max: 500 }) ?? undefined;
    const result = await rotateCredentialKeys({ actor: actorLabel(admin.user), actorId: admin.user.id, batchSize });
    return jsonOk({ result });
  } catch (error) {
    const mapped = keyRotationError(error);
    return jsonError('key_rotation_failed', mapped.text, mapped.status);
  }
}
