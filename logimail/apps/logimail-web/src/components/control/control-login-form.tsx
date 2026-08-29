'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { CircleAlert, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { clearLoginCooldown, logimailGoogleLogin, logimailPasswordLogin, readLoginCooldownSeconds, storeLoginCooldown } from '@/lib/auth-login-client';
import { normalizeAuthError } from '@/lib/auth-errors';
import styles from '@/components/auth-forms.module.css';

export function ControlLoginForm({ redirectTo = '/' }: Readonly<{ redirectTo?: string }>) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0 || loading) return undefined;
    const timer = window.setTimeout(() => setRetryAfterSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds, loading]);

  function changeEmail(value: string) {
    const normalizedEmail = value.trim().toLowerCase();
    setEmail(value);
    setRetryAfterSeconds(normalizedEmail ? readLoginCooldownSeconds(normalizedEmail) : 0);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const storedRetry = readLoginCooldownSeconds(normalizedEmail);
    if (storedRetry > 0) {
      setRetryAfterSeconds(storedRetry);
      setError(`Bạn đã thử đăng nhập nhiều lần. Vui lòng chờ ${storedRetry} giây.`);
      return;
    }
    if (retryAfterSeconds > 0 || loading || !normalizedEmail || !password) return;
    setLoading(true);
    setError(null);
    try {
      await logimailPasswordLogin({ email: normalizedEmail, password });
      clearLoginCooldown(normalizedEmail);
      router.replace(redirectTo);
      router.refresh();
    } catch (signInError) {
      const authError = normalizeAuthError(signInError, 'Không đăng nhập được.');
      storeLoginCooldown(normalizedEmail, authError.retryAfterSeconds);
      setError(authError.message);
      setRetryAfterSeconds(authError.retryAfterSeconds);
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await logimailGoogleLogin(redirectTo);
    } catch (signInError) {
      setError(normalizeAuthError(signInError, 'Không thể mở đăng nhập Google.').message);
      setLoading(false);
    }
  }

  return (
    <form className={`control-login-form ${styles.form}`} onSubmit={submit} aria-busy={loading}>
      {error ? <p className={`${styles.status} ${styles.statusDanger}`} role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error}</span></p> : null}
      <div className={`form-field ${styles.field}`}>
        <label htmlFor={emailId}>Email quản trị</label>
        <input id={emailId} name="email" value={email} onChange={(event) => changeEmail(event.target.value)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="admin@logivn.com" required />
      </div>
      <div className={`form-field ${styles.field}`}>
        <label htmlFor={passwordId}>Mật khẩu</label>
        <span className={styles.passwordControl}>
          <input id={passwordId} name="password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
          <button type="button" className={styles.passwordToggle} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>
            {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </span>
      </div>
      <button className={`button-link button-reset primary ${styles.submit}`} type="submit" disabled={loading || retryAfterSeconds > 0 || !email || !password}>
        {loading ? <Loader2 className={styles.spin} size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
        <span>{loading ? 'Đang xác thực' : retryAfterSeconds > 0 ? `Thử lại sau ${retryAfterSeconds}s` : 'Mở Control Center'}</span>
      </button>
      <button className={`button-link button-reset secondary ${styles.submit}`} type="button" onClick={() => void signInWithGoogle()} disabled={loading}>
        <LogIn size={17} aria-hidden="true" />
        <span>Đăng nhập bằng Google</span>
      </button>
      <p className="control-login-hint">Khu vực này dành cho platform admin và dùng quyền quản trị riêng của LogiMail.</p>
      <p className="control-login-hint"><Link href="/auth/forgot-password">Quên mật khẩu?</Link></p>
    </form>
  );
}
