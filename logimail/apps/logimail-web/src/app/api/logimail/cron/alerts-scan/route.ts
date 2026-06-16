import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { alertingError, scanBounceRate, scanPendingSla } from '@/lib/ops/alerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  try {
    const [bounce, sla] = await Promise.all([scanBounceRate(), scanPendingSla()]);
    return jsonOk({ bounce, sla });
  } catch (error) {
    const mapped = alertingError(error);
    return jsonError('alerts_scan_failed', mapped.text, mapped.status);
  }
}
