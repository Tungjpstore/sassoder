# LogiVN PWA Deployment Checklist

Use this checklist for any release that changes `public/sw.js`, PWA cache policy, manifest, headers, auth/session behavior, or install UX.

## Pre-Deploy

- Run `npm run lint`.
- Run `npm run build`.
- Run targeted PWA cache-policy tests.
- Confirm `/manifest.webmanifest` returns a valid manifest.
- Confirm manifest shortcuts and screenshots resolve to existing public assets.
- Confirm manifest `start_url` is `/dashboard/login?source=pwa_launch`, not the marketing homepage.
- Confirm `/sw.js` is served with `Cache-Control: no-cache, no-store, must-revalidate`.
- Confirm CSP includes `manifest-src 'self'` and still allows required Supabase/VPS/map connections.
- Confirm service worker is not registered during `next dev`.
- Confirm Web Push env vars are present in production when push is expected:
  - `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `WEB_PUSH_VAPID_SUBJECT`
- Confirm migration `20260606015156_pwa_push_subscriptions.sql` has been applied before enabling the dashboard push prompt.

## Browser Smoke

- Open `/` in production build and confirm service worker registers.
- Open `/offline` directly and confirm it has no private data.
- Open `/dashboard/login` and confirm it is not cached in Cache Storage.
- Log in, visit dashboard, log out, then inspect Cache Storage for private dashboard/API payloads.
- Visit one `/r/[restaurantSlug]` route and confirm order/payment/reservation API calls remain network-only.
- Toggle offline and confirm public/offline fallback behavior does not expose tenant-private or user-private data.
- Toggle back online and confirm the reconnect notice appears then dismisses.
- Log in to dashboard, grant notification permission, and confirm `/api/admin/push-subscriptions` stores one active subscription.
- Send a test push from `/dashboard/settings` and confirm the notification opens `/dashboard` when clicked.
- Trigger one `order.created` or `payment.waiting_confirm` event in staging and confirm the push payload contains no phone number, token, note, or payment detail.

## Installability

- Chrome/Edge desktop: manifest is detected and install is available when browser criteria pass.
- Android Chrome: manifest and icon set are valid if a test device is available.
- iOS Safari: do not expect `beforeinstallprompt`; verify `/download/ios` shows manual Add to Home Screen guidance.
- Download center: verify `/download`, `/download/android`, `/download/ios`, `/download/windows`, and `/download/mac` render.
- Installed app: verify shortcuts open dashboard login, demo, and download center when supported by the test browser.
- Installed app: opening the main icon should land on `/dashboard/login` and show the Google OAuth entry point.
- Installed app with push permission: verify background notification delivery on at least one Chromium browser.
- iOS/iPadOS: test Web Push only after Add to Home Screen; do not treat normal Safari tab behavior as a failure.

## Update And Rollback

- Bump service worker/cache version when cache behavior changes.
- Confirm old caches are deleted on `activate`.
- Confirm the update prompt can reload into the new version.
- Rollback path: deploy a version that stops registering `/sw.js`, then ask affected users to reload; if needed, run `navigator.serviceWorker.getRegistrations().then((items) => items.forEach((item) => item.unregister()))` and clear `caches.keys()` from a controlled support session.

## Release Blockers

- Any authenticated `/api/**`, `/dashboard/**`, staff, payment, order, reservation, Supabase, or realtime response appears in Cache Storage.
- Login/logout/session refresh changes behavior.
- Tenant subdomain rewrite serves the wrong tenant.
- Offline mode displays stale private data.
- Service worker causes blank pages after deploy.
- Push subscription API allows cross-origin mutation or stores a subscription for the wrong restaurant/user.
- Push payload includes PII, payment secrets, OAuth/auth tokens, QR access tokens, or private staff/payroll details.
