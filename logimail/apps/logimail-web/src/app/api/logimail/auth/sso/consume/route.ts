import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

import { jsonError, jsonOk, requireServerConfig } from '@/lib/api-boundary';
import { createLogimailServiceStore, readJsonObject, stringField } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ssoStateCookieName, trustedSsoRequestContext, verifySsoBrowserState, verifySsoHandoffTicket } from '@/lib/sso-handoff';
import { clearSsoStateCookie, secureSsoResponse } from '@/lib/sso-route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

function failure(code: string, message: string, status = 400, local = false) {
  return clearSsoStateCookie(secureSsoResponse(jsonError(code, message, status)), local);
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'auth-sso-consume', 15, 60_000);
  if (limited) return secureSsoResponse(limited);

  let context: ReturnType<typeof trustedSsoRequestContext>;
  try {
    context = trustedSsoRequestContext(request);
  } catch {
    return secureSsoResponse(jsonError('invalid_origin', 'Yêu cầu chuyển phiên không hợp lệ.', 403));
  }

  const local = context.local;
  const stateCookie = request.cookies.get(ssoStateCookieName(local))?.value ?? '';
  try {
    const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'LOGIMAIL_SSO_SECRET']);
    if (missing.length > 0) return failure('not_configured', 'Dịch vụ chuyển phiên chưa được cấu hình đầy đủ.', 503, local);
    const store = createLogimailServiceStore();
    if (!store) return failure('not_configured', 'Dịch vụ chuyển phiên chưa được cấu hình đầy đủ.', 503, local);

    const body = await readJsonObject(request);
    const ticketValue = stringField(body, 'ticket', { required: true, max: 2048 }) ?? '';
    const state = verifySsoBrowserState(stateCookie, { targetHost: context.hostname });
    const ticket = verifySsoHandoffTicket(ticketValue, { targetHost: context.hostname });
    if (ticket.sourceHost !== state.sourceHost || ticket.targetHost !== state.targetHost) throw new Error('sso_context_mismatch');

    const { data, error } = await store.rpc('consume_sso_handoff', {
      target_handoff_id: ticket.id,
      target_nonce_hash: ticket.nonceHash,
      target_state_hash: state.stateHash,
      expected_target_host: context.hostname,
      expected_code_challenge: state.codeChallenge,
    });
    if (error) throw new Error('sso_handoff_consume_failed');
    const consumed = Array.isArray(data) ? data[0] : data;
    if (!consumed || typeof consumed !== 'object') throw new Error('sso_handoff_replay');
    const consumedRecord = consumed as Record<string, unknown>;
    if (
      consumedRecord.source_host !== state.sourceHost
      || consumedRecord.target_host !== state.targetHost
      || consumedRecord.target_path !== state.next
      || typeof consumedRecord.user_id !== 'string'
    ) throw new Error('sso_context_mismatch');

    const userId = consumedRecord.user_id;
    const { data: userData, error: userError } = await store.auth.admin.getUserById(userId);
    if (userError || !userData.user?.email) throw new Error('sso_user_unavailable');

    const { data: linkData, error: linkError } = await store.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error('sso_magiclink_failed');

    const authCookies: CookieToSet[] = [];
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        db: { schema: 'logimail' },
        auth: { autoRefreshToken: false, persistSession: false },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            authCookies.push(...cookiesToSet);
          },
        },
      },
    );
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (sessionError || !sessionData.session || sessionData.user?.id !== userId) throw new Error('sso_session_failed');

    const response = jsonOk({ next: state.next });
    for (const cookie of authCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
    clearSsoStateCookie(response, local);
    return secureSsoResponse(response);
  } catch {
    return failure('sso_consume_failed', 'Không thể hoàn tất chuyển phiên đăng nhập. Vui lòng thử lại.', 409, local);
  }
}
