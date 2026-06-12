export function requireSupabaseJwt(authorizationHeader?: string) {
  if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) {
    return { ok: false as const, status: 401, error: 'missing_bearer_token' };
  }

  return { ok: true as const, token: authorizationHeader.slice(7).trim() };
}
