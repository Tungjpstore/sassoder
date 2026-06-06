# LogiVN PWA Guide

## Scope

This phase adds the conservative PWA foundation for LogiVN:

- App manifest through `app/manifest.ts`.
- App-grade manifest details: shortcuts, screenshots, display override, and launch handling where browsers support them.
- PWA launch opens `/dashboard/login?source=pwa_launch` so installed users land in the auth/OAuth area instead of the marketing homepage.
- PWA icons under `public/icons/`.
- Production-only service worker registration from `components/pwa/service-worker-register.tsx`.
- Service worker source at `public/sw.js`.
- Offline fallback page at `/offline`.
- Testable cache policy in `lib/pwa/cache-policy.ts`.
- Install/download center under `/download` and platform routes.

This phase does not add Web Push, Background Sync, install campaigns, dashboard data caching, order/reservation/payment offline mutations, or staff attendance background sync.

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

- Web Push architecture with VAPID, subscription schema, consent, unsubscribe, rate limits, and audit logs.
- Staff-specific offline/background sync only after idempotency and device-trust review.
- Optional public menu snapshot cache after privacy/product approval.
