import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import { createLogimailServiceStore, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['new', 'in_progress', 'waiting', 'done', 'archived']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function checkedValue(value: string | null, allowed: Set<string>, field: string) {
  if (!value) return null;
  if (!allowed.has(value)) throw new Error(`invalid_${field}`);
  return value;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  const params = await context.params;
  let taskId: string;
  try {
    taskId = normalizeUuid(params.id, 'taskId');
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Task id không hợp lệ.', 400);
  }

  try {
    const body = await readJsonObject(request);
    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho task.', 503);

    const { data: task, error: readError } = await serviceStore
      .from('team_mailbox_tasks')
      .select('id,workspace_id,mailbox_id')
      .eq('id', taskId)
      .maybeSingle();
    if (readError) return jsonError('supabase_error', supabaseErrorMessage(readError), 502);
    if (!task) return jsonError('not_found', 'Không tìm thấy task.', 404);

    const mailbox = await resolveAuthorizedMailbox(auth.user, task.mailbox_id);
    if (!mailbox) return jsonError('mailbox_forbidden', 'Bạn không có quyền cập nhật task của mailbox này.', 403);

    const assignedToRaw = stringField(body, 'assignedTo', { max: 64 });
    const updates = {
      status: checkedValue(stringField(body, 'status', { max: 24 }), STATUSES, 'status') ?? undefined,
      priority: checkedValue(stringField(body, 'priority', { max: 24 }), PRIORITIES, 'priority') ?? undefined,
      assigned_to: assignedToRaw ? normalizeUuid(assignedToRaw, 'assignedTo') : undefined,
      internal_note: stringField(body, 'internalNote', { max: 2000 }) ?? undefined,
    };
    const cleaned = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
    if (!Object.keys(cleaned).length) return jsonError('invalid_request', 'Không có trường hợp lệ để cập nhật.', 400);

    const { data, error } = await serviceStore
      .from('team_mailbox_tasks')
      .update(cleaned)
      .eq('id', taskId)
      .select('id,workspace_id,mailbox_id,message_uid,subject,customer_email,status,priority,assigned_to,created_by,due_at,internal_note,metadata,created_at,updated_at')
      .single();
    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);

    await writeAuditLog({
      workspaceId: task.workspace_id,
      actorId: auth.user.id,
      action: 'team.mailbox_task.update',
      targetType: 'team_mailbox_task',
      targetId: taskId,
      metadata: cleaned,
    });

    return jsonOk({ task: data });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
