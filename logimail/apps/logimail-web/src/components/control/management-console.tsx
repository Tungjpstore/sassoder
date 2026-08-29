import { MailCheck, ShieldCheck } from 'lucide-react';
import { LogiMailLogo } from '@/components/logimail-logo';
import { SignOutButton } from '@/components/auth-forms';
import { ControlClient } from '@/components/control/control-client';
import { ControlLoginForm } from '@/components/control/control-login-form';
import { getLogimailOperationalData } from '@/lib/logimail-data';
import { isPlatformRole } from '@/lib/security/rbac';

function isAllowlistedPlatformAdmin(email: string | null) {
  if (!email) return false;
  return (process.env.LOGIMAIL_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .some((candidate) => candidate.trim().toLowerCase() === email.toLowerCase());
}

function ControlAuthFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-shell split control-auth-shell">
      <section className="auth-brand-panel" aria-label="LogiMail Control Center">
        <div className="auth-brand-top">
          <LogiMailLogo subtitle="Control Center" />
          <div className="auth-brand-copy"><h1>MailOps control,<br />quietly authoritative.</h1><p>Điều hành domain, mailbox, deliverability và các phê duyệt nhạy cảm trong một mặt phẳng kiểm soát.</p></div>
        </div>
        <div className="auth-assurance-list">
          <article><span className="auth-assurance-icon"><MailCheck size={17} aria-hidden="true" /></span><div><strong>Multi-domain operations</strong><p>Quản trị nhiều domain và luồng cấp mailbox từ dữ liệu LogiMail hiện tại.</p></div></article>
          <article><span className="auth-assurance-icon"><ShieldCheck size={17} aria-hidden="true" /></span><div><strong>Approval-first security</strong><p>Các tác vụ rủi ro vẫn giữ xác nhận, audit và quyền platform admin.</p></div></article>
        </div>
        <div className="auth-platform-status"><span><i className="online" /> Control plane</span><span><i className="protected" /> RLS protected</span><span><i className="ready" /> Audit enabled</span></div>
      </section>
      <section className="control-login-card">{children}</section>
    </main>
  );
}

/**
 * The full domain.logivn.com management console. Renders inline login,
 * the admin cockpit, or a clear notice for non-admin accounts — all at the
 * domain root, with no separate /control namespace.
 */
export async function ManagementConsole() {
  const data = await getLogimailOperationalData();

  if (data.auth.status === 'not_configured') {
    return (
      <ControlAuthFrame><LogiMailLogo subtitle="Điều khiển" /><h1>Chưa cấu hình Supabase</h1><p className="muted-copy">Cần `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` để đăng nhập.</p></ControlAuthFrame>
    );
  }

  if (data.auth.status === 'unauthenticated') {
    return (
      <ControlAuthFrame><LogiMailLogo subtitle="Điều khiển" /><h1>Đăng nhập quản trị LogiMail</h1><p className="muted-copy">Quản lý domain, DNS, mailbox và hàng đợi phê duyệt.</p><ControlLoginForm redirectTo="/" /></ControlAuthFrame>
    );
  }

  const role = data.auth.profile?.platform_role ?? 'none';
  const userLabel = data.auth.profile?.full_name ?? data.auth.userEmail ?? 'Admin';

  if (!isPlatformRole(role) && !isAllowlistedPlatformAdmin(data.auth.userEmail)) {
    return (
      <ControlAuthFrame><LogiMailLogo subtitle="Điều khiển" /><h1>Tài khoản không phải quản trị</h1><p className="muted-copy">domain.logivn.com chỉ dành cho platform admin. Tài khoản “{data.auth.userEmail}” hiện không có quyền quản trị toàn cục.</p><a className="button-link button-reset primary" href="/mail/inbox">Mở hộp thư cá nhân</a><div className="control-login-hint"><SignOutButton /></div></ControlAuthFrame>
    );
  }

  return <ControlClient initialEmail={data.auth.userEmail} userLabel={userLabel} />;
}
