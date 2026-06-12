'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, MailCheck, Radio, Reply, Smartphone } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { MailMessageSummary } from '@/lib/mail-ui-types';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type MailCheckResponse = {
  mailbox: { emailAddress?: string | null };
  messages: MailMessageSummary[];
};

type NotificationPayload = {
  subject: string;
  from: string;
  body: string;
  url: string;
  replyUrl: string;
  tag: string;
  timestamp: number;
};

type PushConfigResponse = {
  ready: boolean;
  publicKey: string | null;
  missing: string[];
};

type PushSendResponse = {
  attempted: number;
  sent: number;
  failed: number;
  disabled: number;
  skipped?: string;
};

const ENABLED_KEY = 'logimail.notifications.enabled.v1';
const LAST_UID_KEY = 'logimail.notifications.lastInboxUid.v1';
const POLL_LOCK_KEY = 'logimail.notifications.pollLock.v1';
const SETTINGS_CHANGED_EVENT = 'logimail-notification-settings-changed';
const POLL_INTERVAL_MS = 60_000;
const POLL_LOCK_MS = 35_000;

function notificationSupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'server' };
  if (!('Notification' in window)) return { supported: false, reason: 'missing_notification' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'missing_service_worker' };
  return { supported: true, reason: null };
}

function pushManagerSupported() {
  return typeof window !== 'undefined' && 'PushManager' in window;
}

function isEnabled() {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setEnabled(value: boolean) {
  window.localStorage.setItem(ENABLED_KEY, value ? 'true' : 'false');
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

function mailboxUidKey(mailboxEmail: string | null | undefined) {
  return `${LAST_UID_KEY}:${(mailboxEmail || 'default').toLowerCase()}`;
}

function firstEmailAddress(value: string) {
  const bracketMatch = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value)?.[0] ?? value.trim();
}

function replySubject(subject: string) {
  const cleanSubject = subject.trim() || '(Không có tiêu đề)';
  return /^re\s*:/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`;
}

async function authToken() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn.');
  return data.session.access_token;
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const token = await authToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.ok ? 'Không gọi được API LogiMail.' : body.error.message);
  }
  return body.data;
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

function notificationPayload(message: MailMessageSummary): NotificationPayload {
  const from = message.from || 'LogiMail';
  const subject = message.subject || 'Email mới';
  const url = `/mail/message/${encodeURIComponent(message.id)}`;
  const replyUrl = `/mail/compose?reply=1&replyMessageId=${encodeURIComponent(message.id)}&to=${encodeURIComponent(firstEmailAddress(from))}&subject=${encodeURIComponent(replySubject(subject))}`;
  return {
    subject,
    from,
    body: `${from} · ${subject}`,
    url,
    replyUrl,
    tag: `logimail-new-mail-${message.id}`,
    timestamp: message.date ? new Date(message.date).getTime() : Date.now(),
  };
}

async function showNotification(payload: NotificationPayload) {
  const registration = await ensureServiceWorker();
  if (registration?.active) {
    registration.active.postMessage({ type: 'LOGIMAIL_SHOW_NOTIFICATION', payload });
    return;
  }
  await registration?.showNotification(payload.subject, {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url, replyUrl: payload.replyUrl },
  });
}

function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

async function getPushConfig() {
  return apiFetch<PushConfigResponse>('/api/logimail/push/config');
}

function subscriptionJson(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Subscription Web Push không hợp lệ.');
  return json;
}

async function registerServerPush(registration: ServiceWorkerRegistration) {
  if (!pushManagerSupported()) return { subscribed: false, reason: 'missing_push_manager' };
  const config = await getPushConfig();
  if (!config.ready || !config.publicKey) return { subscribed: false, reason: config.missing.join(', ') || 'web_push_not_configured' };
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.publicKey),
  });
  await apiFetch('/api/logimail/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscriptionJson(subscription),
      permissionState: Notification.permission,
      deviceLabel: navigator.platform || 'web',
      platform: 'web-pwa',
    }),
  });
  return { subscribed: true, reason: null };
}

async function unregisterServerPush() {
  const registration = await ensureServiceWorker();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return false;
  const endpoint = subscription.endpoint;
  await apiFetch('/api/logimail/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
  return true;
}

async function serverPushNotify(payload: NotificationPayload) {
  const result = await apiFetch<PushSendResponse>('/api/logimail/push/notifications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return result.sent > 0;
}

async function serverPushTest() {
  return apiFetch<PushSendResponse>('/api/logimail/push/test', { method: 'POST' });
}

async function readInboxSnapshot(limit = 5) {
  return apiFetch<MailCheckResponse>(`/api/logimail/mail/messages?folder=inbox&limit=${limit}`);
}

async function primeLatestUid() {
  const data = await readInboxSnapshot(1);
  const latest = data.messages[0];
  if (latest) window.localStorage.setItem(mailboxUidKey(data.mailbox.emailAddress), String(latest.uid));
  return data;
}

function tryAcquirePollLock() {
  const now = Date.now();
  const previous = Number(window.localStorage.getItem(POLL_LOCK_KEY) || 0);
  if (Number.isFinite(previous) && now - previous < POLL_LOCK_MS) return false;
  window.localStorage.setItem(POLL_LOCK_KEY, String(now));
  return true;
}

async function checkForNewMail() {
  if (!isEnabled() || Notification.permission !== 'granted') return;
  if (!tryAcquirePollLock()) return;
  const data = await readInboxSnapshot(5);
  const latest = data.messages[0];
  if (!latest) return;
  const key = mailboxUidKey(data.mailbox.emailAddress);
  const previousUid = Number(window.localStorage.getItem(key) || 0);
  window.localStorage.setItem(key, String(latest.uid));
  if (!previousUid) return;
  const newMessages = data.messages.filter((message) => message.unread && message.uid > previousUid).sort((left, right) => right.uid - left.uid);
  if (!newMessages.length) return;
  const payload = notificationPayload(newMessages[0]);
  const sentByServer = await serverPushNotify(payload).catch(() => false);
  if (!sentByServer) await showNotification(payload);
}

export function MailNotificationWatcher() {
  useEffect(() => {
    const support = notificationSupport();
    if (!support.supported) return;
    let stopped = false;
    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, POLL_INTERVAL_MS);
    };

    const run = () => {
      if (stopped) return;
      void checkForNewMail().catch(() => undefined).finally(schedule);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForNewMail().catch(() => undefined);
    };

    const handleSettingsChanged = () => {
      if (isEnabled() && Notification.permission === 'granted') void checkForNewMail().catch(() => undefined);
    };

    void ensureServiceWorker().catch(() => undefined);
    schedule();
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}

export function PwaNotificationSettings() {
  const support = useMemo(() => notificationSupport(), []);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [enabled, setEnabledState] = useState(false);
  const [serverPushReady, setServerPushReady] = useState(false);
  const [serverSubscribed, setServerSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!support.supported) return;
    setPermission(Notification.permission);
    setEnabledState(isEnabled());
    let cancelled = false;
    void (async () => {
      const [config, registration] = await Promise.all([
        getPushConfig().catch(() => null),
        ensureServiceWorker().catch(() => null),
      ]);
      if (cancelled) return;
      setServerPushReady(Boolean(config?.ready));
      const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
      if (!cancelled) setServerSubscribed(Boolean(subscription));
    })();
    return () => {
      cancelled = true;
    };
  }, [support.supported]);

  const enable = useCallback(async () => {
    if (!support.supported) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const registration = await ensureServiceWorker();
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setEnabled(false);
        setEnabledState(false);
        setError('Trình duyệt chưa cấp quyền thông báo.');
        return;
      }
      let serverPush = { subscribed: false, reason: 'service_worker_missing' as string | null };
      if (registration) serverPush = await registerServerPush(registration).catch((pushError) => ({ subscribed: false, reason: pushError instanceof Error ? pushError.message : 'web_push_failed' }));
      setServerSubscribed(serverPush.subscribed);
      setServerPushReady(serverPush.subscribed || serverPush.reason !== 'web_push_not_configured');
      setEnabled(true);
      setEnabledState(true);
      await primeLatestUid().catch(() => undefined);
      setStatus(serverPush.subscribed ? 'Đã bật Web Push server-side cho thiết bị này.' : 'Đã bật thông báo local. Server Push chưa sẵn sàng trên thiết bị này.');
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : 'Không bật được thông báo.');
    } finally {
      setBusy(false);
    }
  }, [support.supported]);

  const disable = useCallback(() => {
    void unregisterServerPush().finally(() => setServerSubscribed(false));
    setEnabled(false);
    setEnabledState(false);
    setStatus('Đã tắt thông báo trên thiết bị này.');
    setError(null);
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (Notification.permission !== 'granted') throw new Error('Cần cấp quyền thông báo trước.');
      const serverResult = await serverPushTest().catch(() => null);
      if (serverResult?.sent) {
        setStatus(`Đã gửi Web Push thử tới ${serverResult.sent} thiết bị.`);
        return;
      }
      await showNotification({
        subject: 'LogiMail sẵn sàng',
        from: 'LogiMail',
        body: 'Thông báo và nút trả lời nhanh đã hoạt động.',
        url: '/mail/inbox',
        replyUrl: '/mail/compose?subject=Re%3A%20LogiMail%20test',
        tag: 'logimail-notification-test',
        timestamp: Date.now(),
      });
      setStatus('Đã gửi thông báo thử bằng service worker local.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Không gửi được thông báo thử.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!support.supported) {
    return (
      <div className="pwa-notification-card unsupported">
        <BellOff size={18} aria-hidden="true" />
        <strong>Thiết bị chưa hỗ trợ Web Push</strong>
        <span>{support.reason}</span>
      </div>
    );
  }

  return (
    <div className="pwa-notification-card">
      <div className="pwa-notification-head">
        <span><Smartphone size={18} aria-hidden="true" /> PWA trên thiết bị này</span>
        <strong className={enabled && permission === 'granted' ? 'success' : 'muted'}>{enabled && permission === 'granted' ? 'Đang bật' : permission}</strong>
      </div>
      <div className="pwa-notification-grid">
        <div><Bell size={16} aria-hidden="true" /><span>Mail mới</span><strong>{enabled ? 'bật' : 'tắt'}</strong></div>
        <div><Radio size={16} aria-hidden="true" /><span>Server Push</span><strong>{serverSubscribed ? 'đã liên kết' : serverPushReady ? 'sẵn sàng' : 'local'}</strong></div>
        <div><Reply size={16} aria-hidden="true" /><span>Trả lời nhanh</span><strong>compose</strong></div>
        <div><MailCheck size={16} aria-hidden="true" /><span>Kiểm tra</span><strong>60s</strong></div>
      </div>
      {status ? <p className="form-alert success"><CheckCircle2 size={15} aria-hidden="true" />{status}</p> : null}
      {error ? <p className="form-alert danger">{error}</p> : null}
      <div className="pwa-notification-actions">
        <button className="button-link button-reset primary" type="button" onClick={enable} disabled={busy}>
          {busy ? <Loader2 size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
          <span>{enabled ? 'Cấp lại quyền' : 'Bật thông báo'}</span>
        </button>
        <button className="button-link button-reset secondary" type="button" onClick={test} disabled={busy || permission !== 'granted'}>Gửi thử</button>
        <button className="button-link button-reset secondary" type="button" onClick={disable} disabled={busy || !enabled}>Tắt</button>
      </div>
    </div>
  );
}
