import { randomUUID } from 'node:crypto';

import { jsonError, jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { assertBillionMailProviderConfigured, publicBillionMailError, updateBillionMailMailboxPassword } from '@/lib/billionmail-provider';
import { decryptMailboxCredential, mailCredentialReadiness, prepareMailboxCredentials } from '@/lib/mail-credentials';
import { createLogimailServiceStore, normalizeEmail, normalizeMailboxLocalPart, readJsonObject, stringField, supabaseErrorMessage } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hashWorkspaceInviteCode, normalizeWorkspaceInviteCode } from '@/lib/security/invite-code';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_INVITE_ERROR = 'Lời mời, mã bảo mật hoặc địa chỉ email không hợp lệ.';
const INVITE_LEASE_SECONDS = 300;

type CompletedInviteOperation = {
  state: 'completed';
  attemptId: string;
  workspaceId: string;
  mailboxId: string;
  email: string;
  userId: string | null;
};

type ClaimedInviteOperation = {
  state: 'claimed' | 'recovered';
  attemptId: string;
  leaseToken: string;
  leaseVersion: number;
  inviteId: string;
  workspaceId: string;
  mailboxId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  mailboxPermission: 'read' | 'send' | 'admin';
  invitedBy: string;
  displayName: string | null;
  quotaMb: number | null;
  previousPasswordCiphertext: string | null;
  existingUserId: string | null;
  userId: string | null;
  createdAuthUser: boolean;
};

type InviteOperationClaim = CompletedInviteOperation | ClaimedInviteOperation | { state: 'busy' | 'manual_review' };

function passwordField(value: string | null) {
  if (!value || value.length < 10 || value.length > 128) throw new Error('invalid_password');
  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) throw new Error('weak_password');
  return value;
}

function publicInviteError(error: unknown) {
  const message = error instanceof Error ? error.message : 'invite_failed';
  if (message === 'invalid_password') return 'Mật khẩu cần dài từ 10 đến 128 ký tự.';
  if (message === 'weak_password') return 'Mật khẩu cần có cả chữ và số.';
  if (message === 'password_mismatch') return 'Mật khẩu xác nhận không khớp.';
  if (message === 'invalid_invite_code' || message === 'invalid_email') return GENERIC_INVITE_ERROR;
  if (message === 'missing_invite_secret') return 'Dịch vụ lời mời chưa được cấu hình đầy đủ.';
  if (message.startsWith('missing_billionmail_config:') || message.startsWith('billionmail_provider_error:')) return publicBillionMailError(error);
  return 'Không thể kích hoạt lời mời lúc này. Vui lòng thử lại sau.';
}

function operationFailure(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : 'invite_operation_failed';
}

function completedResponse(operation: CompletedInviteOperation | ClaimedInviteOperation) {
  return jsonOk({
    email: operation.email,
    status: 'active',
    workspaceId: operation.workspaceId,
    mailboxId: operation.mailboxId,
  });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'auth-invite-accept', 5, 60 * 60 * 1000);
  if (limited) return limited;

  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LOGIMAIL_INVITE_SECRET']);
  if (missing.length > 0) return jsonError('not_configured', 'Dịch vụ lời mời chưa được cấu hình đầy đủ.', 503);

  const serviceStore = createLogimailServiceStore();
  if (!serviceStore) return jsonError('not_configured', 'Dịch vụ lời mời chưa được cấu hình đầy đủ.', 503);
  const store = serviceStore;

  let operation: ClaimedInviteOperation | null = null;
  let previousPassword: string | null = null;
  let providerInput: { email: string; localPart: string; domain: string; password: string; displayName: string; quotaMb: number } | null = null;
  let userId: string | null = null;
  let createdAuthUser = false;
  let providerApplied = false;
  let authApplied = false;
  let externalMutationUncertain = false;
  let coordinationUncertain = false;
  let commitStarted = false;

  async function touch(nextStage: 'provider_started' | 'provider_applied' | 'auth_started' | 'commit_started') {
    if (!operation) throw new Error('invite_operation_missing');
    const { error } = await store.rpc('touch_workspace_invite_operation', {
      target_attempt_id: operation.attemptId,
      target_lease_token: operation.leaseToken,
      expected_lease_version: operation.leaseVersion,
      next_stage: nextStage,
      lease_seconds: INVITE_LEASE_SECONDS,
      operation_error: null,
    });
    if (error) {
      coordinationUncertain = true;
      throw new Error(supabaseErrorMessage(error));
    }
  }

  async function requireRecovery(error: unknown) {
    if (!operation) return;
    const { error: recoveryError } = await store.rpc('require_workspace_invite_recovery', {
      target_attempt_id: operation.attemptId,
      target_lease_token: operation.leaseToken,
      expected_lease_version: operation.leaseVersion,
      operation_error: operationFailure(error),
    });
    if (recoveryError) {
      console.error('[logimail-invite] recovery marker failed', {
        attemptId: operation.attemptId,
        message: supabaseErrorMessage(recoveryError),
      });
    }
  }

  try {
    const body = await readJsonObject(request);
    const email = normalizeEmail(stringField(body, 'email', { required: true, max: 254 }) ?? '');
    const code = normalizeWorkspaceInviteCode(stringField(body, 'inviteCode', { required: true, max: 64 }) ?? '');
    const password = passwordField(stringField(body, 'password', { required: true, max: 128 }));
    const confirmPassword = passwordField(stringField(body, 'confirmPassword', { required: true, max: 128 }));
    if (password !== confirmPassword) throw new Error('password_mismatch');
    assertBillionMailProviderConfigured();
    if (!mailCredentialReadiness().ready) throw new Error('missing_mailbox_credential_key');

    const leaseToken = randomUUID();
    const { data: claimData, error: claimError } = await store.rpc('claim_workspace_invite_operation', {
      target_token_hash: hashWorkspaceInviteCode(code),
      requested_email: email,
      new_lease_token: leaseToken,
      lease_seconds: INVITE_LEASE_SECONDS,
    });
    if (claimError) throw new Error(supabaseErrorMessage(claimError));
    if (!claimData || typeof claimData !== 'object' || !('state' in claimData)) {
      return jsonError('invalid_invite', GENERIC_INVITE_ERROR, 409);
    }

    const claim = claimData as InviteOperationClaim;
    if (claim.state === 'completed') return completedResponse(claim);
    if (claim.state === 'busy') return jsonError('invite_busy', 'Lời mời đang được xử lý. Vui lòng thử lại sau ít phút.', 409);
    if (claim.state === 'manual_review') return jsonError('invite_manual_review', 'Lời mời cần được quản trị viên kiểm tra trước khi tiếp tục.', 409);
    const claimedOperation = claim as ClaimedInviteOperation;
    operation = claimedOperation;
    userId = claimedOperation.userId ?? claimedOperation.existingUserId;
    createdAuthUser = claimedOperation.createdAuthUser;

    previousPassword = decryptMailboxCredential(claimedOperation.previousPasswordCiphertext);
    if (!previousPassword) throw new Error('missing_previous_mailbox_credential');

    const atIndex = email.lastIndexOf('@');
    providerInput = {
      email,
      localPart: normalizeMailboxLocalPart(email.slice(0, atIndex)),
      domain: email.slice(atIndex + 1),
      password,
      displayName: claimedOperation.displayName || email.slice(0, atIndex),
      quotaMb: claimedOperation.quotaMb ?? 1024,
    };

    await touch('provider_started');
    externalMutationUncertain = true;
    await updateBillionMailMailboxPassword(providerInput);
    externalMutationUncertain = false;
    providerApplied = true;
    await touch('provider_applied');

    await touch('auth_started');
    externalMutationUncertain = true;
    if (userId) {
      const { error: updateUserError } = await store.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (updateUserError) throw new Error(supabaseErrorMessage(updateUserError));
    } else {
      const { data: createdUser, error: createUserError } = await store.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          logimail_account_status: 'approved',
          logimail_invite_id: claimedOperation.inviteId,
          logimail_invite_attempt_id: claimedOperation.attemptId,
        },
      });
      if (createUserError || !createdUser.user) throw new Error('invite_account_unavailable');
      userId = createdUser.user.id;
      createdAuthUser = true;
    }
    externalMutationUncertain = false;
    authApplied = true;

    if (!userId) throw new Error('invite_account_unavailable');
    const { error: bindError } = await store.rpc('bind_workspace_invite_operation_user', {
      target_attempt_id: claimedOperation.attemptId,
      target_lease_token: claimedOperation.leaseToken,
      expected_lease_version: claimedOperation.leaseVersion,
      target_user_id: userId,
      auth_user_created: createdAuthUser,
      lease_seconds: INVITE_LEASE_SECONDS,
    });
    if (bindError) {
      coordinationUncertain = true;
      throw new Error(supabaseErrorMessage(bindError));
    }

    const credentials = prepareMailboxCredentials({ email, password });
    if (!credentials.prepared) throw new Error(credentials.reason);

    await touch('commit_started');
    commitStarted = true;
    const { data: commitData, error: commitError } = await store.rpc('commit_workspace_invite_operation', {
      target_attempt_id: claimedOperation.attemptId,
      target_lease_token: claimedOperation.leaseToken,
      expected_lease_version: claimedOperation.leaseVersion,
      new_encrypted_username: credentials.encryptedUsername,
      new_encrypted_password: credentials.encryptedPassword,
      new_credential_key_version: credentials.credentialKeyVersion,
    });

    if (commitError || !commitData) {
      const { data: committedAttempt } = await store
        .from('workspace_invite_operations')
        .select('status,stage')
        .eq('attempt_id', claimedOperation.attemptId)
        .maybeSingle();
      if (committedAttempt?.status === 'completed' && committedAttempt.stage === 'completed') {
        return completedResponse(claimedOperation);
      }
      throw new Error(commitError ? supabaseErrorMessage(commitError) : 'invite_operation_commit_failed');
    }

    return completedResponse(claimedOperation);
  } catch (error) {
    if (!operation) return jsonError('invalid_invite', publicInviteError(error), 400);

    if (externalMutationUncertain || coordinationUncertain || commitStarted) {
      await requireRecovery(error);
      return jsonError('invite_recovery_required', publicInviteError(error), 409);
    }

    let rollbackComplete = true;
    if (authApplied && userId && previousPassword) {
      if (createdAuthUser) {
        const { error: userRollbackError } = await store.auth.admin.deleteUser(userId);
        if (userRollbackError) {
          rollbackComplete = false;
          console.error('[logimail-invite] auth user rollback failed', {
            attemptId: operation.attemptId,
            message: supabaseErrorMessage(userRollbackError),
          });
        }
      } else {
        const { error: authRollbackError } = await store.auth.admin.updateUserById(userId, { password: previousPassword });
        if (authRollbackError) {
          rollbackComplete = false;
          console.error('[logimail-invite] auth password rollback failed', {
            attemptId: operation.attemptId,
            message: supabaseErrorMessage(authRollbackError),
          });
        }
      }
    }

    if (providerApplied && providerInput && previousPassword) {
      await updateBillionMailMailboxPassword({ ...providerInput, password: previousPassword }).catch((rollbackError) => {
        rollbackComplete = false;
        console.error('[logimail-invite] provider rollback failed', {
          attemptId: operation?.attemptId,
          message: rollbackError instanceof Error ? rollbackError.message : 'unknown_error',
        });
      });
    }

    if (rollbackComplete) {
      const { data: aborted, error: abortError } = await store.rpc('abort_workspace_invite_operation', {
        target_attempt_id: operation.attemptId,
        target_lease_token: operation.leaseToken,
        expected_lease_version: operation.leaseVersion,
        operation_error: operationFailure(error),
      });
      if (abortError || aborted !== true) {
        rollbackComplete = false;
        console.error('[logimail-invite] operation abort failed', {
          attemptId: operation.attemptId,
          message: abortError ? supabaseErrorMessage(abortError) : 'lease_lost',
        });
      }
    }

    if (!rollbackComplete) await requireRecovery(error);
    return jsonError('invalid_invite', publicInviteError(error), 400);
  }
}
