import 'server-only';

import { jsonError, requireAuth, type LogimailAction, type VerifiedLogimailUser } from '@/lib/api-boundary';
import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';

export type AdminRole = 'admin' | 'owner';

export type VerifiedAdminUser = VerifiedLogimailUser & {
  adminRole: AdminRole;
  fullName: string | null;
};

const ADMIN_ROLES = new Set<AdminRole>(['admin', 'owner']);

/**
 * Resolve whether the authenticated user holds an approved admin/owner profile
 * inside the LogiMail schema. Authority lives entirely in `logimail.profiles.role`
 * so the control panel at domain.logivn.com is independent from admin.logivn.com.
 */
export async function resolveAdminProfile(user: VerifiedLogimailUser) {
  const store = createLogimailServiceStore();
  if (!store) return { ok: false as const, reason: 'not_configured' as const };

  const { data, error } = await store
    .from('profiles')
    .select('id,email,full_name,role,account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return { ok: false as const, reason: 'forbidden' as const };

  const profile = data as { role?: string; account_status?: string; full_name?: string | null };
  if (profile.account_status !== 'approved') return { ok: false as const, reason: 'forbidden' as const };
  if (!profile.role || !ADMIN_ROLES.has(profile.role as AdminRole)) {
    return { ok: false as const, reason: 'forbidden' as const };
  }

  return {
    ok: true as const,
    user: {
      ...user,
      adminRole: profile.role as AdminRole,
      fullName: typeof profile.full_name === 'string' ? profile.full_name : null,
    } satisfies VerifiedAdminUser,
  };
}

/**
 * Guard for admin-only control-panel API routes. Verifies the Supabase JWT,
 * action policy (dangerous actions still need the confirm header), and that the
 * caller is a LogiMail admin/owner.
 */
export async function requireAdmin(request: Request, action: LogimailAction = 'read') {
  const auth = await requireAuth(request, action);
  if (!auth.ok) return auth;

  let resolved: Awaited<ReturnType<typeof resolveAdminProfile>>;
  try {
    resolved = await resolveAdminProfile(auth.user);
  } catch (error) {
    return {
      ok: false as const,
      response: jsonError('supabase_error', error instanceof Error ? error.message : 'Không đọc được hồ sơ admin.', 502),
    };
  }

  if (!resolved.ok) {
    if (resolved.reason === 'not_configured') {
      return { ok: false as const, response: jsonError('not_configured', 'Thiếu service role để kiểm tra quyền admin LogiMail.', 503) };
    }
    return { ok: false as const, response: jsonError('forbidden', 'Chỉ admin/owner LogiMail mới truy cập được bảng điều khiển này.', 403) };
  }

  return { ok: true as const, token: auth.token, user: resolved.user, action };
}

export function actorLabel(user: VerifiedAdminUser) {
  return user.email ?? user.id;
}
