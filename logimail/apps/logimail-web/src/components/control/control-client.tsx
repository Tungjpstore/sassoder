'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  Globe2,
  KeyRound,
  Loader2,
  MailCheck,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Send,
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

type AdminMailbox = {
  id: string;
  emailAddress: string;
  displayName: string | null;
  domain: string | null;
  workspaceId: string;
  status: string;
  quotaMb: number;
};

type Workspace = { id: string; name: string; slug: string; status: string };

type SendingDomain = {
  id: string;
  domain: string;
  workspaceName: string | null;
  status: string;
  streamType: 'transactional' | 'marketing';
  score: number | null;
  dailyLimit: number | null;
  usedToday: number;
};

type AlertRow = {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  resolved_at: string | null;
  created_at: string;
};

type Ops = {
  sendVolume: Array<{ day: string; sent: number; total: number }>;
  sendTotals: { sent: number; deferred: number; failed: number; total: number };
  deliverability: Array<{ domain: string; score: number; checkedAt: string | null }>;
  bounce: { hard: number; soft: number; complaint: number; blocked: number; total: number };
  backups: { latestStatus: string | null; latestAt: string | null; completed: number; failed: number; total: number };
  activity: Array<{ id: string; action: string; actorId: string | null; targetType: string | null; createdAt: string }>;
};

type Overview = {
  admin: { email: string | null; role: string; fullName: string | null };
  queue: {
    summary: { pendingTotal: number; accounts: number; domains: number; mailboxes: number };
    requests: ApprovalRequest[];
  };
  domainControl: {
    summary: { total: number; active: number; registrationEnabled: number; warning: number; cloudflareReady: boolean };
    workspaces: Workspace[];
    domains: AdminDomain[];
  };
  mailboxes: AdminMailbox[];
  securityCodes: SecurityCode[];
  ops: Ops | null;
  alerts?: AlertRow[];
};

type TabKey = 'cockpit' | 'queue' | 'domains' | 'mailboxes' | 'codes' | 'deliverability' | 'ops';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'cockpit', label: 'Tổng quan' },
  { key: 'queue', label: 'Hàng đợi duyệt' },
  { key: 'domains', label: 'Domain & DNS' },
  { key: 'deliverability', label: 'Deliverability' },
  { key: 'mailboxes', label: 'Mailbox' },
  { key: 'codes', label: 'Mã bảo mật' },
  { key: 'ops', label: 'Cảnh báo & Khóa' },
];

const CONFIRM_HEADER = { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' };

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
  const [sending, setSending] = useState<SendingDomain[] | null>(null);

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

  const loadSending = useCallback(async () => {
    try {
      const result = await apiFetch<{ domains: SendingDomain[] }>('/api/logimail/admin/domains');
      setSending(result.domains);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Không tải được danh sách Sending_Domain.');
    }
  }, []);

  useEffect(() => {
    if (tab === 'deliverability' && sending === null) void loadSending();
  }, [tab, sending, loadSending]);

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

      {data && tab === 'cockpit' && data.ops ? <CockpitOps ops={data.ops} /> : null}

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
        <DomainsPanel domains={data.domainControl.domains} workspaces={data.domainControl.workspaces} busyId={busyId} run={run} />
      ) : null}

      {data && tab === 'mailboxes' ? (
        <MailboxesPanel mailboxes={data.mailboxes} />
      ) : null}

      {data && tab === 'deliverability' ? (
        <DeliverabilityPanel sending={sending} busyId={busyId} run={run} reload={loadSending} />
      ) : null}

      {data && tab === 'ops' ? (
        <OpsControlPanel alerts={data.alerts ?? []} busyId={busyId} run={run} />
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

function scoreTone(score: number) {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

function activityLabel(action: string) {
  const map: Record<string, string> = {
    'logimail.account_request_approved': 'Duyệt tài khoản',
    'logimail.domain_request_approved': 'Duyệt domain',
    'logimail.mailbox_request_approved': 'Duyệt mailbox',
    'logimail.account_request_rejected': 'Từ chối tài khoản',
    'logimail.domain_request_rejected': 'Từ chối domain',
    'logimail.mailbox_request_rejected': 'Từ chối mailbox',
    'logimail.domain_created': 'Thêm domain',
    'logimail.domain_updated': 'Cập nhật domain',
    'logimail.domain_dns_checked': 'Kiểm DNS',
    'logimail.domain_registration_enabled': 'Bật đăng ký domain',
    'logimail.domain_registration_disabled': 'Tắt đăng ký domain',
    'logimail.security_code_created': 'Tạo mã bảo mật',
    'logimail.security_code_rotated': 'Đổi mã bảo mật',
    'logimail.security_code_revoked': 'Thu hồi mã bảo mật',
    'mail.native_send': 'Gửi email',
  };
  return map[action] ?? action;
}

function CockpitOps({ ops }: Readonly<{ ops: Ops }>) {
  const maxVolume = Math.max(1, ...ops.sendVolume.map((day) => day.total));
  return (
    <div className="cockpit-ops-grid">
      <section className="control-panel">
        <h2><BarChart3 size={16} aria-hidden="true" /> Lưu lượng gửi 7 ngày</h2>
        <div className="ops-bars" role="img" aria-label="Biểu đồ lưu lượng gửi 7 ngày">
          {ops.sendVolume.map((day) => (
            <div className="ops-bar-col" key={day.day}>
              <div className="ops-bar-track">
                <div className="ops-bar-total" style={{ height: `${Math.round((day.total / maxVolume) * 100)}%` }} title={`${day.total} email`} />
                <div className="ops-bar-sent" style={{ height: `${Math.round((day.sent / maxVolume) * 100)}%` }} title={`${day.sent} đã gửi`} />
              </div>
              <span className="ops-bar-label">{day.day}</span>
            </div>
          ))}
        </div>
        <div className="ops-send-totals">
          <span className="status-badge success"><Send size={12} aria-hidden="true" /> {ops.sendTotals.sent} gửi</span>
          <span className="status-badge warning">{ops.sendTotals.deferred} hoãn</span>
          <span className="status-badge danger">{ops.sendTotals.failed} lỗi</span>
          <span className="status-badge info">{ops.bounce.total} bounce</span>
        </div>
      </section>

      <section className="control-panel">
        <h2><MailCheck size={16} aria-hidden="true" /> Deliverability theo domain</h2>
        {ops.deliverability.length === 0 ? (
          <p className="muted-copy">Chưa có lần kiểm tra deliverability nào.</p>
        ) : (
          <ul className="ops-list">
            {ops.deliverability.map((item) => (
              <li key={item.domain}>
                <span>{item.domain}</span>
                <span className={`status-badge ${scoreTone(item.score)}`}>{item.score}/100</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ops-send-totals">
          <span className={`status-badge ${ops.backups.failed > 0 ? 'danger' : ops.backups.total > 0 ? 'success' : 'info'}`}>
            <DatabaseBackup size={12} aria-hidden="true" /> Backup: {ops.backups.latestStatus ?? 'chưa có'}
          </span>
          <span className="status-badge neutral">{ops.backups.completed}/{ops.backups.total} hoàn tất</span>
        </div>
      </section>

      <section className="control-panel cockpit-activity">
        <h2><Activity size={16} aria-hidden="true" /> Hoạt động gần đây</h2>
        {ops.activity.length === 0 ? (
          <p className="muted-copy">Chưa có hoạt động nào được ghi nhận.</p>
        ) : (
          <ul className="ops-timeline">
            {ops.activity.map((item) => (
              <li key={item.id}>
                <Clock size={13} aria-hidden="true" />
                <div>
                  <strong>{activityLabel(item.action)}</strong>
                  <span className="control-request-meta">{item.targetType ?? '—'} · {formatDateTime(item.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DnsPill({ label, state }: Readonly<{ label: string; state: DnsState }>) {
  return <span className={`status-badge ${dnsTone(state)}`}>{label} {state}</span>;
}

function DomainsPanel({
  domains,
  workspaces,
  busyId,
  run,
}: Readonly<{
  domains: AdminDomain[];
  workspaces: Workspace[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<void>;
}>) {
  const [newDomain, setNewDomain] = useState('');
  const [mailHostname, setMailHostname] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const createKey = 'create-domain';

  return (
    <section className="control-panel" aria-label="Domain và DNS">
      <h2>Domain & DNS ({domains.length})</h2>

      <form
        className="control-code-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            createKey,
            () => apiFetch('/api/logimail/admin/domains', {
              method: 'POST',
              body: JSON.stringify({ domain: newDomain.trim(), mailHostname: mailHostname.trim() || undefined, workspaceId: workspaceId || undefined }),
            }).then(() => { setNewDomain(''); setMailHostname(''); }),
            'Đã thêm domain.',
          );
        }}
      >
        <label className="form-field">
          <span>Domain mới</span>
          <input value={newDomain} onChange={(event) => setNewDomain(event.target.value)} placeholder="example.com" autoComplete="off" required />
        </label>
        <label className="form-field">
          <span>Mail host (tuỳ chọn)</span>
          <input value={mailHostname} onChange={(event) => setMailHostname(event.target.value)} placeholder="mail.example.com" autoComplete="off" />
        </label>
        {workspaces.length > 1 ? (
          <label className="form-field">
            <span>Workspace</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              <option value="">Mặc định</option>
              {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name} ({ws.slug})</option>)}
            </select>
          </label>
        ) : null}
        <button className="button-link button-reset primary" type="submit" disabled={busyId === createKey}>
          {busyId === createKey ? <Loader2 size={15} aria-hidden="true" /> : <Globe2 size={15} aria-hidden="true" />}
          <span>Thêm domain</span>
        </button>
      </form>

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

function MailboxesPanel({ mailboxes }: Readonly<{ mailboxes: AdminMailbox[] }>) {
  return (
    <section className="control-panel" aria-label="Mailbox">
      <h2>Mailbox ({mailboxes.length})</h2>
      {mailboxes.length === 0 ? (
        <p className="muted-copy">Chưa có mailbox nào. Mailbox được tạo qua luồng duyệt yêu cầu.</p>
      ) : (
        <ul className="control-code-list">
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id} className="control-code-row">
              <div>
                <strong>{mailbox.emailAddress}</strong>
                <p className="control-request-meta">
                  {mailbox.displayName ? `${mailbox.displayName} · ` : ''}{mailbox.domain ?? '—'} · quota {mailbox.quotaMb}MB
                </p>
              </div>
              <span className={`status-badge ${mailbox.status === 'active' ? 'success' : mailbox.status === 'suspended' || mailbox.status === 'disabled' ? 'danger' : 'warning'}`}>{mailbox.status}</span>
            </li>
          ))}
        </ul>
      )}
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


function DeliverabilityPanel({
  sending,
  busyId,
  run,
  reload,
}: Readonly<{
  sending: SendingDomain[] | null;
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<void>;
  reload: () => Promise<void>;
}>) {
  if (sending === null) return <p className="muted-copy">Đang tải Sending_Domain…</p>;
  if (sending.length === 0) return <section className="control-panel"><h2>Deliverability</h2><p className="muted-copy">Chưa có Sending_Domain nào.</p></section>;

  return (
    <section className="control-panel" aria-label="Deliverability theo Sending_Domain">
      <h2>Deliverability ({sending.length} domain)</h2>
      <p className="muted-copy">Kiểm tra auth records, quản lý DKIM, warm-up và placement cho từng Sending_Domain.</p>
      <ul className="control-request-list">
        {sending.map((domain) => {
          const checkKey = `${domain.id}-authcheck`;
          const dkimKey = `${domain.id}-dkim`;
          const rotateKey = `${domain.id}-dkimrotate`;
          const warmupKey = `${domain.id}-warmup`;
          const placementKey = `${domain.id}-placement`;
          const provisionKey = `${domain.id}-provision`;
          return (
            <li key={domain.id} className="control-request-row">
              <div className="control-request-main">
                <div className="control-request-tags">
                  <span className={`status-badge ${scoreTone(domain.score ?? 0)}`}>Score {domain.score ?? '—'}</span>
                  <span className="status-badge info">{domain.streamType}</span>
                  <span className={`status-badge ${domain.status === 'active' ? 'success' : 'warning'}`}>{domain.status}</span>
                </div>
                <strong>{domain.domain}</strong>
                <p className="muted-copy">{domain.workspaceName ?? '—'} · quota ngày {domain.usedToday}/{domain.dailyLimit ?? '∞'}</p>
              </div>
              <div className="control-request-actions">
                <button className="icon-text-button" type="button" disabled={busyId === checkKey} onClick={() => void run(checkKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/auth-check`, { method: 'POST' }).then(reload), `Đã kiểm tra auth cho ${domain.domain}.`)}>
                  {busyId === checkKey ? <Loader2 size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}Auth check
                </button>
                <button className="icon-text-button" type="button" disabled={busyId === dkimKey} onClick={() => void run(dkimKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/dkim`, { method: 'POST', body: JSON.stringify({ action: 'create' }) }).then(reload), `Đã tạo DKIM selector cho ${domain.domain}.`)}>
                  <KeyRound size={15} aria-hidden="true" />DKIM tạo
                </button>
                <button className="icon-text-button" type="button" disabled={busyId === rotateKey} onClick={() => void run(rotateKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/dkim`, { method: 'POST', body: JSON.stringify({ action: 'rotate' }) }).then(reload), `Đã rotate DKIM cho ${domain.domain}.`)}>
                  <RotateCcw size={15} aria-hidden="true" />DKIM rotate
                </button>
                <button className="icon-text-button" type="button" disabled={busyId === warmupKey} onClick={() => {
                  const target = Number(window.prompt(`Target gửi/ngày cho warm-up ${domain.domain}?`, '10000') ?? '');
                  if (!Number.isFinite(target) || target <= 0) return;
                  void run(warmupKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/warmup`, { method: 'POST', body: JSON.stringify({ action: 'start', target }) }).then(reload), `Đã bắt đầu warm-up cho ${domain.domain}.`);
                }}>
                  <PlayCircle size={15} aria-hidden="true" />Warm-up
                </button>
                <button className="icon-text-button" type="button" disabled={busyId === placementKey} onClick={() => void run(placementKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/placement-test`, { method: 'POST' }).then(() => undefined), `Đã khởi tạo placement test cho ${domain.domain}.`)}>
                  <Send size={15} aria-hidden="true" />Placement
                </button>
                <button className="icon-text-button danger" type="button" disabled={busyId === provisionKey} onClick={() => {
                  if (!window.confirm(`Cấp phát DNS qua Cloudflare cho ${domain.domain}? Hành động này thay đổi DNS thật.`)) return;
                  void run(provisionKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/dns-provision`, { method: 'POST', headers: CONFIRM_HEADER, body: JSON.stringify({}) }).then(() => undefined), `Đã chạy cấp phát DNS cho ${domain.domain}.`);
                }}>
                  <Globe2 size={15} aria-hidden="true" />DNS provision
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function alertTone(severity: AlertRow['severity']) {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function OpsControlPanel({
  alerts,
  busyId,
  run,
}: Readonly<{
  alerts: AlertRow[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<void>;
}>) {
  const open = alerts.filter((alert) => !alert.resolved_at);
  return (
    <section className="control-panel" aria-label="Cảnh báo và khóa mã hóa">
      <div className="control-panel-head">
        <h2>Cảnh báo ({open.length} chưa xử lý)</h2>
        <div className="control-request-actions">
          <button className="icon-text-button" type="button" disabled={busyId === 'alerts-scan'} onClick={() => void run('alerts-scan', () => apiFetch('/api/logimail/admin/alerts', { method: 'POST', body: JSON.stringify({ action: 'scan' }) }).then(() => undefined), 'Đã quét cảnh báo bounce-rate và SLA.')}>
            {busyId === 'alerts-scan' ? <Loader2 size={15} aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}Quét ngay
          </button>
          <button className="icon-text-button danger" type="button" disabled={busyId === 'key-rotate'} onClick={() => {
            if (!window.confirm('Xoay vòng khóa mã hóa credential? Hệ thống sẽ re-encrypt theo lô.')) return;
            void run('key-rotate', () => apiFetch('/api/logimail/admin/keys/rotate', { method: 'POST', headers: CONFIRM_HEADER, body: JSON.stringify({}) }).then(() => undefined), 'Đã chạy một lô xoay khóa credential.');
          }}>
            <KeyRound size={15} aria-hidden="true" />Xoay khóa
          </button>
        </div>
      </div>
      {alerts.length === 0 ? (
        <p className="muted-copy">Không có cảnh báo nào.</p>
      ) : (
        <ul className="control-code-list">
          {alerts.map((alert) => {
            const resolveKey = `${alert.id}-resolve`;
            return (
              <li key={alert.id} className="control-code-row">
                <div>
                  <div className="control-request-tags">
                    <span className={`status-badge ${alertTone(alert.severity)}`}>{alert.kind}</span>
                    {alert.resolved_at ? <span className="status-badge success">đã xử lý</span> : null}
                  </div>
                  <strong>{alert.message}</strong>
                  <p className="control-request-meta">{formatDateTime(alert.created_at)}</p>
                </div>
                {alert.resolved_at ? null : (
                  <button className="icon-text-button" type="button" disabled={busyId === resolveKey} onClick={() => void run(resolveKey, () => apiFetch('/api/logimail/admin/alerts', { method: 'POST', body: JSON.stringify({ action: 'resolve', alertId: alert.id }) }).then(() => undefined), 'Đã đánh dấu xử lý cảnh báo.')}>
                    <CheckCircle2 size={15} aria-hidden="true" />Xử lý
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
