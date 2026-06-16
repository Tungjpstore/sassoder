const CACHE_NAME = 'logimail-shell-v6';
const SHELL_ASSETS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
];

const OFFLINE_HTML = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LogiMail</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8f7f2;color:#24352f}.box{max-width:28rem;margin:1rem;padding:1.25rem;border:1px solid #ded8cb;border-radius:.75rem;background:#fff}.box strong{color:#0f4d3a}</style></head><body><main class="box"><strong>LogiMail đang ngoại tuyến.</strong><p>Vui lòng kiểm tra kết nối rồi tải lại trang.</p></main></body></html>`;

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
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined));
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
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/') || url.pathname === '/sw.js') return;
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && SHELL_ASSETS.includes(url.pathname)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'LOGIMAIL_CLEAR_SW_CACHE') {
    const task = caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    if (typeof event.waitUntil === 'function') event.waitUntil(task);
    return;
  }
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
