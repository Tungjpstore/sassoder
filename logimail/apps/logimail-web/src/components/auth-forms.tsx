'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { normalizeAuthError } from '@/lib/auth-errors';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type FormState = {
  loading: boolean;
  message: string | null;
  error: string | null;
  retryAfterSeconds?: number;
};

export type AuthDomainOption = {
  domain: string;
  label?: string;
};

type EmailAddressFieldsProps = Readonly<{
  domains: AuthDomainOption[];
  localPart: string;
  setLocalPart: (value: string) => void;
  domain: string;
  setDomain: (value: string) => void;
  label: string;
  autoComplete?: string;
}>;

const initialState: FormState = { loading: false, message: null, error: null };

function firstDomain(domains: AuthDomainOption[]) {
  return domains[0]?.domain ?? 'logivn.com';
}

function cleanLocalPart(value: string) {
  return value.trim().toLowerCase();
}

function emailFromParts(localPart: string, domain: string) {
  return `${cleanLocalPart(localPart)}@${domain}`;
}

async function createBrowserMailSession(email: string, password: string) {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch('/api/logimail/mail/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password }),
  }).catch(() => undefined);
}

function EmailAddressFields({ domains, localPart, setLocalPart, domain, setDomain, label, autoComplete = 'username' }: EmailAddressFieldsProps) {
  useEffect(() => {
    if (!domains.some((item) => item.domain === domain)) setDomain(firstDomain(domains));
  }, [domain, domains, setDomain]);

  const hasMultipleDomains = domains.length > 1;

  return (
    <label className="form-field">
      <span>{label}</span>
      <span className="email-address-control">
        <input
          value={localPart}
          onChange={(event) => setLocalPart(event.target.value)}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete={autoComplete}
          placeholder="ten.ban"
          required
        />
        <span className="email-domain-suffix">
          <span>@</span>
          {hasMultipleDomains ? (
            <select value={domain} onChange={(event) => setDomain(event.target.value)} aria-label="Domain email">
              {domains.map((item) => <option key={item.domain} value={item.domain}>{item.label ?? item.domain}</option>)}
            </select>
          ) : (
            <strong>{domain}</strong>
          )}
        </span>
      </span>
    </label>
  );
}

export function AuthLoginForm({ domains }: Readonly<{ domains: AuthDomainOption[] }>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const [state, setState] = useState<FormState>(initialState);
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState(firstDomain(domains));
  const [password, setPassword] = useState('');
  const email = useMemo(() => emailFromParts(localPart, domain), [localPart, domain]);
  const retryAfterSeconds = state.retryAfterSeconds ?? 0;

  useEffect(() => {
    if (retryAfterSeconds <= 0 || state.loading) return undefined;
    const timer = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        retryAfterSeconds: Math.max(0, (current.retryAfterSeconds ?? 0) - 1),
      }));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds, state.loading]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (retryAfterSeconds > 0 || state.loading) return;
    setState({ loading: true, message: null, error: null });
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      await createBrowserMailSession(email, password);
      setState({ loading: false, message: 'Đăng nhập thành công.', error: null });
      router.push('/mail/inbox');
      router.refresh();
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đăng nhập được.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {urlError ? <p className="form-alert danger">{urlError}</p> : null}
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={setLocalPart} domain={domain} setDomain={setDomain} label="Địa chỉ email" />
      <label className="form-field">
        <span>Mật khẩu</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
      </label>
      <div className="auth-row">
        <a href="/auth/forgot-password">Quên mật khẩu?</a>
      </div>
      <button className="button-link button-reset primary" type="submit" disabled={state.loading || retryAfterSeconds > 0}>{state.loading ? 'Đang xử lý' : retryAfterSeconds > 0 ? `Thử lại sau ${retryAfterSeconds}s` : 'Đăng nhập'}</button>
      <p className="auth-inline-copy">Chưa có email? <a href="/auth/register">Đăng ký</a></p>
    </form>
  );
}

export function AuthRegisterForm({ domains }: Readonly<{ domains: AuthDomainOption[] }>) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState(firstDomain(domains));
  const [securityCode, setSecurityCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const mismatch = useMemo(() => Boolean(confirmPassword) && password !== confirmPassword, [password, confirmPassword]);
  const email = useMemo(() => emailFromParts(localPart, domain), [localPart, domain]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setState({ loading: true, message: null, error: null });
    try {
      const response = await fetch('/api/logimail/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPart, domain, securityCode, password, confirmPassword }),
      });
      const body = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Không tạo được email.');

      setState({
        loading: false,
        message: `Đã tạo ${email}. Bạn có thể đăng nhập ngay.`,
        error: null,
      });
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (!signInError) {
        await createBrowserMailSession(email, password);
        router.push('/mail/inbox');
        router.refresh();
        return;
      }
      setLocalPart('');
      setSecurityCode('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đăng ký được.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={setLocalPart} domain={domain} setDomain={setDomain} label="Chọn địa chỉ email" autoComplete="off" />
      <label className="form-field">
        <span>Mã bảo mật</span>
        <input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} type="text" autoComplete="one-time-code" inputMode="text" required />
      </label>
      <div className="form-two">
        <label className="form-field"><span>Mật khẩu</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required /></label>
        <label className="form-field"><span>Xác nhận mật khẩu</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required />{mismatch ? <small>Mật khẩu xác nhận chưa khớp.</small> : null}</label>
      </div>
      <button className="button-link button-reset primary" type="submit" disabled={state.loading || mismatch}>{state.loading ? 'Đang tạo' : 'Tạo email'}</button>
      <p className="auth-inline-copy">Đã có email nội bộ? <a href="/auth/login">Đăng nhập</a></p>
    </form>
  );
}

export function ForgotPasswordForm({ domains }: Readonly<{ domains: AuthDomainOption[] }>) {
  const [state, setState] = useState<FormState>(initialState);
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState(firstDomain(domains));
  const [securityCode, setSecurityCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const mismatch = useMemo(() => Boolean(confirmPassword) && password !== confirmPassword, [password, confirmPassword]);
  const email = useMemo(() => emailFromParts(localPart, domain), [localPart, domain]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setState({ loading: true, message: null, error: null });
    try {
      const response = await fetch('/api/logimail/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPart, domain, securityCode, password, confirmPassword }),
      });
      const body = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Không đổi được mật khẩu.');
      setState({ loading: false, message: `Đã cập nhật mật khẩu cho ${email}.`, error: null });
      setSecurityCode('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đổi được mật khẩu.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={setLocalPart} domain={domain} setDomain={setDomain} label="Địa chỉ email cần khôi phục" />
      <label className="form-field">
        <span>Mã bảo mật</span>
        <input value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} type="text" autoComplete="one-time-code" required />
      </label>
      <div className="form-two">
        <label className="form-field"><span>Mật khẩu mới</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required /></label>
        <label className="form-field"><span>Xác nhận mật khẩu</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required />{mismatch ? <small>Mật khẩu xác nhận chưa khớp.</small> : null}</label>
      </div>
      <button className="button-link button-reset primary" type="submit" disabled={state.loading || mismatch}>{state.loading ? 'Đang đổi' : 'Đổi mật khẩu'}</button>
      <p className="auth-inline-copy"><a href="/auth/login">Quay lại đăng nhập</a></p>
    </form>
  );
}

export function InviteAcceptForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const mismatch = useMemo(() => Boolean(confirmPassword) && password !== confirmPassword, [password, confirmPassword]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    setState({ loading: true, message: null, error: null });
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
      if (error) throw error;
      setState({ loading: false, message: 'Đã cập nhật mật khẩu.', error: null });
      router.push('/mail/inbox');
      router.refresh();
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không cập nhật được mật khẩu.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {state.error ? <p className="form-alert danger">{state.error}</p> : null}
      {state.message ? <p className="form-alert success">{state.message}</p> : null}
      <label className="form-field">
        <span>Tạo mật khẩu</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="form-field">
        <span>Xác nhận mật khẩu</span>
        <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={10} required />
        {mismatch ? <small>Mật khẩu xác nhận chưa khớp.</small> : null}
      </label>
      <button className="button-link button-reset primary" type="submit" disabled={state.loading || mismatch}>{state.loading ? 'Đang xử lý' : 'Tham gia workspace'}</button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return <button className="button-link button-reset ghost" type="button" disabled={loading} onClick={signOut}>{loading ? 'Đang thoát' : 'Đăng xuất'}</button>;
}
