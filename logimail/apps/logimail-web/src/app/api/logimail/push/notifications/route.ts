import { jsonError, jsonOk } from '@/lib/api-boundary';
import { requireMailSession } from '@/lib/mail-api';
import { readJsonObject } from '@/lib/logimail-store';
import { cleanNotificationPayload, sendPushToMailbox } from '@/lib/push-subscriptions';
import { webPushReadiness } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;

  const readiness = webPushReadiness();
  if (!readiness.ready) return jsonOk({ attempted: 0, sent: 0, failed: 0, disabled: 0, skipped: 'web_push_not_configured' });

  try {
    const body = await readJsonObject(request);
    const payload = cleanNotificationPayload(body);
    const result = await sendPushToMailbox({ userId: context.auth.user.id, mailboxId: context.mailbox.id, payload });
    return jsonOk(result);
  } catch {
    return jsonError('web_push_failed', 'Không gửi được thông báo mail mới.', 502);
  }
}
