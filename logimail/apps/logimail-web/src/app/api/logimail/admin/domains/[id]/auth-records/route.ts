import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { normalizeUuid } from '@/lib/logimail-store';
import { authRecordsError, buildExpectedRecords } from '@/lib/deliverability/auth-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const records = await buildExpectedRecords(domainId);
    return jsonOk({ records });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = authRecordsError(error);
    return jsonError('auth_records_failed', mapped.text, mapped.status);
  }
}
