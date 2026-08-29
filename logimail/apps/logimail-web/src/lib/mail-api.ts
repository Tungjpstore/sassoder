import 'server-only';

import { jsonError, requireAuth } from '@/lib/api-boundary';
import { resolveAuthorizedMailbox } from '@/lib/mail-access';
import { mailSessionBelongsTo, readMailSessionCookie } from '@/lib/mail-session';

export async function requireMailSession(request: Request, action: 'read' | 'write' = 'read') {
  const auth = await requireAuth(request, action);
  if (!auth.ok) return auth;

  const session = await readMailSessionCookie();
  if (!session || !mailSessionBelongsTo(session, { userId: auth.user.id })) {
    return { ok: false as const, response: jsonError('mail_session_required', 'Cần mở khóa hộp thư LogiMail trên thiết bị này.', 428) };
  }

  const mailbox = await resolveAuthorizedMailbox(auth.user, session.mailboxId);
  if (!mailbox || !mailSessionBelongsTo(session, { userId: auth.user.id, mailboxId: mailbox.id, sessionVersion: mailbox.sessionVersion, email: mailbox.emailAddress })) {
    return { ok: false as const, response: jsonError('mailbox_forbidden', 'Bạn không có quyền truy cập mailbox này.', 403) };
  }

  return { ok: true as const, auth, session, mailbox };
}
