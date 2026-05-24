export function authErrorMessage(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown; status?: unknown };
    return [record.message, record.code, record.status].filter(Boolean).join(" ");
  }
  return String(error);
}

export function isInvalidRefreshTokenError(error: unknown) {
  return /invalid refresh token|refresh token not found|refresh_token_not_found/i.test(authErrorMessage(error));
}
