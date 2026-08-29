import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { jsonError } from '@/lib/api-boundary';
import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
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
  return (await readMfaState(userId)).enabled;
}

async function readMfaState(userId: string): Promise<{ enabled: boolean; available: boolean }> {
  try {
    const admin = adminAuthClient();
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return { enabled: false, available: false };
    const factors = (data?.factors ?? []) as Array<{ status?: string }>;
    return { enabled: factors.some((factor) => factor.status === 'verified'), available: true };
  } catch {
    return { enabled: false, available: false };
  }
}

type ConsoleMfaMode = 'off' | 'enrolled' | 'required';

function consoleMfaMode(): ConsoleMfaMode {
  const configured = (process.env.LOGIMAIL_ADMIN_MFA_MODE ?? 'enrolled').trim().toLowerCase();
  return configured === 'off' || configured === 'required' ? configured : 'enrolled';
}

/**
 * Gate a console action behind MFA when enabled (R17.3). Returns a 401-style
 * guard result requiring a second factor when the session is not aal2.
 */
export async function enforceConsoleMfa(input: { userId: string; token: string }): Promise<{ ok: true } | { ok: false; response: Response }> {
  const mode = consoleMfaMode();
  if (mode === 'off') return { ok: true };
  const mfaState = await readMfaState(input.userId);
  if (!mfaState.available) {
    return { ok: false, response: jsonError('mfa_unavailable', 'Không thể kiểm tra trạng thái MFA. Vui lòng thử lại sau.', 503) };
  }
  const aal = readAalClaim(input.token);
  if ((mode === 'required' && aal !== 'aal2') || (mode === 'enrolled' && requiresSecondFactor({ mfaEnabled: mfaState.enabled, aal }))) {
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

/** Revoke a target user's auth sessions and mailbox cookies server-side. */
export async function revokeUserSessions(input: { userId: string; actorId: string }): Promise<{ revoked: boolean; authSessionsRevoked: number; mailboxSessionsRevoked: number }> {
  const db = createLogimailServiceStore();
  if (!db) throw new Error('session_manager_not_configured');
  const { data, error } = await db.rpc('revoke_user_sessions', { target_user_id: input.userId, actor_user_id: input.actorId });
  if (error) throw new Error(supabaseErrorMessage(error));
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('revoke_failed');
  const authSessionsRevoked = Number(row.auth_sessions_revoked ?? 0);
  const mailboxSessionsRevoked = Number(row.mailbox_sessions_revoked ?? 0);

  return {
    revoked: true,
    authSessionsRevoked,
    mailboxSessionsRevoked,
  };
}

export { SESSION_IDLE_TIMEOUT_MS };

export function sessionManagerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'session_manager_error');
  if (message === 'session_manager_not_configured') return { status: 503, text: 'Thiếu service role cho session manager.' };
  if (message.includes('target_user_not_found')) return { status: 404, text: 'Không tìm thấy tài khoản cần thu hồi phiên.' };
  return { status: 502, text: message };
}
