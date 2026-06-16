export type AuthUiError = {
  message: string;
  retryAfterSeconds: number;
};

const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 60;

function readNumberProperty(error: unknown, key: string) {
  if (!error || typeof error !== 'object' || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringProperty(error: unknown, key: string) {
  if (!error || typeof error !== 'object' || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function isRateLimitError(error: unknown) {
  const status = readNumberProperty(error, 'status');
  const code = readStringProperty(error, 'code')?.toLowerCase() ?? '';
  const message = error instanceof Error ? error.message.toLowerCase() : readStringProperty(error, 'message')?.toLowerCase() ?? '';
  return status === 429 || code.includes('rate') || message.includes('rate limit') || message.includes('too many requests');
}

function isInvalidCredentialsError(error: unknown) {
  const code = readStringProperty(error, 'code')?.toLowerCase() ?? '';
  const message = error instanceof Error ? error.message.toLowerCase() : readStringProperty(error, 'message')?.toLowerCase() ?? '';
  return code === 'invalid_credentials' || message.includes('invalid login credentials');
}

export function normalizeAuthError(error: unknown, fallback = 'Không đăng nhập được.'): AuthUiError {
  if (isRateLimitError(error)) {
    const retryAfterSeconds = readNumberProperty(error, 'retryAfter') ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS;
    return {
      message: `Bạn thao tác quá nhanh hoặc thử đăng nhập quá nhiều lần. Vui lòng chờ khoảng ${retryAfterSeconds} giây rồi thử lại.`,
      retryAfterSeconds,
    };
  }

  if (isInvalidCredentialsError(error)) {
    return { message: 'Email hoặc mật khẩu chưa đúng.', retryAfterSeconds: 0 };
  }

  if (error instanceof Error && error.message === 'missing_supabase_browser_config') {
    return { message: 'LogiMail chưa nhận đủ cấu hình Supabase ở trình duyệt. Vui lòng báo kỹ thuật kiểm tra bản deploy.', retryAfterSeconds: 0 };
  }

  return { message: error instanceof Error ? error.message : fallback, retryAfterSeconds: 0 };
}
