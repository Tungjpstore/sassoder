'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Menu, Search, ShieldCheck, UserCircle, X } from 'lucide-react';
import { useState } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <button className={`sidebar-backdrop ${mobileOpen ? 'visible' : ''}`} type="button" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="LogiMail navigation">
        <div className="sidebar-brand">
          <Link href="/dashboard" aria-label="LogiMail dashboard">
            <LogiMailLogo subtitle="MailOps" />
          </Link>
          <button className="icon-button mobile-menu-button" type="button" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {appNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined} aria-current={isActive(pathname, item.href) ? 'page' : undefined} onClick={() => setMobileOpen(false)}>
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
        <Topbar userLabel={userLabel} statusItems={statusItems.slice(1, 3)} onOpenMenu={() => setMobileOpen(true)} />
        <main className="workspace">{children}</main>
      </div>
      <MobileBottomNav pathname={pathname} />
    </div>
  );
}

function Topbar({ userLabel, statusItems, onOpenMenu }: Readonly<{ userLabel: string | null; statusItems: ShellStatusItem[]; onOpenMenu: () => void }>) {
  return (
    <header className="topbar">
      <button className="icon-button topbar-menu-button" type="button" aria-label="Mở menu" onClick={onOpenMenu}>
        <Menu size={18} aria-hidden="true" />
      </button>
      <a className="global-search" href="/mail/inbox" aria-label="Mở tìm kiếm trong hộp thư">
        <Search size={16} aria-hidden="true" />
        <span>Tìm trong hộp thư, mailbox, domain...</span>
        <kbd>/</kbd>
      </a>
      <div className="topbar-actions">
        {statusItems.map((item) => <StatusBadge key={`${item.label}-${item.value}`} tone={item.tone}>{item.label}: {item.value}</StatusBadge>)}
        <Link className="icon-button" href="/settings/notifications" aria-label="Thông báo">
          <Bell size={17} aria-hidden="true" />
        </Link>
        <Link className="user-button" href="/settings/profile" aria-label="Tài khoản">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{userLabel || 'Tài khoản'}</span>
          <UserCircle size={19} aria-hidden="true" />
        </Link>
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
          <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
