import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { alertingError, listAlerts, resolveAlert, scanBounceRate, scanPendingSla } from '@/lib/ops/alerting';
import { writeAuditLog } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    return jsonOk({ alerts: await listAlerts(100) });
  } catch (error) {
    const mapped = alertingError(error);
    return jsonError('alerts_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const action = stringField(body, 'action') ?? 'scan';

    if (action === 'resolve') {
      const alertId = normalizeUuid(stringField(body, 'alertId', { required: true }) ?? '', 'alertId');
      await resolveAlert({ alertId, actorId: admin.user.id });
      await writeAuditLog({ actorId: admin.user.id, action: 'logimail.alert_resolved', targetType: 'alert', targetId: alertId });
      return jsonOk({ ok: true });
    }

    // Default: run a scan pass (bounce-rate + SLA).
    const [bounce, sla] = await Promise.all([scanBounceRate(), scanPendingSla()]);
    return jsonOk({ bounce, sla });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = alertingError(error);
    return jsonError('alerts_failed', mapped.text, mapped.status);
  }
}
