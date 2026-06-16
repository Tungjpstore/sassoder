import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { writeAuditLog } from '@/lib/audit-log';
import { jsonError } from '@/lib/api-boundary';
import {
  isSessionIdleExpired,
  readAalClaim,
  requiresSecondFactor,
  SESSION_IDLE_TIMEOUT_MS,
} from '@/lib/security/session-policy';

// Session_Manager + MFA_Service (Requirement 17.3–17.5): enforce MFA for console
// actions, revoke sessions, and apply idle-timeout.

function adminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceRoleKey) throw new Error('session_manager_not_configured');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Whether MFA is enabled (a verified factor exists) for a user. */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  try {
    const admin = adminAuthClient();
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return false;
    const factors = (data?.factors ?? []) as Array<{ status?: string }>;
    return factors.some((factor) => factor.status === 'verified');
  } catch {
    return false;
  }
}

/**
 * Gate a console action behind MFA when enabled (R17.3). Returns a 401-style
 * guard result requiring a second factor when the session is not aal2.
 */
export async function enforceConsoleMfa(input: { userId: string; token: string }): Promise<{ ok: true } | { ok: false; response: Response }> {
  const mfaEnabled = await isMfaEnabled(input.userId);
  const aal = readAalClaim(input.token);
  if (requiresSecondFactor({ mfaEnabled, aal })) {
    return { ok: false, response: jsonError('mfa_required', 'Cần xác thực yếu tố thứ hai (MFA) trước khi thao tác console.', 401) };
  }
  return { ok: true };
}

/** Idle-timeout guard for a session's last-active timestamp (R17.5). */
export function enforceIdleTimeout(lastActiveAt: number, now: number = Date.now()): { ok: true } | { ok: false; response: Response } {
  if (isSessionIdleExpired(lastActiveAt, now)) {
    return { ok: false, response: jsonError('session_expired', 'Phiên đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', 401) };
  }
  return { ok: true };
}

/** Revoke a user's session globally so subsequent requests are rejected (R17.4). */
export async function revokeUserSessions(input: { userId: string; token: string; actor: string; actorId?: string | null }): Promise<{ revoked: boolean }> {
  const admin = adminAuthClient();
  // Global sign-out invalidates the user's refresh tokens for the given JWT.
  const { error } = await admin.auth.admin.signOut(input.token, 'global');
  if (error) throw new Error(error.message ?? 'revoke_failed');

  await writeAuditLog({
    actorId: input.actorId ?? input.actor,
    action: 'logimail.session_revoked',
    targetType: 'user',
    targetId: input.userId,
    metadata: {},
  });
  return { revoked: true };
}

export { SESSION_IDLE_TIMEOUT_MS };

export function sessionManagerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'session_manager_error');
  if (message === 'session_manager_not_configured') return { status: 503, text: 'Thiếu service role cho session manager.' };
  return { status: 502, text: message };
}
