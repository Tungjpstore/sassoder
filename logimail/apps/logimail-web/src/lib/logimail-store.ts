import { createClient } from '@supabase/supabase-js';

export type JsonObject = Record<string, unknown>;

export function createLogimailStore(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'logimail',
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

let serviceStore: ReturnType<typeof createLogimailStore> | null = null;

export function createLogimailServiceStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceRoleKey) return null;

  if (!serviceStore) {
    serviceStore = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'logimail',
      },
    });
  }

  return serviceStore;
}

export async function readJsonObject(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error('invalid_json');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('invalid_json_object');
  }

  return body as JsonObject;
}

export function stringField(body: JsonObject, key: string, options: { required?: boolean; max?: number } = {}) {
  const value = body[key];
  if (typeof value !== 'string') {
    if (options.required) throw new Error(`missing_${key}`);
    return null;
  }

  const cleaned = value.trim();
  if (!cleaned) {
    if (options.required) throw new Error(`missing_${key}`);
    return null;
  }

  if (options.max && cleaned.length > options.max) throw new Error(`invalid_${key}`);
  return cleaned;
}

export function optionalNumberField(body: JsonObject, key: string, options: { min: number; max: number }) {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) throw new Error(`invalid_${key}`);
  return parsed;
}

export function normalizeSlug(value: string) {
  const slug = value.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error('invalid_slug');
  return slug;
}

export function normalizeDomain(value: string) {
  const domain = value.toLowerCase();
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) throw new Error('invalid_domain');
  return domain;
}

export function normalizeEmail(value: string) {
  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('invalid_email');
  return email;
}

export function normalizeMailboxLocalPart(value: string) {
  const localPart = value.trim().toLowerCase();
  if (
    localPart.length < 1 ||
    localPart.length > 64 ||
    localPart.includes('..') ||
    !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(localPart)
  ) {
    throw new Error('invalid_local_part');
  }
  return localPart;
}

export function normalizeUuid(value: string, field = 'id') {
  const uuid = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error(`invalid_${field}`);
  }
  return uuid;
}

export function normalizeMailboxPermission(value: string | null) {
  const permission = value ?? 'read';
  if (!['read', 'send', 'admin'].includes(permission)) throw new Error('invalid_permission');
  return permission;
}

export function supabaseErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return 'Supabase request failed.';
  return error.code ? `${error.message ?? 'Supabase request failed.'} (${error.code})` : error.message ?? 'Supabase request failed.';
}

export function buildSafeDnsPlan(domain: string, vpsIp: string, mailHostname: string) {
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
  const normalizedMailHostname = mailHostname.toLowerCase().replace(/\.$/, '');
  const records: Array<{ type: string; name: string; content: string; priority?: number; proxied?: boolean }> = [];

  // A shared mail host such as mail.logivn.com is managed in its own zone. Do
  // not attempt to create that A record inside each customer domain's zone.
  if (normalizedMailHostname === normalizedDomain || normalizedMailHostname.endsWith(`.${normalizedDomain}`)) {
    records.push({ type: 'A', name: normalizedMailHostname, content: vpsIp, proxied: false });
  }
  records.push(
    { type: 'MX', name: domain, content: mailHostname, priority: 10 },
    { type: 'TXT', name: domain, content: `v=spf1 mx ip4:${vpsIp} -all` },
    { type: 'TXT', name: `_dmarc.${domain}`, content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}; fo=1` },
    { type: 'TXT', name: `_mta-sts.${domain}`, content: 'v=STSv1; id=logimail-v1' },
    { type: 'TXT', name: `_smtp._tls.${domain}`, content: `v=TLSRPTv1; rua=mailto:postmaster@${domain}` },
  );
  return records;
}
