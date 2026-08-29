export type MailboxPermission = 'member' | 'read' | 'send' | 'admin';
type DirectMailboxPermission = Exclude<MailboxPermission, 'member'>;

type ResolveMailboxPermissionInput = {
  mailboxEmail: string;
  userEmail: string | null | undefined;
  permission?: string | null;
};

export function resolveMailboxPermission(
  input: ResolveMailboxPermissionInput & { fallback?: DirectMailboxPermission },
): DirectMailboxPermission;
export function resolveMailboxPermission(
  input: ResolveMailboxPermissionInput & { fallback: 'member' },
): MailboxPermission;
export function resolveMailboxPermission(input: ResolveMailboxPermissionInput & { fallback?: MailboxPermission }): MailboxPermission {
  const mailboxEmail = input.mailboxEmail.trim().toLowerCase();
  const userEmail = input.userEmail?.trim().toLowerCase();

  // A mailbox owned by the authenticated identity must remain usable even when
  // an old or incomplete permission row still exists for it.
  if (userEmail && mailboxEmail === userEmail) return 'admin';

  if (input.permission === 'admin' || input.permission === 'send' || input.permission === 'read') {
    return input.permission;
  }

  return input.fallback ?? 'member';
}
