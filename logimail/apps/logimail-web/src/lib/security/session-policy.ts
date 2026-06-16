// Pure session + MFA policy (Requirement 17.3–17.5). No imports so idle-timeout
// and MFA gating can be unit-tested directly.

export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8h default (R17.5)

/** True when a session has been idle beyond the timeout and must re-authenticate. */
export function isSessionIdleExpired(lastActiveAt: number, now: number = Date.now(), timeoutMs: number = SESSION_IDLE_TIMEOUT_MS): boolean {
  return now - lastActiveAt > timeoutMs;
}

/**
 * Whether a console action must be blocked pending a second factor (R17.3):
 * MFA is enabled for the user but the session has not reached aal2.
 */
export function requiresSecondFactor(input: { mfaEnabled: boolean; aal: string | null | undefined }): boolean {
  if (!input.mfaEnabled) return false;
  return (input.aal ?? 'aal1') !== 'aal2';
}

/** Decode the `aal` claim from a Supabase JWT without verifying the signature. */
export function readAalClaim(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { aal?: string };
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}
