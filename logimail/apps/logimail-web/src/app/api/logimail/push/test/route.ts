import { jsonError, jsonOk } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { requireMailSession } from '@/lib/mail-api';
import { sendPushToMailbox } from '@/lib/push-subscriptions';
import { webPushReadiness } from '@/lib/web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;

  const readiness = webPushReadiness();
  if (!readiness.ready) {
    return jsonError('web_push_not_configured', `Thiếu cấu hình Web Push: ${readiness.missing.join(', ')}`, 503);
  }

  try {
    const result = await sendPushToMailbox({
      userId: context.auth.user.id,
      mailboxId: context.mailbox.id,
      payload: {
        subject: 'LogiMail sẵn sàng',
        from: 'LogiMail',
        body: 'Web Push server-side đã hoạt động trên thiết bị đã đăng ký.',
        url: '/mail/inbox',
        replyUrl: '/mail/compose?subject=Re%3A%20LogiMail%20test',
        tag: `logimail-web-push-test-${Date.now()}`,
        timestamp: Date.now(),
      },
    });

    await writeAuditLog({
      workspaceId: context.mailbox.workspaceId,
      actorId: context.auth.user.id,
      action: 'push.test_send',
      targetType: 'mailbox',
      targetId: context.mailbox.id,
      metadata: result,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError('web_push_failed', 'Không gửi được Web Push thử.', 502);
  }
}
