import { createLogimailServiceStore, supabaseErrorMessage, type JsonObject } from '@/lib/logimail-store';
import { publicWebPushError, sendLogimailWebPush, shouldDisablePushSubscription } from '@/lib/web-push';

type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

export type LogimailNotificationPayload = {
  subject: string;
  from?: string | null;
  body: string;
  url: string;
  replyUrl?: string | null;
  tag: string;
  timestamp: number;
};

function storeOrThrow() {
  const store = createLogimailServiceStore();
  if (!store) throw new Error('push_store_not_configured');
  return store;
}

function cleanString(value: unknown, max: number) {
  if (typeof value !== 'string') throw new Error('invalid_subscription');
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new Error('invalid_subscription');
  return cleaned;
}

export function normalizePushSubscription(value: unknown): PushSubscriptionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_subscription');
  const record = value as Record<string, unknown>;
  const keys = record.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('invalid_subscription');
  const keyRecord = keys as Record<string, unknown>;

  const expirationTime = record.expirationTime;
  if (expirationTime !== undefined && expirationTime !== null && !Number.isFinite(Number(expirationTime))) {
    throw new Error('invalid_subscription');
  }

  return {
    endpoint: cleanString(record.endpoint, 2048),
    keys: {
      p256dh: cleanString(keyRecord.p256dh, 4096),
      auth: cleanString(keyRecord.auth, 1024),
    },
    expirationTime: expirationTime === undefined || expirationTime === null ? null : Number(expirationTime),
  };
}

export function cleanNotificationPayload(input: JsonObject): LogimailNotificationPayload {
  const subject = typeof input.subject === 'string' && input.subject.trim() ? input.subject.trim().slice(0, 180) : 'Email mới trong LogiMail';
  const from = typeof input.from === 'string' && input.from.trim() ? input.from.trim().slice(0, 240) : 'LogiMail';
  const body = typeof input.body === 'string' && input.body.trim() ? input.body.trim().slice(0, 280) : `${from} gửi email mới.`;
  const url = safeNotificationPath(input.url, '/mail/inbox');
  const replyUrl = input.replyUrl ? safeNotificationPath(input.replyUrl, '/mail/compose') : null;
  const tag = typeof input.tag === 'string' && input.tag.trim() ? input.tag.trim().slice(0, 180) : `logimail-${Date.now()}`;
  const timestamp = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  return { subject, from, body, url, replyUrl, tag, timestamp };
}

function safeNotificationPath(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  try {
    const url = new URL(value, 'https://mail.logivn.com');
    if (url.origin !== 'https://mail.logivn.com') return fallback;
    if (!url.pathname.startsWith('/mail/')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export async function savePushSubscription(input: {
  workspaceId: string;
  mailboxId: string;
  userId: string;
  subscription: PushSubscriptionInput;
  permissionState: string;
  userAgent: string | null;
  deviceLabel?: string | null;
  platform?: string | null;
}) {
  const store = storeOrThrow();
  const expirationTime = input.subscription.expirationTime ? new Date(input.subscription.expirationTime).toISOString() : null;
  const permissionState = ['granted', 'denied', 'default'].includes(input.permissionState) ? input.permissionState : 'default';
  const { data, error } = await store
    .from('push_subscriptions')
    .upsert(
      {
        workspace_id: input.workspaceId,
        mailbox_id: input.mailboxId,
        user_id: input.userId,
        endpoint: input.subscription.endpoint,
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
        expiration_time: expirationTime,
        device_label: input.deviceLabel ?? null,
        platform: input.platform ?? null,
        permission_state: permissionState,
        enabled: true,
        disabled_at: null,
        disabled_reason: null,
        user_agent: input.userAgent,
        failure_count: 0,
        last_seen_at: new Date().toISOString(),
        metadata: {},
      },
      { onConflict: 'endpoint' },
    )
    .select('id,enabled,last_seen_at')
    .single();

  if (error) throw new Error(supabaseErrorMessage(error));
  return data;
}

export async function disablePushSubscription(input: { userId: string; endpoint: string; reason: string }) {
  const store = storeOrThrow();
  const { error } = await store
    .from('push_subscriptions')
    .update({ enabled: false, disabled_at: new Date().toISOString(), disabled_reason: input.reason })
    .eq('user_id', input.userId)
    .eq('endpoint', input.endpoint);
  if (error) throw new Error(supabaseErrorMessage(error));
}

async function markPushSuccess(id: string) {
  const store = storeOrThrow();
  await store
    .from('push_subscriptions')
    .update({ failure_count: 0, last_success_at: new Date().toISOString(), last_notification_at: new Date().toISOString() })
    .eq('id', id);
}

async function markPushFailure(row: PushSubscriptionRow, error: unknown) {
  const store = storeOrThrow();
  const shouldDisable = shouldDisablePushSubscription(error);
  await store
    .from('push_subscriptions')
    .update({
      failure_count: row.failure_count + 1,
      last_failure_at: new Date().toISOString(),
      disabled_at: shouldDisable ? new Date().toISOString() : null,
      disabled_reason: shouldDisable ? publicWebPushError(error) : null,
      enabled: shouldDisable ? false : true,
      metadata: { lastError: publicWebPushError(error) },
    })
    .eq('id', row.id);
}

export async function sendPushToMailbox(input: { userId: string; mailboxId: string; payload: LogimailNotificationPayload }) {
  const store = storeOrThrow();
  const { data, error } = await store
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth,failure_count')
    .eq('user_id', input.userId)
    .eq('mailbox_id', input.mailboxId)
    .eq('enabled', true)
    .is('disabled_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(supabaseErrorMessage(error));

  let sent = 0;
  let failed = 0;
  let disabled = 0;
  const rows = (data ?? []) as PushSubscriptionRow[];
  for (const row of rows) {
    try {
      const result = await sendLogimailWebPush(row, input.payload);
      if (result.ok) {
        sent += 1;
        await markPushSuccess(row.id);
      } else {
        failed += 1;
      }
    } catch (pushError) {
      failed += 1;
      if (shouldDisablePushSubscription(pushError)) disabled += 1;
      await markPushFailure(row, pushError);
    }
  }

  return { attempted: rows.length, sent, failed, disabled };
}
