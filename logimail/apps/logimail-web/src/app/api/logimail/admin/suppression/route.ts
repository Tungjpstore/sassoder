import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeEmail, normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { addSuppression, bounceError, listSuppression, removeSuppression } from '@/lib/deliverability/bounce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(request.url);
    const workspaceId = normalizeUuid(url.searchParams.get('workspaceId') ?? '', 'workspaceId');
    return jsonOk({ suppression: await listSuppression(workspaceId) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Thiếu workspaceId hợp lệ.', 400);
    const mapped = bounceError(error);
    return jsonError('suppression_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const body = await readJsonObject(request);
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const email = normalizeEmail(stringField(body, 'email', { required: true }) ?? '');
    await addSuppression({ workspaceId, email, actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = bounceError(error);
    return jsonError('suppression_failed', mapped.text, mapped.status);
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const url = new URL(request.url);
    const workspaceId = normalizeUuid(url.searchParams.get('workspaceId') ?? '', 'workspaceId');
    const email = normalizeEmail(url.searchParams.get('email') ?? '');
    await removeSuppression({ workspaceId, email, actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = bounceError(error);
    return jsonError('suppression_failed', mapped.text, mapped.status);
  }
}
