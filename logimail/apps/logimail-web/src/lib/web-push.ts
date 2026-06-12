import webPush, { type PushSubscription, type WebPushError } from 'web-push';

type WebPushPayload = {
  subject: string;
  from?: string | null;
  body: string;
  url: string;
  replyUrl?: string | null;
  tag: string;
  timestamp: number;
};

type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configuredKey: string | null = null;

export function webPushReadiness() {
  const publicKey = process.env.LOGIMAIL_WEB_PUSH_PUBLIC_KEY ?? '';
  const privateKey = process.env.LOGIMAIL_WEB_PUSH_PRIVATE_KEY ?? '';
  const subject = process.env.LOGIMAIL_WEB_PUSH_SUBJECT ?? 'mailto:postmaster@logivn.com';
  const missing = [
    publicKey ? null : 'LOGIMAIL_WEB_PUSH_PUBLIC_KEY',
    privateKey ? null : 'LOGIMAIL_WEB_PUSH_PRIVATE_KEY',
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    missing,
    publicKey: publicKey || null,
    subject,
  };
}

function configureWebPush() {
  const readiness = webPushReadiness();
  if (!readiness.ready || !readiness.publicKey) return readiness;
  const key = `${readiness.subject}:${readiness.publicKey}`;
  if (configuredKey !== key) {
    webPush.setVapidDetails(readiness.subject, readiness.publicKey, process.env.LOGIMAIL_WEB_PUSH_PRIVATE_KEY ?? '');
    configuredKey = key;
  }
  return readiness;
}

function webPushErrorStatus(error: unknown) {
  const candidate = error as Partial<WebPushError> | null;
  return typeof candidate?.statusCode === 'number' ? candidate.statusCode : null;
}

export function shouldDisablePushSubscription(error: unknown) {
  const statusCode = webPushErrorStatus(error);
  return statusCode === 404 || statusCode === 410;
}

export function publicWebPushError(error: unknown) {
  const statusCode = webPushErrorStatus(error);
  if (statusCode) return `web_push_failed_${statusCode}`;
  return error instanceof Error ? error.message.slice(0, 180) : 'web_push_failed';
}

export async function sendLogimailWebPush(subscription: StoredPushSubscription, payload: WebPushPayload) {
  const readiness = configureWebPush();
  if (!readiness.ready) {
    return { ok: false as const, skipped: 'not_configured', missing: readiness.missing };
  }

  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  await webPush.sendNotification(pushSubscription, JSON.stringify(payload), {
    TTL: 60 * 60,
    urgency: 'normal',
  });

  return { ok: true as const };
}
