import 'server-only';

import { jsonError, requireAuth, type LogimailAction, type VerifiedLogimailUser } from '@/lib/api-boundary';
import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import {
  ALL_ROLES,
  authorizeRole,
  isLogimailRole,
  isPlatformRole,
  type LogimailRole,
  type PlatformRole,
} from '@/lib/security/rbac';
import { enforceConsoleMfa } from '@/lib/security/session';

export type { LogimailRole } from '@/lib/security/rbac';

export type AdminRole = PlatformRole;

export type VerifiedAdminUser = VerifiedLogimailUser & {
  adminRole: AdminRole;
  fullName: string | null;
};

export type VerifiedRoleUser = VerifiedLogimailUser & {
  logimailRole: LogimailRole;
  fullName: string | null;
};

function configuredPlatformAdmins() {
  return new Set(
    (process.env.LOGIMAIL_PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resolve whether the authenticated user holds an explicit platform role.
 * Workspace ownership never grants access to the global control plane.
 */
export async function resolveAdminProfile(user: VerifiedLogimailUser) {
  const store = createLogimailServiceStore();
  if (!store) return { ok: false as const, reason: 'not_configured' as const };

  const { data, error } = await store
    .from('profiles')
    .select('id,email,full_name,platform_role,account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return { ok: false as const, reason: 'forbidden' as const };

  const profile = data as { platform_role?: string; account_status?: string; full_name?: string | null };
  if (profile.account_status !== 'approved') return { ok: false as const, reason: 'forbidden' as const };
  const allowlisted = Boolean(user.email && configuredPlatformAdmins().has(user.email.toLowerCase()));
  if (!isPlatformRole(profile.platform_role) && !allowlisted) {
    return { ok: false as const, reason: 'forbidden' as const };
  }
  const adminRole: AdminRole = isPlatformRole(profile.platform_role) ? profile.platform_role : 'platform_admin';

  return {
    ok: true as const,
    user: {
      ...user,
      adminRole,
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

  // Rollout-safe MFA: only state-changing console actions are gated, and the
  // default `enrolled` mode affects users who already have a verified factor.
  if (action !== 'read') {
    const mfa = await enforceConsoleMfa({ userId: auth.user.id, token: auth.token });
    if (!mfa.ok) return mfa;
  }

  return { ok: true as const, token: auth.token, user: resolved.user, action };
}

export function actorLabel(user: VerifiedAdminUser | VerifiedRoleUser) {
  return user.email ?? user.id;
}

/**
 * Resolve the approved LogiMail role (owner/admin/member/viewer) for any user.
 * This legacy profile role is not a platform-admin signal. Workspace-sensitive
 * operations must resolve the role from workspace_members for the target object.
 */
export async function resolveRoleProfile(user: VerifiedLogimailUser) {
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
  if (!isLogimailRole(profile.role)) return { ok: false as const, reason: 'forbidden' as const };

  return {
    ok: true as const,
    user: {
      ...user,
      logimailRole: profile.role,
      fullName: typeof profile.full_name === 'string' ? profile.full_name : null,
    } satisfies VerifiedRoleUser,
  };
}

/**
 * Guard for role-scoped console API routes (RBAC_Service, R15). Verifies the JWT
 * + action policy, resolves the caller's LogiMail role, and authorizes it against
 * the `allow` list. A `viewer` is always denied state-changing actions (R15.2).
 * Defaults to allowing every approved role for read access.
 */
export async function requireRole(
  request: Request,
  options: { allow?: LogimailRole[]; action?: LogimailAction } = {},
) {
  const action = options.action ?? 'read';
  const allow = options.allow ?? ALL_ROLES;

  const auth = await requireAuth(request, action);
  if (!auth.ok) return auth;

  let resolved: Awaited<ReturnType<typeof resolveRoleProfile>>;
  try {
    resolved = await resolveRoleProfile(auth.user);
  } catch (error) {
    return {
      ok: false as const,
      response: jsonError('supabase_error', error instanceof Error ? error.message : 'Không đọc được hồ sơ người dùng.', 502),
    };
  }

  if (!resolved.ok) {
    if (resolved.reason === 'not_configured') {
      return { ok: false as const, response: jsonError('not_configured', 'Thiếu service role để kiểm tra quyền LogiMail.', 503) };
    }
    return { ok: false as const, response: jsonError('forbidden', 'Tài khoản chưa được duyệt hoặc không có quyền truy cập.', 403) };
  }

  const decision = authorizeRole(resolved.user.logimailRole, action, allow);
  if (!decision.ok) {
    const message =
      decision.reason === 'viewer_readonly'
        ? 'Vai trò viewer chỉ được xem, không thể thực hiện thao tác thay đổi.'
        : 'Vai trò hiện tại không được phép thực hiện hành động này.';
    return { ok: false as const, response: jsonError('forbidden', message, 403) };
  }

  return { ok: true as const, token: auth.token, user: resolved.user, action };
}

/** Convenience guard: admin-console functions require owner/admin (R15.4). */
export function requireAdminRole(request: Request, action: LogimailAction = 'read') {
  return requireAdmin(request, action);
}
