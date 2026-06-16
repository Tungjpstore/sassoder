import { jsonError, jsonOk } from '@/lib/api-boundary';
import { actorLabel, requireAdmin } from '@/lib/admin-access';
import { runRunbook, runbookError } from '@/lib/ops/runbook';
import { buildRunbookSteps, isRunbookKey } from '@/lib/ops/runbook-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  // Dangerous: runbooks perform operational actions and require the confirm header.
  const admin = await requireAdmin(request, 'dangerous');
  if (!admin.ok) return admin.response;
  try {
    const { key } = await context.params;
    if (!isRunbookKey(key)) return jsonError('unknown_runbook', 'Runbook không tồn tại.', 404);
    const steps = buildRunbookSteps(key);
    const result = await runRunbook({ runbookKey: key, steps, actor: actorLabel(admin.user), actorId: admin.user.id });
    return jsonOk({ result });
  } catch (error) {
    const mapped = runbookError(error);
    return jsonError('runbook_failed', mapped.text, mapped.status);
  }
}
