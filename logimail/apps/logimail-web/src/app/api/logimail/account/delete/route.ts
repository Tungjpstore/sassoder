import { createClient } from '@supabase/supabase-js';

import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { deleteBillionMailMailbox } from '@/lib/billionmail-provider';
import { createLogimailServiceStore, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';
import { enforceConsoleMfa, revokeUserSessions } from '@/lib/security/session';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/lib/account-deletion';
import { trustedSsoRequestContext } from '@/lib/sso-handoff';


function sameOrigin(request: Request) {
  try {
    trustedSsoRequestContext(request);
    return true;
  } catch {
    return false;
  }
}

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) throw new Error('auth_reauth_not_configured');
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function publicDeleteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'account_delete_failed');
  if (message === 'auth_reauth_not_configured') return { status: 503, code: 'not_configured', text: 'Dịch vụ xác thực lại chưa được cấu hình.' };
  if (message === 'service_store_not_configured') return { status: 503, code: 'not_configured', text: 'Dịch vụ dữ liệu tài khoản chưa được cấu hình.' };
  if (message === 'audit_unavailable') return { status: 503, code: 'audit_unavailable', text: 'Không thể ghi audit log. Tài khoản chưa bị xóa; hãy thử lại sau.' };
  if (message === 'workspace_ownership_transfer_required') return { status: 409, code: message, text: 'Hãy chuyển quyền sở hữu workspace cho thành viên khác trước khi xóa tài khoản.' };
  if (message === 'reauth_failed') return { status: 401, code: message, text: 'Mật khẩu hiện tại không đúng hoặc tài khoản không hỗ trợ xác thực lại bằng mật khẩu.' };
  if (message === 'invalid_json' || message === 'invalid_json_object' || message.startsWith('missing_') || message.startsWith('invalid_')) return { status: 400, code: 'invalid_request', text: 'Payload xóa tài khoản không hợp lệ.' };
  if (message.startsWith('billionmail_provider_error:')) return { status: 502, code: 'provider_cleanup_failed', text: 'Chưa thể xóa mailbox khỏi BillionMail. Tài khoản chưa bị xóa; hãy thử lại sau.' };
  return { status: 502, code: 'account_delete_failed', text: 'Chưa thể hoàn tất xóa tài khoản. Tài khoản chưa bị xóa; hãy thử lại sau.' };
}

function isProviderMailboxMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not found|does not exist|no such mailbox|unknown mailbox|không tồn tại/i.test(message);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError('csrf_origin_invalid', 'Yêu cầu xóa tài khoản phải xuất phát từ đúng LogiMail origin.', 403);

  const auth = await requireAuth(request, 'dangerous');
  if (!auth.ok) return auth.response;
  if (!auth.user.email) return jsonError('reauth_failed', 'Tài khoản cần có email để xác thực lại.', 401);
  const mfa = await enforceConsoleMfa({ userId: auth.user.id, token: auth.token });
  if (!mfa.ok) return mfa.response;

  try {
    const body = await readJsonObject(request);
    const password = stringField(body, 'password', { required: true, max: 128 }) ?? '';
    const confirmation = stringField(body, 'confirmation', { required: true, max: 64 }) ?? '';
    if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) return jsonError('confirmation_mismatch', `Nhập chính xác ${ACCOUNT_DELETE_CONFIRMATION} để tiếp tục.`, 428);
    if (password.length < 10) return jsonError('reauth_failed', 'Mật khẩu hiện tại không đúng hoặc tài khoản không hỗ trợ xác thực lại bằng mật khẩu.', 401);

    const { data: reauth, error: reauthError } = await authClient().auth.signInWithPassword({ email: auth.user.email, password });
    if (reauthError || !reauth.user || reauth.user.id !== auth.user.id) throw new Error('reauth_failed');

    const db = createLogimailServiceStore();
    if (!db) throw new Error('service_store_not_configured');

    const { data: ownedWorkspaces, error: workspaceError } = await db
      .from('workspaces')
      .select('id,name')
      .eq('owner_id', auth.user.id)
      .limit(10);
    if (workspaceError) throw new Error(supabaseErrorMessage(workspaceError));
    if ((ownedWorkspaces ?? []).length > 0) throw new Error('workspace_ownership_transfer_required');

    const { data: permissionRows, error: permissionError } = await db
      .from('mailbox_permissions')
      .select('mailbox_id')
      .eq('user_id', auth.user.id);
    if (permissionError) throw new Error(supabaseErrorMessage(permissionError));

    const mailboxIds = Array.from(new Set((permissionRows ?? []).map((row) => row.mailbox_id as string).filter(Boolean)));
    const mailboxRows = mailboxIds.length
      ? await db.from('mailboxes').select('id,email_address').in('id', mailboxIds)
      : { data: [], error: null };
    if (mailboxRows.error) throw new Error(supabaseErrorMessage(mailboxRows.error));

    const allPermissions = mailboxIds.length
      ? await db.from('mailbox_permissions').select('mailbox_id,user_id').in('mailbox_id', mailboxIds)
      : { data: [], error: null };
    if (allPermissions.error) throw new Error(supabaseErrorMessage(allPermissions.error));

    const permissionCount = new Map<string, number>();
    for (const row of allPermissions.data ?? []) permissionCount.set(row.mailbox_id as string, (permissionCount.get(row.mailbox_id as string) ?? 0) + 1);
    const soleMailboxes = (mailboxRows.data ?? []).filter((row) => permissionCount.get(row.id as string) === 1);

    const audit = await writeAuditLog({
      actorId: auth.user.id,
      action: 'account.delete',
      targetType: 'user',
      targetId: auth.user.id,
      metadata: {
        email: auth.user.email.toLowerCase(),
        soleMailboxCount: soleMailboxes.length,
        sharedMailboxCount: mailboxIds.length - soleMailboxes.length,
        provider: 'billionmail',
        reauthenticated: true,
      },
    });
    if (!audit.ok) throw new Error('audit_unavailable');

    for (const mailbox of soleMailboxes) {
      try {
        await deleteBillionMailMailbox(mailbox.email_address as string);
      } catch (error) {
        if (!isProviderMailboxMissing(error)) throw error;
      }
    }

    const { error: inviteError } = await db.from('workspace_invites').delete().eq('invited_by', auth.user.id);
    if (inviteError) throw new Error(supabaseErrorMessage(inviteError));
    if (soleMailboxes.length > 0) {
      const { error: mailboxInviteError } = await db
        .from('workspace_invites')
        .delete()
        .in('mailbox_id', soleMailboxes.map((mailbox) => mailbox.id as string));
      if (mailboxInviteError) throw new Error(supabaseErrorMessage(mailboxInviteError));
    }

    const { error: permissionCleanupError } = await db.from('mailbox_permissions').delete().eq('user_id', auth.user.id);
    if (permissionCleanupError) throw new Error(supabaseErrorMessage(permissionCleanupError));

    for (const mailbox of soleMailboxes) {
      const { error: mailboxDeleteError } = await db
        .from('mailboxes')
        .delete()
        .eq('id', mailbox.id);
      if (!mailboxDeleteError) continue;

      const { error: mailboxCleanupError } = await db
        .from('mailboxes')
        .update({
          status: 'disabled',
          provider_mailbox_id: null,
          encrypted_imap_username: null,
          encrypted_imap_password: null,
          encrypted_smtp_username: null,
          encrypted_smtp_password: null,
          credential_key_version: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mailbox.id);
      if (mailboxCleanupError) throw new Error(supabaseErrorMessage(mailboxCleanupError));
    }

    await revokeUserSessions({ userId: auth.user.id, actorId: auth.user.id });
    const { error: deleteUserError } = await db.auth.admin.deleteUser(auth.user.id);
    if (deleteUserError) throw new Error(supabaseErrorMessage(deleteUserError));

    return jsonOk({ deleted: true, signedOut: true });
  } catch (error) {
    const mapped = publicDeleteError(error);
    return jsonError(mapped.code, mapped.text, mapped.status);
  }
}
