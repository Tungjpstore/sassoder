import Link from 'next/link';
import { LogiMailLogo } from '@/components/logimail-logo';
import { SignOutButton } from '@/components/auth-forms';
import { ControlClient } from '@/components/control/control-client';
import { ControlLoginForm } from '@/components/control/control-login-form';
import { getLogimailOperationalData } from '@/lib/logimail-data';

const ADMIN_ROLES = new Set(['admin', 'owner']);

/**
 * The full domain.logivn.com management console. Renders inline login,
 * the admin cockpit, or a clear notice for non-admin accounts — all at the
 * domain root, with no separate /control namespace.
 */
export async function ManagementConsole() {
  const data = await getLogimailOperationalData();

  if (data.auth.status === 'not_configured') {
    return (
      <main className="control-login-shell">
        <section className="control-login-card">
          <LogiMailLogo subtitle="Điều khiển" />
          <h1>Chưa cấu hình Supabase</h1>
          <p className="muted-copy">Cần `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` để đăng nhập.</p>
        </section>
      </main>
    );
  }

  if (data.auth.status === 'unauthenticated') {
    return (
      <main className="control-login-shell">
        <section className="control-login-card">
          <LogiMailLogo subtitle="Điều khiển" />
          <h1>Đăng nhập quản trị LogiMail</h1>
          <p className="muted-copy">domain.logivn.com · quản lý domain, DNS, mailbox và duyệt yêu cầu</p>
          <ControlLoginForm redirectTo="/" />
        </section>
      </main>
    );
  }

  const role = data.auth.profile?.role ?? '';
  const userLabel = data.auth.profile?.full_name ?? data.auth.userEmail ?? 'Admin';

  if (!ADMIN_ROLES.has(role)) {
    return (
      <main className="control-login-shell">
        <section className="control-login-card">
          <LogiMailLogo subtitle="Điều khiển" />
          <h1>Tài khoản không phải quản trị</h1>
          <p className="muted-copy">
            domain.logivn.com là khu vực quản trị LogiMail dành cho admin/owner. Tài khoản “{data.auth.userEmail}” hiện ở vai trò “{role || 'thành viên'}”.
          </p>
          <a className="button-link button-reset primary" href="https://mail.logivn.com/mail/inbox">Mở hộp thư cá nhân</a>
          <div className="control-login-hint"><SignOutButton /></div>
        </section>
      </main>
    );
  }

  return (
    <div className="control-shell">
      <header className="control-topbar">
        <Link className="control-brand" href="/" aria-label="LogiMail control">
          <LogiMailLogo subtitle="Điều khiển" />
        </Link>
        <div className="control-topbar-actions">
          <a className="icon-text-button" href="https://mail.logivn.com/mail/inbox">Mở hộp thư</a>
          <span className="control-user-pill">{userLabel}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="control-main">
        <ControlClient initialEmail={data.auth.userEmail} />
      </main>
    </div>
  );
}
