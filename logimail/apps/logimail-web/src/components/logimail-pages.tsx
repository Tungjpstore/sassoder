import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  DatabaseBackup,
  Download,
  FileText,
  Inbox,
  KeyRound,
  MailCheck,
  MailPlus,
  MailWarning,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  UploadCloud,
  UserPlus,
} from 'lucide-react';
import { AuthLoginForm, AuthRegisterForm, ForgotPasswordForm, InviteAcceptForm, SignOutButton } from '@/components/auth-forms';
import { AccountDeleteForm } from '@/components/account-delete-form';
import { MailboxAdminActions, SecurityAdminActions } from '@/components/admin-action-controls';
import { LogiMailLogo } from '@/components/logimail-logo';
import { AppShell } from '@/components/logimail-shell';
import { MailAppShell } from '@/components/mail-app-shell';
import { MailComposeClient, MailInboxClient, MailMessageClient } from '@/components/mail-native-client';
import { ProfileSettingsForm } from '@/components/profile-settings-form';
import { PwaNotificationSettings } from '@/components/pwa-notifications';
import { AliasRequestForm, BackupRequestButton, DeliverabilityCheckButton, DomainRequestForm, MailboxRequestForm, MailLabelForm, MailRuleForm, TeamInviteForm } from '@/components/request-forms';
import {
  ActionCard,
  ActivityTimeline,
  AgentPolicyCard,
  ButtonLike,
  ButtonLink,
  CopyableRecordRow,
  DataTable,
  EmailVolumeChart,
  EmptyState,
  FormField,
  HealthCard,
  MailboxCard,
  MailboxUsageBar,
  MetricCard,
  PageHeader,
  Panel,
  PermissionTable,
  QueueStatusCard,
  SafetyNotice,
  SecurityChecklist,
  StatusBadge,
} from '@/components/logimail-ui';
import {
  buildSendVolume,
  buildShellStatus,
  aliasesForDomain,
  aliasesForMailbox,
  backupSummary,
  bounceEventsForDomain,
  bounceSummary,
  dateTime,
  deliverabilityScore,
  draftsForMailbox,
  dmarcReportsForDomain,
  expectedDnsRecords,
  findDomain,
  findMailbox,
  getLogimailOperationalData,
  labelsForMailbox,
  latestDeliverabilityForDomain,
  pendingTotal,
  permissionForMailbox,
  rulesForMailbox,
  shortDate,
  statusLabel,
  statusTone,
  tasksForMailbox,
  type DomainRow,
  type LogimailOperationalData,
  type MailboxRow,
} from '@/lib/logimail-data';
import type { StatusTone } from '@/lib/logimail-types';
import type { MailFolderKey, MailUiMailbox } from '@/lib/mail-ui-types';
import { getRegistrationDomains } from '@/lib/registration-domains';
import { isPlatformRole } from '@/lib/security/rbac';

function shellProps(data: LogimailOperationalData) {
  return {
    statusItems: buildShellStatus(data),
    userLabel: data.auth.profile?.full_name ?? data.auth.userEmail ?? 'Tài khoản',
  };
}

function mailShellProps(data: LogimailOperationalData) {
  return {
    userLabel: data.auth.profile?.full_name ?? data.auth.userEmail ?? 'Tài khoản',
  };
}

function accessGate(data: LogimailOperationalData) {
  if (data.auth.status === 'unauthenticated') redirect('/auth/login');
  if (data.auth.status === 'approved') return null;
  if (data.auth.status === 'not_configured') {
    return (
      <main className="auth-shell">
        <section className="auth-panel wide">
          <h1>Chưa cấu hình Supabase</h1>
          <p>LogiMail cần `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` để đọc dữ liệu thật qua RLS.</p>
          <SafetyNotice tone="info">Không dùng dữ liệu giả khi thiếu cấu hình. Hãy đặt env production/local rồi tải lại trang.</SafetyNotice>
        </section>
      </main>
    );
  }

  const latestRequest = data.accountRequests[0];
  return (
    <main className="auth-shell">
      <section className="auth-panel wide">
        <h1>Quyền truy cập LogiMail</h1>
        {data.auth.status === 'unregistered' ? (
          <>
            <p>Tài khoản hiện tại chưa có email LogiMail.</p>
            <div className="card-actions"><ButtonLink href="/auth/register">Tạo email bằng mã bảo mật</ButtonLink><SignOutButton /></div>
          </>
        ) : null}
        {data.auth.status === 'pending' ? (
          <>
            <p>Yêu cầu đang chờ admin duyệt. Khi được duyệt, workspace và quyền LogiMail sẽ xuất hiện tự động.</p>
            <div className="invite-summary">
              <span>Email: <strong>{data.auth.userEmail}</strong></span>
              <span>Trạng thái: <strong>{statusLabel(latestRequest?.status ?? 'pending')}</strong></span>
              <span>Gửi lúc: <strong>{dateTime(latestRequest?.created_at)}</strong></span>
            </div>
          </>
        ) : null}
        {data.auth.status === 'rejected' || data.auth.status === 'suspended' ? (
          <>
            <p>Tài khoản hiện không có quyền vào LogiMail.</p>
            <SafetyNotice>{latestRequest?.rejection_reason ?? 'Liên hệ admin LogiVN để kiểm tra quyền truy cập.'}</SafetyNotice>
          </>
        ) : null}
        <div className="card-actions"><SignOutButton /></div>
      </section>
    </main>
  );
}

async function loadApprovedData() {
  const data = await getLogimailOperationalData();
  const gate = accessGate(data);
  return { data, gate };
}

function mailboxView(data: LogimailOperationalData, mailbox: MailboxRow) {
  return {
    id: mailbox.id,
    email: mailbox.email_address,
    displayName: mailbox.display_name ?? mailbox.email_address,
    permission: permissionForMailbox(data, mailbox.id),
    unread: null,
    quotaMb: mailbox.quota_mb,
    usedMb: null,
    status: statusLabel(mailbox.status),
    tone: statusTone(mailbox.status),
  };
}

function mailUiMailboxes(data: LogimailOperationalData): MailUiMailbox[] {
  const currentUserEmail = data.auth.userEmail?.trim().toLowerCase() ?? '';
  return data.mailboxes
    .filter((mailbox) => mailbox.status === 'active')
    // Workspace membership does not grant mailbox access; keep only explicit grants
    // (or the user's own mailbox, which the API also authorizes).
    .filter((mailbox) => permissionForMailbox(data, mailbox.id) !== 'member' || mailbox.email_address.toLowerCase() === currentUserEmail)
    .map((mailbox) => ({
      id: mailbox.id,
      emailAddress: mailbox.email_address,
      displayName: mailbox.display_name,
      permission: permissionForMailbox(data, mailbox.id),
      aliases: aliasesForMailbox(data, mailbox.id).map((alias) => ({
        id: alias.id,
        emailAddress: alias.alias_email,
        displayName: alias.display_name,
        status: alias.status,
      })),
    }));
}

function domainById(data: LogimailOperationalData, domainId: string) {
  return data.domains.find((domain) => domain.id === domainId) ?? null;
}

function dnsSignals(domain: DomainRow) {
  return [
    { label: 'MX', status: statusLabel(domain.mx_status), tone: statusTone(domain.mx_status) },
    { label: 'SPF', status: statusLabel(domain.spf_status), tone: statusTone(domain.spf_status) },
    { label: 'DKIM', status: statusLabel(domain.dkim_status), tone: statusTone(domain.dkim_status) },
    { label: 'DMARC', status: statusLabel(domain.dmarc_status), tone: statusTone(domain.dmarc_status) },
    { label: 'PTR', status: statusLabel(domain.ptr_status), tone: statusTone(domain.ptr_status) },
  ];
}

function deliverabilitySignals(domain: DomainRow) {
  const authSignals = dnsSignals(domain);
  const authClean = [domain.mx_status, domain.spf_status, domain.dkim_status, domain.dmarc_status, domain.ptr_status].every((signal) => signal === 'pass');
  return [
    ...authSignals,
    { label: 'MTA-STS/TLS-RPT', status: authClean ? 'Nên bật tiếp' : 'Chờ auth sạch', tone: authClean ? 'warning' as StatusTone : 'neutral' as StatusTone },
    { label: 'BIMI/logo inbox', status: domain.dmarc_status === 'pass' ? 'Sau DMARC enforcement' : 'Chờ DMARC', tone: 'neutral' as StatusTone },
    { label: 'Postmaster spam rate', status: 'Cần theo dõi ngoài inbox', tone: 'info' as StatusTone },
  ];
}

function authSignalSummary(data: LogimailOperationalData) {
  const domains = data.domains.length;
  const passSignals = data.domains.reduce((total, domain) => total + [domain.mx_status, domain.spf_status, domain.dkim_status, domain.dmarc_status, domain.ptr_status].filter((item) => item === 'pass').length, 0);
  const allSignals = Math.max(1, domains * 5);
  return `${passSignals}/${allSignals}`;
}

function realActivity(data: LogimailOperationalData) {
  return data.auditLogs.slice(0, 8).map((log) => ({
    time: shortDate(log.created_at),
    title: log.action,
    detail: [log.target_type, log.target_id].filter(Boolean).join(' · ') || 'LogiMail audit log',
    tone: 'info' as StatusTone,
  }));
}

function quickActions(data: LogimailOperationalData) {
  const firstDomain = data.domains[0];
  return [
    { label: 'Mở hộp thư', href: '/mail/inbox', icon: Inbox, tone: 'info' as StatusTone },
    { label: 'Soạn email', href: '/mail/compose', icon: Send, tone: 'success' as StatusTone },
    { label: 'Tạo mailbox', href: '/mailboxes/new', icon: MailPlus, tone: 'success' as StatusTone },
    { label: 'Kiểm tra DNS', href: firstDomain ? `/domains/${firstDomain.id}/dns` : '/domains', icon: ShieldCheck, tone: 'info' as StatusTone },
    { label: 'Gửi yêu cầu domain', href: '/domains/new', icon: UploadCloud, tone: 'warning' as StatusTone },
  ];
}

export async function DashboardView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const quota = data.quotas;
  const warningDomains = data.domains.filter((domain) => ['warning', 'failed'].includes(domain.status) || dnsSignals(domain).some((item) => item.tone === 'warning' || item.tone === 'danger')).length;
  const queued = data.emailSendLogs.filter((log) => ['queued', 'deferred'].includes(log.status)).length;
  const sentToday = data.emailSendLogs.filter((log) => log.status === 'sent' && log.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <AppShell {...shellProps(data)}>
      <PageHeader
        eyebrow="LogiVN Internal Mail"
        title={`Xin chào, ${data.auth.profile?.full_name ?? data.auth.userEmail ?? 'LogiMail'}`}
        description="Dashboard đang đọc trực tiếp từ Supabase schema logimail qua session hiện tại."
        actions={<><ButtonLink href="/mailboxes/new" icon={MailPlus}>Tạo mailbox</ButtonLink><SignOutButton /></>}
      />
      <section className="metric-grid">
        <MetricCard label="Mailbox" value={String(data.mailboxes.length)} helper={`${data.mailboxes.filter((item) => item.status === 'active').length} đang hoạt động`} tone="success" icon={MailPlus} />
        <MetricCard label="Email gửi hôm nay" value={String(sentToday)} helper={`${data.emailSendLogs.length} log gần nhất`} tone="info" icon={Send} />
        <MetricCard label="Domain" value={String(data.domains.length)} helper={`Auth signals ${authSignalSummary(data)}`} tone={warningDomains ? 'warning' : 'success'} icon={ShieldCheck} />
        <MetricCard label="Queue" value={String(queued)} helper="Từ email_send_logs" tone={queued ? 'warning' : 'success'} icon={RefreshCcw} />
        <MetricCard label="Quota ngày" value={quota ? `${quota.used_today}/${quota.daily_send_limit}` : 'N/A'} helper={quota ? `Tháng ${quota.used_this_month}/${quota.monthly_send_limit}` : 'Chưa có bản ghi quota'} tone="neutral" icon={DatabaseBackup} />
        <MetricCard label="Yêu cầu chờ" value={String(pendingTotal(data))} helper="Account/domain/mailbox approvals" tone={pendingTotal(data) ? 'warning' : 'success'} icon={UserPlus} />
      </section>
      <section className="dashboard-grid">
        <Panel title="Email activity" description="Tổng log gửi email theo dữ liệu thật trong `email_send_logs`." className="span-2">
          <EmailVolumeChart data={buildSendVolume(data.emailSendLogs)} />
        </Panel>
        <Panel title="Tình trạng hệ thống" description="Tổng hợp từ metadata LogiMail hiện có.">
          <div className="status-list">
            <HealthCard label="Supabase metadata" value={data.errors.length ? 'Cần kiểm tra' : 'OK'} detail={data.errors[0] ?? 'Đọc schema logimail thành công'} tone={data.errors.length ? 'warning' : 'success'} />
            <HealthCard label="Workspace" value={statusLabel(data.activeWorkspace?.status)} detail={data.activeWorkspace?.name ?? 'Chưa có workspace'} tone={statusTone(data.activeWorkspace?.status)} />
            <HealthCard label="Domain active" value={`${data.domains.filter((item) => item.status === 'active').length}/${data.domains.length}`} detail="Dữ liệu từ bảng domains" tone={warningDomains ? 'warning' : 'success'} />
            <HealthCard label="Mailbox active" value={`${data.mailboxes.filter((item) => item.status === 'active').length}/${data.mailboxes.length}`} detail="Dữ liệu từ bảng mailboxes" tone={data.mailboxes.length ? 'success' : 'info'} />
          </div>
        </Panel>
      </section>
      <section className="dashboard-grid compact">
        <Panel title="Tác vụ nhanh" description="Điều hướng tới luồng thật có kiểm soát quyền.">
          <div className="action-grid">
            {quickActions(data).map((action) => <ActionCard key={action.label} {...action} />)}
          </div>
        </Panel>
        <Panel title="Audit gần đây" description="Từ bảng logimail.audit_logs.">
          {data.auditLogs.length ? <ActivityTimeline items={realActivity(data)} /> : <p className="muted-copy">Chưa có audit log trong workspace này.</p>}
        </Panel>
      </section>
    </AppShell>
  );
}

export async function MailHomeView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Hộp thư" title="Mailbox được gán cho bạn" actions={<ButtonLink href="/mail/compose" icon={Send}>Soạn email</ButtonLink>} />
      {data.mailboxes.length ? <section className="card-grid three">{data.mailboxes.slice(0, 6).map((mailbox) => <MailboxCard key={mailbox.id} mailbox={mailboxView(data, mailbox)} />)}</section> : <EmptyState title="Chưa có mailbox" description="Mailbox chỉ xuất hiện sau khi yêu cầu được admin phê duyệt." action="Yêu cầu mailbox" href="/mailboxes/new" />}
      <Panel title="Kết nối">
        <div className="integration-grid">
          <article className="integration-card"><ShieldCheck size={18} aria-hidden="true" /><strong>Supabase RLS</strong><span>{data.auth.status === 'approved' ? 'Session đã được xác thực' : statusLabel(data.auth.status)}</span></article>
          <article className="integration-card"><Inbox size={18} aria-hidden="true" /><strong>IMAP native</strong><span>{process.env.LOGIMAIL_MAIL_HOSTNAME ?? 'mail.logivn.com'}:993</span></article>
          <article className="integration-card"><Send size={18} aria-hidden="true" /><strong>SMTP native</strong><span>{process.env.LOGIMAIL_MAIL_HOSTNAME ?? 'mail.logivn.com'}:587</span></article>
        </div>
      </Panel>
    </AppShell>
  );
}

export async function InboxView({ folder = 'inbox' }: Readonly<{ folder?: MailFolderKey }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <MailAppShell {...mailShellProps(data)}>
      <MailInboxClient folder={folder} mailboxes={mailUiMailboxes(data)} showFolderPanel={false} />
    </MailAppShell>
  );
}

export async function ComposeView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <MailAppShell {...mailShellProps(data)}>
      <div className="mail-content-heading"><h1>Soạn thư</h1></div>
      <MailComposeClient mailboxes={mailUiMailboxes(data)} />
    </MailAppShell>
  );
}

export async function MailNotificationSettingsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <MailAppShell {...mailShellProps(data)}>
      <PageHeader
        eyebrow="LogiMail PWA"
        title="Thông báo mail mới"
        description="Bật quyền thông báo trên thiết bị này. Nút trả lời trong notification sẽ mở compose và nạp email gốc khi mailbox đã được mở khóa."
        actions={<ButtonLink href="/mail/inbox" tone="secondary" icon={Inbox}>Hộp thư</ButtonLink>}
      />
      <Panel title="Thiết bị hiện tại" description="Quyền thông báo là theo origin mail.logivn.com, nên cần bật trực tiếp trong hộp thư LogiMail.">
        <PwaNotificationSettings />
      </Panel>
    </MailAppShell>
  );
}

export async function MailboxesView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Mailbox" title="Quản lý mailbox" description="Danh sách đọc từ bảng logimail.mailboxes." actions={<ButtonLink href="/mailboxes/new" icon={Plus}>Yêu cầu mailbox</ButtonLink>} />
      {data.mailboxes.length ? (
        <Panel>
          <DataTable
            columns={['Email', 'Tên hiển thị', 'Domain', 'Quyền của bạn', 'Quota', 'Trạng thái', 'Cập nhật', 'Hành động']}
            rows={data.mailboxes.map((mailbox) => {
              const domain = domainById(data, mailbox.domain_id);
              return [
                <Link href={`/mailboxes/${mailbox.id}`} key="email"><strong>{mailbox.email_address}</strong></Link>,
                mailbox.display_name ?? '-',
                domain?.domain ?? mailbox.domain_id,
                permissionForMailbox(data, mailbox.id),
                <MailboxUsageBar key="usage" quotaMb={mailbox.quota_mb} />,
                <StatusBadge key="status" tone={statusTone(mailbox.status)}>{statusLabel(mailbox.status)}</StatusBadge>,
                dateTime(mailbox.updated_at),
                <span className="row-actions" key="actions"><a href="/mail/inbox">Mở hộp thư</a><Link href={`/mailboxes/${mailbox.id}`}>Chi tiết</Link></span>,
              ];
            })}
          />
        </Panel>
      ) : <EmptyState title="Chưa có mailbox" description="Tạo yêu cầu mailbox để admin phê duyệt trước khi provision." action="Yêu cầu mailbox" href="/mailboxes/new" />}
      <section className="mobile-card-list">{data.mailboxes.map((mailbox) => <MailboxCard key={mailbox.id} mailbox={mailboxView(data, mailbox)} />)}</section>
    </AppShell>
  );
}

export async function CreateMailboxView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const workspaceId = data.activeWorkspace?.id;
  if (!workspaceId) return <AppShell {...shellProps(data)}><EmptyState title="Chưa có workspace" description="Cần workspace đã được duyệt trước khi tạo yêu cầu mailbox." action="Về dashboard" href="/dashboard" /></AppShell>;
  const approvedDomains = data.domains.filter((domain) => domain.status === 'active' && domain.approval_status === 'approved' && domain.registration_enabled);
  const pendingMailboxRequests = data.mailboxRequests.filter((request) => request.status === 'pending');
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Mailbox" title="Yêu cầu mailbox mới" description="Mailbox mới bắt buộc qua domain.logivn.com và Telegram approval." />
      <section className="form-layout">
        <Panel title="Thông tin mailbox">
          <MailboxRequestForm workspaceId={workspaceId} domains={approvedDomains.map((domain) => ({ id: domain.id, domain: domain.domain }))} />
        </Panel>
        <aside className="side-stack">
          <Panel title="Domain khả dụng"><SecurityChecklist items={approvedDomains.map((domain) => ({ label: domain.domain, status: 'Có thể đăng ký', tone: 'success' }))} /></Panel>
          <Panel title="Yêu cầu đang chờ"><SecurityChecklist items={pendingMailboxRequests.slice(0, 6).map((request) => ({ label: request.email_address, status: statusLabel(request.status), tone: statusTone(request.status) }))} /></Panel>
          <SafetyNotice>Yêu cầu được ghi vào Supabase, audit log và luồng duyệt admin/Telegram trước khi provision.</SafetyNotice>
        </aside>
      </section>
    </AppShell>
  );
}

export async function MailboxDetailView({ id }: Readonly<{ id: string }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const mailbox = findMailbox(data, id);
  if (!mailbox) return <AppShell {...shellProps(data)}><EmptyState title="Không tìm thấy mailbox" description="Mailbox không tồn tại hoặc bạn chưa có quyền truy cập." action="Về danh sách" href="/mailboxes" /></AppShell>;
  const domain = domainById(data, mailbox.domain_id);
  const aliases = aliasesForMailbox(data, mailbox.id);
  const labels = labelsForMailbox(data, mailbox.id);
  const rules = rulesForMailbox(data, mailbox.id);
  const drafts = draftsForMailbox(data, mailbox.id).filter((draft) => draft.status === 'draft');
  const tasks = tasksForMailbox(data, mailbox.id).filter((task) => task.status !== 'archived');
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Mailbox detail" title={mailbox.email_address} description="Metadata, quyền truy cập và cấu hình client từ dữ liệu thật." actions={<ButtonLink href="/mail/inbox" icon={Inbox}>Mở hộp thư</ButtonLink>} />
      <section className="dashboard-grid compact">
        <Panel title="Overview"><MailboxCard mailbox={mailboxView(data, mailbox)} /></Panel>
        <Panel title="Mail access">
          <div className="copy-list">
            <CopyableRecordRow label="IMAP" value={`${domain?.mail_hostname ?? 'mail.logivn.com'}:993`} />
            <CopyableRecordRow label="SMTP" value={`${domain?.mail_hostname ?? 'mail.logivn.com'}:587`} />
          </div>
        </Panel>
      </section>
      <section className="dashboard-grid compact">
        <Panel title="Quyền của bạn"><SecurityChecklist items={[{ label: mailbox.email_address, status: permissionForMailbox(data, mailbox.id), tone: 'info' }]} /></Panel>
        <Panel title="Domain"><SecurityChecklist items={domain ? dnsSignals(domain) : []} /></Panel>
      </section>
      <section className="dashboard-grid compact">
        <Panel title="Aliases" description="Alias chỉ chuyển sang active sau khi provider có endpoint/provision tương ứng.">
          {aliases.length ? <DataTable columns={['Alias', 'Tên', 'Trạng thái', 'Cập nhật']} rows={aliases.map((alias) => [alias.alias_email, alias.display_name ?? '-', <StatusBadge key="status" tone={statusTone(alias.status)}>{statusLabel(alias.status)}</StatusBadge>, dateTime(alias.updated_at)])} /> : <p className="muted-copy">Chưa có alias cho mailbox này.</p>}
          <AliasRequestForm mailboxId={mailbox.id} />
        </Panel>
        <Panel title="Label & rule" description="Cấu hình được lưu metadata thật, sẵn sàng cho worker xử lý tự động.">
          <div className="compact-stack">
            {labels.length ? <div className="pill-list">{labels.map((label) => <span key={label.id} style={{ borderColor: label.color }}>{label.name}</span>)}</div> : <p className="muted-copy">Chưa có label.</p>}
            <MailLabelForm mailboxId={mailbox.id} />
            <MailRuleForm mailboxId={mailbox.id} labels={labels.map((label) => ({ id: label.id, name: label.name }))} />
            {rules.length ? <DataTable columns={['Rule', 'Điều kiện', 'Action', 'Status']} rows={rules.map((rule) => [rule.name, [rule.from_contains, rule.subject_contains].filter(Boolean).join(' / ') || '-', rule.action, rule.enabled ? 'enabled' : 'disabled'])} /> : null}
          </div>
        </Panel>
      </section>
      <section className="dashboard-grid compact">
        <Panel title="Draft metadata"><DataTable columns={['Cập nhật', 'Người nhận', 'Tiêu đề', 'Preview', 'File']} rows={drafts.map((draft) => [dateTime(draft.updated_at), draft.to_email ?? '-', draft.subject ?? '-', draft.body_preview ?? '-', String(draft.attachment_count)])} /></Panel>
        <Panel title="Team tasks"><DataTable columns={['Tạo lúc', 'Subject', 'Khách', 'Ưu tiên', 'Trạng thái']} rows={tasks.map((task) => [dateTime(task.created_at), task.subject ?? '-', task.customer_email ?? '-', task.priority, <StatusBadge key="status" tone={statusTone(task.status)}>{statusLabel(task.status)}</StatusBadge>])} /></Panel>
      </section>
      {isPlatformRole(data.auth.profile?.platform_role) ? (
        <Panel title="Danger zone" description="Khóa/mở khóa gọi API quản trị thật. Reset và xóa vẫn bị vô hiệu hóa tới khi có workflow server-side an toàn.">
          <MailboxAdminActions mailboxId={mailbox.id} email={mailbox.email_address} status={mailbox.status} />
        </Panel>
      ) : null}
    </AppShell>
  );
}

export async function DomainsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Domain & DNS" title="Domain list" description="Domain đọc từ logimail.domains; thêm domain qua approval." actions={<ButtonLink href="/domains/new" icon={Plus}>Yêu cầu domain</ButtonLink>} />
      {data.domains.length ? (
        <Panel>
          <DataTable
            columns={['Domain', 'Trạng thái', 'MX', 'SPF', 'DKIM', 'DMARC', 'PTR', 'Đăng ký', 'Hành động']}
            rows={data.domains.map((domain) => [
              <Link href={`/domains/${domain.id}`} key="domain"><strong>{domain.domain}</strong><br /><small>{domain.mail_hostname ?? '-'}</small></Link>,
              <StatusBadge key="status" tone={statusTone(domain.status)}>{statusLabel(domain.status)}</StatusBadge>,
              <DnsMiniStatus key="mx" value={domain.mx_status} />,
              <DnsMiniStatus key="spf" value={domain.spf_status} />,
              <DnsMiniStatus key="dkim" value={domain.dkim_status} />,
              <DnsMiniStatus key="dmarc" value={domain.dmarc_status} />,
              <DnsMiniStatus key="ptr" value={domain.ptr_status} />,
              <StatusBadge key="reg" tone={domain.registration_enabled ? 'success' : 'neutral'}>{domain.registration_enabled ? 'Bật' : 'Tắt'}</StatusBadge>,
              <span className="row-actions" key="actions"><Link href={`/domains/${domain.id}/dns`}>DNS</Link><Link href={`/domains/${domain.id}/deliverability`}>Score</Link></span>,
            ])}
          />
        </Panel>
      ) : <EmptyState title="Chưa có domain" description="Domain chỉ xuất hiện sau khi admin duyệt yêu cầu." action="Yêu cầu domain" href="/domains/new" />}
    </AppShell>
  );
}

function DnsMiniStatus({ value }: Readonly<{ value: string }>) {
  return <StatusBadge tone={statusTone(value)}>{statusLabel(value)}</StatusBadge>;
}

export async function AddDomainView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const workspaceId = data.activeWorkspace?.id;
  if (!workspaceId) return <AppShell {...shellProps(data)}><EmptyState title="Chưa có workspace" description="Cần workspace đã được duyệt trước khi tạo yêu cầu domain." action="Về dashboard" href="/dashboard" /></AppShell>;
  const pendingDomainRequests = data.domainRequests.filter((request) => request.status === 'pending');
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Domain" title="Yêu cầu thêm domain" description="Domain mới cần admin duyệt trước khi bật đăng ký mailbox." />
      <section className="form-layout">
        <Panel title="Domain setup">
          <DomainRequestForm workspaceId={workspaceId} />
        </Panel>
        <aside className="side-stack">
          <Panel title="Yêu cầu đang chờ"><SecurityChecklist items={pendingDomainRequests.slice(0, 6).map((request) => ({ label: request.domain, status: statusLabel(request.status), tone: statusTone(request.status) }))} /></Panel>
          <Panel title="Safety policy"><ul className="policy-list"><li>Không tự sửa MX/SPF/DKIM/DMARC khi chưa có admin approval.</li><li>Hostname mail/smtp/imap luôn DNS only trên Cloudflare.</li><li>Không dùng Global API Key.</li></ul></Panel>
        </aside>
      </section>
    </AppShell>
  );
}

export async function DomainDetailView({ id }: Readonly<{ id: string }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const domain = findDomain(data, id);
  if (!domain) return <AppShell {...shellProps(data)}><EmptyState title="Không tìm thấy domain" description="Domain không tồn tại hoặc chưa được duyệt." action="Về danh sách" href="/domains" /></AppShell>;
  const latestCheck = latestDeliverabilityForDomain(data, domain.id);
  const score = deliverabilityScore(data, domain);
  const scoreStyle = { '--score': `${score * 3.6}deg` } as CSSProperties;
  const domainMailboxes = data.mailboxes.filter((mailbox) => mailbox.domain_id === domain.id);
  const aliases = aliasesForDomain(data, domain.id);
  const bounces = bounceEventsForDomain(data, domain.id);
  const bounceStats = bounceSummary(bounces);
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Domain detail" title={domain.domain} description={`Mail host: ${domain.mail_hostname ?? 'chưa đặt'}`} actions={<ButtonLink href={`/domains/${domain.id}/dns`} icon={ShieldCheck}>DNS check</ButtonLink>} />
      <section className="dashboard-grid compact">
        <Panel title="Domain overview"><div className="domain-score-wrap"><div className="score-ring" style={scoreStyle}><strong>{score}</strong><span>/100</span></div><div><StatusBadge tone={statusTone(domain.status)}>{statusLabel(domain.status)}</StatusBadge><p>Last checked: {dateTime(latestCheck?.created_at ?? domain.last_checked_at)}</p></div></div></Panel>
        <Panel title="Authentication status"><SecurityChecklist items={dnsSignals(domain)} /></Panel>
      </section>
      <section className="metric-grid">
        <MetricCard label="Mailbox" value={String(domainMailboxes.length)} helper="mailboxes theo domain" tone="info" icon={MailPlus} />
        <MetricCard label="Alias" value={String(aliases.length)} helper={`${aliases.filter((alias) => alias.status === 'active').length} active`} tone="neutral" icon={MailPlus} />
        <MetricCard label="Bounce" value={String(bounceStats.total)} helper={`${bounceStats.hard} hard · ${bounceStats.soft} soft`} tone={bounceStats.hard || bounceStats.complaints ? 'warning' : 'success'} icon={MailWarning} />
        <MetricCard label="DMARC report" value={String(dmarcReportsForDomain(data, domain.id).length)} helper="aggregate reports" tone="info" icon={FileText} />
        <MetricCard label="Đăng ký" value={domain.registration_enabled ? 'Bật' : 'Tắt'} helper="form tạo email" tone={domain.registration_enabled ? 'success' : 'neutral'} icon={UserPlus} />
        <MetricCard label="Snapshot" value={String(data.deliverabilityChecks.filter((item) => item.domain_id === domain.id).length)} helper="deliverability history" tone="neutral" icon={ShieldCheck} />
      </section>
      <section className="dashboard-grid compact">
        <Panel title="Mailboxes"><DataTable columns={['Email', 'Tên', 'Quota', 'Status']} rows={domainMailboxes.map((mailbox) => [<Link key="mailbox" href={`/mailboxes/${mailbox.id}`}>{mailbox.email_address}</Link>, mailbox.display_name ?? '-', `${mailbox.quota_mb}MB`, <StatusBadge key="status" tone={statusTone(mailbox.status)}>{statusLabel(mailbox.status)}</StatusBadge>])} /></Panel>
        <Panel title="Aliases"><DataTable columns={['Alias', 'Mailbox', 'Status', 'Cập nhật']} rows={aliases.map((alias) => [alias.alias_email, data.mailboxes.find((mailbox) => mailbox.id === alias.mailbox_id)?.email_address ?? '-', <StatusBadge key="status" tone={statusTone(alias.status)}>{statusLabel(alias.status)}</StatusBadge>, dateTime(alias.updated_at)])} /></Panel>
      </section>
      <Panel title="Actions"><div className="action-grid"><ActionCard href={`/domains/${domain.id}/dns`} label="Run DNS check" icon={ShieldCheck} tone="info" /><ActionCard href={`/domains/${domain.id}/deliverability`} label="Deliverability" icon={MailCheck} tone="success" /><ActionCard href="/domains/new" label="Yêu cầu domain mới" icon={UploadCloud} tone="warning" /><ActionCard href="/mailboxes/new" label="Yêu cầu mailbox" icon={MailPlus} tone="success" /></div></Panel>
    </AppShell>
  );
}

export async function DnsChecklistView({ id = 'current' }: Readonly<{ id?: string }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const domain = findDomain(data, id);
  if (!domain) return <AppShell {...shellProps(data)}><EmptyState title="Chưa có domain DNS" description="Hãy gửi yêu cầu domain và chờ admin duyệt." action="Yêu cầu domain" href="/domains/new" /></AppShell>;
  const records = expectedDnsRecords(domain);
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Cloudflare DNS" title="DNS checklist" description={`Dữ liệu trạng thái thật cho ${domain.domain}.`} actions={<ButtonLink href={`/domains/${domain.id}/dns`} icon={RefreshCcw}>Verify DNS</ButtonLink>} />
      <section className="dns-layout">
        <Panel title="Authentication signals"><SecurityChecklist items={dnsSignals(domain)} /></Panel>
        <aside className="side-stack">
          <Panel title="Expected records"><div className="copy-list">{records.length ? records.map((record) => <CopyableRecordRow key={`${record.type}-${record.name}`} label={`${record.type} ${record.name}`} value={record.content} />) : <p className="muted-copy">Thiếu LOGIMAIL_VPS_IP nên chưa dựng expected DNS plan.</p>}</div></Panel>
          <SafetyNotice>Cloudflare mutation thật vẫn cần route server-side có token scope hẹp và audit.</SafetyNotice>
        </aside>
      </section>
    </AppShell>
  );
}

export async function DeliverabilityView({ id = 'current' }: Readonly<{ id?: string }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const domain = findDomain(data, id);
  if (!domain) return <AppShell {...shellProps(data)}><EmptyState title="Chưa có deliverability data" description="Cần domain đã duyệt trước." action="Về domain" href="/domains" /></AppShell>;
  const checks = data.deliverabilityChecks.filter((item) => item.domain_id === domain.id);
  const latestCheck = checks[0] ?? null;
  const bounces = bounceEventsForDomain(data, domain.id);
  const bounceStats = bounceSummary(bounces);
  const reports = dmarcReportsForDomain(data, domain.id);
  const score = deliverabilityScore(data, domain);
  const scoreStyle = { '--score': `${score * 3.6}deg` } as CSSProperties;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Deliverability" title={`${domain.domain} deliverability`} description="Score từ DNS auth, snapshot vận hành, bounce và DMARC report." actions={<DeliverabilityCheckButton domainId={domain.id} />} />
      <section className="dashboard-grid compact"><Panel title="Overall score"><div className="score-ring large" style={scoreStyle}><strong>{score}</strong><span>/100</span></div><p className="muted-copy">Snapshot mới nhất: {dateTime(latestCheck?.created_at)}</p></Panel><Panel title="Signals"><SecurityChecklist items={deliverabilitySignals(domain)} /></Panel></section>
      <section className="metric-grid">
        <MetricCard label="Hard bounce" value={String(bounceStats.hard)} helper={`${bounceStats.total} bounce events`} tone={bounceStats.hard ? 'warning' : 'success'} icon={MailWarning} />
        <MetricCard label="Complaint" value={String(bounceStats.complaints)} helper="feedback loop" tone={bounceStats.complaints ? 'danger' : 'success'} icon={MailWarning} />
        <MetricCard label="DMARC pass" value={String(reports.reduce((total, report) => total + report.pass_count, 0))} helper={`${reports.length} reports`} tone="success" icon={ShieldCheck} />
        <MetricCard label="DMARC fail" value={String(reports.reduce((total, report) => total + report.fail_count, 0))} helper="alignment failures" tone={reports.some((report) => report.fail_count > 0) ? 'warning' : 'success'} icon={ShieldCheck} />
        <MetricCard label="Spam rate" value={latestCheck?.spam_rate == null ? 'N/A' : `${(latestCheck.spam_rate * 100).toFixed(2)}%`} helper="manual/postmaster input" tone={latestCheck?.spam_rate && latestCheck.spam_rate > 0.003 ? 'warning' : 'neutral'} icon={MailCheck} />
        <MetricCard label="BIMI" value={statusLabel(latestCheck?.bimi_status ?? 'unknown')} helper="logo inbox" tone={statusTone(latestCheck?.bimi_status)} icon={MailCheck} />
      </section>
      <Panel title="Send activity"><EmailVolumeChart data={buildSendVolume(data.emailSendLogs.filter((log) => log.from_email.endsWith(`@${domain.domain}`)))} /></Panel>
      <section className="dashboard-grid compact">
        <Panel title="Snapshot history"><DataTable columns={['Time', 'Score', 'MX', 'SPF', 'DKIM', 'DMARC', 'PTR']} rows={checks.map((check) => [dateTime(check.created_at), String(check.score), statusLabel(check.mx_status), statusLabel(check.spf_status), statusLabel(check.dkim_status), statusLabel(check.dmarc_status), statusLabel(check.ptr_status)])} /></Panel>
        <Panel title="Bounce events"><DataTable columns={['Time', 'Type', 'Recipient', 'SMTP', 'Reason']} rows={bounces.map((bounce) => [dateTime(bounce.created_at), bounce.bounce_type, bounce.recipient_email, bounce.smtp_code ?? '-', bounce.reason ?? '-'])} /></Panel>
      </section>
      <Panel title="DMARC reports"><DataTable columns={['Period', 'Reporter', 'IP', 'DKIM', 'SPF', 'Pass', 'Fail']} rows={reports.map((report) => [[report.report_start, report.report_end].filter(Boolean).join(' → ') || dateTime(report.created_at), report.report_domain, report.source_ip ?? '-', report.dkim_result ?? '-', report.spf_result ?? '-', String(report.pass_count), String(report.fail_count)])} /></Panel>
    </AppShell>
  );
}

export async function OpsOverviewView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const queued = data.emailSendLogs.filter((item) => item.status === 'queued').length;
  const failed = data.emailSendLogs.filter((item) => ['failed', 'bounced'].includes(item.status)).length;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="MailOps" title="Vận hành mail server" description="Cockpit metadata thật cho domain, queue log, approval và audit." />
      <section className="metric-grid"><MetricCard label="Workspace" value={statusLabel(data.activeWorkspace?.status)} helper={data.activeWorkspace?.name} tone={statusTone(data.activeWorkspace?.status)} /><MetricCard label="Domain" value={String(data.domains.length)} helper="logimail.domains" tone="info" /><MetricCard label="Mailbox" value={String(data.mailboxes.length)} helper="logimail.mailboxes" tone="info" /><MetricCard label="Queued" value={String(queued)} helper="email_send_logs" tone={queued ? 'warning' : 'success'} /><MetricCard label="Failed" value={String(failed)} helper="email_send_logs" tone={failed ? 'danger' : 'success'} /><MetricCard label="Audit" value={String(data.auditLogs.length)} helper="logimail.audit_logs" tone="neutral" /></section>
      <Panel title="Quick actions"><div className="action-grid"><ActionCard href="/ops/mail-queue" label="Mail queue" icon={RefreshCcw} tone="warning" /><ActionCard href="/ops/logs" label="Audit logs" icon={FileText} tone="info" /><ActionCard href="/domains" label="Domains" icon={ShieldCheck} tone="success" /><ActionCard href="/ops/backups" label="Backup runbook" icon={DatabaseBackup} tone="neutral" /></div></Panel>
    </AppShell>
  );
}

export async function ServerHealthView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Server Health" title="VPS health" description="Chỉ hiển thị health có nguồn thật trong LogiMail metadata/env." />
      <section className="card-grid four"><QueueStatusCard label="Supabase errors" value={String(data.errors.length)} tone={data.errors.length ? 'warning' : 'success'} /><QueueStatusCard label="Domains" value={String(data.domains.length)} tone="success" /><QueueStatusCard label="Mailboxes" value={String(data.mailboxes.length)} tone="success" /><QueueStatusCard label="Send logs" value={String(data.emailSendLogs.length)} tone="info" /></section>
      <Panel title="Health details"><SecurityChecklist items={[{ label: 'Supabase RLS', status: data.errors.length ? 'Cần kiểm tra' : 'OK', tone: data.errors.length ? 'warning' : 'success' }, { label: 'LOGIMAIL_VPS_IP', status: process.env.LOGIMAIL_VPS_IP ? 'Configured' : 'Missing', tone: process.env.LOGIMAIL_VPS_IP ? 'success' : 'warning' }, { label: 'LOGIMAIL_MAIL_HOSTNAME', status: process.env.LOGIMAIL_MAIL_HOSTNAME ?? 'mail.logivn.com', tone: 'info' }]} /></Panel>
    </AppShell>
  );
}

export async function DnsAutomationView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Cloudflare DNS Automation" title="DNS automation plan" description="Dữ liệu domain thật; mutation DNS vẫn cần xác nhận an toàn." />
      <section className="dashboard-grid compact"><Panel title="Domain readiness"><SecurityChecklist items={data.domains.map((domain) => ({ label: domain.domain, status: `${statusLabel(domain.status)} / ${statusLabel(domain.approval_status)}`, tone: statusTone(domain.status) }))} /></Panel><Panel title="Buttons"><div className="action-grid"><ActionCard href="/domains" label="Domain list" icon={FileText} tone="info" /><ActionCard href="/domains/new" label="Yêu cầu domain" icon={UploadCloud} tone="warning" /><ActionCard href="/ops/logs" label="Audit logs" icon={ShieldCheck} tone="success" /></div></Panel></section>
      <Panel title="Safety policy"><div className="three-policy"><AgentPolicyCard title="Allowed" items={['Generate plan', 'Verify DNS status', 'Create approval request']} tone="success" /><AgentPolicyCard title="Requires confirmation" items={['Update existing records', 'Change MX/SPF/DKIM/DMARC', 'Change proxy status']} tone="warning" /><AgentPolicyCard title="Denied" items={['Delete zone', 'Global API Key', 'Proxy mail/smtp/imap']} tone="danger" /></div></Panel>
    </AppShell>
  );
}

export async function MailQueueView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const counts = (status: string) => data.emailSendLogs.filter((item) => item.status === status).length;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Mail Queue" title="Queue monitor" description="Dữ liệu từ email_send_logs, không tạo queue giả." actions={<ButtonLink href="/ops/mail-queue" icon={RefreshCcw}>Refresh</ButtonLink>} />
      <section className="card-grid four"><QueueStatusCard label="Queued" value={String(counts('queued'))} tone={counts('queued') ? 'warning' : 'success'} /><QueueStatusCard label="Deferred" value={String(counts('deferred'))} tone={counts('deferred') ? 'warning' : 'success'} /><QueueStatusCard label="Failed" value={String(counts('failed'))} tone={counts('failed') ? 'danger' : 'success'} /><QueueStatusCard label="Sent" value={String(counts('sent'))} tone="success" /></section>
      <Panel title="Queue table"><DataTable columns={['Time', 'From', 'Recipient', 'Status', 'Subject', 'Error']} rows={data.emailSendLogs.map((item) => [dateTime(item.created_at), item.from_email, item.to_email, <StatusBadge key="status" tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge>, item.subject ?? '-', item.error_message ?? '-'])} /></Panel>
      <div className="card-actions"><ButtonLike icon={RefreshCcw}>Refresh</ButtonLike><ButtonLike icon={RotateCcw}>Retry safe</ButtonLike><ButtonLike icon={Download}>Export report</ButtonLike></div>
    </AppShell>
  );
}

export async function BackupsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const summary = backupSummary(data);
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Backup" title="Backup center" description="Backup job lưu metadata thật, worker/runbook VPS thực thi phần dữ liệu nặng." actions={data.activeWorkspace ? <BackupRequestButton workspaceId={data.activeWorkspace.id} /> : null} />
      <section className="metric-grid">
        <MetricCard label="Job" value={String(summary.total)} helper="backup_jobs" tone="info" icon={DatabaseBackup} />
        <MetricCard label="Completed" value={String(summary.completed)} helper="đã hoàn tất" tone="success" icon={DatabaseBackup} />
        <MetricCard label="Failed" value={String(summary.failed)} helper="cần kiểm tra" tone={summary.failed ? 'danger' : 'success'} icon={DatabaseBackup} />
        <MetricCard label="Latest" value={summary.latest ? statusLabel(summary.latest.status) : 'N/A'} helper={dateTime(summary.latest?.created_at)} tone={statusTone(summary.latest?.status)} icon={RefreshCcw} />
        <MetricCard label="Schema" value="logimail" helper="metadata" tone="neutral" icon={FileText} />
        <MetricCard label="Target" value={process.env.BACKUP_STORAGE_ADAPTER ?? 'N/A'} helper="storage adapter" tone={process.env.BACKUP_STORAGE_ADAPTER ? 'success' : 'warning'} icon={Download} />
      </section>
      <section className="dashboard-grid compact"><Panel title="Backup source"><CopyableRecordRow label="Schema" value="logimail" /><CopyableRecordRow label="Workspace" value={data.activeWorkspace?.id ?? 'N/A'} /><CopyableRecordRow label="Target" value={process.env.BACKUP_STORAGE_ADAPTER ?? 'not_configured'} /></Panel><Panel title="Runbook"><p className="muted-copy">Dùng `logimail/infra/mailops-agent/backup.sh` hoặc systemd job trên VPS sau khi xác nhận env.</p></Panel></section>
      <Panel title="Backup jobs"><DataTable columns={['Created', 'Scope', 'Status', 'Started', 'Completed', 'Artifact', 'Error']} rows={data.backupJobs.map((job) => [dateTime(job.created_at), job.scope, <StatusBadge key="status" tone={statusTone(job.status)}>{statusLabel(job.status)}</StatusBadge>, dateTime(job.started_at), dateTime(job.completed_at), job.artifact_uri ?? '-', job.error_message ?? '-'])} /></Panel>
      <SafetyNotice>Restore thật cần xác nhận thủ công trên VPS. Không chạy restore production từ browser.</SafetyNotice>
      <div className="card-actions"><ButtonLike icon={Play} disabled>Restore dry-run chưa có API</ButtonLike><ButtonLike icon={Download} disabled>Download report chưa kết nối</ButtonLike></div>
    </AppShell>
  );
}

export async function AgentControlView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Agent Control" title="AI MailOps Agent" description="Chỉ hiển thị policy vận hành; action thật cần audit và quyền riêng." />
      <section className="dashboard-grid compact"><Panel title="Agent status"><SecurityChecklist items={[{ label: 'Policy mode', status: 'confirm-first', tone: 'warning' }, { label: 'Workspace', status: data.activeWorkspace?.slug ?? 'N/A', tone: 'info' }, { label: 'Pending approvals', status: String(pendingTotal(data)), tone: pendingTotal(data) ? 'warning' : 'success' }]} /></Panel><Panel title="Last audit"><p>{data.auditLogs[0]?.action ?? 'Chưa có audit log.'}</p><ButtonLink href="/ops/logs">View policy logs</ButtonLink></Panel></section>
      <Panel title="Policy"><div className="three-policy"><AgentPolicyCard title="Allowed" items={['Read metadata', 'Generate report', 'Create approval request']} tone="success" /><AgentPolicyCard title="Requires confirmation" items={['DNS mutation', 'Mailbox lock/reset', 'Backup/restore']} tone="warning" /><AgentPolicyCard title="Denied" items={['Expose secret', 'Delete DNS zone', 'Bypass admin approval']} tone="danger" /></div></Panel>
      <div className="card-actions"><ButtonLike icon={FileText} disabled>Daily report chưa kết nối</ButtonLike><ButtonLink href="/ops/logs">View policy</ButtonLink><ButtonLike tone="danger" disabled>Tắt agent chưa có API</ButtonLike></div>
    </AppShell>
  );
}

export async function LogsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Logs" title="Ops logs" description="Audit log thật trong schema logimail." />
      <Panel>{data.auditLogs.length ? <DataTable columns={['Time', 'Action', 'Target type', 'Target ID']} rows={data.auditLogs.map((item) => [dateTime(item.created_at), item.action, item.target_type ?? '-', item.target_id ?? '-'])} /> : <p className="muted-copy">Chưa có audit log.</p>}</Panel>
    </AppShell>
  );
}

export async function TeamView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Team" title="Thành viên LogiMail" description="Dữ liệu từ workspace_members theo RLS." actions={<ButtonLink href="/team/invites" icon={UserPlus}>Invite member</ButtonLink>} />
      <Panel title="Members"><DataTable columns={['User ID', 'Role', 'Created']} rows={data.workspaceMembers.map((member) => [member.user_id, member.role, dateTime(member.created_at)])} /></Panel>
      <Panel title="Mailbox tasks"><DataTable columns={['Created', 'Mailbox', 'Subject', 'Customer', 'Priority', 'Status', 'Assigned']} rows={data.teamMailboxTasks.map((task) => [dateTime(task.created_at), data.mailboxes.find((mailbox) => mailbox.id === task.mailbox_id)?.email_address ?? '-', task.subject ?? '-', task.customer_email ?? '-', task.priority, <StatusBadge key="status" tone={statusTone(task.status)}>{statusLabel(task.status)}</StatusBadge>, task.assigned_to ?? '-'])} /></Panel>
      <Panel title="Roles & permission matrix"><PermissionTable rows={[{ permission: 'Mailbox metadata', owner: true, admin: true, mailManager: true, support: true, viewer: true }, { permission: 'Request domain', owner: true, admin: true, mailManager: false, support: false, viewer: false }, { permission: 'Request mailbox', owner: true, admin: true, mailManager: true, support: true, viewer: false }, { permission: 'Danger actions', owner: true, admin: false, mailManager: false, support: false, viewer: false }]} /></Panel>
    </AppShell>
  );
}

export async function InviteMemberView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const activeMailboxes = data.mailboxes
    .filter((mailbox) => mailbox.workspace_id === data.activeWorkspace?.id && mailbox.status === 'active')
    .map((mailbox) => ({ id: mailbox.id, emailAddress: mailbox.email_address }));
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Team" title="Mời thành viên" description="Lời mời tạo mã một lần, gắn với mailbox danh tính và không tự gửi email." />
      <Panel title="Lời mời bảo mật">
        {data.activeWorkspace ? <TeamInviteForm workspaceId={data.activeWorkspace.id} mailboxes={activeMailboxes} /> : <SafetyNotice>Chưa có workspace hoạt động để tạo lời mời.</SafetyNotice>}
      </Panel>
    </AppShell>
  );
}

export async function SettingsProfileView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Settings" title="Hồ sơ người gửi" description="Tên hiển thị được ưu tiên khi gửi email nếu mailbox chưa đặt tên riêng." />
      <Panel title="Sender identity">
        <ProfileSettingsForm email={data.auth.userEmail ?? ''} fullName={data.auth.profile?.full_name ?? ''} avatarUrl={data.auth.profile?.avatar_url ?? ''} />
      </Panel>
      <Panel title="Trạng thái"><DataTable columns={['Field', 'Value']} rows={[["Role", data.auth.profile?.role ?? '-'], ['Status', statusLabel(data.auth.profile?.account_status)]]} /></Panel>
    </AppShell>
  );
}

export async function WorkspaceSettingsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return <SettingsForm data={data} title="Workspace" fields={[['Workspace name', data.activeWorkspace?.name ?? ''], ['Slug', data.activeWorkspace?.slug ?? ''], ['Plan', data.activeWorkspace?.plan ?? ''], ['Default domain', data.domains[0]?.domain ?? ''], ['Daily send limit', data.quotas ? String(data.quotas.daily_send_limit) : '']]} />;
}

function SettingsForm({ title, fields, data }: Readonly<{ title: string; fields: Array<[string, string]>; data: LogimailOperationalData }>) {
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Settings" title={title} description="Dữ liệu thật đang đọc từ Supabase; mutation setting cần route riêng." />
      <Panel title={`${title} settings`}><form className="stack-form">{fields.map(([label, value]) => <FormField key={label} label={label}><input defaultValue={value} /></FormField>)}<ButtonLike tone="primary" type="submit" icon={Save}>Save</ButtonLike></form></Panel>
    </AppShell>
  );
}

export async function SecuritySettingsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const platformAdmin = isPlatformRole(data.auth.profile?.platform_role);
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Settings" title="Security" description="Trạng thái auth/RLS và session hiện tại." />
      <section className="dashboard-grid compact"><Panel title="Security checklist"><SecurityChecklist items={[{ label: 'Supabase user', status: data.auth.user?.id ? 'Verified' : 'Missing', tone: data.auth.user?.id ? 'success' : 'danger' }, { label: 'LogiMail profile', status: statusLabel(data.auth.profile?.account_status), tone: statusTone(data.auth.profile?.account_status) }, { label: 'Workspace member', status: data.activeWorkspace ? 'Yes' : 'No', tone: data.activeWorkspace ? 'success' : 'warning' }, { label: 'RLS errors', status: String(data.errors.length), tone: data.errors.length ? 'warning' : 'success' }]} /></Panel><Panel title="Current session"><DataTable columns={['Field', 'Value']} rows={[['Email', data.auth.userEmail ?? '-'], ['User ID', data.auth.user?.id ?? '-'], ['Workspace', data.activeWorkspace?.name ?? '-']]} /></Panel></section>
      <Panel title="Danger zone" description="Các tác vụ bên dưới gọi API server-side có audit và kiểm tra MFA.">
        {platformAdmin && data.auth.user ? <SecurityAdminActions userId={data.auth.user.id} /> : <SafetyNotice>Chỉ platform admin mới được xoay khóa credential hoặc thu hồi phiên.</SafetyNotice>}
      </Panel>
      <Panel title="Xóa tài khoản" description="Xóa tài khoản là thao tác không thể hoàn tác. LogiMail yêu cầu xác thực lại và MFA (nếu tài khoản đã bật) trước khi chạy.">
        <AccountDeleteForm />
      </Panel>
    </AppShell>
  );
}

export async function ApiKeysView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return <AppShell {...shellProps(data)}><PageHeader eyebrow="Settings" title="API Keys" description="Chưa có bảng API key trong schema logimail." actions={<ButtonLike tone="primary" icon={KeyRound}>Create API key</ButtonLike>} /><EmptyState title="Chưa có nguồn dữ liệu API key" description="Cần migration/table riêng trước khi bật quản lý API key thật." action="Về settings" href="/settings/security" /></AppShell>;
}

export async function NotificationsView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return (
    <AppShell {...shellProps(data)}>
      <PageHeader eyebrow="Settings" title="Notifications" description="Các kênh thông báo vận hành cho domain/admin. Thông báo hộp thư cá nhân nằm trong mail.logivn.com." actions={<ButtonLink href="/mail/settings/notifications" tone="secondary" icon={Inbox}>PWA mail</ButtonLink>} />
      <Panel title="Telegram bot"><SecurityChecklist items={[{ label: 'Mode', status: process.env.LOGIMAIL_TELEGRAM_MODE ?? 'not_configured', tone: process.env.LOGIMAIL_TELEGRAM_MODE ? 'success' : 'warning' }, { label: 'Platform alerts', status: process.env.LOGIMAIL_PLATFORM_ALERTS_ENABLED ?? 'false', tone: process.env.LOGIMAIL_PLATFORM_ALERTS_ENABLED === 'true' ? 'success' : 'info' }]} /></Panel>
      <Panel title="Approval queue"><DataTable columns={['Type', 'Target', 'Status', 'Created']} rows={[...data.domainRequests.map((row) => ['domain', row.domain, statusLabel(row.status), dateTime(row.created_at)]), ...data.mailboxRequests.map((row) => ['mailbox', row.email_address, statusLabel(row.status), dateTime(row.created_at)])]} /></Panel>
    </AppShell>
  );
}

export async function OnboardingView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  const firstDomain = data.domains[0];
  const dnsReady = firstDomain
    ? [firstDomain.mx_status, firstDomain.spf_status, firstDomain.dkim_status, firstDomain.dmarc_status, firstDomain.ptr_status].every((status) => status === 'pass')
    : false;
  const steps = [
    { title: 'Workspace', description: data.activeWorkspace?.name ?? 'Chưa có workspace', status: data.activeWorkspace ? 'Hoàn tất' : 'Thiếu', tone: data.activeWorkspace ? 'success' : 'warning' as StatusTone, href: '/dashboard', action: 'Mở dashboard' },
    { title: 'Domain', description: firstDomain ? `${data.domains.length} domain đã kết nối` : 'Thêm domain gửi và nhận mail', status: firstDomain ? 'Có dữ liệu' : 'Cần thiết lập', tone: firstDomain ? 'success' : 'warning' as StatusTone, href: firstDomain ? '/domains' : '/domains/new', action: firstDomain ? 'Quản lý domain' : 'Thêm domain' },
    { title: 'DNS', description: firstDomain ? `Xác thực MX, SPF, DKIM và DMARC cho ${firstDomain.domain}` : 'Cần domain trước khi cấu hình DNS', status: dnsReady ? 'Sẵn sàng' : 'Cần kiểm tra', tone: dnsReady ? 'success' : 'warning' as StatusTone, href: firstDomain ? `/domains/${firstDomain.id}/dns` : '/domains/new', action: firstDomain ? 'Cấu hình DNS' : 'Thêm domain trước' },
    { title: 'Mailbox', description: data.mailboxes.length ? `${data.mailboxes.length} mailbox đã cấp` : 'Tạo mailbox đầu tiên trên domain đã duyệt', status: data.mailboxes.length ? 'Sẵn sàng' : 'Cần thiết lập', tone: data.mailboxes.length ? 'success' : 'warning' as StatusTone, href: data.mailboxes.length ? '/mail/inbox' : '/mailboxes/new', action: data.mailboxes.length ? 'Mở hộp thư' : 'Tạo mailbox' },
  ];
  return <AppShell {...shellProps(data)}><PageHeader eyebrow="Onboarding" title="Thiết lập LogiMail" description="Mỗi bước phản ánh dữ liệu thật và dẫn thẳng tới màn hình cần thao tác." /><section className="onboarding-steps">{steps.map((step, index) => <article className={`onboarding-step ${step.tone}`} key={step.title}><span>{index + 1}</span><div><h2>{step.title}</h2><p>{step.description}</p></div><div className="card-actions"><StatusBadge tone={step.tone}>{step.status}</StatusBadge><ButtonLink href={step.href} tone="secondary">{step.action}</ButtonLink></div></article>)}</section></AppShell>;
}

export async function AuthLoginView() {
  const domains = await getRegistrationDomains();

  return (
    <main className="auth-shell split">
      <section className="auth-brand-panel" aria-label="LogiMail Internal MailOps Platform">
        <div className="auth-brand-top">
          <LogiMailLogo subtitle="Internal MailOps Platform" />
          <div className="auth-brand-copy">
            <h1>Email nội bộ,<br />vận hành như hạ tầng.</h1>
            <p>Truy cập hộp thư được gán và các tác vụ MailOps đúng theo quyền đã phê duyệt.</p>
          </div>
        </div>
        <div className="auth-assurance-list">
          <article>
            <span className="auth-assurance-icon"><MailCheck size={17} aria-hidden="true" /></span>
            <div><strong>Enterprise deliverability</strong><p>Quản trị luồng gửi, xác thực domain và uy tín inbox trong một không gian.</p></div>
          </article>
          <article>
            <span className="auth-assurance-icon"><ShieldCheck size={17} aria-hidden="true" /></span>
            <div><strong>Zero-trust access</strong><p>Mỗi phiên mail gắn với mailbox, workspace và quyền truy cập đã duyệt.</p></div>
          </article>
        </div>
        <div className="auth-platform-status" aria-label="Năng lực nền tảng">
          <span><i className="online" /> IMAP / SMTP</span>
          <span><i className="protected" /> Supabase RLS</span>
          <span><i className="ready" /> Audit ready</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-heading">
          <span className="auth-secure-mark"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <h2>Chào mừng trở lại</h2>
            <p>Đăng nhập bằng email LogiMail đã được cấp.</p>
          </div>
        </div>
        <AuthLoginForm domains={domains} />
        <p className="auth-support-copy">Cần quyền truy cập? Liên hệ quản trị viên LogiVN.</p>
      </section>
    </main>
  );
}

export async function AuthRegisterView() {
  const data = await getLogimailOperationalData();
  const domains = await getRegistrationDomains();
  if (data.auth.status === 'approved') redirect('/mail/inbox');

  return (
    <main className="auth-shell">
      <section className="auth-panel wide">
        <h2>Tạo email LogiMail</h2>
        {data.auth.status === 'not_configured' ? (
          <SafetyNotice tone="info">Thiếu cấu hình Supabase nên chưa thể đăng ký.</SafetyNotice>
        ) : (
          <AuthRegisterForm domains={domains} />
        )}
      </section>
    </main>
  );
}

export function InviteAcceptView() {
  return (
    <main className="auth-shell">
      <section className="auth-panel wide">
        <h1>Bạn được mời vào LogiMail</h1>
        <div className="invite-summary"><span>Workspace: <strong>LogiMail</strong></span><span>Quyền: <strong>Do admin phê duyệt</strong></span></div>
        <InviteAcceptForm />
        <SafetyNotice tone="info">Đăng ký LogiMail chỉ dành cho tài khoản có approval.</SafetyNotice>
      </section>
    </main>
  );
}

export async function ForgotPasswordView() {
  const domains = await getRegistrationDomains();

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <h1>Đổi mật khẩu</h1>
        <ForgotPasswordForm domains={domains} />
      </section>
    </main>
  );
}

export async function MessageDetailView({ id }: Readonly<{ id: string }>) {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return <MailAppShell {...mailShellProps(data)}><MailMessageClient id={id} mailboxes={mailUiMailboxes(data)} /></MailAppShell>;
}

export async function EmptyMailboxStateView() {
  const { data, gate } = await loadApprovedData();
  if (gate) return gate;
  return <MailAppShell {...mailShellProps(data)}><EmptyState title="Chưa có hộp thư" description="Email nội bộ chỉ xuất hiện sau khi tài khoản được tạo bằng mã bảo mật hợp lệ." action="Tạo email" href="/auth/register" /></MailAppShell>;
}
