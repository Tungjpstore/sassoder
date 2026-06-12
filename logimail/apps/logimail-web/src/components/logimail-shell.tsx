'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Menu, Search, ShieldCheck, UserCircle } from 'lucide-react';
import { LogiMailLogo } from '@/components/logimail-logo';
import { appNavigation, mobileNavigation } from '@/lib/logimail-navigation';
import type { ShellStatusItem } from '@/lib/logimail-types';
import { StatusBadge } from '@/components/logimail-ui';

function isActive(pathname: string, href: string) {
  if (href === '/dashboard' || href === '/ops') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  statusItems = [],
  userLabel = 'Tài khoản',
}: Readonly<{ children: React.ReactNode; statusItems?: ShellStatusItem[]; userLabel?: string | null }>) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="LogiMail navigation">
        <div className="sidebar-brand">
          <Link href="/dashboard" aria-label="LogiMail dashboard">
            <LogiMailLogo subtitle="MailOps" />
          </Link>
          <button className="icon-button mobile-menu-button" type="button" aria-label="Mở menu">
            <Menu size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {appNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {statusItems.length ? (
          <div className="sidebar-status">
            {statusItems.map((item) => (
              <div key={`${item.label}-${item.value}`}><span>{item.label}</span><StatusBadge tone={item.tone}>{item.value}</StatusBadge></div>
            ))}
          </div>
        ) : null}
      </aside>
      <div className="shell-main">
        <Topbar userLabel={userLabel} statusItems={statusItems.slice(1, 3)} />
        <main className="workspace">{children}</main>
      </div>
      <MobileBottomNav pathname={pathname} />
    </div>
  );
}

function Topbar({ userLabel, statusItems }: Readonly<{ userLabel: string | null; statusItems: ShellStatusItem[] }>) {
  return (
    <header className="topbar">
      <div className="global-search" role="search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Tìm kiếm mailbox, domain, logs" placeholder="Tìm mailbox, domain, logs..." />
      </div>
      <div className="topbar-actions">
        {statusItems.map((item) => <StatusBadge key={`${item.label}-${item.value}`} tone={item.tone}>{item.label}: {item.value}</StatusBadge>)}
        <button className="icon-button" type="button" aria-label="Thông báo">
          <Bell size={17} aria-hidden="true" />
        </button>
        <button className="user-button" type="button" aria-label="Tài khoản">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{userLabel || 'Tài khoản'}</span>
          <UserCircle size={19} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function MobileBottomNav({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <nav className="mobile-bottom-nav" aria-label="LogiMail mobile navigation">
      {mobileNavigation.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
