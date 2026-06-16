import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { advanceAllActiveWarmups, warmupError } from '@/lib/deliverability/warmup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  try {
    const result = await advanceAllActiveWarmups({ actor: 'cron:warmup-tick' });
    return jsonOk({ result });
  } catch (error) {
    const mapped = warmupError(error);
    return jsonError('warmup_tick_failed', mapped.text, mapped.status);
  }
}
