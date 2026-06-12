import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';

export type LogimailAction = 'read' | 'write' | 'dangerous';

export type VerifiedLogimailUser = {
  id: string;
  email: string | null;
  role: string | null;
};

let supabaseAuthClient: ReturnType<typeof createClient> | null = null;

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function requireServerConfig(keys: string[]) {
  const missing = keys.filter((key) => !process.env[key]);
  return missing;
}

function getSupabaseAuthClient() {
  if (!supabaseAuthClient) {
    supabaseAuthClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseAuthClient;
}

function normalizeUser(user: User): VerifiedLogimailUser {
  const role = typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null;
  return {
    id: user.id,
    email: user.email ?? null,
    role,
  };
}

function enforceActionPolicy(request: Request, action: LogimailAction) {
  if (action !== 'dangerous') return null;
  const confirmation = request.headers.get('x-logimail-confirm') ?? '';
  if (confirmation !== 'I_UNDERSTAND_LOGIMAIL_RISK') {
    return jsonError(
      'confirmation_required',
      'Hành động nguy hiểm cần header x-logimail-confirm=I_UNDERSTAND_LOGIMAIL_RISK.',
      428,
    );
  }
  return null;
}

export async function requireAuth(request: Request, action: LogimailAction = 'read') {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, response: jsonError('unauthorized', 'Thiếu Supabase JWT bearer token.', 401) };
  }

  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  if (missing.length > 0) {
    return { ok: false as const, response: jsonError('not_configured', `Thiếu env server-side: ${missing.join(', ')}`, 503) };
  }

  const policyResponse = enforceActionPolicy(request, action);
  if (policyResponse) {
    return { ok: false as const, response: policyResponse };
  }

  const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, response: jsonError('unauthorized', 'Supabase JWT không hợp lệ hoặc đã hết hạn.', 401) };
  }

  return { ok: true as const, token, user: normalizeUser(data.user), action };
}
