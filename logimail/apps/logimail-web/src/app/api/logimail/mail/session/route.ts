import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { getAuthorizedMailboxes, resolveAuthorizedMailbox } from '@/lib/mail-access';
import { readJsonObject, stringField } from '@/lib/logimail-store';
import { verifyMailCredentials } from '@/lib/mail-client';
import { saveMailboxCredentials } from '@/lib/mail-credentials';
import {
  createMailSession,
  emptyMailSessionCookieOptions,
  encryptMailSession,
  MAIL_SESSION_COOKIE,
  mailSessionBelongsTo,
  mailSessionCookieOptions,
  publicMailSession,
  readMailSessionCookie,
} from '@/lib/mail-session';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'mail_session_failed');
  if (message === 'missing_mail_session_secret') return 'Chưa cấu hình khóa mail-session cho LogiMail.';
  if (message.includes('Authentication failed') || message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) return 'Mật khẩu mailbox không đúng.';
  return 'Không mở khóa được hộp thư. Hãy kiểm tra mật khẩu hoặc thử lại sau.';
}

export async function GET(request: Request) {
  const auth = await requireAuth(request, 'read');
  if (!auth.ok) return auth.response;

  const mailboxes = await getAuthorizedMailboxes(auth.user);
  const session = await readMailSessionCookie();
  if (!session || !mailSessionBelongsTo(session, { userId: auth.user.id })) {
    return jsonOk({ unlocked: false, session: null, mailboxes });
  }

  const mailbox = mailboxes.find((item) => item.id === session.mailboxId && item.emailAddress === session.email) ?? null;
  const current = mailbox && mailSessionBelongsTo(session, {
    userId: auth.user.id,
    mailboxId: mailbox.id,
    sessionVersion: mailbox.sessionVersion,
    email: mailbox.emailAddress,
  });
  return jsonOk({
    unlocked: Boolean(current),
    session: current ? publicMailSession(session) : null,
    mailbox: current ? mailbox : null,
    mailboxes,
  });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, 'mail-session-unlock', 8, 60_000);
  if (limited) return limited;

  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const email = stringField(body, 'email', { required: true, max: 254 })?.toLowerCase() ?? '';
    const password = stringField(body, 'password', { required: true, max: 256 }) ?? '';
    const mailbox = await resolveAuthorizedMailbox(auth.user, email);
    if (!mailbox || mailbox.emailAddress !== email) return jsonError('mailbox_forbidden', 'Bạn không có quyền mở khóa mailbox này.', 403);

    await verifyMailCredentials(email, password, mailbox);
    await saveMailboxCredentials({ mailboxId: mailbox.id, email, password });

    const session = createMailSession({ userId: auth.user.id, mailboxId: mailbox.id, sessionVersion: mailbox.sessionVersion, email, password });
    const response = jsonOk({ unlocked: true, session: publicMailSession(session), mailbox });
    response.cookies.set(MAIL_SESSION_COOKIE, encryptMailSession(session), mailSessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return jsonError('mail_session_failed', publicSessionError(error), 400);
  }
}

export async function DELETE() {
  // Cookie deletion is deliberately idempotent and unauthenticated: an expired
  // Supabase token must never strand encrypted mailbox credentials in-browser.
  const response = jsonOk({ unlocked: false });
  response.cookies.set(MAIL_SESSION_COOKIE, '', emptyMailSessionCookieOptions());
  response.headers.set('cache-control', 'no-store');
  return response;
}
