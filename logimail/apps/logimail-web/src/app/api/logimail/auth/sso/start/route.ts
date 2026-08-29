import { jsonError, jsonOk, requireAuth, requireServerConfig } from '@/lib/api-boundary';
import { createLogimailServiceStore, readJsonObject, stringField } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  assertPkceChallenge,
  createSsoHandoffTicket,
  hashSsoState,
  normalizeSsoSurface,
  resolveSsoTarget,
  safeSsoNextPath,
  trustedSsoRequestContext,
} from '@/lib/sso-handoff';
import { secureSsoResponse } from '@/lib/sso-route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(code: string, message: string, status = 400) {
  return secureSsoResponse(jsonError(code, message, status));
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'auth-sso-start', 15, 60_000);
  if (limited) return secureSsoResponse(limited);

  let context: ReturnType<typeof trustedSsoRequestContext>;
  try {
    context = trustedSsoRequestContext(request);
  } catch {
    return failure('invalid_origin', 'Yêu cầu chuyển phiên không hợp lệ.', 403);
  }

  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return secureSsoResponse(auth.response);

  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'LOGIMAIL_SSO_SECRET']);
  if (missing.length > 0) return failure('not_configured', 'Dịch vụ chuyển phiên chưa được cấu hình đầy đủ.', 503);
  const store = createLogimailServiceStore();
  if (!store) return failure('not_configured', 'Dịch vụ chuyển phiên chưa được cấu hình đầy đủ.', 503);

  try {
    const body = await readJsonObject(request);
    const target = normalizeSsoSurface(stringField(body, 'target', { required: true, max: 16 }) ?? '');
    const state = stringField(body, 'state', { required: true, max: 256 }) ?? '';
    const codeChallenge = assertPkceChallenge(stringField(body, 'codeChallenge', { required: true, max: 128 }) ?? '');
    const next = safeSsoNextPath(target, stringField(body, 'next', { max: 4096 }), context.local);
    const resolved = resolveSsoTarget({ sourceHost: context.hostname, sourceOrigin: context.origin, target });
    const ticket = createSsoHandoffTicket({ sourceHost: context.hostname, targetHost: resolved.targetHost });

    const { error } = await store.from('sso_handoffs').insert({
      id: ticket.id,
      nonce_hash: ticket.nonceHash,
      state_hash: hashSsoState(state),
      user_id: auth.user.id,
      source_host: context.hostname,
      target_host: resolved.targetHost,
      target_path: next,
      code_challenge: codeChallenge,
      status: 'active',
      expires_at: ticket.expiresAt.toISOString(),
    });
    if (error) throw new Error('sso_handoff_insert_failed');

    const redirectUrl = new URL('/sso/complete', resolved.targetOrigin);
    redirectUrl.searchParams.set('ticket', ticket.ticket);
    return secureSsoResponse(jsonOk({ redirectUrl: redirectUrl.toString() }));
  } catch {
    return failure('sso_start_failed', 'Không thể bắt đầu chuyển phiên đăng nhập.', 400);
  }
}
