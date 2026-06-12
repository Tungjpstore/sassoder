import 'server-only';

import type { VerifiedLogimailUser } from '@/lib/api-boundary';
import { createLogimailServiceStore, normalizeEmail, supabaseErrorMessage } from '@/lib/logimail-store';

export type AuthorizedMailbox = {
  id: string;
  workspaceId: string;
  domainId: string;
  emailAddress: string;
  displayName: string | null;
  quotaMb: number;
  status: string;
  provider: string;
  providerMailboxId: string | null;
  permission: 'read' | 'send' | 'admin';
  domain: string | null;
  mailHostname: string | null;
  profileFullName: string | null;
  profileAvatarUrl: string | null;
};

type MailboxRow = {
  id: string;
  workspace_id: string;
  domain_id: string;
  email_address: string;
  display_name: string | null;
  quota_mb: number;
  status: string;
  provider: string;
  provider_mailbox_id: string | null;
};

type PermissionRow = {
  mailbox_id: string;
  permission: 'read' | 'send' | 'admin';
};

type DomainRow = {
  id: string;
  domain: string;
  mail_hostname: string | null;
};

function serviceStore() {
  const store = createLogimailServiceStore();
  if (!store) throw new Error('mail_access_not_configured');
  return store;
}

function permissionRank(permission: AuthorizedMailbox['permission']) {
  if (permission === 'admin') return 3;
  if (permission === 'send') return 2;
  return 1;
}

function mergePermissions(current: AuthorizedMailbox['permission'] | undefined, next: AuthorizedMailbox['permission']) {
  if (!current) return next;
  return permissionRank(next) > permissionRank(current) ? next : current;
}

export function canSendFromMailbox(mailbox: AuthorizedMailbox) {
  return mailbox.permission === 'send' || mailbox.permission === 'admin';
}

export async function getAuthorizedMailboxes(user: VerifiedLogimailUser) {
  const store = serviceStore();
  const email = user.email ? normalizeEmail(user.email) : null;

  const { data: profile, error: profileError } = await store
    .from('profiles')
    .select('id,email,full_name,avatar_url,account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(supabaseErrorMessage(profileError));
  if (!profile || profile.account_status !== 'approved') return [];

  const { data: permissionRows, error: permissionError } = await store
    .from('mailbox_permissions')
    .select('mailbox_id,permission')
    .eq('user_id', user.id);
  if (permissionError) throw new Error(supabaseErrorMessage(permissionError));

  const permissions = new Map<string, AuthorizedMailbox['permission']>();
  for (const row of (permissionRows ?? []) as PermissionRow[]) {
    permissions.set(row.mailbox_id, mergePermissions(permissions.get(row.mailbox_id), row.permission));
  }

  const mailboxIds = Array.from(permissions.keys());
  const mailboxResults: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>[] = [];
  if (mailboxIds.length > 0) {
    mailboxResults.push(
      store
        .from('mailboxes')
        .select('id,workspace_id,domain_id,email_address,display_name,quota_mb,status,provider,provider_mailbox_id')
        .in('id', mailboxIds)
        .eq('status', 'active'),
    );
  }
  if (email) {
    mailboxResults.push(
      store
        .from('mailboxes')
        .select('id,workspace_id,domain_id,email_address,display_name,quota_mb,status,provider,provider_mailbox_id')
        .eq('email_address', email)
        .eq('status', 'active'),
    );
  }

  const mailboxResultRows = await Promise.all(mailboxResults);
  const mailboxMap = new Map<string, MailboxRow>();
  for (const result of mailboxResultRows) {
    if (result.error) throw new Error(supabaseErrorMessage(result.error));
    for (const mailbox of (result.data ?? []) as MailboxRow[]) {
      mailboxMap.set(mailbox.id, mailbox);
      if (email && mailbox.email_address === email && !permissions.has(mailbox.id)) {
        permissions.set(mailbox.id, 'admin');
      }
    }
  }

  const domainIds = Array.from(new Set(Array.from(mailboxMap.values()).map((mailbox) => mailbox.domain_id)));
  const domainMap = new Map<string, DomainRow>();
  if (domainIds.length > 0) {
    const { data: domains, error: domainError } = await store
      .from('domains')
      .select('id,domain,mail_hostname')
      .in('id', domainIds);
    if (domainError) throw new Error(supabaseErrorMessage(domainError));
    for (const domain of (domains ?? []) as DomainRow[]) domainMap.set(domain.id, domain);
  }

  return Array.from(mailboxMap.values())
    .map((mailbox) => {
      const domain = domainMap.get(mailbox.domain_id);
      return {
        id: mailbox.id,
        workspaceId: mailbox.workspace_id,
        domainId: mailbox.domain_id,
        emailAddress: mailbox.email_address,
        displayName: mailbox.display_name,
        quotaMb: mailbox.quota_mb,
        status: mailbox.status,
        provider: mailbox.provider,
        providerMailboxId: mailbox.provider_mailbox_id,
        permission: permissions.get(mailbox.id) ?? 'read',
        domain: domain?.domain ?? null,
        mailHostname: domain?.mail_hostname ?? null,
        profileFullName: typeof profile.full_name === 'string' ? profile.full_name : null,
        profileAvatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
      } satisfies AuthorizedMailbox;
    })
    .sort((left, right) => left.emailAddress.localeCompare(right.emailAddress));
}

export async function resolveAuthorizedMailbox(user: VerifiedLogimailUser, mailboxIdOrEmail?: string | null) {
  const mailboxes = await getAuthorizedMailboxes(user);
  if (!mailboxIdOrEmail) return mailboxes[0] ?? null;

  const key = mailboxIdOrEmail.toLowerCase();
  return mailboxes.find((mailbox) => mailbox.id === mailboxIdOrEmail || mailbox.emailAddress === key) ?? null;
}
