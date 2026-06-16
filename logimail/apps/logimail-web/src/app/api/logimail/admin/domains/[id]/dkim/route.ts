import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, readJsonObject, stringField } from '@/lib/logimail-store';
import { createDkimSelector, deleteDkimSelector, dkimError, getDkimTxtRecord, listDkimSelectors, rotateDkimSelector, type KeySource } from '@/lib/deliverability/dkim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY_SOURCES = new Set<KeySource>(['billionmail', 'logimail']);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const [selectors, txt] = await Promise.all([listDkimSelectors(domainId), getDkimTxtRecord(domainId)]);
    return jsonOk({ selectors, txt });
  } catch (error) {
    const mapped = dkimError(error);
    return jsonError('dkim_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const body = await readJsonObject(request);
    const action = stringField(body, 'action') ?? 'create';
    const keySourceRaw = stringField(body, 'keySource');
    const keySource = keySourceRaw && KEY_SOURCES.has(keySourceRaw as KeySource) ? (keySourceRaw as KeySource) : undefined;
    const selector = stringField(body, 'selector', { max: 63 }) ?? undefined;
    const billionmailPublicKey = stringField(body, 'billionmailPublicKey', { max: 8192 }) ?? undefined;
    const actor = actorLabel(admin.user);

    if (action === 'rotate') {
      const result = await rotateDkimSelector({ domainId, newSelector: selector, keySource, billionmailPublicKey, actor, actorId: admin.user.id });
      return jsonOk({ rotated: result }, { status: 201 });
    }
    const result = await createDkimSelector({ domainId, selector, keySource, billionmailPublicKey, actor, actorId: admin.user.id });
    return jsonOk({ created: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = dkimError(error);
    return jsonError('dkim_failed', mapped.text, mapped.status);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const url = new URL(request.url);
    const selectorId = normalizeUuid(url.searchParams.get('selectorId') ?? '', 'selectorId');
    const result = await deleteDkimSelector({ domainId, selectorId, actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ result });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = dkimError(error);
    return jsonError('dkim_failed', mapped.text, mapped.status);
  }
}
