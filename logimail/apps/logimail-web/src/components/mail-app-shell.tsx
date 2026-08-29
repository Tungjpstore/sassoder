'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, Bell, FileText, Inbox, PencilLine, Search, Send, ShieldAlert, Trash2, UserCircle } from 'lucide-react';
import { SignOutButton } from '@/components/auth-forms';
import { LogiMailLogo } from '@/components/logimail-logo';

const mailNavigation = [
  { href: '/mail/inbox', label: 'Hộp thư đến', icon: Inbox },
  { href: '/mail/sent', label: 'Đã gửi', icon: Send },
  { href: '/mail/drafts', label: 'Thư nháp', icon: FileText },
  { href: '/mail/archive', label: 'Lưu trữ', icon: Archive },
  { href: '/mail/spam', label: 'Thư rác', icon: ShieldAlert },
  { href: '/mail/trash', label: 'Thùng rác', icon: Trash2 },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MailAppShell({
  children,
  userLabel = 'Tài khoản',
}: Readonly<{ children: React.ReactNode; userLabel?: string | null }>) {
  const pathname = usePathname();

  return (
    <div className="mail-app-shell">
      <aside className="mail-app-sidebar" aria-label="Điều hướng hộp thư">
        <Link className="mail-app-brand" href="/mail/inbox" aria-label="LogiMail inbox">
          <LogiMailLogo subtitle="Hộp thư" />
        </Link>
        <Link className="mail-compose-button" href="/mail/compose">
          <PencilLine size={16} aria-hidden="true" />
          <span>Soạn thư</span>
        </Link>
        <nav className="mail-folder-nav">
          {mailNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="mail-app-main">
        <header className="mail-app-topbar">
          <div className="mail-search" role="search">
            <Search size={16} aria-hidden="true" />
            <input aria-label="Tìm trong thư" placeholder="Tìm trong thư" />
          </div>
          <div className="mail-account-actions">
            <Link className="icon-button mail-notification-settings" href="/mail/settings/notifications" aria-label="Thông báo PWA" title="Thông báo PWA">
              <Bell size={16} aria-hidden="true" />
            </Link>
            <Link className="mail-top-compose" href="/mail/compose">
              <PencilLine size={16} aria-hidden="true" />
              <span>Soạn</span>
            </Link>
            <span className="mail-user-pill" title={userLabel || 'Tài khoản'}>
              <UserCircle size={18} aria-hidden="true" />
              <span>{userLabel || 'Tài khoản'}</span>
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="mail-workspace">{children}</main>
      </div>
      <nav className="mail-mobile-nav" aria-label="Điều hướng hộp thư di động">
        {mailNavigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link href="/mail/compose" className={isActive(pathname, '/mail/compose') ? 'active' : undefined}>
          <PencilLine size={18} aria-hidden="true" />
          <span>Soạn</span>
        </Link>
      </nav>
    </div>
  );
}
