import { jsonError, jsonOk } from '@/lib/api-boundary';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { verifyIngestKey } from '@/lib/ingest-auth';
import { dmarcError, ingestDmarcReport } from '@/lib/deliverability/dmarc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!verifyIngestKey(request)) return jsonError('unauthorized', 'Thiếu hoặc sai khóa ingest.', 401);
  try {
    const body = await readJsonObject(request);
    const domainId = normalizeUuid(stringField(body, 'domainId', { required: true }) ?? '', 'domainId');
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const xml = stringField(body, 'xml', { required: true, max: 5_000_000 }) ?? '';
    const result = await ingestDmarcReport({ domainId, workspaceId, xml });
    return jsonOk({ inserted: result.inserted }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = dmarcError(error);
    return jsonError('dmarc_ingest_failed', mapped.text, mapped.status);
  }
}
