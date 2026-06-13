import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogiMailLogo } from '@/components/logimail-logo';
import { SignOutButton } from '@/components/auth-forms';
import { ControlClient } from '@/components/control/control-client';
import { getLogimailOperationalData } from '@/lib/logimail-data';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['admin', 'owner']);

export default async function ControlPage() {
  const data = await getLogimailOperationalData();

  if (data.auth.status === 'unauthenticated') redirect('/auth/login');
  if (data.auth.status === 'not_configured') {
    return (
      <main className="auth-shell">
        <section className="auth-panel wide">
          <h1>Chưa cấu hình Supabase</h1>
          <p>Trung tâm điều khiển cần `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`.</p>
        </section>
      </main>
    );
  }

  const role = data.auth.profile?.role ?? '';
  if (!ADMIN_ROLES.has(role)) {
    return (
      <main className="auth-shell">
        <section className="auth-panel wide">
          <h1>Không có quyền điều khiển</h1>
          <p>Khu vực domain.logivn.com chỉ dành cho admin/owner LogiMail. Tài khoản của bạn hiện là “{role || 'thành viên'}”.</p>
          <Link className="button-link secondary" href="https://mail.logivn.com/mail/inbox">Mở hộp thư</Link>
        </section>
      </main>
    );
  }

  const userLabel = data.auth.profile?.full_name ?? data.auth.userEmail ?? 'Admin';

  return (
    <div className="control-shell">
      <header className="control-topbar">
        <Link className="control-brand" href="/control" aria-label="LogiMail control">
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
