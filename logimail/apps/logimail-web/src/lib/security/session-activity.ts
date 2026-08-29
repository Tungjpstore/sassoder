import { createLogimailServiceStore, supabaseErrorMessage } from '@/lib/logimail-store';
import {
  normalizeSessionId,
  readSessionIdClaim,
  resolveSessionActivityRpcResult,
  type SessionActivityDecision,
} from '@/lib/security/session-activity-policy';

export async function enforceVerifiedSessionActivity(input: {
  userId: string;
  token?: string | null;
  sessionId?: string | null;
}): Promise<SessionActivityDecision> {
  const sessionId = normalizeSessionId(input.sessionId) ?? readSessionIdClaim(input.token);
  if (!sessionId) return { status: 'invalid_session', reason: 'missing_session_id' };

  const store = createLogimailServiceStore();
  if (!store) return { status: 'unavailable', reason: 'session_activity_not_configured' };

  try {
    const { data, error } = await store.rpc('touch_auth_session_activity', {
      target_session_id: sessionId,
      target_user_id: input.userId,
    });
    return resolveSessionActivityRpcResult(data, error ? { message: supabaseErrorMessage(error) } : null);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'session_activity_rpc_failed',
    };
  }
}
