import test from 'node:test';
import assert from 'node:assert/strict';

const { authCallbackMessage, normalizeAuthError } = await import('./auth-errors.ts');

test('maps Supabase 429 auth errors to a local cooldown message', () => {
  const result = normalizeAuthError({ status: 429, message: 'Request rate limit reached' });
  assert.equal(result.retryAfterSeconds, 60);
  assert.match(result.message, /thử đăng nhập quá nhiều lần/i);
  assert.match(result.message, /60 giây/);
});

test('maps Supabase auth rate messages without status', () => {
  const result = normalizeAuthError(new Error('Request rate limit reached'));
  assert.equal(result.retryAfterSeconds, 60);
  assert.match(result.message, /thao tác quá nhanh/i);
});

test('maps invalid credentials to a safe Vietnamese message', () => {
  const result = normalizeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' });
  assert.equal(result.retryAfterSeconds, 0);
  assert.equal(result.message, 'Email hoặc mật khẩu chưa đúng.');
});

test('maps missing browser config to an operator-facing message', () => {
  const result = normalizeAuthError(new Error('missing_supabase_browser_config'));
  assert.equal(result.retryAfterSeconds, 0);
  assert.match(result.message, /cấu hình Supabase/);
});

test('collapses unknown provider errors to the caller fallback', () => {
  const result = normalizeAuthError(new Error('Unexpected auth failure'));
  assert.equal(result.retryAfterSeconds, 0);
  assert.equal(result.message, 'Không đăng nhập được.');
});

test('keeps messages already sanitized by a LogiMail API client error', () => {
  const error = new Error('Mã bảo mật không hợp lệ.');
  error.name = 'AuthClientError';
  const result = normalizeAuthError(error, 'Không đổi được mật khẩu.');
  assert.equal(result.message, 'Mã bảo mật không hợp lệ.');
});

test('maps callback codes without rendering provider error text', () => {
  assert.match(authCallbackMessage('auth_callback_failed'), /liên kết đăng nhập/i);
  assert.match(authCallbackMessage('crafted-provider-error'), /phiên xác thực/i);
  assert.equal(authCallbackMessage(null), null);
});
