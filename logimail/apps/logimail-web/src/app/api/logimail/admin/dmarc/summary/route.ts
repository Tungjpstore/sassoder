import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireAdmin } from '@/lib/admin-access';
import { normalizeUuid } from '@/lib/logimail-store';
import { dmarcError, getDmarcSummary } from '@/lib/deliverability/dmarc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(request.url);
    const domainId = normalizeUuid(url.searchParams.get('domainId') ?? '', 'domainId');
    const windowDays = Number(url.searchParams.get('windowDays') ?? '30');
    const limit = Number(url.searchParams.get('limit') ?? '200');
    const summary = await getDmarcSummary({ domainId, windowDays: Number.isFinite(windowDays) ? windowDays : 30, limit: Number.isFinite(limit) ? limit : 200 });
    return jsonOk({ summary });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Thiếu domainId hợp lệ.', 400);
    const mapped = dmarcError(error);
    return jsonError('dmarc_summary_failed', mapped.text, mapped.status);
  }
}
