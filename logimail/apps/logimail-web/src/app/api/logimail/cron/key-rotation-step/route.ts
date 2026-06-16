import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { keyRotationError, rotateCredentialKeys } from '@/lib/security/key-rotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  try {
    // One batch per tick; the cron schedule drains remaining records over time.
    const result = await rotateCredentialKeys({ actor: 'cron:key-rotation-step', batchSize: 100 });
    return jsonOk({ result });
  } catch (error) {
    const mapped = keyRotationError(error);
    return jsonError('key_rotation_step_failed', mapped.text, mapped.status);
  }
}
