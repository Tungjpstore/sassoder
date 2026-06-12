import { jsonError, jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { assertBillionMailProviderConfigured, publicBillionMailError, updateBillionMailMailboxPassword } from '@/lib/billionmail-provider';
import { saveMailboxCredentials } from '@/lib/mail-credentials';
import {
  createLogimailServiceStore,
  normalizeEmail,
  normalizeMailboxLocalPart,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';
import { getRegistrationDomainRecord } from '@/lib/registration-domains';
import { consumeSecurityCode, publicSecurityCodeError, validateSecurityCode } from '@/lib/security-codes';

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
}

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
  if (message === 'security_code_invalid') return 'Mã bảo mật không hợp lệ cho email này.';
  if (message === 'security_code_expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong admin.logivn.com hoặc LogiDev bot.';
  if (message === 'security_code_used') return 'Mã bảo mật đã được sử dụng.';
  if (message.startsWith('billionmail_provider_error:') || message.startsWith('missing_billionmail_config:')) return publicBillionMailError(error);
  return publicSecurityCodeError(error);
}

function codeFailureMessage(reason: 'invalid' | 'expired' | 'used') {
  if (reason === 'expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong admin.logivn.com hoặc LogiDev bot.';
  if (reason === 'used') return 'Mã bảo mật đã được sử dụng.';
  return 'Mã bảo mật không hợp lệ cho email này.';
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return jsonError('rate_limited', 'Bạn đã gửi quá nhiều yêu cầu. Hãy thử lại sau.', 429);
  }

  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length > 0) {
    return jsonError('not_configured', `Thiếu env server-side: ${missing.join(', ')}`, 503);
  }

  const serviceStore = createLogimailServiceStore();
  if (!serviceStore) return jsonError('not_configured', 'Chưa cấu hình Supabase service role cho reset LogiMail.', 503);

  try {
    const body = await readJsonObject(request);
    const localPart = normalizeMailboxLocalPart(stringField(body, 'localPart', { required: true, max: 64 }) ?? '');
    const domain = await getRegistrationDomainRecord(stringField(body, 'domain', { required: true, max: 253 }) ?? '');
    if (!domain) return jsonError('domain_not_available', 'Domain này chưa được xác minh hoặc chưa bật reset tự động.', 409);

    const email = normalizeEmail(`${localPart}@${domain.domain}`);
    const securityCode = stringField(body, 'securityCode', { required: true, max: 64 }) ?? '';
    const password = passwordField(stringField(body, 'password', { required: true, max: 128 }));
    const confirmPassword = passwordField(stringField(body, 'confirmPassword', { required: true, max: 128 }));
    if (password !== confirmPassword) throw new Error('password_mismatch');
    assertBillionMailProviderConfigured();

    const { data: profile, error: profileError } = await serviceStore
      .from('profiles')
      .select('id,email,account_status')
      .eq('email', email)
      .eq('account_status', 'approved')
      .maybeSingle();
    if (profileError) throw new Error(supabaseErrorMessage(profileError));
    if (!profile) return jsonError('account_not_found', 'Email này chưa được kích hoạt trong LogiMail.', 404);

    const { data: mailbox, error: mailboxError } = await serviceStore
      .from('mailboxes')
      .select('id,email_address,display_name,quota_mb,workspace_id,domain_id,status')
      .eq('email_address', email)
      .eq('status', 'active')
      .maybeSingle();
    if (mailboxError) throw new Error(supabaseErrorMessage(mailboxError));
    if (!mailbox) return jsonError('mailbox_not_found', 'Mailbox thật của email này chưa active.', 404);

    const validatedCode = await validateSecurityCode({ code: securityCode, domain: domain.domain, purpose: 'password_reset' });
    if (!validatedCode.ok) return jsonError('invalid_security_code', codeFailureMessage(validatedCode.reason), 409);

    await updateBillionMailMailboxPassword({
      email,
      localPart,
      domain: domain.domain,
      password,
      displayName: typeof mailbox.display_name === 'string' ? mailbox.display_name : localPart,
      quotaMb: typeof mailbox.quota_mb === 'number' ? mailbox.quota_mb : 1024,
    });

    const { error: updateUserError } = await serviceStore.auth.admin.updateUserById(profile.id as string, { password });
    if (updateUserError) throw new Error(supabaseErrorMessage(updateUserError));

    await saveMailboxCredentials({ mailboxId: mailbox.id as string, email, password });

    const consumedCode = await consumeSecurityCode({ code: securityCode, domain: domain.domain, email, userId: profile.id as string, purpose: 'password_reset' });
    if (!consumedCode.ok) throw new Error(`security_code_${consumedCode.reason}`);

    await writeAuditLog({
      workspaceId: mailbox.workspace_id as string,
      actorId: profile.id as string,
      action: 'account.password_reset_with_security_code',
      targetType: 'mailbox',
      targetId: mailbox.id as string,
      metadata: { email, domain: domain.domain, securityCodeId: consumedCode.row.id, provider: 'billionmail' },
    });

    return jsonOk({ email, status: 'password_updated' });
  } catch (error) {
    return jsonError('invalid_request', publicErrorMessage(error), 400);
  }
}
