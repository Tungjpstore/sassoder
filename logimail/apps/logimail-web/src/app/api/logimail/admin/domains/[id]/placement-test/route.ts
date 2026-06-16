import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { getDomain } from '@/lib/admin-service';
import { placementError, recordPlacementResults, startPlacementTest, type PlacementFolder } from '@/lib/deliverability/placement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOLDERS = new Set<PlacementFolder>(['inbox', 'spam', 'missing']);

function parseResults(value: unknown) {
  if (!Array.isArray(value)) throw new Error('invalid_results');
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    const provider = String(record.provider ?? '');
    const folder = String(record.folder ?? '');
    if (!provider || !FOLDERS.has(folder as PlacementFolder)) throw new Error('invalid_results');
    return { provider, folder: folder as PlacementFolder };
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const domain = await getDomain(domainId);
    if (!domain) return jsonError('domain_not_found', 'Không tìm thấy domain.', 404);

    const body = await readJsonObject(request);
    const action = stringField(body, 'action') ?? 'start';
    const actor = actorLabel(admin.user);

    if (action === 'collect') {
      const testId = normalizeUuid(stringField(body, 'testId', { required: true }) ?? '', 'testId');
      const results = parseResults(body.results);
      const result = await recordPlacementResults({ testId, domainId, workspaceId: domain.workspace_id, results, actor, actorId: admin.user.id });
      return jsonOk({ result });
    }

    const started = await startPlacementTest({ domainId, workspaceId: domain.workspace_id, actor, actorId: admin.user.id });
    return jsonOk({ started }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = placementError(error);
    return jsonError('placement_failed', mapped.text, mapped.status);
  }
}
