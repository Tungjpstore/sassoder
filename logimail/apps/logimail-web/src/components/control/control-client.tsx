'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  KeyRound,
  Loader2,
  MailCheck,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type DnsState = 'pass' | 'warning' | 'fail' | 'unknown';

type ApprovalRequest = {
  id: string;
  type: 'account' | 'domain' | 'mailbox';
  title: string;
  detail: string;
  requesterEmail: string | null;
  workspaceName: string | null;
  targetValue: string;
  riskFlags: string[];
  plannedRecordCount: number;
  createdAt: string;
};

type AdminDomain = {
  id: string;
  domain: string;
  workspaceName: string | null;
  mailHostname: string | null;
  status: string;
  approvalStatus: string;
  registrationEnabled: boolean;
  dns: { mx: DnsState; spf: DnsState; dkim: DnsState; dmarc: DnsState; ptr: DnsState; lastCheckedAt: string | null };
  mailboxCount: number;
};

type SecurityCode = {
  id: string;
  domain: string | null;
  purpose: string;
  code: string | null;
  codeHint: string;
  status: string;
  expiresAt: string;
  consumedEmail: string | null;
};

type Overview = {
  admin: { email: string | null; role: string; fullName: string | null };
  queue: {
    summary: { pendingTotal: number; accounts: number; domains: number; mailboxes: number };
    requests: ApprovalRequest[];
  };
  domainControl: {
    summary: { total: number; active: number; registrationEnabled: number; warning: number; cloudflareReady: boolean };
    domains: AdminDomain[];
  };
  securityCodes: SecurityCode[];
};

type TabKey = 'cockpit' | 'queue' | 'domains' | 'codes';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'cockpit', label: 'Tổng quan' },
  { key: 'queue', label: 'Hàng đợi duyệt' },
  { key: 'domains', label: 'Domain & DNS' },
  { key: 'codes', label: 'Mã bảo mật' },
];

async function authToken() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');
  return data.session.access_token;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await authToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${token}`,
    },
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? 'Không gọi được API điều khiển.' : body.error.message);
  }
  return body.data;
}

function dnsTone(state: DnsState) {
  if (state === 'pass') return 'success';
  if (state === 'warning') return 'warning';
  if (state === 'fail') return 'danger';
  return 'info';
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function requestTypeLabel(type: ApprovalRequest['type']) {
  if (type === 'account') return 'Tài khoản';
  if (type === 'domain') return 'Domain';
  return 'Mailbox';
}

export function ControlClient({ initialEmail }: Readonly<{ initialEmail: string | null }>) {
  const [tab, setTab] = useState<TabKey>('cockpit');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<Overview>('/api/logimail/admin/overview'));
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Không tải được dữ liệu điều khiển.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, action: () => Promise<void>, successMessage: string) => {
      setBusyId(key);
      setError(null);
      setNotice(null);
      try {
        await action();
        setNotice(successMessage);
        await load();
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Thao tác thất bại.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const summary = data?.queue.summary;
  const domainSummary = data?.domainControl.summary;

  return (
    <div className="control-root">
      <header className="control-header">
        <div>
          <h1>Trung tâm điều khiển LogiMail</h1>
          <p className="muted-copy">Vận hành domain, duyệt yêu cầu và mã bảo mật cho mail.logivn.com</p>
        </div>
        <div className="control-header-actions">
          <span className="status-badge info">{data?.admin.email ?? initialEmail ?? 'admin'}</span>
          <button className="icon-text-button" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={15} aria-hidden="true" />
            {loading ? 'Đang tải' : 'Làm mới'}
          </button>
        </div>
      </header>

      {error ? <p className="form-alert danger" role="alert">{error}</p> : null}
      {notice ? <p className="form-alert success" role="status">{notice}</p> : null}

      <nav className="control-tabs" aria-label="Khu vực điều khiển">
        {TABS.map((item) => {
          const count = item.key === 'queue' ? summary?.pendingTotal ?? 0 : 0;
          return (
            <button key={item.key} type="button" className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
              {item.label}
              {item.key === 'queue' && count > 0 ? <span className="control-tab-badge">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      {loading && !data ? <p className="muted-copy">Đang tải bảng điều khiển…</p> : null}

      {data && tab === 'cockpit' ? (
        <section className="control-metric-grid" aria-label="Chỉ số vận hành">
          <MetricTile icon={MailCheck} label="Yêu cầu chờ duyệt" value={summary?.pendingTotal ?? 0} detail={`${summary?.accounts ?? 0} tài khoản · ${summary?.domains ?? 0} domain · ${summary?.mailboxes ?? 0} mailbox`} tone={(summary?.pendingTotal ?? 0) > 0 ? 'warning' : 'success'} />
          <MetricTile icon={Globe2} label="Domain đăng ký" value={domainSummary?.registrationEnabled ?? 0} detail={`${domainSummary?.total ?? 0} domain · ${domainSummary?.active ?? 0} active`} tone={(domainSummary?.registrationEnabled ?? 0) > 0 ? 'success' : 'warning'} />
          <MetricTile icon={KeyRound} label="Mã bảo mật active" value={data.securityCodes.length} detail="Cấp cho đăng ký / đặt lại mật khẩu" tone={data.securityCodes.length > 0 ? 'success' : 'info'} />
          <MetricTile icon={ShieldCheck} label="DNS cảnh báo" value={domainSummary?.warning ?? 0} detail={domainSummary?.cloudflareReady ? 'Cloudflare sẵn sàng' : 'Resolver nội bộ'} tone={(domainSummary?.warning ?? 0) > 0 ? 'danger' : 'success'} />
        </section>
      ) : null}

      {data && (tab === 'cockpit' || tab === 'queue') ? (
        <section className="control-panel" aria-label="Hàng đợi duyệt">
          <h2>Hàng đợi duyệt {summary?.pendingTotal ? `(${summary.pendingTotal})` : ''}</h2>
          {data.queue.requests.length === 0 ? (
            <p className="muted-copy">Không có yêu cầu nào đang chờ duyệt.</p>
          ) : (
            <ul className="control-request-list">
              {data.queue.requests.map((req) => (
                <li key={`${req.type}-${req.id}`} className="control-request-row">
                  <div className="control-request-main">
                    <div className="control-request-tags">
                      <span className={`status-badge ${req.riskFlags.length ? 'warning' : 'info'}`}>{requestTypeLabel(req.type)}</span>
                      {req.riskFlags.map((flag) => <span key={flag} className="status-badge danger">{flag}</span>)}
                    </div>
                    <strong>{req.title}</strong>
                    <p className="muted-copy">
                      {req.workspaceName ? `${req.workspaceName} · ` : ''}{req.detail}
                    </p>
                    <p className="control-request-meta">{req.requesterEmail ?? '—'} · {formatDateTime(req.createdAt)}{req.plannedRecordCount ? ` · ${req.plannedRecordCount} DNS records` : ''}</p>
                  </div>
                  <div className="control-request-actions">
                    <button
                      className="button-link button-reset primary"
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void run(req.id, () => apiFetch('/api/logimail/admin/requests', { method: 'POST', body: JSON.stringify({ type: req.type, requestId: req.id, action: 'approve' }) }).then(() => undefined), `Đã duyệt ${req.title}.`)}
                    >
                      {busyId === req.id ? <Loader2 size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
                      <span>Duyệt</span>
                    </button>
                    <button
                      className="icon-text-button danger"
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => {
                        const reason = window.prompt(`Lý do từ chối ${req.title}?`, '') ?? '';
                        void run(req.id, () => apiFetch('/api/logimail/admin/requests', { method: 'POST', body: JSON.stringify({ type: req.type, requestId: req.id, action: 'reject', reason }) }).then(() => undefined), `Đã từ chối ${req.title}.`);
                      }}
                    >
                      <XCircle size={15} aria-hidden="true" />Từ chối
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {data && tab === 'domains' ? (
        <DomainsPanel domains={data.domainControl.domains} busyId={busyId} run={run} />
      ) : null}

      {data && tab === 'codes' ? (
        <SecurityCodesPanel codes={data.securityCodes} busyId={busyId} run={run} />
      ) : null}
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, detail, tone }: Readonly<{ icon: typeof MailCheck; label: string; value: number; detail: string; tone: string }>) {
  return (
    <div className={`control-metric-tile tone-${tone}`}>
      <Icon size={18} aria-hidden="true" />
      <span className="control-metric-value">{value}</span>
      <span className="control-metric-label">{label}</span>
      <span className="control-metric-detail">{detail}</span>
    </div>
  );
}

function DnsPill({ label, state }: Readonly<{ label: string; state: DnsState }>) {
  return <span className={`status-badge ${dnsTone(state)}`}>{label} {state}</span>;
}

function DomainsPanel({
  domains,
  busyId,
  run,
}: Readonly<{
  domains: AdminDomain[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<void>;
}>) {
  return (
    <section className="control-panel" aria-label="Domain và DNS">
      <h2>Domain & DNS ({domains.length})</h2>
      {domains.length === 0 ? <p className="muted-copy">Chưa có domain nào.</p> : null}
      <div className="control-domain-grid">
        {domains.map((domain) => {
          const toggleKey = `${domain.id}-reg`;
          const dnsKey = `${domain.id}-dns`;
          const removeKey = `${domain.id}-rm`;
          return (
            <article key={domain.id} className="control-domain-card">
              <header>
                <div>
                  <strong>{domain.domain}</strong>
                  <p className="control-request-meta">{domain.workspaceName ?? '—'} · {domain.mailHostname ?? `mail.${domain.domain}`} · {domain.mailboxCount} mailbox</p>
                </div>
                <span className={`status-badge ${domain.status === 'active' && domain.registrationEnabled ? 'success' : domain.status === 'disabled' ? 'danger' : 'warning'}`}>{domain.status}</span>
              </header>
              <div className="control-dns-row">
                <DnsPill label="MX" state={domain.dns.mx} />
                <DnsPill label="SPF" state={domain.dns.spf} />
                <DnsPill label="DKIM" state={domain.dns.dkim} />
                <DnsPill label="DMARC" state={domain.dns.dmarc} />
                <DnsPill label="PTR" state={domain.dns.ptr} />
              </div>
              <p className="control-request-meta">Kiểm DNS lần cuối: {formatDateTime(domain.dns.lastCheckedAt)}</p>
              <div className="control-request-actions">
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={busyId === toggleKey}
                  onClick={() => void run(toggleKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}`, { method: 'PATCH', body: JSON.stringify({ registrationEnabled: !domain.registrationEnabled }) }).then(() => undefined), `Đã ${domain.registrationEnabled ? 'tắt' : 'bật'} đăng ký cho ${domain.domain}.`)}
                >
                  {domain.registrationEnabled ? <PauseCircle size={15} aria-hidden="true" /> : <PlayCircle size={15} aria-hidden="true" />}
                  {domain.registrationEnabled ? 'Tắt đăng ký' : 'Bật đăng ký'}
                </button>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={busyId === dnsKey}
                  onClick={() => void run(dnsKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/dns-check`, { method: 'POST' }).then(() => undefined), `Đã kiểm tra DNS cho ${domain.domain}.`)}
                >
                  {busyId === dnsKey ? <Loader2 size={15} aria-hidden="true" /> : <Wifi size={15} aria-hidden="true" />}
                  Kiểm DNS
                </button>
                <button
                  className="icon-text-button danger"
                  type="button"
                  disabled={busyId === removeKey}
                  onClick={() => {
                    if (!window.confirm(`Gỡ/tắt domain ${domain.domain}? Hành động này cần xác nhận.`)) return;
                    void run(removeKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}`, { method: 'DELETE', headers: { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' } }).then(() => undefined), `Đã xử lý gỡ domain ${domain.domain}.`);
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />Gỡ
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SecurityCodesPanel({
  codes,
  busyId,
  run,
}: Readonly<{
  codes: SecurityCode[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<void>;
}>) {
  const [domain, setDomain] = useState('');
  const [purpose, setPurpose] = useState<'account_signup' | 'password_reset'>('account_signup');
  const [ttlHours, setTtlHours] = useState('24');
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const createKey = 'create-code';

  return (
    <section className="control-panel" aria-label="Mã bảo mật">
      <h2>Mã bảo mật ({codes.length} active)</h2>
      <form
        className="control-code-form"
        onSubmit={(event) => {
          event.preventDefault();
          setCreatedCode(null);
          void run(
            createKey,
            async () => {
              const result = await apiFetch<{ code: string }>('/api/logimail/admin/security-codes', {
                method: 'POST',
                body: JSON.stringify({ domain: domain.trim() || undefined, purpose, ttlHours: Number(ttlHours) }),
              });
              setCreatedCode(result.code);
            },
            'Đã tạo mã bảo mật mới.',
          );
        }}
      >
        <label className="form-field">
          <span>Domain (bỏ trống = mọi domain)</span>
          <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="logivn.com" autoComplete="off" />
        </label>
        <label className="form-field">
          <span>Loại mã</span>
          <select value={purpose} onChange={(event) => setPurpose(event.target.value as typeof purpose)}>
            <option value="account_signup">Đăng ký email</option>
            <option value="password_reset">Đặt lại mật khẩu</option>
          </select>
        </label>
        <label className="form-field">
          <span>Hiệu lực</span>
          <select value={ttlHours} onChange={(event) => setTtlHours(event.target.value)}>
            <option value="8">8 giờ</option>
            <option value="24">24 giờ</option>
            <option value="72">3 ngày</option>
            <option value="168">7 ngày</option>
          </select>
        </label>
        <button className="button-link button-reset primary" type="submit" disabled={busyId === createKey}>
          {busyId === createKey ? <Loader2 size={15} aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
          <span>Tạo mã</span>
        </button>
      </form>
      {createdCode ? <p className="form-alert success">Mã mới: <code>{createdCode}</code> — chỉ hiển thị một lần, hãy gửi an toàn cho người dùng.</p> : null}

      {codes.length === 0 ? (
        <p className="muted-copy">Chưa có mã bảo mật active.</p>
      ) : (
        <ul className="control-code-list">
          {codes.map((code) => {
            const rotateKey = `${code.id}-rotate`;
            const revokeKey = `${code.id}-revoke`;
            return (
              <li key={code.id} className="control-code-row">
                <div>
                  <code>{code.code ?? `••••-${code.codeHint}`}</code>
                  <p className="control-request-meta">{code.purpose === 'password_reset' ? 'Đặt lại mật khẩu' : 'Đăng ký email'} · {code.domain ?? 'mọi domain'} · hết hạn {formatDateTime(code.expiresAt)}</p>
                </div>
                <div className="control-request-actions">
                  <button className="icon-text-button" type="button" disabled={busyId === rotateKey} onClick={() => void run(rotateKey, () => apiFetch(`/api/logimail/admin/security-codes/${code.id}`, { method: 'POST', body: JSON.stringify({ action: 'rotate' }) }).then(() => undefined), 'Đã đổi mã mới.')}>
                    <RotateCcw size={15} aria-hidden="true" />Đổi
                  </button>
                  <button className="icon-text-button danger" type="button" disabled={busyId === revokeKey} onClick={() => void run(revokeKey, () => apiFetch(`/api/logimail/admin/security-codes/${code.id}`, { method: 'POST', body: JSON.stringify({ action: 'revoke' }) }).then(() => undefined), 'Đã thu hồi mã.')}>
                    <Trash2 size={15} aria-hidden="true" />Thu hồi
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
