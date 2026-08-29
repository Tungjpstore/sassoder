'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Circle, CircleAlert, CircleCheck, Eye, EyeOff, Loader2, LogIn, UserPlus } from 'lucide-react';
import {
  clearLoginCooldown,
  logimailAuthRequest,
  logimailGoogleLogin,
  logimailPasswordLogin,
  readLoginCooldownSeconds,
  storeLoginCooldown,
} from '@/lib/auth-login-client';
import { authCallbackMessage, normalizeAuthError } from '@/lib/auth-errors';
import { safeNextPath } from '@/lib/safe-next-path';
import { logoutCurrentOrigin, nextLogoutPageUrl } from '@/lib/sso-client';
import styles from './auth-forms.module.css';

type FormState = {
  loading: boolean;
  message: string | null;
  error: string | null;
  retryAfterSeconds: number;
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
  hint?: string;
}>;

type PasswordFieldProps = Readonly<{
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  showRules?: boolean;
  invalid?: boolean;
  error?: string | null;
}>;

const initialState: FormState = { loading: false, message: null, error: null, retryAfterSeconds: 0 };

function firstDomain(domains: AuthDomainOption[]) {
  return domains[0]?.domain ?? '';
}

function cleanLocalPart(value: string) {
  return value.trim().toLowerCase();
}

function emailFromParts(localPart: string, domain: string) {
  const cleanLocal = cleanLocalPart(localPart);
  return cleanLocal && domain ? `${cleanLocal}@${domain}` : '';
}

function formatSecurityCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 39);
}

function addressParts(value: string | null, domains: AuthDomainOption[]) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0) return null;
  const domain = domains.find((item) => item.domain.toLowerCase() === normalized.slice(atIndex + 1));
  if (!domain) return null;
  return { localPart: normalized.slice(0, atIndex), domain: domain.domain };
}

function splitEmailAddress(value: string) {
  const normalized = value.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
  return { localPart: normalized.slice(0, atIndex), domain: normalized.slice(atIndex + 1) };
}

function useRetryCountdown(state: FormState, setState: React.Dispatch<React.SetStateAction<FormState>>) {
  useEffect(() => {
    if (state.retryAfterSeconds <= 0 || state.loading) return undefined;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, retryAfterSeconds: Math.max(0, current.retryAfterSeconds - 1) }));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [setState, state.loading, state.retryAfterSeconds]);
}

async function createBrowserMailSession(email: string, password: string, accessToken: string) {
  await logimailAuthRequest('/api/logimail/mail/session', { email, password }, { authorization: `Bearer ${accessToken}` });
}

function Feedback({ state, externalError }: Readonly<{ state: FormState; externalError?: string | null }>) {
  const error = state.error ?? externalError;
  if (error) {
    return <p className={`${styles.status} ${styles.statusDanger}`} role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error}</span></p>;
  }
  if (state.message) {
    return <p className={`${styles.status} ${styles.statusSuccess}`} role="status"><CircleCheck size={17} aria-hidden="true" /><span>{state.message}</span></p>;
  }
  return null;
}

function EmailAddressFields({ domains, localPart, setLocalPart, domain, setDomain, label, hint }: EmailAddressFieldsProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const hasMultipleDomains = domains.length > 1;

  useEffect(() => {
    if (!domains.some((item) => item.domain === domain)) setDomain(firstDomain(domains));
  }, [domain, domains, setDomain]);

  function changeLocalPart(value: string) {
    const atIndex = value.lastIndexOf('@');
    if (atIndex > 0) {
      const pastedDomain = value.slice(atIndex + 1).trim().toLowerCase();
      const matchedDomain = domains.find((item) => item.domain.toLowerCase() === pastedDomain);
      if (matchedDomain) {
        setLocalPart(value.slice(0, atIndex));
        setDomain(matchedDomain.domain);
        return;
      }
    }
    setLocalPart(value);
  }

  return (
    <div className={`form-field ${styles.field}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className={styles.emailControl}>
        <input
          id={inputId}
          name="email"
          value={localPart}
          onChange={(event) => changeLocalPart(event.target.value)}
          onBlur={() => setLocalPart(cleanLocalPart(localPart))}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="ten.ban"
          pattern="[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?"
          maxLength={254}
          aria-describedby={hint ? hintId : undefined}
          disabled={domains.length === 0}
          required
        />
        <span className={styles.domainSuffix} aria-label={`Domain email ${domain || 'chưa khả dụng'}`}>
          <span aria-hidden="true">@</span>
          {hasMultipleDomains ? (
            <select name="domain" value={domain} onChange={(event) => setDomain(event.target.value)} aria-label="Chọn domain email">
              {domains.map((item) => <option key={item.domain} value={item.domain}>{item.label ?? item.domain}</option>)}
            </select>
          ) : <strong>{domain || 'chưa có domain'}</strong>}
        </span>
      </div>
      {hint ? <p className={styles.fieldHint} id={hintId}>{hint}</p> : null}
    </div>
  );
}

function PasswordField({ label, name, value, onChange, autoComplete, showRules = false, invalid = false, error }: PasswordFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const rulesId = `${inputId}-rules`;
  const [visible, setVisible] = useState(false);
  const checks = [
    { label: '10-128 ký tự', met: value.length >= 10 && value.length <= 128 },
    { label: 'Có chữ', met: /[a-z]/i.test(value) },
    { label: 'Có số', met: /[0-9]/.test(value) },
  ];
  const describedBy = [showRules ? rulesId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`form-field ${styles.field}`}>
      <label htmlFor={inputId}>{label}</label>
      <span className={styles.passwordControl}>
        <input
          id={inputId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={autoComplete === 'new-password' ? 10 : undefined}
          maxLength={128}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className={styles.passwordToggle}
          aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
      {showRules ? (
        <ul className={styles.passwordRules} id={rulesId} aria-label="Yêu cầu mật khẩu">
          {checks.map((check) => (
            <li className={check.met ? styles.met : undefined} key={check.label}>
              {check.met ? <Check size={12} aria-hidden="true" /> : <Circle size={9} aria-hidden="true" />}
              {check.label}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className={styles.fieldError} id={errorId}>{error}</p> : null}
    </div>
  );
}

function SubmitButton({ state, idleLabel, loadingLabel, icon = 'login', disabled = false }: Readonly<{
  state: FormState;
  idleLabel: string;
  loadingLabel: string;
  icon?: 'login' | 'register';
  disabled?: boolean;
}>) {
  const retrying = state.retryAfterSeconds > 0;
  const label = state.loading ? loadingLabel : retrying ? `Thử lại sau ${state.retryAfterSeconds}s` : idleLabel;
  const Icon = icon === 'register' ? UserPlus : LogIn;
  return (
    <button className={`button-link button-reset primary ${styles.submit}`} type="submit" disabled={disabled || state.loading || retrying}>
      {state.loading ? <Loader2 className={styles.spin} size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}

export function AuthLoginForm({ domains, domainStatus = 'ready' }: Readonly<{
  domains: AuthDomainOption[];
  domainStatus?: 'ready' | 'unavailable';
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = authCallbackMessage(searchParams.get('error'));
  const nextPath = safeNextPath(searchParams.get('next'), { disallowAuthRoutes: true });
  const suggestedAddress = searchParams.get('email');
  const suggested = addressParts(suggestedAddress, domains);
  const acceptsFullEmail = domainStatus === 'unavailable';
  const [state, setState] = useState<FormState>(initialState);
  const [localPart, setLocalPart] = useState(suggested?.localPart ?? '');
  const [domain, setDomain] = useState(suggested?.domain ?? firstDomain(domains));
  const [fullEmail, setFullEmail] = useState(acceptsFullEmail ? suggestedAddress?.trim().toLowerCase() ?? '' : '');
  const [password, setPassword] = useState('');
  const email = useMemo(
    () => acceptsFullEmail ? fullEmail.trim().toLowerCase() : emailFromParts(localPart, domain),
    [acceptsFullEmail, domain, fullEmail, localPart],
  );
  useRetryCountdown(state, setState);

  function updateLocalPart(value: string) {
    setLocalPart(value);
    const nextEmail = emailFromParts(value, domain);
    setState((current) => current.loading ? current : { ...current, error: null, message: null, retryAfterSeconds: readLoginCooldownSeconds(nextEmail) });
  }

  function updateDomain(value: string) {
    setDomain(value);
    const nextEmail = emailFromParts(localPart, value);
    setState((current) => current.loading ? current : { ...current, error: null, message: null, retryAfterSeconds: readLoginCooldownSeconds(nextEmail) });
  }

  function updateFullEmail(value: string) {
    setFullEmail(value);
    setState((current) => current.loading ? current : {
      ...current,
      error: null,
      message: null,
      retryAfterSeconds: readLoginCooldownSeconds(value.trim().toLowerCase()),
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const storedRetry = readLoginCooldownSeconds(email);
    if (storedRetry > 0) {
      setState({ loading: false, message: null, error: `Bạn đã thử đăng nhập nhiều lần. Vui lòng chờ ${storedRetry} giây.`, retryAfterSeconds: storedRetry });
      return;
    }
    if (!email || state.retryAfterSeconds > 0 || state.loading) return;
    setState({ loading: true, message: null, error: null, retryAfterSeconds: 0 });
    try {
      const login = await logimailPasswordLogin({ email, password });
      clearLoginCooldown(email);
      try {
        await createBrowserMailSession(email, password, login.accessToken);
      } catch {
        // The authenticated inbox owns mailbox-unlock recovery if IMAP is temporarily unavailable.
      }
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đăng nhập được.');
      storeLoginCooldown(email, authError.retryAfterSeconds);
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  async function signInWithGoogle() {
    if (state.loading) return;
    setState({ loading: true, message: null, error: null, retryAfterSeconds: 0 });
    try {
      await logimailGoogleLogin(nextPath);
    } catch (error) {
      setState({ loading: false, message: null, error: normalizeAuthError(error, 'Không thể mở đăng nhập Google.').message, retryAfterSeconds: 0 });
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={state.loading}>
      <Feedback state={state} externalError={urlError} />
      {acceptsFullEmail ? (
        <p className={`${styles.status} ${styles.statusInfo}`} role="status"><CircleAlert size={17} aria-hidden="true" /><span>Tạm thời không tải được danh sách domain. Bạn vẫn có thể đăng nhập bằng địa chỉ email đầy đủ.</span></p>
      ) : domains.length === 0 ? (
        <p className={`${styles.status} ${styles.statusInfo}`} role="status"><CircleAlert size={17} aria-hidden="true" /><span>Chưa có domain đăng nhập khả dụng. Vui lòng liên hệ quản trị viên.</span></p>
      ) : null}
      {acceptsFullEmail ? (
        <div className={`form-field ${styles.field}`}>
          <label htmlFor="login-full-email">Địa chỉ email đầy đủ</label>
          <input id="login-full-email" name="email" value={fullEmail} onChange={(event) => updateFullEmail(event.target.value)} onBlur={() => setFullEmail(email)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="ten.ban@congty.com" maxLength={254} required />
        </div>
      ) : (
        <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={updateLocalPart} domain={domain} setDomain={updateDomain} label="Địa chỉ email" hint="Bạn có thể dán cả địa chỉ email; LogiMail sẽ tự nhận domain." />
      )}
      <PasswordField label="Mật khẩu" name="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className={styles.formRow}><span>Đăng nhập được bảo vệ bằng giới hạn thử lại.</span><Link href={`/auth/forgot-password?next=${encodeURIComponent(nextPath)}`}>Quên mật khẩu?</Link></div>
      <SubmitButton state={state} idleLabel="Mở LogiMail" loadingLabel="Đang xác thực" disabled={!email || !password || (!acceptsFullEmail && domains.length === 0)} />
      <button className={`button-link button-reset secondary ${styles.submit}`} type="button" onClick={() => void signInWithGoogle()} disabled={state.loading}>
        <LogIn size={17} aria-hidden="true" />
        <span>Đăng nhập bằng Google</span>
      </button>
      <p className={styles.inlineCopy}>Chưa có địa chỉ? <Link href="/auth/register">Tạo email LogiMail</Link></p>
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
  const [completedEmail, setCompletedEmail] = useState<string | null>(null);
  const mismatch = Boolean(confirmPassword) && password !== confirmPassword;
  const passwordReady = password.length >= 10 && password.length <= 128 && /[a-z]/i.test(password) && /[0-9]/.test(password);
  const email = useMemo(() => emailFromParts(localPart, domain), [localPart, domain]);
  useRetryCountdown(state, setState);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.', retryAfterSeconds: 0 });
      return;
    }
    setState({ loading: true, message: null, error: null, retryAfterSeconds: 0 });
    try {
      await logimailAuthRequest('/api/logimail/auth/register', { localPart, domain, securityCode, password, confirmPassword });
      try {
        const login = await logimailPasswordLogin({ email, password });
        clearLoginCooldown(email);
        try {
          await createBrowserMailSession(email, password, login.accessToken);
        } catch {
          // The inbox can request mailbox unlock again without invalidating account creation.
        }
        router.replace('/mail/inbox');
        router.refresh();
        return;
      } catch (signInError) {
        const authError = normalizeAuthError(signInError, 'Không đăng nhập tự động được.');
        storeLoginCooldown(email, authError.retryAfterSeconds);
        setCompletedEmail(email);
        setPassword('');
        setConfirmPassword('');
        setSecurityCode('');
        setState({ loading: false, message: `Đã tạo ${email}. Hãy đăng nhập để mở hộp thư.`, error: null, retryAfterSeconds: authError.retryAfterSeconds });
      }
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đăng ký được.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  if (completedEmail) {
    return (
      <div className={styles.form}>
        <Feedback state={state} />
        <div className={styles.successActions}>
          <Link className="button-link primary" href={`/auth/login?email=${encodeURIComponent(completedEmail)}`}>Đăng nhập</Link>
          <Link className="button-link secondary" href="/auth/forgot-password">Khôi phục mật khẩu</Link>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={state.loading}>
      <Feedback state={state} />
      {domains.length === 0 ? (
        <p className={`${styles.status} ${styles.statusInfo}`} role="status"><CircleAlert size={17} aria-hidden="true" /><span>Chưa có domain nào đang mở đăng ký email.</span></p>
      ) : null}
      <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={setLocalPart} domain={domain} setDomain={setDomain} label="Địa chỉ email mới" hint="Tên có thể dùng chữ, số, dấu chấm, gạch ngang và gạch dưới." />
      <div className={`form-field ${styles.field}`}>
        <label htmlFor="registration-security-code">Mã bảo mật một lần</label>
        <input id="registration-security-code" className={styles.securityCode} name="securityCode" value={securityCode} onChange={(event) => setSecurityCode(formatSecurityCode(event.target.value))} type="text" autoComplete="one-time-code" inputMode="text" placeholder="LM-XXXX-XXXX-XX" minLength={8} maxLength={39} spellCheck={false} required />
        <p className={styles.fieldHint}>Mã đăng ký chỉ dùng được một lần và phải khớp với domain đã chọn.</p>
      </div>
      <div className={styles.formGrid}>
        <PasswordField label="Mật khẩu" name="new-password" value={password} onChange={setPassword} autoComplete="new-password" showRules />
        <PasswordField label="Xác nhận mật khẩu" name="confirm-password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" invalid={mismatch} error={mismatch ? 'Mật khẩu xác nhận chưa khớp.' : null} />
      </div>
      <SubmitButton state={state} idleLabel="Tạo email" loadingLabel="Đang cấp phát mailbox" icon="register" disabled={!email || !securityCode || !passwordReady || mismatch || domains.length === 0} />
      <p className={styles.inlineCopy}>Đã có địa chỉ? <Link href="/auth/login">Đăng nhập</Link></p>
    </form>
  );
}

export function ForgotPasswordForm({ domains, domainStatus = 'ready' }: Readonly<{
  domains: AuthDomainOption[];
  domainStatus?: 'ready' | 'unavailable';
}>) {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'), { disallowAuthRoutes: true });
  const acceptsFullEmail = domainStatus === 'unavailable';
  const [state, setState] = useState<FormState>(initialState);
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState(firstDomain(domains));
  const [fullEmail, setFullEmail] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [completedEmail, setCompletedEmail] = useState<string | null>(null);
  const mismatch = Boolean(confirmPassword) && password !== confirmPassword;
  const passwordReady = password.length >= 10 && password.length <= 128 && /[a-z]/i.test(password) && /[0-9]/.test(password);
  const parsedFullEmail = acceptsFullEmail ? splitEmailAddress(fullEmail) : null;
  const email = acceptsFullEmail
    ? parsedFullEmail ? emailFromParts(parsedFullEmail.localPart, parsedFullEmail.domain) : ''
    : emailFromParts(localPart, domain);
  useRetryCountdown(state, setState);

  function updateFullEmail(value: string) {
    setFullEmail(value);
    setState((current) => current.loading ? current : { ...current, error: null, message: null, retryAfterSeconds: 0 });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.', retryAfterSeconds: 0 });
      return;
    }
    setState({ loading: true, message: null, error: null, retryAfterSeconds: 0 });
    try {
      await logimailAuthRequest('/api/logimail/auth/reset-password', {
        localPart: acceptsFullEmail ? parsedFullEmail?.localPart : localPart,
        domain: acceptsFullEmail ? parsedFullEmail?.domain : domain,
        securityCode,
        password,
        confirmPassword,
      });
      setCompletedEmail(email);
      setSecurityCode('');
      setPassword('');
      setConfirmPassword('');
      setState({ loading: false, message: `Mật khẩu của ${email} đã được cập nhật.`, error: null, retryAfterSeconds: 0 });
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không đổi được mật khẩu.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  if (completedEmail) {
    return (
      <div className={styles.form}>
        <Feedback state={state} />
        <Link className={`button-link primary ${styles.submit}`} href={`/auth/login?next=${encodeURIComponent(nextPath)}`}>Đăng nhập bằng mật khẩu mới</Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={state.loading}>
      <Feedback state={state} />
      {acceptsFullEmail ? (
        <p className={`${styles.status} ${styles.statusInfo}`} role="status"><CircleAlert size={17} aria-hidden="true" /><span>Tạm thời không tải được danh sách domain. Bạn vẫn có thể nhập địa chỉ email đầy đủ để khôi phục.</span></p>
      ) : domains.length === 0 ? (
        <p className={`${styles.status} ${styles.statusInfo}`} role="status"><CircleAlert size={17} aria-hidden="true" /><span>Chưa có domain khôi phục mật khẩu khả dụng.</span></p>
      ) : null}
      {acceptsFullEmail ? (
        <div className={`form-field ${styles.field}`}>
          <label htmlFor="reset-full-email">Địa chỉ cần khôi phục</label>
          <input id="reset-full-email" name="email" value={fullEmail} onChange={(event) => updateFullEmail(event.target.value)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="ten.ban@congty.com" maxLength={254} required />
        </div>
      ) : (
        <EmailAddressFields domains={domains} localPart={localPart} setLocalPart={setLocalPart} domain={domain} setDomain={setDomain} label="Địa chỉ cần khôi phục" hint="Mã khôi phục phải được cấp riêng cho chính địa chỉ này." />
      )}
      <div className={`form-field ${styles.field}`}>
        <label htmlFor="reset-security-code">Mã khôi phục một lần</label>
        <input id="reset-security-code" className={styles.securityCode} name="securityCode" value={securityCode} onChange={(event) => setSecurityCode(formatSecurityCode(event.target.value))} type="text" autoComplete="one-time-code" placeholder="LM-XXXX-XXXX-XX" minLength={8} maxLength={39} spellCheck={false} required />
      </div>
      <div className={styles.formGrid}>
        <PasswordField label="Mật khẩu mới" name="new-password" value={password} onChange={setPassword} autoComplete="new-password" showRules />
        <PasswordField label="Xác nhận mật khẩu" name="confirm-password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" invalid={mismatch} error={mismatch ? 'Mật khẩu xác nhận chưa khớp.' : null} />
      </div>
      <SubmitButton state={state} idleLabel="Cập nhật mật khẩu" loadingLabel="Đang cập nhật đồng bộ" disabled={!email || !securityCode || !passwordReady || mismatch || (!acceptsFullEmail && domains.length === 0)} />
      <p className={styles.inlineCopy}><Link href="/auth/login">Quay lại đăng nhập</Link></p>
    </form>
  );
}

export function InviteAcceptForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [completedEmail, setCompletedEmail] = useState<string | null>(null);
  const mismatch = Boolean(confirmPassword) && password !== confirmPassword;
  const passwordReady = password.length >= 10 && password.length <= 128 && /[a-z]/i.test(password) && /[0-9]/.test(password);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ loading: false, message: null, error: 'Mật khẩu xác nhận không khớp.', retryAfterSeconds: 0 });
      return;
    }
    setState({ loading: true, message: null, error: null, retryAfterSeconds: 0 });
    try {
      const result = await logimailAuthRequest<{ email: string }>('/api/logimail/auth/invite', { email, inviteCode, password, confirmPassword });
      try {
        const login = await logimailPasswordLogin({ email: result.email, password });
        try {
          await createBrowserMailSession(result.email, password, login.accessToken);
        } catch {
          // The mailbox identity was synchronized server-side; inbox recovery can retry IMAP unlock.
        }
        router.replace('/mail/inbox');
        router.refresh();
      } catch (signInError) {
        const authError = normalizeAuthError(signInError, 'Không đăng nhập tự động được.');
        storeLoginCooldown(result.email, authError.retryAfterSeconds);
        setCompletedEmail(result.email);
        setInviteCode('');
        setPassword('');
        setConfirmPassword('');
        setState({ loading: false, message: `Tài khoản ${result.email} đã được kích hoạt. Hãy đăng nhập để tiếp tục.`, error: null, retryAfterSeconds: authError.retryAfterSeconds });
      }
    } catch (error) {
      const authError = normalizeAuthError(error, 'Không kích hoạt được lời mời.');
      setState({ loading: false, message: null, error: authError.message, retryAfterSeconds: authError.retryAfterSeconds });
    }
  }

  if (completedEmail) {
    return (
      <div className={styles.form}>
        <Feedback state={state} />
        <Link className={`button-link primary ${styles.submit}`} href={`/auth/login?email=${encodeURIComponent(completedEmail)}`}>Đăng nhập tài khoản đã kích hoạt</Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={state.loading}>
      <Feedback state={state} />
      <div className={`form-field ${styles.field}`}>
        <label htmlFor="invite-email">Địa chỉ email được mời</label>
        <input id="invite-email" name="email" value={email} onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} type="email" autoComplete="email" placeholder="name@company.com" maxLength={254} required />
      </div>
      <div className={`form-field ${styles.field}`}>
        <label htmlFor="invite-code">Mã lời mời một lần</label>
        <input id="invite-code" className={styles.securityCode} name="inviteCode" value={inviteCode} onChange={(event) => setInviteCode(formatSecurityCode(event.target.value))} type="text" autoComplete="one-time-code" placeholder="LMI-XXXXX-XXXXX-XXXXX-XXXX" minLength={8} maxLength={39} spellCheck={false} required />
      </div>
      <PasswordField label="Tạo mật khẩu" name="new-password" value={password} onChange={setPassword} autoComplete="new-password" showRules />
      <PasswordField label="Xác nhận mật khẩu" name="confirm-password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" invalid={mismatch} error={mismatch ? 'Mật khẩu xác nhận chưa khớp.' : null} />
      <SubmitButton state={state} idleLabel="Hoàn tất tài khoản" loadingLabel="Đang đồng bộ mailbox" icon="register" disabled={!email || !inviteCode || !passwordReady || mismatch} />
    </form>
  );
}

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    if (loading) return;
    setLoading(true);
    try {
      await logoutCurrentOrigin();
    } finally {
      setLoading(false);
      window.location.replace(nextLogoutPageUrl());
    }
  }

  return (
    <button className="button-link button-reset ghost" type="button" disabled={loading} onClick={signOut}>
      {loading ? <Loader2 className={styles.spin} size={16} aria-hidden="true" /> : null}
      <span>{loading ? 'Đang đăng xuất' : 'Đăng xuất'}</span>
    </button>
  );
}
