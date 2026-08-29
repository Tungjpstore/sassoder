import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { createLogimailServiceStore, normalizeEmail, normalizeUuid, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createWorkspaceInviteCode, hashWorkspaceInviteCode, normalizeWorkspaceInviteRole, workspaceInviteCodeHint } from '@/lib/security/invite-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INVITE_TTL_HOURS = 72;

function publicInviteError(error: unknown) {
  const message = error instanceof Error ? error.message : 'invite_failed';
  if (message === 'invalid_invite_role') return 'Vai trò lời mời không hợp lệ.';
  if (message === 'missing_invite_secret') return 'Chưa cấu hình khóa máy chủ cho lời mời LogiMail.';
  if (message.startsWith('invalid_') || message.startsWith('missing_')) return 'Dữ liệu lời mời không hợp lệ.';
  return 'Không thể tạo lời mời lúc này.';
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'team-invite-create', 12, 60 * 60 * 1000);
  if (limited) return limited;

  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  const serviceStore = createLogimailServiceStore();
  if (!serviceStore) return jsonError('not_configured', 'Thiếu env server-side: SUPABASE_SERVICE_ROLE_KEY', 503);

  try {
    const body = await readJsonObject(request);
    const workspaceId = normalizeUuid(stringField(body, 'workspaceId', { required: true }) ?? '', 'workspaceId');
    const mailboxId = normalizeUuid(stringField(body, 'mailboxId', { required: true }) ?? '', 'mailboxId');
    const targetEmail = normalizeEmail(stringField(body, 'email', { required: true, max: 254 }) ?? '');
    const role = normalizeWorkspaceInviteRole(stringField(body, 'role', { required: true, max: 20 }) ?? '');

    const [{ data: workspace, error: workspaceError }, { data: membership, error: membershipError }, { data: mailbox, error: mailboxError }] = await Promise.all([
      serviceStore.from('workspaces').select('id,owner_id,status').eq('id', workspaceId).maybeSingle(),
      serviceStore.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', auth.user.id).maybeSingle(),
      serviceStore.from('mailboxes').select('id,workspace_id,email_address,status').eq('id', mailboxId).maybeSingle(),
    ]);
    if (workspaceError || membershipError || mailboxError) {
      return jsonError('supabase_error', supabaseErrorMessage(workspaceError ?? membershipError ?? mailboxError), 502);
    }
    if (!workspace || workspace.status !== 'active' || !mailbox || mailbox.workspace_id !== workspaceId || mailbox.status !== 'active') {
      return jsonError('not_found', 'Không tìm thấy workspace hoặc mailbox hoạt động.', 404);
    }
    if (workspace.owner_id !== auth.user.id && !['owner', 'admin'].includes(membership?.role ?? '')) {
      return jsonError('forbidden', 'Chỉ owner hoặc admin của workspace mới có thể mời thành viên.', 403);
    }

    // A mailbox password belongs to exactly one identity. Requiring this match
    // prevents an invite from accidentally rotating credentials of a shared inbox.
    if (mailbox.email_address !== targetEmail) {
      return jsonError('identity_mismatch', 'Email người được mời phải khớp mailbox danh tính đã chọn.', 409);
    }

    const { data: existingProfile, error: profileError } = await serviceStore
      .from('profiles')
      .select('id,account_status')
      .eq('email', targetEmail)
      .maybeSingle();
    if (profileError) return jsonError('supabase_error', supabaseErrorMessage(profileError), 502);
    if (existingProfile?.account_status && existingProfile.account_status !== 'approved') {
      return jsonError('account_unavailable', 'Tài khoản đích chưa sẵn sàng để nhận lời mời.', 409);
    }
    if (existingProfile) {
      const { data: existingMembership, error: existingMembershipError } = await serviceStore
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', existingProfile.id as string)
        .maybeSingle();
      if (existingMembershipError) return jsonError('supabase_error', supabaseErrorMessage(existingMembershipError), 502);
      if (existingMembership) return jsonError('already_member', 'Địa chỉ này đã là thành viên của workspace.', 409);
    }

    const code = createWorkspaceInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: invite, error: inviteError } = await serviceStore
      .from('workspace_invites')
      .insert({
        workspace_id: workspaceId,
        target_email: targetEmail,
        role,
        mailbox_id: mailboxId,
        mailbox_permission: 'admin',
        token_hash: hashWorkspaceInviteCode(code),
        token_hint: workspaceInviteCodeHint(code),
        status: 'active',
        expires_at: expiresAt,
        invited_by: auth.user.id,
        metadata: { source: 'team_invites_ui', provider: 'billionmail' },
      })
      .select('id,workspace_id,target_email,role,mailbox_id,mailbox_permission,token_hint,status,expires_at,created_at')
      .single();
    if (inviteError) {
      if (inviteError.code === '23505') return jsonError('active_invite_exists', 'Địa chỉ này đã có lời mời đang hiệu lực trong workspace.', 409);
      return jsonError('supabase_error', supabaseErrorMessage(inviteError), 502);
    }

    await writeAuditLog({
      workspaceId,
      actorId: auth.user.id,
      action: 'team.invite_create',
      targetType: 'workspace_invite',
      targetId: invite.id as string,
      metadata: { targetEmail, role, mailboxId, expiresAt },
    });

    const baseUrl = new URL(request.url).origin;
    return jsonOk({
      invite,
      code,
      acceptanceUrl: `${baseUrl}/auth/invite`,
      delivery: 'manual_secure_channel_required',
    }, { status: 201 });
  } catch (error) {
    return jsonError('invalid_request', publicInviteError(error), 400);
  }
}
