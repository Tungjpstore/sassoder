import { jsonError, jsonOk, requireAuth, requireServerConfig } from '@/lib/api-boundary';
import { createLogimailServiceStore } from '@/lib/logimail-store';
import { enforceRateLimit } from '@/lib/rate-limit';
import { trustedSsoRequestContext } from '@/lib/sso-handoff';
import { secureSsoResponse } from '@/lib/sso-route-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'auth-sso-revoke', 15, 60_000);
  if (limited) return secureSsoResponse(limited);

  try {
    trustedSsoRequestContext(request);
  } catch {
    return secureSsoResponse(jsonError('invalid_origin', 'Yêu cầu đăng xuất không hợp lệ.', 403));
  }

  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return secureSsoResponse(auth.response);
  const missing = requireServerConfig(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length > 0) return secureSsoResponse(jsonError('not_configured', 'Dịch vụ đăng xuất chưa được cấu hình đầy đủ.', 503));
  const store = createLogimailServiceStore();
  if (!store) return secureSsoResponse(jsonError('not_configured', 'Dịch vụ đăng xuất chưa được cấu hình đầy đủ.', 503));

  const { data, error } = await store.rpc('revoke_sso_handoffs', { target_user_id: auth.user.id });
  if (error) return secureSsoResponse(jsonError('sso_revoke_failed', 'Không thể thu hồi chuyển phiên đăng nhập.', 503));
  return secureSsoResponse(jsonOk({ revoked: typeof data === 'number' ? data : 0 }));
}
