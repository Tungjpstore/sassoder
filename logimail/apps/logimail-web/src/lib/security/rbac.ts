// Pure RBAC decision logic (Requirement 15). No project-alias / server-only
// imports so the role matrix can be unit-tested directly.

export type LogimailRole = 'owner' | 'admin' | 'member' | 'viewer';
export type LogimailAction = 'read' | 'write' | 'dangerous';

export const ALL_ROLES: LogimailRole[] = ['owner', 'admin', 'member', 'viewer'];

/** Admin-console roles: only owner/admin may operate domain.logivn.com admin functions (R15.4). */
export const ADMIN_ROLES: LogimailRole[] = ['owner', 'admin'];

/** A write or dangerous action mutates state; read is the only non-state-changing action. */
export function isStateChangingAction(action: LogimailAction): boolean {
  return action !== 'read';
}

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; reason: 'role_not_allowed' | 'viewer_readonly' };

/**
 * Decide whether `role` may perform `action` given the set of `allow`ed roles.
 *  - Role must be in the allow-list (R15.1, R15.4).
 *  - A `viewer` may never perform a state-changing action, even if allow-listed (R15.2).
 */
export function authorizeRole(role: LogimailRole, action: LogimailAction, allow: LogimailRole[]): AuthorizeResult {
  if (!allow.includes(role)) return { ok: false, reason: 'role_not_allowed' };
  if (role === 'viewer' && isStateChangingAction(action)) return { ok: false, reason: 'viewer_readonly' };
  return { ok: true };
}

export function isLogimailRole(value: unknown): value is LogimailRole {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}
