'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Activity,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  DatabaseBackup,
  Globe2,
  HardDrive,
  Inbox,
  KeyRound,
  ListChecks,
  Loader2,
  MailCheck,
  Menu,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import { SignOutButton } from '@/components/auth-forms';
import { AdminMfaStepUpModal, useAdminMfaStepUp } from '@/components/admin-mfa-step-up';
import { ControlActionDialog, type ControlActionDialogConfig } from '@/components/control/control-action-dialog';
import { LogiMailLogo } from '@/components/logimail-logo';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

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
  targetEmail: string | null;
  purpose: string;
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

type DnsRecordPreview = {
  id?: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  proxied?: boolean;
  ttl?: number;
};

type DnsPreviewChange = {
  action: 'create' | 'update' | 'delete' | 'noop';
  before: DnsRecordPreview | null;
  after: DnsRecordPreview | null;
};

type DnsProvisionPreview = {
  zone: { id: string; name: string };
  status: 'ready' | 'needs_confirmation' | 'blocked';
  digest: string;
  generatedAt: string;
  changes: DnsPreviewChange[];
  diff: {
    toCreate: DnsRecordPreview[];
    toModify: Array<{ planned: DnsRecordPreview; existing: DnsRecordPreview }>;
    duplicates: DnsRecordPreview[];
  };
  findings: Array<{ code: string; severity: 'blocker' | 'warning' | 'info'; message: string; recordIds: string[] }>;
  blockers: Array<{ code: string; severity: 'blocker'; message: string; recordIds: string[] }>;
  confirmation: { previewId: string; text: string; expiresAt: string } | null;
};

type DnsPreviewState = DnsProvisionPreview & { freshness: 'fresh' | 'stale' };

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

const TABS: Array<{ key: TabKey; label: string; icon: typeof MailCheck }> = [
  { key: 'cockpit', label: 'Tổng quan', icon: BarChart3 },
  { key: 'queue', label: 'Hàng đợi duyệt', icon: ListChecks },
  { key: 'domains', label: 'Domain & DNS', icon: Globe2 },
  { key: 'deliverability', label: 'Deliverability', icon: MailCheck },
  { key: 'mailboxes', label: 'Quản lý mailbox', icon: Inbox },
  { key: 'codes', label: 'Mã bảo mật', icon: KeyRound },
  { key: 'ops', label: 'Cảnh báo & khóa', icon: ShieldCheck },
];

const TAB_COPY: Record<TabKey, { title: string; description: string }> = {
  cockpit: { title: 'Tổng quan MailOps', description: 'Theo dõi phê duyệt, domain, deliverability và hoạt động vận hành từ dữ liệu thật.' },
  queue: { title: 'Hàng đợi phê duyệt', description: 'Duyệt tài khoản, domain và mailbox theo đúng chính sách workspace.' },
  domains: { title: 'Domain & DNS', description: 'Quản lý nhiều domain, trạng thái xác thực và quyền đăng ký mailbox.' },
  deliverability: { title: 'Deliverability', description: 'Theo dõi điểm gửi, DKIM, warm-up và placement theo từng sending domain.' },
  mailboxes: { title: 'Quản lý mailbox', description: 'Kiểm tra mailbox đã cấp, quota và trạng thái hoạt động.' },
  codes: { title: 'Mã bảo mật', description: 'Cấp mã đăng ký hoặc đặt lại mật khẩu theo đúng email đích.' },
  ops: { title: 'Cảnh báo & bảo mật', description: 'Xử lý cảnh báo vận hành và các tác vụ khóa cần kiểm soát.' },
};

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
    if (body.ok) throw new ApiRequestError('Không gọi được API điều khiển.', 'api_request_failed', response.status);
    throw new ApiRequestError(body.error.message, body.error.code, response.status);
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

function dnsChangeLabel(action: DnsPreviewChange['action']) {
  if (action === 'create') return 'CREATE';
  if (action === 'update') return 'UPDATE';
  if (action === 'delete') return 'DELETE';
  return 'NOOP';
}

function dnsRecordMeta(record: DnsRecordPreview | null) {
  if (!record) return 'TTL — · Proxy —';
  const ttl = typeof record.ttl === 'number' ? String(record.ttl) : 'auto';
  const proxy = typeof record.proxied === 'boolean' ? (record.proxied ? 'on' : 'off') : 'n/a';
  const priority = typeof record.priority === 'number' ? ` · Priority ${record.priority}` : '';
  return `TTL ${ttl} · Proxy ${proxy}${priority}`;
}

function DnsChangePreviewRow({ change }: Readonly<{ change: DnsPreviewChange }>) {
  const record = change.after ?? change.before;
  if (!record) return null;
  return (
    <li className={`control-dns-change ${change.action}`}>
      <span className={`status-badge ${change.action === 'delete' ? 'danger' : change.action === 'update' ? 'warning' : change.action === 'create' ? 'success' : 'neutral'}`}>{dnsChangeLabel(change.action)}</span>
      <div>
        <strong>{record.type} {record.name}</strong>
        {change.action === 'update' ? (
          <div className="control-dns-value-diff">
            <code>{change.before?.content ?? '—'}</code>
            <ArrowRight size={13} aria-hidden="true" />
            <code>{change.after?.content ?? '—'}</code>
          </div>
        ) : <code>{record.content}</code>}
        <small>{change.action === 'update' ? `${dnsRecordMeta(change.before)} → ${dnsRecordMeta(change.after)}` : dnsRecordMeta(record)}</small>
      </div>
    </li>
  );
}

function activeAlerts(alerts: AlertRow[] | undefined) {
  return (alerts ?? []).filter((alert) => !alert.resolved_at);
}

function sendSuccessRate(ops: Ops | null | undefined) {
  if (!ops || ops.sendTotals.total === 0) return null;
  return Math.round((ops.sendTotals.sent / ops.sendTotals.total) * 100);
}

function dnsHealthState(domain: AdminDomain): 'success' | 'warning' | 'danger' | 'info' {
  const states = [domain.dns.mx, domain.dns.spf, domain.dns.dkim, domain.dns.dmarc, domain.dns.ptr];
  if (states.includes('fail')) return 'danger';
  if (states.includes('warning')) return 'warning';
  if (states.every((state) => state === 'pass')) return 'success';
  return 'info';
}

function dnsHealthLabel(state: ReturnType<typeof dnsHealthState>) {
  if (state === 'success') return 'DNS ổn định';
  if (state === 'warning') return 'Cần kiểm tra';
  if (state === 'danger') return 'DNS lỗi';
  return 'Chưa kiểm tra';
}

function requestTypeLabel(type: ApprovalRequest['type']) {
  if (type === 'account') return 'Tài khoản';
  if (type === 'domain') return 'Domain';
  return 'Mailbox';
}

export function ControlClient({ initialEmail, userLabel }: Readonly<{ initialEmail: string | null; userLabel?: string | null }>) {
  const [tab, setTab] = useState<TabKey>('cockpit');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState<SendingDomain[] | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionDialog, setActionDialog] = useState<ControlActionDialogConfig | null>(null);
  const [actionDialogValue, setActionDialogValue] = useState('');
  const mfaStepUp = useAdminMfaStepUp();
  const { active: mfaActive, runWithStepUp } = mfaStepUp;

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
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
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
    if (tab !== 'deliverability' || sending !== null) return undefined;
    const task = window.setTimeout(() => void loadSending(), 0);
    return () => window.clearTimeout(task);
  }, [tab, sending, loadSending]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.control-search input')?.focus();
      }
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, []);

  const run = useCallback(
    async (key: string, action: () => Promise<void>, successMessage: string): Promise<boolean> => {
      if (mfaActive) return false;
      setBusyId(key);
      setError(null);
      setNotice(null);
      try {
        await runWithStepUp(action);
        setNotice(successMessage);
        await load();
        return true;
      } catch (apiError) {
        setError(apiError instanceof Error ? apiError.message : 'Thao tác thất bại.');
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [load, mfaActive, runWithStepUp],
  );

  const openActionDialog = useCallback((config: ControlActionDialogConfig) => {
    setActionDialogValue(config.defaultValue ?? '');
    setActionDialog(config);
  }, []);

  const closeActionDialog = useCallback(() => {
    setActionDialog(null);
    setActionDialogValue('');
  }, []);

  const summary = data?.queue.summary;
  const domainSummary = data?.domainControl.summary;
  const copy = TAB_COPY[tab];
  const openAlerts = activeAlerts(data?.alerts);
  const criticalAlerts = openAlerts.filter((alert) => alert.severity === 'critical').length;
  const sendRate = sendSuccessRate(data?.ops);
  const systemTone = error ? 'danger' : openAlerts.length > 0 || (domainSummary?.warning ?? 0) > 0 ? 'warning' : data ? 'success' : 'info';
  const systemLabel = error
    ? 'Cần kiểm tra'
    : criticalAlerts > 0
      ? `${criticalAlerts} cảnh báo nghiêm trọng`
      : openAlerts.length > 0
        ? `${openAlerts.length} cảnh báo đang mở`
        : (domainSummary?.warning ?? 0) > 0
          ? `${domainSummary?.warning ?? 0} domain cần kiểm tra`
          : data
            ? 'Đang vận hành'
            : 'Đang đồng bộ';

  function selectTab(nextTab: TabKey) {
    setTab(nextTab);
    setMobileOpen(false);
    setAccountOpen(false);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    if (query.includes('dns') || query.includes('domain')) setTab('domains');
    else if (query.includes('mailbox') || query.includes('hộp thư')) setTab('mailboxes');
    else if (query.includes('deliver') || query.includes('dkim') || query.includes('spf')) setTab('deliverability');
    else if (query.includes('queue') || query.includes('duyệt')) setTab('queue');
    else if (query.includes('mã') || query.includes('code') || query.includes('reset')) setTab('codes');
    else if (query.includes('alert') || query.includes('cảnh báo') || query.includes('khóa')) setTab('ops');
    else setNotice(`Không tìm thấy khu vực phù hợp cho “${searchQuery.trim()}”.`);
  }

  return (
    <div className="control-app-shell">
      <button className={`control-sidebar-backdrop ${mobileOpen ? 'visible' : ''}`} type="button" aria-label="Đóng menu điều khiển" onClick={() => setMobileOpen(false)} />
      <aside className={`control-sidebar ${mobileOpen ? 'open' : ''}`} aria-label="MailOps navigation">
        <div className="control-sidebar-head">
          <Link href="/" aria-label="LogiVN MailOps dashboard">
            <LogiMailLogo subtitle="The Quiet Authority" />
          </Link>
          <button className="icon-button control-sidebar-close" type="button" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}><X size={18} aria-hidden="true" /></button>
        </div>
        <nav className="control-sidebar-nav">
          <p>Core</p>
          {TABS.slice(0, 1).map((item) => <ControlTabLink key={item.key} item={item} active={tab === item.key} count={0} onSelect={() => selectTab(item.key)} />)}
          <a className="control-nav-link" href="/mail/inbox"><Inbox size={16} aria-hidden="true" /><span>Hộp thư</span></a>
          <p>Mail Operations</p>
          {TABS.slice(1, 6).map((item) => <ControlTabLink key={item.key} item={item} active={tab === item.key} count={item.key === 'queue' ? summary?.pendingTotal ?? 0 : 0} onSelect={() => selectTab(item.key)} />)}
          <p>Infrastructure</p>
          <ControlTabLink item={TABS[6]!} active={tab === 'ops'} count={0} onSelect={() => selectTab('ops')} />
          <Link className="control-nav-link" href="/ops/mail-queue"><ListChecks size={16} aria-hidden="true" /><span>Mail Queue</span></Link>
          <Link className="control-nav-link" href="/ops/backups"><DatabaseBackup size={16} aria-hidden="true" /><span>Backup</span></Link>
          <Link className="control-nav-link" href="/ops/agent"><Bot size={16} aria-hidden="true" /><span>Agent Control</span></Link>
          <p>Administration</p>
          <Link className="control-nav-link" href="/team"><Users size={16} aria-hidden="true" /><span>Team</span></Link>
          <Link className="control-nav-link" href="/settings/security"><Settings size={16} aria-hidden="true" /><span>Settings</span></Link>
        </nav>
        <button className={`control-emergency-button ${openAlerts.length === 0 ? 'quiet' : ''}`} type="button" onClick={() => selectTab('ops')}>
          <Shield size={15} aria-hidden="true" />
          <span>{openAlerts.length > 0 ? `${openAlerts.length} cảnh báo cần xử lý` : 'Kiểm tra trạng thái hệ thống'}</span>
        </button>
        <div className="control-sidebar-footer">
          <span className={`control-live-dot ${systemTone}`} />
          <span>{systemLabel}</span>
          <span className="control-footer-separator">·</span>
          <span>{domainSummary?.cloudflareReady ? 'Cloudflare ready' : data ? 'DNS chưa sẵn sàng' : 'DNS pending'}</span>
        </div>
      </aside>
      <div className="control-app-main">
        <header className="control-app-topbar">
          <button className="icon-button control-menu-button" type="button" aria-label="Mở menu điều khiển" onClick={() => setMobileOpen(true)}><Menu size={18} aria-hidden="true" /></button>
          <form className="control-search" role="search" onSubmit={submitSearch}>
            <Search size={16} aria-hidden="true" />
            <input aria-label="Tìm mailbox, domain, logs" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search mailboxes, domains, logs..." />
            <kbd>⌘ K</kbd>
          </form>
          <div className="control-app-actions">
            <button className={`control-status-button ${criticalAlerts > 0 ? 'danger' : ''}`} type="button" onClick={() => selectTab('ops')} aria-label={`${openAlerts.length} cảnh báo chưa xử lý`}>
              <Bell size={15} aria-hidden="true" /> <span>{openAlerts.length} cảnh báo</span>
            </button>
            <button className={`control-status-button ${(domainSummary?.warning ?? 0) > 0 ? 'warning' : ''}`} type="button" onClick={() => selectTab('domains')} aria-label={`${domainSummary?.warning ?? 0} domain cần kiểm tra DNS`}>
              <Globe2 size={15} aria-hidden="true" /> <span>DNS {domainSummary ? `${domainSummary.warning}/${domainSummary.total}` : '—'}</span>
            </button>
            <div className="control-account-wrap">
              <button className="control-account-button" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}><span className="control-avatar"><ShieldCheck size={15} aria-hidden="true" /></span><span>{userLabel ?? data?.admin.email ?? initialEmail ?? 'Admin'}</span><ChevronDown size={14} aria-hidden="true" /></button>
              {accountOpen ? <div className="control-account-menu"><strong>{data?.admin.email ?? initialEmail ?? 'Admin'}</strong><Link href="/settings/profile" onClick={() => setAccountOpen(false)}>Hồ sơ tài khoản</Link><SignOutButton /></div> : null}
            </div>
          </div>
        </header>
        <main className="control-main control-app-content">
          <div className="control-root">
            <header className="control-header">
              <div><p className="control-kicker">LOGIMAIL / CONTROL CENTER</p><h1>{copy.title}</h1><p className="muted-copy">{copy.description}</p></div>
              <div className="control-header-actions"><span className={`status-badge ${systemTone}`}>{systemLabel}</span><button className="icon-text-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? 'spin' : ''} size={15} aria-hidden="true" />{loading ? 'Đang tải' : 'Làm mới'}</button></div>
            </header>

            {error ? <div className="control-inline-alert danger" role="alert"><AlertTriangle size={17} aria-hidden="true" /><div><strong>Không thể đồng bộ toàn bộ dữ liệu</strong><p>{error}</p></div><button className="icon-text-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={14} aria-hidden="true" />Thử lại</button></div> : null}
            {notice ? <p className="form-alert success" role="status">{notice}</p> : null}

            {loading && !data ? <ControlLoadingState /> : null}

            {data && tab === 'cockpit' ? (
              <section className="control-metric-grid" aria-label="Chỉ số vận hành">
                <MetricTile icon={Send} label="Tỷ lệ gửi thành công" value={sendRate === null ? '—' : `${sendRate}%`} detail={data.ops?.sendTotals.total ? `${data.ops.sendTotals.sent}/${data.ops.sendTotals.total} log gửi gần nhất` : 'Chưa có log gửi để tính'} tone={sendRate === null ? 'info' : sendRate >= 95 ? 'success' : sendRate >= 80 ? 'warning' : 'danger'} />
                <MetricTile icon={Globe2} label="Domain đang hoạt động" value={domainSummary?.active ?? 0} detail={`${domainSummary?.total ?? 0} domain · ${domainSummary?.warning ?? 0} cần kiểm tra`} tone={(domainSummary?.warning ?? 0) > 0 ? 'warning' : domainSummary?.active ? 'success' : 'info'} />
                <MetricTile icon={Inbox} label="Mailbox đã cấp" value={data.mailboxes.length} detail={`${data.mailboxes.filter((mailbox) => mailbox.status === 'active').length} mailbox đang active`} tone={data.mailboxes.length > 0 ? 'success' : 'info'} />
                <MetricTile icon={ListChecks} label="Yêu cầu chờ duyệt" value={summary?.pendingTotal ?? 0} detail={`${summary?.accounts ?? 0} tài khoản · ${summary?.domains ?? 0} domain · ${summary?.mailboxes ?? 0} mailbox`} tone={(summary?.pendingTotal ?? 0) > 0 ? 'warning' : 'success'} />
              </section>
            ) : null}

            {data && tab === 'cockpit' && data.ops ? <CockpitOps ops={data.ops} domains={data.domainControl.domains} alerts={data.alerts ?? []} onSelect={selectTab} /> : null}
            {data && tab === 'cockpit' && !data.ops ? <OpsUnavailable onRetry={() => void load()} /> : null}

      {data && (tab === 'cockpit' || tab === 'queue') ? (
        <section className="control-panel" aria-label="Hàng đợi duyệt">
          <div className="control-panel-head">
            <div>
              <h2><ListChecks size={16} aria-hidden="true" /> Hàng đợi duyệt {summary?.pendingTotal ? `(${summary.pendingTotal})` : ''}</h2>
              <p className="control-panel-description">Tài khoản, domain và mailbox đang chờ platform admin quyết định.</p>
            </div>
            {tab === 'cockpit' && data.queue.requests.length > 0 ? <button className="icon-text-button" type="button" onClick={() => selectTab('queue')}>Xem tất cả <ArrowRight size={14} aria-hidden="true" /></button> : null}
          </div>
          {data.queue.requests.length === 0 ? (
            <div className="control-empty-state"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>Hàng đợi đã sạch</strong><p>Không có yêu cầu nào đang chờ duyệt.</p></div></div>
          ) : (
            <ul className="control-request-list">
              {(tab === 'cockpit' ? data.queue.requests.slice(0, 4) : data.queue.requests).map((req) => (
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
                      onClick={() => openActionDialog({
                        actionKey: req.id,
                        title: `Từ chối ${req.title}`,
                        description: 'Lý do sẽ được lưu cùng quyết định trong audit log và hiển thị cho quy trình xử lý tiếp theo.',
                        confirmLabel: 'Từ chối yêu cầu',
                        tone: 'danger',
                        field: { kind: 'textarea', label: 'Lý do từ chối', placeholder: 'Nêu lý do cụ thể', required: true, minLength: 3 },
                        onConfirm: async (reason) => {
                          const completed = await run(req.id, () => apiFetch('/api/logimail/admin/requests', { method: 'POST', body: JSON.stringify({ type: req.type, requestId: req.id, action: 'reject', reason: reason.trim() }) }).then(() => undefined), `Đã từ chối ${req.title}.`);
                          closeActionDialog();
                          return completed;
                        },
                      })}
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
        <DomainsPanel domains={data.domainControl.domains} workspaces={data.domainControl.workspaces} busyId={busyId} run={run} openActionDialog={openActionDialog} closeActionDialog={closeActionDialog} />
      ) : null}

      {data && tab === 'mailboxes' ? (
        <MailboxesPanel mailboxes={data.mailboxes} />
      ) : null}

      {data && tab === 'deliverability' ? (
        <DeliverabilityPanel sending={sending} busyId={busyId} run={run} reload={loadSending} openActionDialog={openActionDialog} closeActionDialog={closeActionDialog} />
      ) : null}

      {data && tab === 'ops' ? (
        <OpsControlPanel alerts={data.alerts ?? []} busyId={busyId} run={run} openActionDialog={openActionDialog} closeActionDialog={closeActionDialog} />
      ) : null}

      {data && tab === 'codes' ? (
        <SecurityCodesPanel codes={data.securityCodes} busyId={busyId} run={run} />
      ) : null}
          </div>
        </main>
      </div>
      <ControlActionDialog
        state={actionDialog}
        value={actionDialogValue}
        busy={Boolean(actionDialog && busyId === actionDialog.actionKey)}
        onValueChange={setActionDialogValue}
        onClose={closeActionDialog}
      />
      <AdminMfaStepUpModal state={mfaStepUp.modal} onVerify={mfaStepUp.verify} onClose={mfaStepUp.close} />
    </div>
  );
}

function ControlTabLink({ item, active, count, onSelect }: Readonly<{ item: (typeof TABS)[number]; active: boolean; count: number; onSelect: () => void }>) {
  const Icon = item.icon;
  return (
    <button className={`control-nav-link ${active ? 'active' : ''}`} type="button" aria-current={active ? 'page' : undefined} onClick={onSelect}>
      <Icon size={16} aria-hidden="true" />
      <span>{item.label}</span>
      {count > 0 ? <span className="control-nav-count">{count}</span> : null}
    </button>
  );
}

function ControlLoadingState() {
  return (
    <div className="control-loading-state" role="status" aria-label="Đang tải dữ liệu MailOps">
      <div className="control-loading-metrics">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div>
      <div className="control-loading-panels"><span /><span /><span /></div>
      <p><Loader2 size={15} aria-hidden="true" /> Đang đồng bộ domain, mailbox và dữ liệu vận hành…</p>
    </div>
  );
}

function OpsUnavailable({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <section className="control-panel control-unavailable-panel" aria-label="Dữ liệu MailOps chưa sẵn sàng">
      <ServerCog size={20} aria-hidden="true" />
      <div><h2>Dữ liệu vận hành chưa sẵn sàng</h2><p>API tổng quan chưa trả snapshot send logs, deliverability hoặc backup. LogiMail không thay thế bằng số liệu mẫu.</p></div>
      <button className="icon-text-button" type="button" onClick={onRetry}><RefreshCcw size={14} aria-hidden="true" />Thử lại</button>
    </section>
  );
}

function MetricTile({ icon: Icon, label, value, detail, tone }: Readonly<{ icon: typeof MailCheck; label: string; value: number | string; detail: string; tone: string }>) {
  return (
    <div className={`control-metric-tile tone-${tone}`}>
      <div className="control-metric-heading"><span className="control-metric-icon"><Icon size={17} aria-hidden="true" /></span><span className="control-metric-label">{label}</span></div>
      <span className="control-metric-value">{value}</span>
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

function CockpitOps({
  ops,
  domains,
  alerts,
  onSelect,
}: Readonly<{
  ops: Ops;
  domains: AdminDomain[];
  alerts: AlertRow[];
  onSelect: (tab: TabKey) => void;
}>) {
  const maxVolume = Math.max(1, ...ops.sendVolume.map((day) => day.total));
  const hasVolume = ops.sendVolume.some((day) => day.total > 0);
  const unresolvedAlerts = activeAlerts(alerts);
  const criticalCount = unresolvedAlerts.filter((alert) => alert.severity === 'critical').length;
  const unhealthyDomains = domains.filter((domain) => dnsHealthState(domain) !== 'success');
  const healthyDomains = domains.length - unhealthyDomains.length;
  const latestBackupTone = ops.backups.latestStatus === 'completed' ? 'success' : ops.backups.latestStatus === 'failed' ? 'danger' : 'info';

  return (
    <div className="cockpit-ops-grid">
      <section className="control-panel cockpit-throughput">
        <div className="control-panel-head"><div><h2><BarChart3 size={16} aria-hidden="true" /> Lưu lượng gửi 7 ngày</h2><p className="control-panel-description">Dữ liệu từ email send logs gần nhất.</p></div><span className="status-badge neutral">{ops.sendTotals.total} log</span></div>
        {hasVolume ? (
          <div className="ops-bars" role="img" aria-label="Biểu đồ lưu lượng gửi 7 ngày">
            {ops.sendVolume.map((day) => (
              <div className="ops-bar-col" key={day.day}>
                <div className="ops-bar-track">
                  <div className="ops-bar-total" style={{ height: `${Math.round((day.total / maxVolume) * 100)}%` }} title={`${day.total} email`} />
                  <div className="ops-bar-sent" style={{ height: `${Math.round((day.sent / maxVolume) * 100)}%` }} title={`${day.sent} đã gửi`} />
                </div>
                <span className="ops-bar-value">{day.total}</span>
                <span className="ops-bar-label">{day.day}</span>
              </div>
            ))}
          </div>
        ) : <div className="control-empty-state compact"><BarChart3 size={18} aria-hidden="true" /><div><strong>Chưa có lưu lượng gửi</strong><p>Biểu đồ sẽ bắt đầu khi email send logs phát sinh.</p></div></div>}
        <div className="ops-send-totals">
          <span className="status-badge success"><Send size={12} aria-hidden="true" /> {ops.sendTotals.sent} gửi</span>
          <span className="status-badge warning">{ops.sendTotals.deferred} hoãn</span>
          <span className="status-badge danger">{ops.sendTotals.failed} lỗi</span>
          <span className="status-badge info">{ops.bounce.total} bounce</span>
        </div>
      </section>

      <section className="control-panel cockpit-infrastructure">
        <div className="control-panel-head"><div><h2><ServerCog size={16} aria-hidden="true" /> Hạ tầng & cảnh báo</h2><p className="control-panel-description">DNS, backup và alert từ dữ liệu hiện tại.</p></div><button className="icon-text-button" type="button" onClick={() => onSelect('ops')}>Mở MailOps <ArrowRight size={14} aria-hidden="true" /></button></div>
        <div className="ops-health-list">
          <div className="ops-health-row"><span className="ops-health-icon"><Globe2 size={16} aria-hidden="true" /></span><div><strong>Domain health</strong><p>{domains.length > 0 ? `${healthyDomains}/${domains.length} domain DNS ổn định` : 'Chưa có domain để kiểm tra'}</p></div><span className={`status-badge ${unhealthyDomains.length > 0 ? 'warning' : domains.length > 0 ? 'success' : 'info'}`}>{unhealthyDomains.length > 0 ? `${unhealthyDomains.length} cần xem` : domains.length > 0 ? 'OK' : '—'}</span></div>
          <div className="ops-health-row"><span className="ops-health-icon"><HardDrive size={16} aria-hidden="true" /></span><div><strong>Backup gần nhất</strong><p>{ops.backups.latestAt ? formatDateTime(ops.backups.latestAt) : 'Chưa có backup job'}</p></div><span className={`status-badge ${latestBackupTone}`}>{ops.backups.latestStatus ?? 'chưa có'}</span></div>
          <div className="ops-health-row"><span className="ops-health-icon"><AlertTriangle size={16} aria-hidden="true" /></span><div><strong>Cảnh báo mở</strong><p>{criticalCount > 0 ? `${criticalCount} cảnh báo nghiêm trọng` : 'Không có cảnh báo nghiêm trọng'}</p></div><span className={`status-badge ${criticalCount > 0 ? 'danger' : unresolvedAlerts.length > 0 ? 'warning' : 'success'}`}>{unresolvedAlerts.length}</span></div>
        </div>
        {unhealthyDomains.length > 0 ? <div className="ops-domain-watch"><p>Domain cần chú ý</p>{unhealthyDomains.slice(0, 4).map((domain) => { const state = dnsHealthState(domain); return <button key={domain.id} type="button" onClick={() => onSelect('domains')}><span>{domain.domain}</span><span className={`status-badge ${state}`}>{dnsHealthLabel(state)}</span></button>; })}</div> : null}
      </section>

      <section className="control-panel cockpit-deliverability">
        <div className="control-panel-head"><div><h2><MailCheck size={16} aria-hidden="true" /> Deliverability theo domain</h2><p className="control-panel-description">Kết quả kiểm tra gần nhất cho từng sending domain.</p></div><button className="icon-text-button" type="button" onClick={() => onSelect('deliverability')}>Chi tiết <ArrowRight size={14} aria-hidden="true" /></button></div>
        {ops.deliverability.length === 0 ? (
          <div className="control-empty-state compact"><MailCheck size={18} aria-hidden="true" /><div><strong>Chưa có kết quả kiểm tra</strong><p>Chạy auth check hoặc placement test để tạo dữ liệu.</p></div></div>
        ) : (
          <ul className="ops-list">
            {ops.deliverability.slice(0, 6).map((item) => (
              <li key={item.domain}>
                <span><strong>{item.domain}</strong><small>{formatDateTime(item.checkedAt)}</small></span>
                <span className={`status-badge ${scoreTone(item.score)}`}>{item.score}/100</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="control-panel cockpit-activity">
        <div className="control-panel-head"><div><h2><Activity size={16} aria-hidden="true" /> Hoạt động gần đây</h2><p className="control-panel-description">Audit log mới nhất trong toàn bộ control plane.</p></div><span className="status-badge neutral">{ops.activity.length} sự kiện</span></div>
        {ops.activity.length === 0 ? (
          <div className="control-empty-state compact"><Activity size={18} aria-hidden="true" /><div><strong>Chưa có audit event</strong><p>Hoạt động duyệt, DNS và gửi mail sẽ xuất hiện tại đây.</p></div></div>
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
  openActionDialog,
  closeActionDialog,
}: Readonly<{
  domains: AdminDomain[];
  workspaces: Workspace[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<boolean>;
  openActionDialog: (config: ControlActionDialogConfig) => void;
  closeActionDialog: () => void;
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
                  onClick={() => openActionDialog({
                    actionKey: removeKey,
                    title: `Gỡ domain ${domain.domain}`,
                    description: 'Domain sẽ bị vô hiệu hóa trong LogiMail. Mailbox và DNS liên quan cần được kiểm tra trước khi tiếp tục.',
                    confirmLabel: 'Gỡ domain',
                    tone: 'danger',
                    details: [`${domain.mailboxCount} mailbox đang gắn với domain`, `Mail host: ${domain.mailHostname ?? `mail.${domain.domain}`}`],
                    field: { kind: 'confirmation', label: 'Xác nhận domain', confirmationText: domain.domain },
                    onConfirm: async () => {
                      const completed = await run(removeKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}`, { method: 'DELETE', headers: { 'x-logimail-confirm': 'I_UNDERSTAND_LOGIMAIL_RISK' } }).then(() => undefined), `Đã xử lý gỡ domain ${domain.domain}.`);
                      closeActionDialog();
                      return completed;
                    },
                  })}
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
  run: (key: string, action: () => Promise<void>, message: string) => Promise<boolean>;
}>) {
  const [domain, setDomain] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
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
                body: JSON.stringify({
                  domain: domain.trim() || undefined,
                  targetEmail: purpose === 'password_reset' ? targetEmail.trim() || undefined : undefined,
                  purpose,
                  ttlHours: Number(ttlHours),
                }),
              });
              setCreatedCode(result.code);
            },
            'Đã tạo mã bảo mật mới.',
          );
        }}
      >
        <label className="form-field">
          <span>{purpose === 'password_reset' ? 'Domain' : 'Domain (bỏ trống = mọi domain)'}</span>
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="logivn.com"
            autoComplete="off"
            required={purpose === 'password_reset'}
          />
        </label>
        {purpose === 'password_reset' ? (
          <label className="form-field">
            <span>Email mailbox cần reset</span>
            <input
              type="email"
              value={targetEmail}
              onChange={(event) => setTargetEmail(event.target.value)}
              placeholder="user@logivn.com"
              autoComplete="off"
              required
            />
          </label>
        ) : null}
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
                  <code>••••-{code.codeHint}</code>
                  <p className="control-request-meta">
                    {code.purpose === 'password_reset' ? 'Đặt lại mật khẩu' : 'Đăng ký email'} · {code.domain ?? 'mọi domain'}
                    {code.targetEmail ? ` · ${code.targetEmail}` : ''} · hết hạn {formatDateTime(code.expiresAt)}
                  </p>
                </div>
                <div className="control-request-actions">
                  <button className="icon-text-button" type="button" disabled={busyId === rotateKey} onClick={() => void run(rotateKey, () => apiFetch<{ result?: { code?: string } }>(`/api/logimail/admin/security-codes/${code.id}`, { method: 'POST', body: JSON.stringify({ action: 'rotate' }) }).then((response) => {
                    if (response.result?.code) setCreatedCode(response.result.code);
                  }), 'Đã đổi mã mới; mã mới chỉ hiện một lần ở phía trên.')}>
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
  openActionDialog,
  closeActionDialog,
}: Readonly<{
  sending: SendingDomain[] | null;
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<boolean>;
  reload: () => Promise<void>;
  openActionDialog: (config: ControlActionDialogConfig) => void;
  closeActionDialog: () => void;
}>) {
  const [dnsPreviews, setDnsPreviews] = useState<Record<string, DnsPreviewState>>({});
  const [dnsConfirmations, setDnsConfirmations] = useState<Record<string, string>>({});

  function savePreview(domainId: string, preview: DnsProvisionPreview) {
    setDnsPreviews((current) => ({ ...current, [domainId]: { ...preview, freshness: 'fresh' } }));
    setDnsConfirmations((current) => ({ ...current, [domainId]: '' }));
  }

  function markPreviewStale(domainId: string) {
    setDnsPreviews((current) => {
      const preview = current[domainId];
      return preview ? { ...current, [domainId]: { ...preview, freshness: 'stale' } } : current;
    });
  }

  function clearPreview(domainId: string) {
    setDnsPreviews((current) => {
      const next = { ...current };
      delete next[domainId];
      return next;
    });
    setDnsConfirmations((current) => {
      const next = { ...current };
      delete next[domainId];
      return next;
    });
  }

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
          const previewKey = `${domain.id}-dns-preview`;
          const provisionKey = `${domain.id}-provision`;
          const dnsPreview = dnsPreviews[domain.id];
          const dnsBusy = busyId === previewKey || busyId === provisionKey;
          const dnsConfirmation = dnsConfirmations[domain.id] ?? '';
          const mutationCount = dnsPreview?.changes.filter((change) => change.action === 'create' || change.action === 'update').length ?? 0;
          const confirmationReady = Boolean(dnsPreview?.confirmation && dnsConfirmation.trim() === dnsPreview.confirmation.text);
          const applyDisabled = Boolean(
            dnsBusy
            || (dnsPreview?.freshness === 'fresh' && dnsPreview.status !== 'blocked' && mutationCount > 0 && !confirmationReady),
          );
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
                  openActionDialog({
                    actionKey: warmupKey,
                    title: `Bắt đầu warm-up ${domain.domain}`,
                    description: 'Đặt giới hạn gửi mục tiêu mỗi ngày. LogiMail sẽ áp dụng lịch tăng dần thay vì gửi ngay toàn bộ lưu lượng.',
                    confirmLabel: 'Bắt đầu warm-up',
                    defaultValue: '10000',
                    field: { kind: 'number', label: 'Mục tiêu gửi mỗi ngày', placeholder: '10000', min: 1 },
                    onConfirm: async (value) => {
                      const target = Number(value);
                      const completed = await run(warmupKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/warmup`, { method: 'POST', body: JSON.stringify({ action: 'start', target }) }).then(reload), `Đã bắt đầu warm-up cho ${domain.domain}.`);
                      closeActionDialog();
                      return completed;
                    },
                  });
                }}>
                  <PlayCircle size={15} aria-hidden="true" />Warm-up
                </button>
                <button className="icon-text-button" type="button" disabled={busyId === placementKey} onClick={() => void run(placementKey, () => apiFetch(`/api/logimail/admin/domains/${domain.id}/placement-test`, { method: 'POST' }).then(() => undefined), `Đã khởi tạo placement test cho ${domain.domain}.`)}>
                  <Send size={15} aria-hidden="true" />Placement
                </button>
                <button className={`icon-text-button ${dnsPreview?.freshness === 'fresh' && dnsPreview.status !== 'blocked' && mutationCount > 0 ? 'danger' : ''}`} type="button" disabled={applyDisabled} onClick={() => {
                  if (!dnsPreview || dnsPreview.freshness === 'stale' || dnsPreview.status === 'blocked' || mutationCount === 0) {
                    void run(
                      previewKey,
                      () => apiFetch<{ preview: DnsProvisionPreview }>(`/api/logimail/admin/domains/${domain.id}/dns-provision`).then(({ preview }) => savePreview(domain.id, preview)),
                      `Đã tải DNS preview mới cho ${domain.domain}.`,
                    );
                    return;
                  }
                  const previewConfirmation = dnsPreview.confirmation;
                  if (!previewConfirmation || !confirmationReady || Date.parse(previewConfirmation.expiresAt) <= Date.now()) {
                    markPreviewStale(domain.id);
                    return;
                  }
                  void run(
                    provisionKey,
                    async () => {
                      try {
                        const response = await apiFetch<{ result: { status: string } }>(`/api/logimail/admin/domains/${domain.id}/dns-provision`, {
                          method: 'POST',
                          headers: CONFIRM_HEADER,
                          body: JSON.stringify({
                            previewId: previewConfirmation.previewId,
                            expectedPreviewDigest: dnsPreview.digest,
                            confirmationText: dnsConfirmation.trim(),
                          }),
                        });
                        if (response.result.status === 'blocked' || response.result.status === 'needs_confirmation') {
                          markPreviewStale(domain.id);
                          throw new Error('DNS chưa được áp dụng vì zone cần một preview mới và xử lý conflict trước.');
                        }
                        clearPreview(domain.id);
                      } catch (apiError) {
                        if (apiError instanceof ApiRequestError && ['dns_preview_stale', 'dns_preview_replayed', 'dns_preview_superseded', 'dns_preview_expired', 'dns_preview_invalid', 'dns_preview_confirmation_invalid', 'preview_required'].includes(apiError.code)) {
                          markPreviewStale(domain.id);
                          throw new Error('DNS đã thay đổi sau preview. Hãy tải lại preview trước khi xác nhận.');
                        }
                        throw apiError;
                      }
                    },
                    `Đã áp dụng DNS plan đã xác nhận cho ${domain.domain}.`,
                  );
                }}>
                  {dnsBusy ? <Loader2 size={15} aria-hidden="true" /> : dnsPreview?.freshness === 'fresh' && dnsPreview.status !== 'blocked' ? <ShieldCheck size={15} aria-hidden="true" /> : <Globe2 size={15} aria-hidden="true" />}
                  {!dnsPreview ? 'Xem DNS preview' : dnsPreview.freshness === 'stale' ? 'Tải lại preview' : dnsPreview.status === 'blocked' ? 'Kiểm tra lại blocker' : mutationCount === 0 ? 'Tải lại preview' : 'Áp dụng DNS'}
                </button>
              </div>
              {dnsPreview ? (
                <div className={`control-dns-preview ${dnsPreview.freshness === 'stale' || dnsPreview.status === 'blocked' ? 'warning' : ''}`}>
                  <div className="control-request-tags">
                    <span className={`status-badge ${dnsPreview.freshness === 'stale' ? 'warning' : dnsPreview.status === 'blocked' ? 'danger' : dnsPreview.status === 'needs_confirmation' ? 'warning' : 'success'}`}>
                      {dnsPreview.freshness === 'stale' ? 'preview đã cũ' : dnsPreview.status}
                    </span>
                    <span className="status-badge neutral">zone {dnsPreview.zone.name}</span>
                    <span className="status-badge info">+{dnsPreview.diff.toCreate.length} / ~{dnsPreview.diff.toModify.length} / -{dnsPreview.diff.duplicates.length}</span>
                  </div>
                  <p className="control-request-meta">Digest {dnsPreview.digest.slice(0, 16)} · {formatDateTime(dnsPreview.generatedAt)}</p>
                  <ul className="control-dns-change-list" aria-label={`Full DNS diff cho ${domain.domain}`}>
                    {dnsPreview.changes.map((change, index) => <DnsChangePreviewRow key={`${change.action}-${change.before?.id ?? change.after?.id ?? change.after?.name ?? change.before?.name}-${index}`} change={change} />)}
                  </ul>
                  {dnsPreview.blockers.length > 0 ? (
                    <ul className="control-dns-findings">
                      {dnsPreview.blockers.map((finding) => <li key={finding.code}><AlertTriangle size={13} aria-hidden="true" />{finding.message}</li>)}
                    </ul>
                  ) : dnsPreview.confirmation ? (
                    <label className="form-field control-dns-confirmation">
                      <span>Nhập chính xác <code>{dnsPreview.confirmation.text}</code> để áp dụng</span>
                      <input
                        value={dnsConfirmation}
                        onChange={(event) => setDnsConfirmations((current) => ({ ...current, [domain.id]: event.target.value }))}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={dnsBusy || dnsPreview.freshness === 'stale'}
                      />
                      <small>Ticket dùng một lần, hết hạn lúc {formatDateTime(dnsPreview.confirmation.expiresAt)}.</small>
                    </label>
                  ) : <p className="control-request-meta">Không có mutation cần áp dụng.</p>}
                </div>
              ) : null}
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
  openActionDialog,
  closeActionDialog,
}: Readonly<{
  alerts: AlertRow[];
  busyId: string | null;
  run: (key: string, action: () => Promise<void>, message: string) => Promise<boolean>;
  openActionDialog: (config: ControlActionDialogConfig) => void;
  closeActionDialog: () => void;
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
            openActionDialog({
              actionKey: 'key-rotate',
              title: 'Xoay khóa mã hóa credential',
              description: 'Tác vụ sẽ re-encrypt một lô credential và ghi đầy đủ actor vào audit log.',
              confirmLabel: 'Xoay khóa',
              tone: 'danger',
              details: ['Không xóa credential hiện tại', 'Chỉ chạy một lô trong mỗi lần xác nhận'],
              onConfirm: async () => {
                const completed = await run('key-rotate', () => apiFetch('/api/logimail/admin/keys/rotate', { method: 'POST', headers: CONFIRM_HEADER, body: JSON.stringify({}) }).then(() => undefined), 'Đã chạy một lô xoay khóa credential.');
                closeActionDialog();
                return completed;
              },
            });
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
