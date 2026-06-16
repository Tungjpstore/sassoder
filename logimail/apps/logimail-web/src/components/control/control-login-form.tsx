'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { normalizeAuthError } from '@/lib/auth-errors';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export function ControlLoginForm({ redirectTo = '/' }: Readonly<{ redirectTo?: string }>) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0 || loading) return undefined;
    const timer = window.setTimeout(() => setRetryAfterSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds, loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryAfterSeconds > 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw signInError;
      router.push(redirectTo);
      router.refresh();
    } catch (signInError) {
      const authError = normalizeAuthError(signInError, 'Không đăng nhập được.');
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
      <p className="control-login-hint">Khu vực này chỉ dành cho admin/owner LogiMail. Tài khoản thường sẽ được chuyển về trang quản lý domain.</p>
      <p className="control-login-hint"><a href="/auth/forgot-password">Quên mật khẩu?</a></p>
    </form>
  );
}
