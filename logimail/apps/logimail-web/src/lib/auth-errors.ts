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

function isWeakPasswordError(error: unknown) {
  const code = readStringProperty(error, 'code')?.toLowerCase() ?? '';
  const message = error instanceof Error ? error.message.toLowerCase() : readStringProperty(error, 'message')?.toLowerCase() ?? '';
  return code.includes('weak_password') || message.includes('password should be') || message.includes('weak password');
}

function isSafeClientError(error: unknown) {
  return error instanceof Error && error.name === 'AuthClientError';
}

export function authCallbackMessage(code: string | null) {
  if (!code) return null;
  if (code === 'invalid_auth_host') return 'Liên kết đăng nhập không thuộc host LogiMail được phép.';
  if (code === 'missing_supabase_config') return 'Dịch vụ đăng nhập chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên.';
  if (code === 'access_denied') return 'Yêu cầu đăng nhập đã bị từ chối hoặc hết hiệu lực.';
  if (code === 'auth_callback_failed') return 'Không thể hoàn tất liên kết đăng nhập. Vui lòng yêu cầu một liên kết mới.';
  return 'Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.';
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

  if (isWeakPasswordError(error)) {
    return { message: 'Mật khẩu cần dài ít nhất 10 ký tự và có cả chữ lẫn số.', retryAfterSeconds: 0 };
  }

  if (error instanceof Error && error.message === 'missing_supabase_browser_config') {
    return { message: 'LogiMail chưa nhận đủ cấu hình Supabase ở trình duyệt. Vui lòng báo kỹ thuật kiểm tra bản deploy.', retryAfterSeconds: 0 };
  }

  // Server/provider errors are intentionally collapsed. Browser API errors
  // already carry a message sanitized by a LogiMail route.
  return { message: isSafeClientError(error) && error instanceof Error ? error.message : fallback, retryAfterSeconds: 0 };
}
