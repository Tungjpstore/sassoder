import { jsonError, jsonOk, requireAuth } from '@/lib/api-boundary';
import { writeAuditLog } from '@/lib/audit-log';
import { requireMailSession } from '@/lib/mail-api';
import { readJsonObject, stringField } from '@/lib/logimail-store';
import { disablePushSubscription, normalizePushSubscription, savePushSubscription } from '@/lib/push-subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicPushError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'push_subscription_failed');
  if (message === 'invalid_subscription') return 'Subscription thông báo không hợp lệ.';
  if (message === 'push_store_not_configured') return 'Chưa cấu hình Supabase service role cho Web Push.';
  return 'Không lưu được thiết bị nhận thông báo.';
}

export async function POST(request: Request) {
  const context = await requireMailSession(request, 'read');
  if (!context.ok) return context.response;

  try {
    const body = await readJsonObject(request);
    const subscription = normalizePushSubscription(body.subscription);
    const permissionState = stringField(body, 'permissionState', { max: 24 }) ?? 'default';
    const deviceLabel = stringField(body, 'deviceLabel', { max: 120 });
    const platform = stringField(body, 'platform', { max: 80 });
    const saved = await savePushSubscription({
      workspaceId: context.mailbox.workspaceId,
      mailboxId: context.mailbox.id,
      userId: context.auth.user.id,
      subscription,
      permissionState,
      deviceLabel,
      platform,
      userAgent: request.headers.get('user-agent'),
    });

    await writeAuditLog({
      workspaceId: context.mailbox.workspaceId,
      actorId: context.auth.user.id,
      action: 'push.subscription_upsert',
      targetType: 'mailbox',
      targetId: context.mailbox.id,
      metadata: { subscriptionId: saved?.id ?? null, permissionState },
    });

    return jsonOk({ subscribed: true, subscription: saved }, { status: 201 });
  } catch (error) {
    return jsonError('push_subscription_failed', publicPushError(error), 400);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request, 'write');
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const endpoint = stringField(body, 'endpoint', { required: true, max: 2048 }) ?? '';
    await disablePushSubscription({ userId: auth.user.id, endpoint, reason: 'user_disabled' });
    await writeAuditLog({
      actorId: auth.user.id,
      action: 'push.subscription_disable',
      targetType: 'push_subscription',
      targetId: endpoint.slice(0, 120),
      metadata: {},
    });
    return jsonOk({ subscribed: false });
  } catch (error) {
    return jsonError('push_unsubscribe_failed', 'Không tắt được thiết bị nhận thông báo.', 400);
  }
}
