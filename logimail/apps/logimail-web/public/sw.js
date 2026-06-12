const CACHE_NAME = 'logimail-shell-v5';
const SHELL_ASSETS = [
  '/mail/inbox',
  '/mail/compose',
  '/mail/settings/notifications',
  '/auth/login',
  '/manifest.json',
  '/icons/icon.svg',
];

function safeUrl(value, fallback = '/mail/inbox') {
  try {
    const url = new URL(value || fallback, self.location.origin);
    return url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function notificationActions(payload) {
  const maxActions = Number.isFinite(Notification.maxActions) ? Notification.maxActions : 2;
  if (maxActions <= 0) return [];
  const actions = [];
  if (payload.replyUrl) actions.push({ action: 'reply', title: 'Trả lời', icon: '/icons/icon-192.png' });
  actions.push({ action: 'open', title: 'Mở thư', icon: '/icons/icon-192.png' });
  return actions.slice(0, maxActions);
}

async function focusOrOpen(url) {
  const target = safeUrl(url);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    const clientUrl = new URL(client.url);
    if (clientUrl.origin === self.location.origin) {
      await client.navigate(target);
      return client.focus();
    }
  }
  return self.clients.openWindow(target);
}

async function showLogimailNotification(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const subject = typeof payload.subject === 'string' && payload.subject.trim() ? payload.subject.trim() : 'Email mới trong LogiMail';
  const from = typeof payload.from === 'string' && payload.from.trim() ? payload.from.trim() : 'LogiMail';
  const body = typeof payload.body === 'string' && payload.body.trim() ? payload.body.trim() : `${from} gửi email mới.`;
  const url = safeUrl(payload.url, '/mail/inbox');
  const replyUrl = payload.replyUrl ? safeUrl(payload.replyUrl, '/mail/compose') : null;
  await self.registration.showNotification(subject, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : `logimail-${url}`,
    renotify: true,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    data: { url, replyUrl },
    actions: notificationActions({ replyUrl }),
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/mail/inbox') || caches.match('/auth/login'))));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'LOGIMAIL_SHOW_NOTIFICATION') return;
  const task = showLogimailNotification(event.data.payload);
  if (typeof event.waitUntil === 'function') event.waitUntil(task);
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { subject: 'Email mới trong LogiMail', body: event.data?.text() || 'Mở LogiMail để xem thư mới.' };
  }
  event.waitUntil(showLogimailNotification(payload));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = event.action === 'reply' && data.replyUrl ? data.replyUrl : data.url;
  event.waitUntil(focusOrOpen(target || '/mail/inbox'));
});
