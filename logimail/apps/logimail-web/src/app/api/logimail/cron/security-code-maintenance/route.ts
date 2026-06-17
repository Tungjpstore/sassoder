import { jsonError, jsonOk } from '@/lib/api-boundary';
import { verifyCronRequest } from '@/lib/cron-auth';
import { publicSecurityCodeError, runSecurityCodeMaintenance } from '@/lib/security-codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) return jsonError('unauthorized', 'Cron key không hợp lệ.', 401);
  try {
    const url = new URL(request.url);
    const retentionHoursParam = url.searchParams.get('retentionHours');
    const retentionHours = retentionHoursParam === null ? undefined : Number(retentionHoursParam);
    if (retentionHours !== undefined && (!Number.isFinite(retentionHours) || retentionHours < 0 || retentionHours > 720)) {
      return jsonError('invalid_retention_hours', 'Retention phải nằm trong khoảng 0-720 giờ.', 400);
    }
    const result = await runSecurityCodeMaintenance({ actor: 'cron:security-code-maintenance', retentionHours });
    return jsonOk({ result });
  } catch (error) {
    return jsonError('security_code_maintenance_failed', publicSecurityCodeError(error), 502);
  }
}
