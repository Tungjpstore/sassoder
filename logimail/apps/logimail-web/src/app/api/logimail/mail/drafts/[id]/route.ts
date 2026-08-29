import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailServiceStore, normalizeUuid, supabaseErrorMessage } from '@/lib/logimail-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  const params = await context.params;
  let draftId: string;
  try {
    draftId = normalizeUuid(params.id, 'draftId');
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Draft id không hợp lệ.', 400);
  }

  const serviceStore = createLogimailServiceStore();
  if (!serviceStore) return jsonError('not_configured', 'Thiếu Supabase service role cho draft.', 503);

  const { data: draft, error: readError } = await serviceStore
    .from('mail_drafts')
    .select('id,workspace_id,user_id,status')
    .eq('id', draftId)
    .maybeSingle();
  if (readError) return jsonError('supabase_error', supabaseErrorMessage(readError), 502);
  if (!draft || draft.user_id !== auth.user.id) return jsonError('not_found', 'Không tìm thấy draft hoặc draft không thuộc tài khoản này.', 404);
  if (draft.status !== 'draft') return jsonError('draft_not_editable', 'Draft này đã được hoàn tất trước đó.', 409);

  // Re-check the status in the write and require a returned row so a concurrent
  // send cannot be reported as a successful discard after finalizing the draft.
  const { data: discardedDraft, error } = await serviceStore
    .from('mail_drafts')
    .update({ status: 'discarded' })
    .eq('id', draftId)
    .eq('user_id', auth.user.id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();
  if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
  if (!discardedDraft) return jsonError('draft_not_editable', 'Draft này đã được hoàn tất trước đó.', 409);

  await writeAuditLog({
    workspaceId: draft.workspace_id,
    actorId: auth.user.id,
    action: 'mail.draft.discard',
    targetType: 'mail_draft',
    targetId: draftId,
  });

  return jsonOk({ discarded: true });
}
