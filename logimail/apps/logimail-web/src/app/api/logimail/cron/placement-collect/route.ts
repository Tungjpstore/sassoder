import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { collectStalePlacementTests, placementError } from '@/lib/deliverability/placement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  try {
    const result = await collectStalePlacementTests();
    return jsonOk({ result });
  } catch (error) {
    const mapped = placementError(error);
    return jsonError('placement_collect_failed', mapped.text, mapped.status);
  }
}
