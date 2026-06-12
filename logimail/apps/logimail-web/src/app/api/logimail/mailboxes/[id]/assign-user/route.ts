import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import {
  createLogimailServiceStore,
  createLogimailStore,
  normalizeMailboxPermission,
  normalizeUuid,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;
  const params = await context.params;

  try {
    const mailboxId = normalizeUuid(params.id, 'mailboxId');
    const body = await readJsonObject(request);
    const userId = normalizeUuid(stringField(body, 'userId', { required: true }) ?? '', 'userId');
    const permission = normalizeMailboxPermission(stringField(body, 'permission', { max: 20 }));
    const store = createLogimailStore(auth.token);
    const { data: mailbox, error: mailboxError } = await store
      .from('mailboxes')
      .select('id,workspace_id,email_address')
      .eq('id', mailboxId)
      .maybeSingle();

    if (mailboxError) return jsonError('supabase_error', supabaseErrorMessage(mailboxError), 502);
    if (!mailbox) return jsonError('not_found', 'Không tìm thấy mailbox hoặc bạn không có quyền truy cập.', 404);

    const serviceStore = createLogimailServiceStore();
    if (!serviceStore) return jsonError('not_configured', 'Thiếu env server-side: SUPABASE_SERVICE_ROLE_KEY', 503);

    const { data: workspace, error: workspaceError } = await store
      .from('workspaces')
      .select('id,owner_id')
      .eq('id', mailbox.workspace_id)
      .maybeSingle();

    if (workspaceError) return jsonError('supabase_error', supabaseErrorMessage(workspaceError), 502);
    if (!workspace) return jsonError('not_found', 'Không tìm thấy workspace hoặc tài khoản chưa được duyệt LogiMail.', 404);

    const { data: actorMembership, error: actorMembershipError } = await store
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', mailbox.workspace_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (actorMembershipError) return jsonError('supabase_error', supabaseErrorMessage(actorMembershipError), 502);

    const canAssignMailbox = workspace.owner_id === auth.user.id || ['owner', 'admin'].includes(actorMembership?.role ?? '');
    if (!canAssignMailbox) {
      return jsonError('forbidden', 'Chỉ owner/admin LogiMail đã được duyệt mới được gán user vào mailbox.', 403);
    }

    const { data: targetProfile, error: targetProfileError } = await serviceStore
      .from('profiles')
      .select('id,account_status,email')
      .eq('id', userId)
      .maybeSingle();

    if (targetProfileError) return jsonError('supabase_error', supabaseErrorMessage(targetProfileError), 502);
    if (!targetProfile || targetProfile.account_status !== 'approved') {
      return jsonError('account_not_approved', 'User được gán mailbox phải có tài khoản LogiMail đã được admin phê duyệt.', 409);
    }

    const { data, error } = await serviceStore
      .from('mailbox_permissions')
      .upsert({ mailbox_id: mailboxId, user_id: userId, permission }, { onConflict: 'mailbox_id,user_id' })
      .select('id,mailbox_id,user_id,permission,created_at')
      .single();

    if (error) return jsonError('supabase_error', supabaseErrorMessage(error), 502);
    await writeAuditLog({
      workspaceId: mailbox.workspace_id,
      actorId: auth.user.id,
      action: 'mailbox.assign_user',
      targetType: 'mailbox',
      targetId: mailbox.id,
      metadata: { emailAddress: mailbox.email_address, assignedUserId: userId, permission },
    });
    return jsonOk({ mailboxPermission: data }, { status: 201 });
  } catch (error) {
    return jsonError('invalid_request', error instanceof Error ? error.message : 'Payload không hợp lệ.', 400);
  }
}
