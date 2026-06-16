'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { logimailPasswordLogin, readLoginCooldownSeconds, storeLoginCooldown } from '@/lib/auth-login-client';
import { normalizeAuthError } from '@/lib/auth-errors';

export function ControlLoginForm({ redirectTo = '/' }: Readonly<{ redirectTo?: string }>) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setRetryAfterSeconds((current) => Math.max(current, readLoginCooldownSeconds(normalizedEmail)));
  }, [email]);

  useEffect(() => {
    if (retryAfterSeconds <= 0 || loading) return undefined;
    const timer = window.setTimeout(() => setRetryAfterSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds, loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const storedRetry = readLoginCooldownSeconds(normalizedEmail);
    if (storedRetry > 0) {
      setRetryAfterSeconds(storedRetry);
      setError(`Bạn thao tác quá nhanh hoặc thử đăng nhập quá nhiều lần. Vui lòng chờ khoảng ${storedRetry} giây rồi thử lại.`);
      return;
    }
    if (retryAfterSeconds > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      await logimailPasswordLogin({ email: normalizedEmail, password });
      router.push(redirectTo);
      router.refresh();
    } catch (signInError) {
      const authError = normalizeAuthError(signInError, 'Không đăng nhập được.');
      storeLoginCooldown(normalizedEmail, authError.retryAfterSeconds);
      setError(authError.message);
      setRetryAfterSeconds(authError.retryAfterSeconds);
      setLoading(false);
    }
  }

  return (
    <form className="control-login-form" onSubmit={submit}>
      {error ? <p className="form-alert danger" role="alert">{error}</p> : null}
      <label className="form-field">
        <span>Email nội bộ</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="ten.ban@logivn.com"
          required
        />
      </label>
      <label className="form-field">
        <span>Mật khẩu</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <button className="button-link button-reset primary" type="submit" disabled={loading || retryAfterSeconds > 0 || !email || !password}>
        {loading ? <Loader2 size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
        <span>{loading ? 'Đang đăng nhập' : retryAfterSeconds > 0 ? `Thử lại sau ${retryAfterSeconds}s` : 'Đăng nhập điều khiển'}</span>
      </button>
      <p className="control-login-hint">Khu vực này chỉ dành cho admin/owner LogiMail và dùng quyền riêng của hệ thống mail.</p>
      <p className="control-login-hint"><a href="https://mail.logivn.com/auth/forgot-password">Quên mật khẩu?</a></p>
    </form>
  );
}
