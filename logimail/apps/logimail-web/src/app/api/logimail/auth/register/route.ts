import { jsonError, jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { assertBillionMailProviderConfigured, createBillionMailMailbox, deleteBillionMailMailbox, publicBillionMailError } from '@/lib/billionmail-provider';
import { saveMailboxCredentials } from '@/lib/mail-credentials';
import {
  createLogimailServiceStore,
  normalizeMailboxLocalPart,
  readJsonObject,
  stringField,
  supabaseErrorMessage,
} from '@/lib/logimail-store';
import { getRegistrationDomainRecord } from '@/lib/registration-domains';
import { consumeSecurityCode, publicSecurityCodeError, validateSecurityCode } from '@/lib/security-codes';

const RESERVED_LOCAL_PARTS = new Set([
  'abuse',
  'hostmaster',
  'mail',
  'mailer-daemon',
  'no-reply',
  'noreply',
  'postmaster',
  'root',
  'security',
  'webmaster',
]);

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const DEFAULT_QUOTA_MB = 1024;

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
  if (message === 'invalid_local_part') return 'Tên email chỉ được dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.';
  if (message === 'invalid_domain') return 'Domain email không hợp lệ.';
  if (message === 'security_code_invalid') return 'Mã bảo mật không hợp lệ cho domain này.';
  if (message === 'security_code_expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong admin.logivn.com hoặc LogiDev bot.';
  if (message === 'security_code_used') return 'Mã bảo mật đã được sử dụng. Mỗi mã chỉ tạo được một tài khoản.';
  if (message.startsWith('missing_billionmail_config:') || message.startsWith('billionmail_provider_error:')) return publicBillionMailError(error);
  return publicSecurityCodeError(error);
}

function codeFailureMessage(reason: 'invalid' | 'expired' | 'used') {
  if (reason === 'expired') return 'Mã bảo mật đã hết hiệu lực. Admin có thể lấy mã mới trong admin.logivn.com hoặc LogiDev bot.';
  if (reason === 'used') return 'Mã bảo mật đã được sử dụng. Mỗi mã chỉ tạo được một tài khoản.';
  return 'Mã bảo mật không hợp lệ cho domain này.';
}

async function ensureAddressAvailable(serviceStore: ReturnType<typeof createLogimailServiceStore>, email: string) {
  if (!serviceStore) throw new Error('not_configured');
  const [profileResult, requestResult, mailboxResult] = await Promise.all([
    serviceStore.from('profiles').select('id,email,account_status').eq('email', email).maybeSingle(),
    serviceStore.from('account_requests').select('id,status').eq('email', email).in('status', ['pending', 'approved']).maybeSingle(),
    serviceStore.from('mailboxes').select('id,email_address').eq('email_address', email).maybeSingle(),
  ]);

  if (profileResult.error) throw new Error(supabaseErrorMessage(profileResult.error));
  if (requestResult.error) throw new Error(supabaseErrorMessage(requestResult.error));
  if (mailboxResult.error) throw new Error(supabaseErrorMessage(mailboxResult.error));
  if (profileResult.data || requestResult.data || mailboxResult.data) {
    return false;
  }
  return true;
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
  if (!serviceStore) return jsonError('not_configured', 'Chưa cấu hình Supabase service role cho đăng ký LogiMail.', 503);

  let providerMailboxCreated = false;
  let createdUserId: string | null = null;
  let createdMailboxId: string | null = null;
  let email = '';

  try {
    const body = await readJsonObject(request);
    const localPart = normalizeMailboxLocalPart(stringField(body, 'localPart', { required: true, max: 64 }) ?? '');
    if (RESERVED_LOCAL_PARTS.has(localPart)) {
      return jsonError('reserved_address', 'Tên email này đang được giữ cho hệ thống hoặc team vận hành.', 409);
    }

    const requestedDomain = stringField(body, 'domain', { required: true, max: 253 }) ?? '';
    const domain = await getRegistrationDomainRecord(requestedDomain);
    if (!domain) return jsonError('domain_not_available', 'Domain này chưa được xác minh hoặc chưa bật đăng ký email.', 409);

    const password = passwordField(stringField(body, 'password', { required: true, max: 128 }));
    const confirmPassword = passwordField(stringField(body, 'confirmPassword', { required: true, max: 128 }));
    if (password !== confirmPassword) throw new Error('password_mismatch');

    const securityCode = stringField(body, 'securityCode', { required: true, max: 64 }) ?? '';
    email = `${localPart}@${domain.domain}`;

    assertBillionMailProviderConfigured();

    const available = await ensureAddressAvailable(serviceStore, email);
    if (!available) return jsonError('address_unavailable', 'Địa chỉ email này đã tồn tại hoặc đang chờ xử lý.', 409);

    const validatedCode = await validateSecurityCode({ code: securityCode, domain: domain.domain, purpose: 'account_signup' });
    if (!validatedCode.ok) return jsonError('invalid_security_code', codeFailureMessage(validatedCode.reason), 409);

    await createBillionMailMailbox({
      email,
      localPart,
      domain: domain.domain,
      password,
      displayName: localPart,
      quotaMb: DEFAULT_QUOTA_MB,
    });
    providerMailboxCreated = true;

    const { data: userData, error: createUserError } = await serviceStore.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        logimail_signup_source: 'security_code_email_form',
        logimail_local_part: localPart,
        logimail_domain: domain.domain,
      },
      app_metadata: {
        logimail_account_status: 'approved',
        logimail_domain: domain.domain,
      },
    });

    if (createUserError || !userData.user) {
      throw new Error('Địa chỉ email này đã tồn tại hoặc chưa thể tạo lúc này.');
    }
    createdUserId = userData.user.id;

    const { error: profileError } = await serviceStore.from('profiles').insert({
      id: createdUserId,
      email,
      full_name: localPart,
      role: 'member',
      account_status: 'approved',
    });
    if (profileError) throw new Error(supabaseErrorMessage(profileError));

    await serviceStore
      .from('workspace_members')
      .upsert({ workspace_id: domain.workspace_id, user_id: createdUserId, role: 'member' }, { onConflict: 'workspace_id,user_id' })
      .then((result) => { if (result.error) throw new Error(supabaseErrorMessage(result.error)); });

    const { data: mailbox, error: mailboxError } = await serviceStore
      .from('mailboxes')
      .insert({
        workspace_id: domain.workspace_id,
        domain_id: domain.id,
        email_address: email,
        display_name: localPart,
        quota_mb: DEFAULT_QUOTA_MB,
        status: 'active',
        provider: 'billionmail',
        provider_mailbox_id: email,
      })
      .select('id,email_address')
      .single();
    if (mailboxError || !mailbox) throw new Error(supabaseErrorMessage(mailboxError));
    createdMailboxId = mailbox.id as string;

    await serviceStore
      .from('mailbox_permissions')
      .upsert({ mailbox_id: createdMailboxId, user_id: createdUserId, permission: 'admin' }, { onConflict: 'mailbox_id,user_id' })
      .then((result) => { if (result.error) throw new Error(supabaseErrorMessage(result.error)); });

    await saveMailboxCredentials({ mailboxId: createdMailboxId, email, password });

    const consumedCode = await consumeSecurityCode({ code: securityCode, domain: domain.domain, email, userId: createdUserId, purpose: 'account_signup' });
    if (!consumedCode.ok) throw new Error(`security_code_${consumedCode.reason}`);

    await writeAuditLog({
      workspaceId: domain.workspace_id,
      actorId: createdUserId,
      action: 'account.email_registration_create',
      targetType: 'mailbox',
      targetId: createdMailboxId,
      metadata: { email, localPart, domain: domain.domain, securityCodeId: consumedCode.row.id, provider: 'billionmail' },
    });

    return jsonOk({ email, status: 'active', mailboxId: createdMailboxId, workspaceId: domain.workspace_id }, { status: 201 });
  } catch (error) {
    if (createdMailboxId) {
      try {
        await serviceStore.from('mailboxes').delete().eq('id', createdMailboxId);
      } catch {
        // Best-effort rollback; the original provisioning error is returned below.
      }
    }
    if (createdUserId) {
      await serviceStore.auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    if (providerMailboxCreated && email) {
      await deleteBillionMailMailbox(email).catch(() => undefined);
    }
    return jsonError('invalid_request', publicErrorMessage(error), 400);
  }
}
