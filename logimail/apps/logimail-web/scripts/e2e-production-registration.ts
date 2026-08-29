import { createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type RegisterResult = {
  email: string;
  mailboxId: string;
  workspaceId: string;
};

type LoginResult = {
  email: string;
  accessToken: string;
};

type MailSessionResult = {
  unlocked: boolean;
  mailbox?: { id: string; emailAddress: string };
};

type SendResult = {
  sent: boolean;
  result?: {
    accepted?: string[];
    rejected?: string[];
    messageId?: string;
  };
};

type MailListResult = {
  messages: Array<{ id: string; subject: string; uid: number; folder: string }>;
  total: number;
  hasMore: boolean;
};

type MailDetailResult = {
  message: {
    id: string;
    subject: string;
    bodyText: string;
    messageId: string | null;
  };
};

type BillionMailJson = {
  ok?: boolean;
  success?: boolean;
  msg?: string;
  message?: string;
  error?: { message?: string };
};

type SecurityCodeRow = {
  id: string;
  domain: string | null;
  purpose: string;
  status: string;
  code_ciphertext: string | null;
  code_hint: string;
  expires_at: string;
};

const baseUrl = (process.env.LOGIMAIL_E2E_BASE_URL || 'https://mail.logivn.com').replace(/\/$/, '');
const domain = process.env.LOGIMAIL_E2E_DOMAIN || 'logivn.com';
const localPart = process.env.LOGIMAIL_E2E_LOCAL_PART || `codexe2e${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
const email = `${localPart}@${domain}`;
const password = process.env.LOGIMAIL_E2E_PASSWORD || `Codex${randomBytes(8).toString('base64url')}9a`;
const adoptExistingProviderMailbox = process.env.LOGIMAIL_E2E_ADOPT_PROVIDER_MAILBOX === '1';
const retainTestAccount = process.env.LOGIMAIL_E2E_RETAIN === '1';
const sendTo = process.env.LOGIMAIL_E2E_SEND_TO || email;
const testMarker = `LOGIMAIL-E2E-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
let testUserId: string | null = null;

function providerConfig() {
  return {
    baseUrl: process.env.BILLIONMAIL_BASE_URL?.trim() ?? '',
    directToken: process.env.BILLIONMAIL_API_TOKEN?.trim() || process.env.BILLIONMAIL_API_KEY?.trim() || '',
    bridgeBaseUrl: process.env.BILLIONMAIL_BRIDGE_BASE_URL?.trim() || process.env.LOGIMAIL_BILLIONMAIL_BRIDGE_BASE_URL?.trim() || '',
    bridgeToken: process.env.BILLIONMAIL_BRIDGE_TOKEN?.trim() || process.env.LOGIMAIL_BILLIONMAIL_BRIDGE_TOKEN?.trim() || '',
  };
}

function assertEnv() {
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LOGIMAIL_SECURITY_CODE_SECRET'].filter((key) => !process.env[key]);
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(', ')}`);
  if (sendTo.toLowerCase() !== email.toLowerCase()) {
    throw new Error('LOGIMAIL_E2E_SEND_TO must match the generated test mailbox because the receive assertion reads that inbox.');
  }

  const provider = providerConfig();
  const providerReady = Boolean(
    (provider.baseUrl && provider.directToken) || (provider.bridgeBaseUrl && provider.bridgeToken),
  );
  if ((adoptExistingProviderMailbox || !retainTestAccount) && !providerReady) {
    throw new Error('Missing BillionMail direct or bridge credentials required for verified E2E cleanup.');
  }
}

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
    auth: { persistSession: false },
    db: { schema: 'logimail' },
  });
}

function supabaseErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return 'Supabase request failed.';
  return error.code ? `${error.message ?? 'Supabase request failed.'} (${error.code})` : error.message ?? 'Supabase request failed.';
}

async function readJson<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || payload.ok === false) throw new Error(payload.error?.message || `HTTP ${response.status}`);
  if (!payload.data) throw new Error('Missing response data.');
  return payload.data;
}

function securityCodeSecret() {
  const secret = process.env.LOGIMAIL_SECURITY_CODE_SECRET || '';
  if (secret.length < 16) throw new Error('missing_security_code_secret');
  return secret;
}

function encryptionKey() {
  return createHash('sha256').update(securityCodeSecret()).digest();
}

function normalizeSecurityCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 8 || normalized.length > 32) throw new Error('invalid_security_code');
  return normalized;
}

function securityCodeHash(code: string) {
  return createHmac('sha256', securityCodeSecret()).update(normalizeSecurityCode(code)).digest('hex');
}

function decryptCode(value: string | null) {
  if (!value) return null;
  try {
    const [ivText, tagText, encryptedText] = value.split('.');
    if (!ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function runMaintenance() {
  const key = process.env.LOGIMAIL_CRON_KEY || '';
  if (!key) throw new Error('Missing LOGIMAIL_CRON_KEY.');
  const response = await fetch(`${baseUrl}/api/logimail/cron/security-code-maintenance`, {
    headers: { 'x-logimail-cron-key': key },
  });
  await readJson<{ result: unknown }>(response);
}

async function activeSignupCode() {
  if (process.env.LOGIMAIL_E2E_SECURITY_CODE) return process.env.LOGIMAIL_E2E_SECURITY_CODE;
  if (process.env.LOGIMAIL_CRON_KEY) await runMaintenance();
  const store = supabase();
  const { data, error } = await store
    .from('security_codes')
    .select('id,domain,purpose,status,code_ciphertext,code_hint,expires_at')
    .eq('domain', domain)
    .eq('purpose', 'account_signup')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(supabaseErrorMessage(error));
  const row = (data?.[0] ?? null) as SecurityCodeRow | null;
  const code = decryptCode(row?.code_ciphertext ?? null);
  if (!row || !code) throw new Error(`No active signup security code for ${domain}.`);
  return code;
}

async function registerAccount(securityCode: string) {
  const response = await fetch(`${baseUrl}/api/logimail/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ localPart, domain, securityCode, password, confirmPassword: password }),
  });
  return readJson<RegisterResult>(response);
}

async function loginAccount() {
  const response = await fetch(`${baseUrl}/api/logimail/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  return readJson<LoginResult>(response);
}

async function openMailSession(accessToken: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/logimail/mail/session`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    try {
      const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
      return { data: await readJson<MailSessionResult>(response), cookie };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Mail session failed.');
}

async function sendTestMail(accessToken: string, sessionCookie: string) {
  if (!sessionCookie) throw new Error('Missing mail session cookie for send test.');
  const response = await fetch(`${baseUrl}/api/logimail/mail/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      cookie: sessionCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      to: sendTo,
      subject: testMarker,
      text: `LogiMail production E2E receive test from ${email}. Marker: ${testMarker}`,
    }),
  });
  return { data: await readJson<SendResult>(response), subject: testMarker };
}

async function receiveTestMail(accessToken: string, sessionCookie: string, marker: string) {
  if (!sessionCookie) throw new Error('Missing mail session cookie for receive test.');
  let lastError: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const listResponse = await fetch(
      `${baseUrl}/api/logimail/mail/messages?folder=inbox&q=${encodeURIComponent(marker)}&limit=50&page=0`,
      { headers: { authorization: `Bearer ${accessToken}`, cookie: sessionCookie } },
    );
    try {
      const list = await readJson<MailListResult>(listResponse);
      const match = list.messages.find((message) => message.subject === marker);
      if (match) {
        const detailResponse = await fetch(`${baseUrl}/api/logimail/mail/messages/${encodeURIComponent(match.id)}`, {
          headers: { authorization: `Bearer ${accessToken}`, cookie: sessionCookie },
        });
        const detail = await readJson<MailDetailResult>(detailResponse);
        if (detail.message.subject !== marker || !detail.message.bodyText.includes(marker)) {
          throw new Error('Received message content did not match marker.');
        }
        return { list, detail };
      }
      lastError = new Error(`Marker not found yet (attempt ${attempt}).`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError instanceof Error ? lastError : new Error('Receive test timed out.');
}

function providerEndpoint(path: string) {
  const base = providerConfig().baseUrl;
  const prefix = (process.env.BILLIONMAIL_API_PREFIX || '/api').replace(/^\/+|\/+$/g, '');
  return new URL(`${prefix ? `/${prefix}` : ''}/${path.replace(/^\/+/, '')}`, base).toString();
}

async function assertProviderResponse(response: Response, action: string, allowMissingMailbox = false) {
  const text = await response.text();
  let body: BillionMailJson | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as BillionMailJson;
    } catch {
      body = { success: response.ok, msg: text.slice(0, 500) };
    }
  }

  if (response.ok && body?.success !== false && body?.ok !== false) return;
  const message = body?.msg || body?.message || body?.error?.message || `HTTP ${response.status}`;
  const missingMailbox = /mailbox[\s\S]*(?:not found|does not exist)|(?:not found|does not exist)[\s\S]*mailbox|邮箱[\s\S]*不存在/i.test(message);
  if (allowMissingMailbox && missingMailbox) return;
  throw new Error(`Provider ${action} failed: ${message}`);
}

function quotaBytes(quotaMb = 1024) {
  return Math.max(128, Math.min(102400, Math.round(quotaMb))) * 1024 * 1024;
}

async function createProviderMailbox() {
  const provider = providerConfig();
  if (provider.baseUrl && provider.directToken) {
    const response = await fetch(providerEndpoint('/mailbox/create'), {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${provider.directToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        domain,
        local_part: localPart,
        full_name: localPart,
        password,
        active: 1,
        isAdmin: 0,
        quota: quotaBytes(),
        quota_active: 1,
      }),
    });
    await assertProviderResponse(response, 'seed create');
    return;
  }

  if (provider.bridgeBaseUrl && provider.bridgeToken) {
    const response = await fetch(new URL('mailbox', `${provider.bridgeBaseUrl.replace(/\/$/, '')}/`).toString(), {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${provider.bridgeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        payload: { email, localPart, domain, password, displayName: localPart, quotaMb: 1024 },
      }),
    });
    await assertProviderResponse(response, 'bridge seed create');
    return;
  }

  throw new Error('Missing BillionMail provider config for adopt E2E seed.');
}

async function deleteProviderMailbox() {
  const provider = providerConfig();
  if (provider.baseUrl && provider.directToken) {
    const response = await fetch(providerEndpoint('/mailbox/delete'), {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${provider.directToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ emails: [email] }),
    });
    await assertProviderResponse(response, 'cleanup delete', true);
    return;
  }

  if (provider.bridgeBaseUrl && provider.bridgeToken) {
    const response = await fetch(new URL('mailbox', `${provider.bridgeBaseUrl.replace(/\/$/, '')}/`).toString(), {
      method: 'POST',
      headers: { accept: 'application/json', authorization: `Bearer ${provider.bridgeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', payload: { email } }),
    });
    await assertProviderResponse(response, 'bridge cleanup delete', true);
    return;
  }

  throw new Error('Missing BillionMail provider config for cleanup.');
}

async function cleanup() {
  const store = supabase();
  const { data: mailbox, error: mailboxError } = await store.from('mailboxes').select('id,email_address').eq('email_address', email).maybeSingle();
  if (mailboxError) throw new Error(supabaseErrorMessage(mailboxError));
  if (mailbox?.id) {
    const permissionResult = await store.from('mailbox_permissions').delete().eq('mailbox_id', mailbox.id);
    if (permissionResult.error) throw new Error(supabaseErrorMessage(permissionResult.error));
    const mailboxResult = await store.from('mailboxes').delete().eq('id', mailbox.id);
    if (mailboxResult.error) throw new Error(supabaseErrorMessage(mailboxResult.error));
  }

  const { data: profile, error: profileError } = await store.from('profiles').select('id,email').eq('email', email).maybeSingle();
  if (profileError) throw new Error(supabaseErrorMessage(profileError));
  const authUserId = profile?.id ?? testUserId;
  if (authUserId) {
    const authResult = await store.auth.admin.deleteUser(authUserId);
    if (authResult.error) throw new Error(supabaseErrorMessage(authResult.error));
  }
  if (profile?.id) {
    const profileResult = await store.from('profiles').delete().eq('id', profile.id);
    if (profileResult.error) throw new Error(supabaseErrorMessage(profileResult.error));
  }

  await deleteProviderMailbox();
}

async function assertCleanup() {
  const store = supabase();
  const [mailbox, profile, authUser] = await Promise.all([
    store.from('mailboxes').select('id').eq('email_address', email),
    store.from('profiles').select('id').eq('email', email),
    testUserId ? store.auth.admin.getUserById(testUserId) : Promise.resolve(null),
  ]);
  if (mailbox.error) throw new Error(supabaseErrorMessage(mailbox.error));
  if (profile.error) throw new Error(supabaseErrorMessage(profile.error));
  if (authUser?.error && !/not found/i.test(authUser.error.message)) throw new Error(supabaseErrorMessage(authUser.error));
  if ((mailbox.data ?? []).length > 0 || (profile.data ?? []).length > 0 || authUser?.data.user) {
    throw new Error('Cleanup verification failed.');
  }
}

async function main() {
  assertEnv();
  const code = await activeSignupCode();
  try {
    if (adoptExistingProviderMailbox) {
      await deleteProviderMailbox();
      await createProviderMailbox();
      console.log(`PROVIDER_SEED_OK ${email}`);
    }

    const registered = await registerAccount(code);
    if (registered.email !== email) throw new Error('Registered email mismatch.');
    if (securityCodeHash(code).length !== 64) throw new Error('Security code hash sanity check failed.');
    console.log(`REGISTER_OK ${email}`);

    const login = await loginAccount();
    if (login.email !== email || !login.accessToken) throw new Error('Login response missing access token.');
    const tokenPayload = JSON.parse(Buffer.from(login.accessToken.split('.')[1] || '', 'base64url').toString('utf8')) as { sub?: string };
    testUserId = tokenPayload.sub ?? null;
    if (!testUserId) throw new Error('Login token is missing the user subject.');
    console.log('LOGIN_OK');

    const mailSession = await openMailSession(login.accessToken);
    if (!mailSession.data.unlocked) throw new Error('Mail session is not unlocked.');
    console.log('MAIL_SESSION_OK');

    const sendResult = await sendTestMail(login.accessToken, mailSession.cookie);
    if (!sendResult.data.sent || !sendResult.data.result?.accepted?.includes(sendTo)) throw new Error('Send test was not accepted by SMTP.');
    console.log(`SEND_OK ${sendTo}`);

    const received = await receiveTestMail(login.accessToken, mailSession.cookie, sendResult.subject);
    if (!received.detail.message.messageId) throw new Error('Received message is missing Message-ID.');
    console.log(`RECEIVE_OK ${received.detail.message.id}`);
  } finally {
    if (retainTestAccount) {
      console.log(`ACCOUNT_RETAINED ${email}`);
    } else {
      await cleanup();
      if (process.env.LOGIMAIL_CRON_KEY) await runMaintenance();
      await assertCleanup();
      console.log('CLEANUP_OK');
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
