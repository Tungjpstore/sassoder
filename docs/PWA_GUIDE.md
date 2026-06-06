# LogiVN PWA Guide

## Scope

This phase adds the conservative PWA foundation for LogiVN:

- App manifest through `app/manifest.ts`.
- App-grade manifest details: shortcuts, screenshots, display override, and launch handling where browsers support them.
- PWA launch opens `/dashboard/login?source=pwa_launch` so installed users land in the auth/OAuth area instead of the marketing homepage.
- PWA icons under `public/icons/`.
- Production-only service worker registration from `components/pwa/service-worker-register.tsx`.
- Service worker source at `public/sw.js`.
- Web Push v1: VAPID-backed push subscriptions, service worker `push`/`notificationclick`, safe notification routing, and operational event push for selected high-signal events.
- Dashboard notification permission prompt from `components/pwa/push-notification-manager.tsx`.
- Offline fallback page at `/offline`.
- Testable cache policy in `lib/pwa/cache-policy.ts`.
- Install/download center under `/download` and platform routes.

This phase does not add Background Sync, dashboard data caching, order/reservation/payment offline mutations, or staff attendance background sync.

## Runtime Behavior

The service worker uses a deny-by-default policy:

- Static assets and known public brand assets may be cached.
- Public marketing documents can use network-first caching.
- Public install/download documents under `/download` can use the same safe public document cache.
- Dynamic customer order/reservation surfaces get network behavior with an offline fallback, but their operational data is not cached.
- Dashboard, admin, auth, API, platform-control, payment, order, reservation, realtime, Supabase, and VPS websocket surfaces stay network-only.

The registration component is intentionally production-only. Development mode should not register a service worker, which avoids stale local assets while coding.

## Cache Safety Rules

Never cache:

- `/api/**`
- `/auth/**`
- `/dashboard/**`
- `/platform-control/**`
- `/staff/change-password`
- non-GET requests
- requests with `Authorization`
- Supabase auth/session cookies
- dashboard smoke auth cookies
- URLs with token, OTP, payment, checkout, order, reservation, session, state, or QR access query params

Allowed static cache candidates are defined in `lib/pwa/cache-policy.ts` and mirrored in `public/sw.js`.

## Update Flow

When a new service worker is installed while an old one controls the page, `ServiceWorkerRegister` shows an update prompt. The user can reload intentionally. The app should not force reload during checkout, payment, reservation, or staff operations.

The same component also shows app-grade network status:

- Offline warning while the device has no network.
- Reconnected confirmation after the browser comes back online.
- Update available prompt only when a waiting service worker exists.

## Web Push V1

Web Push is progressive enhancement for installed/compatible browsers:

- The browser subscribes through `PushManager` after the user clicks the dashboard prompt.
- Subscriptions are stored in `public.push_subscriptions` through `/api/admin/push-subscriptions`.
- Mutations are server-owned with the Supabase service role; authenticated clients can only read their own future device records through RLS.
- Server sending uses `web-push` and VAPID env vars.
- `public/sw.js` handles `push` and `notificationclick`; click targets are constrained to first-party `/dashboard` or `/download` routes.
- `services/operational-event-bus.ts` sends PWA push for selected events when configured: `order.created`, `payment.waiting_confirm`, `reservation.created`, `service_request.created`, `staff.request_created`, `staff.incident_reported`, and `sla.warning`.
- Push payloads intentionally contain compact operational copy and route hints only. Do not include customer phone, payment details, notes, tokens, or private staff/payroll data.

Required production env vars:

```txt
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_VAPID_SUBJECT=mailto:admin@logivn.com
```

Generate a key pair once and store it as environment variables:

```bash
npx web-push generate-vapid-keys
```

Platform caveats:

- Chromium/Edge/Android can receive Web Push after permission is granted.
- iOS/iPadOS Web Push requires the site to be added to Home Screen and the user to grant permission.
- Some desktop browsers support permission but not full badge behavior; app badge updates are best-effort.

## Offline Behavior

When a navigation fails and there is no safe cached public document, the service worker falls back to `/offline`. The offline page contains no tenant, customer, staff, payment, or dashboard data.

## Install UX

Phase 3 adds the install/download center:

- `/download`
- `/download/android`
- `/download/ios`
- `/download/windows`
- `/download/mac`

The install panel is progressive enhancement:

- Chromium browsers can use the real `beforeinstallprompt` event when the browser exposes it.
- iOS/iPadOS never receives a fake prompt; users get Safari Share > Add to Home Screen steps.
- Windows and macOS show Chrome/Edge install guidance, with macOS Safari Add to Dock as a caveat where supported.
- Standalone/display-mode detection changes the CTA to open LogiVN instead of asking to install again.
- Dismissal state is stored in `localStorage` with `logivn:pwa-install-dismissed` so the in-page install prompt does not repeat after the user hides it.

The download routes do not change service worker cache rules and do not cache authenticated dashboard, staff, customer order, reservation, payment, or API data.

The PWA `start_url` intentionally points to `/dashboard/login?source=pwa_launch`. This route shows the Google OAuth entry point and email/password login; it should not auto-redirect to `/auth/google` on launch because opening an installed app should not unexpectedly start an external OAuth round trip.

## Future Phases

Future PWA work should be split into separate reviews:

- Notification center upgrade: role-specific inbox panel, quiet hours, rate limits, audit logs, and per-event preferences.
- Staff-specific offline/background sync only after idempotency and device-trust review.
- Optional public menu snapshot cache after privacy/product approval.
