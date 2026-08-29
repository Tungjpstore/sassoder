import { jsonError, jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { assertBillionMailProviderConfigured, publicBillionMailError, updateBillionMailMailboxPassword } from '@/lib/billionmail-provider';
import { decryptMailboxCredential, mailCredentialReadiness, saveMailboxCredentials } from '@/lib/mail-credentials';
import {
  createLogimailServiceStore,
  normalizeEmail,
  normalizeMailboxLocalPart,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';
import { getAuthenticationDomainRecord } from '@/lib/registration-domains';
import { consumeSecurityCode, validateSecurityCode } from '@/lib/security-codes';
import { enforceRateLimit } from '@/lib/rate-limit';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const GENERIC_RESET_ERROR = 'Mã bảo mật hoặc địa chỉ email không hợp lệ.';

type ConsumedResetCode = {
  id: string;
  used_count: number;
  consumed_at: string | null;
};

function passwordField(value: string | null) {
  if (!value || value.length < 10 || value.length > 128) throw new Error('invalid_password');
  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) throw new Error('weak_password');
  return value;
}

function publicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Payload không hợp lệ.';
  if (message === 'invalid_password') return 'Mật khẩu cần dài từ 10 đến 128 ký tự.';
  if (message === 'weak_password') return 'Mật khẩu cần có cả chữ và số.';
  if (message === 'password_mismatch') return 'Mật khẩu xác nhận không khớp.';
  if (message === 'invalid_local_part' || message === 'invalid_email') return 'Địa chỉ email không hợp lệ.';
  if (message === 'invalid_domain') return 'Domain email không hợp lệ.';
  if (message === 'security_code_invalid') return 'Mã bảo mật không hợp lệ cho email này.';
  if (message === 'security_code_expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong domain.logivn.com hoặc LogiDev bot.';
  if (message === 'security_code_used') return 'Mã bảo mật đã được sử dụng.';
  if (message.startsWith('billionmail_provider_error:') || message.startsWith('missing_billionmail_config:')) return publicBillionMailError(error);
  return 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.';
}

function codeFailureMessage(reason: 'invalid' | 'expired' | 'used') {
  if (reason === 'expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong domain.logivn.com hoặc LogiDev bot.';
  if (reason === 'used') return 'Mã bảo mật đã được sử dụng.';
  return 'Mã bảo mật không hợp lệ cho email này.';
}

async function restoreConsumedResetCode(serviceStore: NonNullable<ReturnType<typeof createLogimailServiceStore>>, code: ConsumedResetCode) {
  if (!code.consumed_at || code.used_count < 1) return;
  const { data, error } = await serviceStore
    .from('security_codes')
    .update({
      status: 'active',
      used_count: code.used_count - 1,
      consumed_by_user_id: null,
      consumed_email: null,
      consumed_at: null,
    })
    .eq('id', code.id)
    .eq('status', 'used')
    .eq('used_count', code.used_count)
    .eq('consumed_at', code.consumed_at)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) throw new Error('security_code_restore_conflict');
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'auth-password-reset', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (limited) return limited;

  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length > 0) {
    return jsonError('not_configured', `Thiếu env server-side: ${missing.join(', ')}`, 503);
  }

  const serviceStore = createLogimailServiceStore();
  if (!serviceStore) return jsonError('not_configured', 'Chưa cấu hình Supabase service role cho reset LogiMail.', 503);

  try {
    const body = await readJsonObject(request);
    const localPart = normalizeMailboxLocalPart(stringField(body, 'localPart', { required: true, max: 64 }) ?? '');
    const domain = await getAuthenticationDomainRecord(stringField(body, 'domain', { required: true, max: 253 }) ?? '');
    if (!domain) return jsonError('domain_not_available', 'Domain này chưa được xác minh hoặc chưa hoạt động.', 409);

    const email = normalizeEmail(`${localPart}@${domain.domain}`);
    const securityCode = stringField(body, 'securityCode', { required: true, max: 64 }) ?? '';
    const password = passwordField(stringField(body, 'password', { required: true, max: 128 }));
    const confirmPassword = passwordField(stringField(body, 'confirmPassword', { required: true, max: 128 }));
    if (password !== confirmPassword) throw new Error('password_mismatch');
    const validatedCode = await validateSecurityCode({ code: securityCode, domain: domain.domain, email, purpose: 'password_reset' });
    if (!validatedCode.ok) return jsonError('invalid_security_code', codeFailureMessage(validatedCode.reason), 409);

    const { data: profile, error: profileError } = await serviceStore
      .from('profiles')
      .select('id,email,account_status')
      .eq('email', email)
      .eq('account_status', 'approved')
      .maybeSingle();
    if (profileError) throw new Error(supabaseErrorMessage(profileError));
    if (!profile) return jsonError('invalid_reset_request', GENERIC_RESET_ERROR, 409);

    const { data: mailbox, error: mailboxError } = await serviceStore
      .from('mailboxes')
      .select('id,email_address,display_name,quota_mb,workspace_id,domain_id,status,session_version,encrypted_imap_password')
      .eq('email_address', email)
      .eq('status', 'active')
      .maybeSingle();
    if (mailboxError) throw new Error(supabaseErrorMessage(mailboxError));
    if (!mailbox) return jsonError('invalid_reset_request', GENERIC_RESET_ERROR, 409);

    const providerInput = {
      email,
      localPart,
      domain: domain.domain,
      password,
      displayName: typeof mailbox.display_name === 'string' ? mailbox.display_name : localPart,
      quotaMb: typeof mailbox.quota_mb === 'number' ? mailbox.quota_mb : 1024,
    };
    const previousPassword = decryptMailboxCredential(typeof mailbox.encrypted_imap_password === 'string' ? mailbox.encrypted_imap_password : null);
    if (!previousPassword) throw new Error('missing_previous_mailbox_credential');

    // Only reveal provider/key readiness after the target-bound code and
    // mailbox have been validated. A bad code must not disclose infrastructure
    // configuration, and a valid code remains retryable while ops is offline.
    assertBillionMailProviderConfigured();
    if (!mailCredentialReadiness().ready) throw new Error('missing_mailbox_credential_key');

    // A missing or corrupt previous credential is a preflight failure. Keep the
    // one-time code active because no external password has changed yet.
    const consumedCode = await consumeSecurityCode({ code: securityCode, domain: domain.domain, email, userId: profile.id as string, purpose: 'password_reset' });
    if (!consumedCode.ok) return jsonError('invalid_security_code', codeFailureMessage(consumedCode.reason), 409);
    let providerUpdated = false;
    let authUpdated = false;
    let credentialsUpdated = false;

    try {
      await updateBillionMailMailboxPassword(providerInput);
      providerUpdated = true;

      const { error: updateUserError } = await serviceStore.auth.admin.updateUserById(profile.id as string, { password });
      if (updateUserError) throw new Error(supabaseErrorMessage(updateUserError));
      authUpdated = true;

      const credentialResult = await saveMailboxCredentials({ mailboxId: mailbox.id as string, email, password });
      if (!credentialResult.stored) throw new Error('mailbox_credential_persistence_failed');
      credentialsUpdated = true;

      // Revoke every Supabase session and mailbox session atomically after the
      // credential writes. No fallible commit step may follow this mutation.
      const { data: revokedSessions, error: sessionRevokeError } = await serviceStore.rpc('revoke_user_sessions', {
        target_user_id: profile.id as string,
        actor_user_id: profile.id as string,
      });
      if (sessionRevokeError || !revokedSessions) throw new Error(supabaseErrorMessage(sessionRevokeError));
    } catch (error) {
      let rollbackComplete = true;

      if (credentialsUpdated) {
        try {
          const credentialRollback = await saveMailboxCredentials({ mailboxId: mailbox.id as string, email, password: previousPassword });
          if (!credentialRollback.stored) throw new Error(credentialRollback.reason);
        } catch (rollbackError) {
          rollbackComplete = false;
          console.error('[logimail-password-reset] credential rollback failed', {
            mailboxId: mailbox.id,
            message: rollbackError instanceof Error ? rollbackError.message : 'unknown_error',
          });
        }
      }

      if (authUpdated) {
        const { error: authRollbackError } = await serviceStore.auth.admin.updateUserById(profile.id as string, { password: previousPassword });
        if (authRollbackError) {
          rollbackComplete = false;
          console.error('[logimail-password-reset] auth rollback failed', {
            mailboxId: mailbox.id,
            message: supabaseErrorMessage(authRollbackError),
          });
        }
      }

      if (providerUpdated) {
        await updateBillionMailMailboxPassword({ ...providerInput, password: previousPassword }).catch((rollbackError) => {
          rollbackComplete = false;
          console.error('[logimail-password-reset] provider rollback failed', {
            mailboxId: mailbox.id,
            message: rollbackError instanceof Error ? rollbackError.message : 'unknown_error',
          });
        });
      }

      if (rollbackComplete) {
        await restoreConsumedResetCode(serviceStore, consumedCode.row).catch((restoreError) => {
          rollbackComplete = false;
          console.error('[logimail-password-reset] security-code restore failed', {
            codeId: consumedCode.row.id,
            message: restoreError instanceof Error ? restoreError.message : 'unknown_error',
          });
        });
      }

      if (!rollbackComplete) {
        console.error('[logimail-password-reset] reset failed closed with consumed code', {
          mailboxId: mailbox.id,
          codeId: consumedCode.row.id,
        });
      }
      throw error;
    }

    await writeAuditLog({
      workspaceId: mailbox.workspace_id as string,
      actorId: profile.id as string,
      action: 'account.password_reset_with_security_code',
      targetType: 'mailbox',
      targetId: mailbox.id as string,
      metadata: { email, domain: domain.domain, securityCodeId: consumedCode.row.id, provider: 'billionmail' },
    }).catch((auditError) => {
      console.error('[logimail-password-reset] audit persistence failed', {
        mailboxId: mailbox.id,
        message: auditError instanceof Error ? auditError.message : 'unknown_error',
      });
    });

    return jsonOk({ email, status: 'password_updated' });
  } catch (error) {
    return jsonError('invalid_request', publicErrorMessage(error), 400);
  }
}
