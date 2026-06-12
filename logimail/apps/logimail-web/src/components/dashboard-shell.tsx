import Link from 'next/link';
import { Activity, Globe2, LayoutDashboard, LockKeyhole, Mailbox, ServerCog, ShieldCheck, Users } from 'lucide-react';
import { LogiMailLogo } from '@/components/logimail-logo';

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/dashboard/domains', label: 'Domain', icon: Globe2 },
  { href: '/dashboard/mailboxes', label: 'Mailbox', icon: Mailbox },
  { href: '/dashboard/team', label: 'Đội ngũ', icon: Users },
  { href: '/dashboard/dns', label: 'DNS', icon: ShieldCheck },
  { href: '/dashboard/ops', label: 'Ops', icon: ServerCog },
  { href: '/dashboard/settings', label: 'Cài đặt', icon: LockKeyhole },
];

export function DashboardShell({ title, eyebrow, children }: Readonly<{ title: string; eyebrow: string; children: React.ReactNode }>) {
  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand-lockup sidebar-brand">
          <LogiMailLogo subtitle="mail.logivn.com" />
        </Link>
        <nav aria-label="LogiMail">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="nav-link">
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <span className="status-pill"><Activity size={16} aria-hidden="true" /> mail.logivn.com</span>
        </header>
        {children}
      </section>
    </main>
  );
}
