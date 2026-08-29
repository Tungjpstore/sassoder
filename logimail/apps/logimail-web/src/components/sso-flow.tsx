'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogiMailLogo } from '@/components/logimail-logo';
import {
  consumeSsoTransfer,
  logoutCurrentOrigin,
  nextGlobalLogoutUrl,
  nextLogoutPageUrl,
  ssoFallbackUrl,
  startSsoTransfer,
} from '@/lib/sso-client';
import { safeNextPath } from '@/lib/safe-next-path';
import styles from './sso-flow.module.css';

type SsoSurface = 'mail' | 'domain';
type FlowMode = 'transfer' | 'complete' | 'logout';

const STATE_PATTERN = /^[A-Za-z0-9_-]{43,256}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readSurface(value: string | null): SsoSurface | null {
  return value === 'mail' || value === 'domain' ? value : null;
}

function clearQueryString() {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', window.location.pathname);
}

function FlowShell({ mode, children }: Readonly<{ mode: FlowMode; children?: React.ReactNode }>) {
  const copy = mode === 'logout'
    ? { title: 'Đang đóng các phiên LogiMail', description: 'Đang thu hồi quyền truy cập và làm sạch phiên trên các bề mặt liên quan.' }
    : mode === 'complete'
      ? { title: 'Đang xác minh phiên đăng nhập', description: 'Handoff chỉ dùng một lần và sẽ hết hiệu lực rất nhanh.' }
      : { title: 'Đang mở phiên LogiMail', description: 'Đang kết nối hộp thư với phiên đăng nhập hiện tại.' };

  return (
    <main className={styles.shell}>
      <section className={styles.brand} aria-label="LogiMail">
        <LogiMailLogo className={styles.logo} subtitle="Business Mail Platform" />
        <div className={styles.brandCopy}>
          <p className={styles.eyebrow}>Secure identity bridge</p>
          <h1>Một danh tính, mọi bề mặt LogiMail.</h1>
          <p>Liên kết hộp thư và bảng điều khiển bằng handoff có chữ ký, có thời hạn và không để lộ token trên đường dẫn.</p>
        </div>
        <div className={styles.protocol} aria-label="Trạng thái nền tảng">
          <span><i /> Host-only cookie</span>
          <span><i /> One-time handoff</span>
        </div>
      </section>
      <section className={styles.content} aria-live="polite">
        <div className={styles.status}>
          <div className={`${styles.statusIcon} ${styles.loading}`} aria-hidden="true">
            {mode === 'logout' ? <LogOut size={24} /> : mode === 'complete' ? <ShieldCheck size={24} /> : <LoaderCircle size={25} />}
          </div>
          <h2>{copy.title}</h2>
          <p className={styles.statusCopy}>{copy.description}</p>
          {mode !== 'logout' ? <div className={styles.progress} aria-hidden="true" /> : null}
          {children}
          <p className={styles.footer}>Kết nối được mã hóa. Không hiển thị thông tin xác thực trong giao diện.</p>
        </div>
      </section>
    </main>
  );
}

function FlowError({ message, fallbackUrl }: Readonly<{ message: string; fallbackUrl: string }>) {
  return (
    <div className={styles.errorBox} role="alert">
      <p><AlertTriangle size={15} aria-hidden="true" /> {message}</p>
      <Link className={styles.fallback} href={fallbackUrl}><span>Đăng nhập trực tiếp</span><ArrowRight size={15} aria-hidden="true" /></Link>
    </div>
  );
}

export function SsoTransferFlow() {
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState('/auth/login');
  const target = readSurface(searchParams.get('target'));
  const state = searchParams.get('state') ?? '';
  const challenge = searchParams.get('challenge') ?? '';
  const next = safeNextPath(searchParams.get('next'));
  const invalidInput = !target || !STATE_PATTERN.test(state) || !CHALLENGE_PATTERN.test(challenge);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    clearQueryString();

    if (invalidInput || !target) return;
    startSsoTransfer(target, next, state, challenge).catch((reason: unknown) => {
      setFallbackUrl(ssoFallbackUrl(target, next));
      setError(reason instanceof Error ? reason.message : 'Không thể mở phiên đăng nhập.');
    });
  }, [challenge, invalidInput, next, state, target]);

  return (
    <FlowShell mode="transfer">
      {invalidInput || error ? <FlowError message={error ?? 'Liên kết chuyển phiên không hợp lệ hoặc đã hết hạn.'} fallbackUrl={fallbackUrl} /> : null}
    </FlowShell>
  );
}

export function SsoCompleteFlow() {
  const searchParams = useSearchParams();
  const consumed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = searchParams.get('ticket') ?? '';

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    clearQueryString();
    if (!ticket) return;

    consumeSsoTransfer(ticket)
      .then(({ next }) => window.location.replace(next))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Không thể xác minh phiên đăng nhập.'));
  }, [ticket]);

  return (
    <FlowShell mode="complete">
      {!ticket || error ? <FlowError message={error ?? 'Thiếu mã chuyển phiên.'} fallbackUrl="/auth/login" /> : null}
    </FlowShell>
  );
}

export function SsoLogoutFlow() {
  const searchParams = useSearchParams();
  const completed = useRef(false);

  useEffect(() => {
    if (completed.current) return;
    completed.current = true;
    const relayFrom = searchParams.get('relay');
    clearQueryString();

    logoutCurrentOrigin().finally(() => {
      window.location.replace(relayFrom ? nextLogoutPageUrl(relayFrom) : nextLogoutPageUrl());
    });
  }, [searchParams]);

  return (
    <FlowShell mode="logout">
      <noscript><Link className={styles.fallback} href={nextGlobalLogoutUrl()}>Tiếp tục</Link></noscript>
    </FlowShell>
  );
}

export function SsoFlowFallback({ mode = 'transfer' }: Readonly<{ mode?: FlowMode }>) {
  return <FlowShell mode={mode} />;
}
