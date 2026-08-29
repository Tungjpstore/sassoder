import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  RefreshCcw,
  type LucideIcon,
} from 'lucide-react';
import type { StatusTone } from '@/lib/logimail-types';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function StatusBadge({ children, tone = 'neutral' }: Readonly<{ children: React.ReactNode; tone?: StatusTone }>) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: Readonly<{
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}>) {
  return (
    <header className="page-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <span>{description}</span> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function ButtonLink({
  href,
  children,
  tone = 'primary',
  icon: Icon,
}: Readonly<{
  href: string;
  children: React.ReactNode;
  tone?: 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
  icon?: LucideIcon;
}>) {
  const content = <>{Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{children}</span></>;
  // Mailbox paths cross from the control host to mail.logivn.com. A native
  // navigation lets middleware perform the signed SSO handoff without a
  // client-side RSC prefetch that cannot follow the host redirect.
  return href.startsWith('/mail/')
    ? <a className={`button-link ${tone}`} href={href}>{content}</a>
    : <Link className={`button-link ${tone}`} href={href}>{content}</Link>;
}

export function ButtonLike({
  children,
  tone = 'secondary',
  icon: Icon,
  type = 'button',
  disabled = false,
}: Readonly<{
  children: React.ReactNode;
  tone?: 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger';
  icon?: LucideIcon;
  type?: 'button' | 'submit';
  disabled?: boolean;
}>) {
  return (
    <button className={`button-link button-reset ${tone}`} type={type} disabled={disabled}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Panel({
  title,
  description,
  children,
  action,
  className,
}: Readonly<{
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}>) {
  return (
    <section className={cx('panel', className)}>
      {title || description || action ? (
        <div className="panel-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="panel-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  helper,
  tone = 'neutral',
  icon: Icon,
}: Readonly<{
  label: string;
  value: string;
  helper?: string;
  tone?: StatusTone;
  icon?: LucideIcon;
}>) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-topline">
        <span>{label}</span>
        {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      </div>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}

export function HealthCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: Readonly<{ label: string; value: string; detail: string; tone?: StatusTone }>) {
  return (
    <article className={`health-card ${tone}`}>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </article>
  );
}

export function ActionCard({
  href,
  label,
  icon: Icon,
  tone = 'neutral',
}: Readonly<{ href: string; label: string; icon: LucideIcon; tone?: StatusTone }>) {
  return (
    <Link className={`action-card ${tone}`} href={href}>
      <span className="action-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <strong>{label}</strong>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}

export function ActivityTimeline({
  items,
}: Readonly<{ items: Array<{ time: string; title: string; detail: string; tone?: StatusTone }> }>) {
  return (
    <ol className="activity-timeline">
      {items.map((item) => (
        <li key={`${item.time}-${item.title}`}>
          <span className={`timeline-dot ${item.tone ?? 'neutral'}`} />
          <div>
            <time>{item.time}</time>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EmailVolumeChart({ data }: Readonly<{ data: Array<{ day: string; sent: number; received: number }> }>) {
  const max = Math.max(1, ...data.map((item) => item.received));

  return (
    <div className="chart-card" aria-label="Bieu do luong email theo ngay">
      <div className="chart-bars">
        {data.map((item) => (
          <div className="chart-column" key={item.day}>
            <span className="bar received" style={{ height: `${Math.max(14, (item.received / max) * 100)}%` }} />
            <span className="bar sent" style={{ height: `${Math.max(10, (item.sent / max) * 78)}%` }} />
            <small>{item.day}</small>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span><i className="legend received" />Tong log</span>
        <span><i className="legend sent" />Đã gửi</span>
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: Readonly<{
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
}>) {
  const style = { '--columns': columns.length } as React.CSSProperties;

  return (
    <div className="data-table" role="table" style={style}>
      <div className="data-row header" role="row">
        {columns.map((column) => (
          <span role="columnheader" key={column}>{column}</span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="data-row" role="row" key={index}>
          {row.map((cell, cellIndex) => (
            <span role="cell" key={cellIndex}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MailboxUsageBar({ usedMb, quotaMb }: Readonly<{ usedMb?: number | null; quotaMb: number }>) {
  const hasUsage = typeof usedMb === 'number' && Number.isFinite(usedMb);
  const percent = hasUsage ? Math.round((usedMb / quotaMb) * 100) : 0;
  const tone = hasUsage && percent > 80 ? 'warning' : 'success';

  return (
    <div className="usage-wrap">
      <div className="usage-meta">
        <span>{hasUsage ? `${usedMb}MB / ${quotaMb}MB` : `Quota ${quotaMb}MB`}</span>
        <strong>{hasUsage ? `${percent}%` : 'N/A'}</strong>
      </div>
      <span className={`usage-track ${tone}`}>
        <i style={{ width: `${Math.min(percent, 100)}%` }} />
      </span>
    </div>
  );
}

export function MailboxCard({
  mailbox,
}: Readonly<{
  mailbox: {
    id: string;
    email: string;
    displayName: string;
    permission: string;
    unread?: number | null;
    quotaMb: number;
    usedMb?: number | null;
    status: string;
    tone: StatusTone;
  };
}>) {
  return (
    <article className="mailbox-card">
      <div className="mailbox-card-head">
        <div>
          <strong>{mailbox.email}</strong>
          <span>{mailbox.displayName}</span>
        </div>
        <StatusBadge tone={mailbox.tone}>{mailbox.status}</StatusBadge>
      </div>
      <div className="mailbox-meta-grid">
        <span>Quyền <strong>{mailbox.permission}</strong></span>
        <span>Chưa đọc <strong>{mailbox.unread ?? 'Chưa đồng bộ'}</strong></span>
      </div>
      <MailboxUsageBar usedMb={mailbox.usedMb} quotaMb={mailbox.quotaMb} />
      <div className="card-actions">
        <ButtonLink href="/mail/inbox" tone="primary">Mở hộp thư</ButtonLink>
        <ButtonLink href="/mail/compose" tone="secondary">Soạn email</ButtonLink>
      </div>
    </article>
  );
}

export function DNSRecordCard({
  record,
}: Readonly<{
  record: {
    type: string;
    name: string;
    value: string;
    expected: string;
    current: string;
    proxy: string;
    status: string;
    tone: StatusTone;
    copy: string;
  };
}>) {
  return (
    <article className={`dns-card ${record.tone}`}>
      <div className="dns-main">
        <StatusBadge tone={record.tone}>{record.type}</StatusBadge>
        <div>
          <strong>{record.name}</strong>
          <code>{record.value}</code>
        </div>
      </div>
      <div className="dns-grid">
        <span>Proxy <strong>{record.proxy}</strong></span>
        <span>Expected <strong>{record.expected}</strong></span>
        <span>Current <strong>{record.current}</strong></span>
        <span>Status <strong>{record.status}</strong></span>
      </div>
      <div className="card-actions">
        <button className="icon-text-button" type="button" aria-label={`Copy ${record.name}`}>
          <Copy size={15} aria-hidden="true" />
          Copy
        </button>
        <button className="icon-text-button" type="button" aria-label={`Check ${record.name}`}>
          <RefreshCcw size={15} aria-hidden="true" />
          Check
        </button>
      </div>
    </article>
  );
}

export function CopyableRecordRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="copy-row">
      <span>{label}</span>
      <code>{value}</code>
      <button className="icon-button" type="button" aria-label={`Copy ${label}`}>
        <Copy size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PermissionTable({
  rows,
}: Readonly<{
  rows: Array<{ permission: string; owner: boolean; admin: boolean; mailManager: boolean; support: boolean; viewer: boolean }>;
}>) {
  const columns = ['Quyền', 'Owner', 'Admin', 'Mail Manager', 'Support', 'Viewer'];

  return (
    <DataTable
      columns={columns}
      rows={rows.map((row) => [
        <strong key="p">{row.permission}</strong>,
        <BooleanMark key="owner" value={row.owner} />,
        <BooleanMark key="admin" value={row.admin} />,
        <BooleanMark key="mailManager" value={row.mailManager} />,
        <BooleanMark key="support" value={row.support} />,
        <BooleanMark key="viewer" value={row.viewer} />,
      ])}
    />
  );
}

function BooleanMark({ value }: Readonly<{ value: boolean }>) {
  return value ? <span className="boolean-mark yes"><Check size={14} aria-hidden="true" /></span> : <span className="boolean-mark no">-</span>;
}

export function EmptyState({
  title,
  description,
  action,
  href,
}: Readonly<{ title: string; description: string; action: string; href: string }>) {
  return (
    <section className="empty-state">
      <span><AlertTriangle size={20} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <ButtonLink href={href} tone="primary">{action}</ButtonLink>
    </section>
  );
}

export function QueueStatusCard({ label, value, tone }: Readonly<{ label: string; value: string; tone: StatusTone }>) {
  return (
    <article className={`queue-status ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function BackupStatusCard() {
  return (
    <article className="backup-status-card">
      <div>
        <span>Last backup status</span>
        <strong>Completed</strong>
        <p>Backup gần nhất đã hoàn tất lúc 03:00. Restore thật cần xác nhận thủ công trên VPS.</p>
      </div>
      <StatusBadge tone="success">OK</StatusBadge>
    </article>
  );
}

export function AgentPolicyCard({
  title,
  items,
  tone,
}: Readonly<{ title: string; items: string[]; tone: StatusTone }>) {
  return (
    <article className={`agent-policy-card ${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

export function SecurityChecklist({
  items,
}: Readonly<{ items: Array<{ label: string; status: string; tone: StatusTone }> }>) {
  return (
    <div className="checklist">
      {items.map((item) => (
        <div className="checklist-row" key={item.label}>
          <strong>{item.label}</strong>
          <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

export function FormField({
  label,
  children,
  hint,
}: Readonly<{ label: string; children: React.ReactNode; hint?: string }>) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function SafetyNotice({ children, tone = 'warning' }: Readonly<{ children: React.ReactNode; tone?: StatusTone }>) {
  return (
    <aside className={`safety-notice ${tone}`}>
      <AlertTriangle size={18} aria-hidden="true" />
      <p>{children}</p>
    </aside>
  );
}
