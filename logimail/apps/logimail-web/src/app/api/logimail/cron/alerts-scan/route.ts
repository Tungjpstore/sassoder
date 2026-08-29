import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { alertingError, scanBounceRate, scanPendingSla } from '@/lib/ops/alerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  let stage: 'bounce_rate' | 'pending_sla' = 'bounce_rate';
  try {
    const bounce = await scanBounceRate();
    stage = 'pending_sla';
    const sla = await scanPendingSla();
    return jsonOk({ bounce, sla });
  } catch (error) {
    const mapped = alertingError(error);
    console.error('[logimail:alerts-scan] failed', {
      stage,
      message: error instanceof Error ? error.message : String(error ?? 'alerting_error'),
    });
    return jsonError('alerts_scan_failed', `${stage}: ${mapped.text}`, mapped.status);
  }
}
