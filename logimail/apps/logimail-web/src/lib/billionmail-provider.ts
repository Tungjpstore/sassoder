import 'server-only';

type BillionMailJson = {
  success?: boolean;
  code?: number;
  msg?: string;
  message?: string;
  data?: unknown;
};

type MailboxInput = {
  email: string;
  localPart: string;
  domain: string;
  password: string;
  displayName?: string | null;
  quotaMb?: number;
};

function readConfig() {
  const baseUrl = process.env.BILLIONMAIL_BASE_URL?.trim() ?? '';
  const apiToken = process.env.BILLIONMAIL_API_TOKEN?.trim() || process.env.BILLIONMAIL_API_KEY?.trim() || '';
  const apiPrefix = process.env.BILLIONMAIL_API_PREFIX?.trim() || '/api';
  return { baseUrl, apiToken, apiPrefix };
}

export function assertBillionMailProviderConfigured() {
  const config = readConfig();
  const missing = [!config.baseUrl ? 'BILLIONMAIL_BASE_URL' : null, !config.apiToken ? 'BILLIONMAIL_API_TOKEN' : null].filter(Boolean);
  if (missing.length) throw new Error(`missing_billionmail_config:${missing.join(',')}`);
  return config;
}

function endpoint(path: string) {
  const config = assertBillionMailProviderConfigured();
  const prefix = config.apiPrefix === '/' ? '' : `/${config.apiPrefix.replace(/^\/+|\/+$/g, '')}`;
  return new URL(`${prefix}/${path.replace(/^\/+/, '')}`, config.baseUrl).toString();
}

function quotaBytes(quotaMb = 1024) {
  return Math.max(128, Math.min(102400, Math.round(quotaMb))) * 1024 * 1024;
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let body: BillionMailJson | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as BillionMailJson;
    } catch {
      body = { success: response.ok, msg: text.slice(0, 500) };
    }
  }

  if (!response.ok || body?.success === false) {
    const message = body?.msg || body?.message || `BillionMail HTTP ${response.status}`;
    throw new Error(`billionmail_provider_error:${message}`);
  }

  return body;
}

async function billionMailFetch(path: string, init: RequestInit) {
  const config = assertBillionMailProviderConfigured();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${config.apiToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(endpoint(path), { ...init, headers, cache: 'no-store' });
  return parseResponse(response);
}

export async function createBillionMailMailbox(input: MailboxInput) {
  return billionMailFetch('/mailbox/create', {
    method: 'POST',
    body: JSON.stringify({
      domain: input.domain,
      local_part: input.localPart,
      full_name: input.displayName || input.localPart,
      password: input.password,
      active: 1,
      isAdmin: 0,
      quota: quotaBytes(input.quotaMb),
      quota_active: 1,
    }),
  });
}

export async function updateBillionMailMailboxPassword(input: MailboxInput) {
  return billionMailFetch('/mailbox/update', {
    method: 'POST',
    body: JSON.stringify({
      domain: input.domain,
      local_part: input.localPart,
      full_name: input.displayName || input.localPart,
      password: input.password,
      active: 1,
      isAdmin: 0,
      quota: quotaBytes(input.quotaMb),
      quota_active: 1,
    }),
  });
}

export async function deleteBillionMailMailbox(email: string) {
  return billionMailFetch('/mailbox/delete', {
    method: 'POST',
    body: JSON.stringify({ emails: [email] }),
  });
}

export function publicBillionMailError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'billionmail_provider_error');
  if (message.startsWith('missing_billionmail_config:')) return 'Chưa cấu hình token API BillionMail để tạo mailbox thật.';
  if (message.startsWith('billionmail_provider_error:')) return 'BillionMail chưa tạo được mailbox. Hãy thử lại hoặc báo admin.';
  return message;
}
