import 'server-only';

import { billionMailBridgeMailboxEndpoint, billionMailProviderReadiness, readBillionMailProviderConfig } from '@/lib/billionmail-config';

type BillionMailJson = {
  ok?: boolean;
  success?: boolean;
  code?: number;
  msg?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
  data?: unknown;
};

export type MailboxInput = {
  email: string;
  localPart: string;
  domain: string;
  password: string;
  displayName?: string | null;
  quotaMb?: number;
};

export function assertBillionMailProviderConfigured() {
  const readiness = billionMailProviderReadiness();
  if (!readiness.ready) throw new Error(`missing_billionmail_config:${readiness.missing.join(',')}`);
  return readBillionMailProviderConfig();
}

export function assertBillionMailDirectProviderConfigured() {
  const config = readBillionMailProviderConfig();
  const missing = [!config.baseUrl ? 'BILLIONMAIL_BASE_URL' : null, !config.apiToken ? 'BILLIONMAIL_API_TOKEN' : null].filter(Boolean);
  if (missing.length) throw new Error(`missing_billionmail_direct_config:${missing.join(',')}`);
  return config;
}

function endpoint(path: string) {
  const config = assertBillionMailDirectProviderConfigured();
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

  if (!response.ok || body?.success === false || body?.ok === false) {
    const message = body?.msg || body?.message || body?.error?.message || `BillionMail HTTP ${response.status}`;
    throw new Error(`billionmail_provider_error:${message}`);
  }

  return body;
}

function providerTimeoutMs() {
  const configured = Number(process.env.LOGIMAIL_BILLIONMAIL_TIMEOUT_MS ?? 15000);
  if (!Number.isFinite(configured)) return 15000;
  return Math.min(60000, Math.max(1000, Math.round(configured)));
}

async function fetchProvider(input: string | URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('billionmail_provider_error:timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function billionMailFetch(path: string, init: RequestInit) {
  const config = assertBillionMailDirectProviderConfigured();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('authorization', `Bearer ${config.apiToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetchProvider(endpoint(path), { ...init, headers, cache: 'no-store' });
  return parseResponse(response);
}

export function isBillionMailMailboxExistsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!message.startsWith('billionmail_provider_error:')) return false;
  const normalized = message.toLowerCase();
  return [
    /mailbox\s+\S+\s+already exists/,
    /mailbox[\s\S]*already exists/,
    /mailbox[\s\S]*exists/,
    /already exists/,
    /duplicate/,
    /unique/,
    /đã tồn tại/,
    /tồn tại/,
    /已经存在/,
  ].some((pattern) => pattern.test(normalized));
}

export async function createBillionMailMailboxDirect(input: MailboxInput) {
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

export async function updateBillionMailMailboxPasswordDirect(input: MailboxInput) {
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

export async function deleteBillionMailMailboxDirect(email: string) {
  return billionMailFetch('/mailbox/delete', {
    method: 'POST',
    body: JSON.stringify({ emails: [email] }),
  });
}

async function bridgeFetch(action: 'create' | 'update' | 'delete', payload: unknown) {
  const config = assertBillionMailProviderConfigured();
  if (!config.bridgeBaseUrl || !config.bridgeToken) throw new Error('missing_billionmail_config:BILLIONMAIL_BRIDGE_BASE_URL,BILLIONMAIL_BRIDGE_TOKEN');

  const response = await fetchProvider(billionMailBridgeMailboxEndpoint(config.bridgeBaseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${config.bridgeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, payload }),
    cache: 'no-store',
  });
  return parseResponse(response);
}

function shouldUseDirectProvider() {
  const config = readBillionMailProviderConfig();
  return Boolean(config.baseUrl && config.apiToken);
}

export async function createBillionMailMailbox(input: MailboxInput) {
  if (shouldUseDirectProvider()) return createBillionMailMailboxDirect(input);
  return bridgeFetch('create', input);
}

export async function updateBillionMailMailboxPassword(input: MailboxInput) {
  if (shouldUseDirectProvider()) return updateBillionMailMailboxPasswordDirect(input);
  return bridgeFetch('update', input);
}

export async function deleteBillionMailMailbox(email: string) {
  if (shouldUseDirectProvider()) return deleteBillionMailMailboxDirect(email);
  return bridgeFetch('delete', { email });
}

export function publicBillionMailError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'billionmail_provider_error');
  if (message.startsWith('missing_billionmail_config:') || message.startsWith('missing_billionmail_direct_config:')) return 'Chưa cấu hình token API BillionMail để tạo mailbox thật.';
  if (message.startsWith('billionmail_provider_error:')) return 'BillionMail chưa tạo được mailbox. Hãy thử lại hoặc báo admin.';
  return message;
}
