import {
  Activity,
  Bot,
  DatabaseBackup,
  Globe2,
  Inbox,
  LockKeyhole,
  Mail,
  MailCheck,
  MailWarning,
  ServerCog,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: 'core' | 'mail' | 'ops' | 'admin';
};

export const appNavigation: NavItem[] = [
  { href: '/dashboard', label: 'Tong quan', icon: Activity, group: 'core' },
  { href: '/mail', label: 'Hop thu', icon: Inbox, group: 'mail' },
  { href: '/mailboxes', label: 'Mailbox', icon: Mail, group: 'mail' },
  { href: '/domains', label: 'Domain & DNS', icon: Globe2, group: 'core' },
  { href: '/domains/current/deliverability', label: 'Deliverability', icon: MailCheck, group: 'core' },
  { href: '/ops/dns-check', label: 'Cloudflare DNS', icon: ShieldCheck, group: 'ops' },
  { href: '/ops', label: 'MailOps', icon: ServerCog, group: 'ops' },
  { href: '/ops/mail-queue', label: 'Mail Queue', icon: MailWarning, group: 'ops' },
  { href: '/ops/backups', label: 'Backup', icon: DatabaseBackup, group: 'ops' },
  { href: '/ops/agent', label: 'Agent Control', icon: Bot, group: 'ops' },
  { href: '/team', label: 'Team', icon: Users, group: 'admin' },
  { href: '/settings/security', label: 'Security', icon: LockKeyhole, group: 'admin' },
  { href: '/settings/workspace', label: 'Settings', icon: Settings, group: 'admin' },
];

export const mobileNavigation = appNavigation.filter((item) =>
  ['/dashboard', '/mail', '/domains', '/ops', '/settings/security'].includes(item.href),
);
