export type SessionActivityDecision =
  | { status: 'active'; lastActiveAt: string | null }
  | { status: 'idle_expired' | 'revoked'; lastActiveAt: string | null }
  | { status: 'invalid_session'; reason: string }
  | { status: 'unavailable'; reason: string };

type RpcError = { message?: string } | null;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function readSessionIdClaim(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { session_id?: unknown };
    return normalizeSessionId(payload.session_id);
  } catch {
    return null;
  }
}

export function resolveSessionActivityRpcResult(data: unknown, error: RpcError): SessionActivityDecision {
  if (error) return { status: 'unavailable', reason: error.message ?? 'session_activity_rpc_failed' };

  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== 'object') {
    return { status: 'unavailable', reason: 'invalid_session_activity_response' };
  }

  const row = candidate as { allowed?: unknown; status?: unknown; last_active_at?: unknown };
  const lastActiveAt = typeof row.last_active_at === 'string' ? row.last_active_at : null;

  if (row.allowed === true && row.status === 'active') {
    return { status: 'active', lastActiveAt };
  }
  if (row.allowed === false && (row.status === 'idle_expired' || row.status === 'revoked')) {
    return { status: row.status, lastActiveAt };
  }

  return { status: 'unavailable', reason: 'invalid_session_activity_response' };
}
