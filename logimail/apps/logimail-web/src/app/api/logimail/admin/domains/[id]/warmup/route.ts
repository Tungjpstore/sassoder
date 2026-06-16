import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { normalizeUuid, optionalNumberField, readJsonObject, stringField } from '@/lib/logimail-store';
import { advanceWarmupPlan, listWarmupPlans, startWarmupPlan, warmupError } from '@/lib/deliverability/warmup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'read');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    return jsonOk({ plans: await listWarmupPlans(domainId) });
  } catch (error) {
    const mapped = warmupError(error);
    return jsonError('warmup_failed', mapped.text, mapped.status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request, 'write');
  if (!admin.ok) return admin.response;
  try {
    const { id } = await context.params;
    const domainId = normalizeUuid(id, 'domainId');
    const body = await readJsonObject(request);
    const action = stringField(body, 'action') ?? 'start';
    const actor = actorLabel(admin.user);

    if (action === 'advance') {
      const planId = normalizeUuid(stringField(body, 'planId', { required: true }) ?? '', 'planId');
      const plan = await advanceWarmupPlan({ planId, actor, actorId: admin.user.id });
      return jsonOk({ plan });
    }

    const target = optionalNumberField(body, 'target', { min: 1, max: 1_000_000 }) ?? 0;
    const startLimit = optionalNumberField(body, 'startLimit', { min: 1, max: 1_000_000 }) ?? undefined;
    const multiplier = optionalNumberField(body, 'multiplier', { min: 1, max: 100 }) ?? undefined;
    const plan = await startWarmupPlan({ domainId, target, startLimit, multiplier, actor, actorId: admin.user.id });
    return jsonOk({ plan }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return jsonError('invalid_input', 'Dữ liệu không hợp lệ.', 400);
    const mapped = warmupError(error);
    return jsonError('warmup_failed', mapped.text, mapped.status);
  }
}
