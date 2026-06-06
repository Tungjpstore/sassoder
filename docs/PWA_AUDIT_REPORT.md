# LogiVN PWA Audit Report

Ngay audit: 2026-06-06 (Asia/Tokyo)

## Executive Summary

LogiVN da co nen tang tot de trien khai PWA: Next.js App Router, metadata tap trung, icon co ban, CSP cho phep worker cung origin, nhieu route public co `revalidate`, va mobile/PWA da duoc xem la huong san pham trong `docs/mobile-ui-hiring-brief.md`.

Tuy nhien, repo hien chua co PWA foundation production: chua co `app/manifest.ts` hoac `/public/manifest.json`, chua co service worker, chua co service worker registration, chua co install UX, chua co update/offline shell dung chung, va chua co Web Push architecture. Rui ro lon nhat cua Phase 2 khong phai la tao manifest, ma la service worker cache nham du lieu multi-tenant, session Supabase, API don hang/thanh toan/nhan su hoac dashboard owner.

Khuyen nghi: Phase 2 chi nen trien khai PWA foundation nho, mac dinh deny cache cho `/api/**`, `/auth/**`, `/dashboard/**`, `/staff/change-password`, `/platform-control/**`, Supabase/VPS realtime, payment/order/reservation mutation. Push notification va background sync can la phase rieng sau khi co schema, consent, unsubscribe, rate limit va audit log.

## Source References

- [Next.js Progressive Web Apps guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [MDN Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [MDN beforeinstallprompt event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [Chrome Workbox strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)
- [web.dev PWA installation](https://web.dev/learn/pwa/installation)
- [WebKit Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Repository Snapshot

Audited files and areas:

- `package.json`
- `next.config.ts`
- `app/layout.tsx`
- `app/dashboard/layout.tsx`
- `lib/seo/metadata.ts`
- `proxy.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `lib/session.ts`
- `services/menu-service.ts`
- `features/attendance/hooks/use-offline-attendance-queue.ts`
- `components/customer/order-client.tsx`
- `components/customer/remote-order-client.tsx`
- `app/r/[restaurantSlug]/page.tsx`
- `app/r/[restaurantSlug]/table/[tableId]/page.tsx`
- `app/r/[restaurantSlug]/reserve/page.tsx`
- `app/api/**`
- `public/**`
- existing docs under `docs/`

Stack observed:

- Next.js `16.2.6`
- React `19.2.5`
- TypeScript
- Tailwind CSS v4
- Supabase SSR/client auth
- Vercel deployment assumptions
- VPS hybrid services and realtime integration
- Telegram operational notification layer

Quality gates available:

- `npm run lint`
- `npm run build`
- `npm run test`
- focused domain checks such as `npm run responsive:smoke`, `npm run infra:check`, `npm run seo:audit`, and billing/production smoke scripts when relevant

## Current PWA State

### Present

- Basic icons exist in `public/`: `favicon.ico`, `favicon-48x48.png`, `apple-icon.png`, `icon-192.png`, `icon.png`.
- Brand assets exist under `public/brand/logivn/**`.
- Customer/order-flow and onboarding images exist under `public/customer/order-flow/**` and `public/onboarding/flow/**`.
- Root metadata is centralized through `lib/seo/metadata.ts` and applied from `app/layout.tsx`.
- `next.config.ts` sets strong baseline security headers: CSP, HSTS, frame protection, referrer policy, permissions policy.
- CSP currently includes `worker-src 'self' blob:`, so same-origin service worker/web worker is not blocked by the current policy.
- `connect-src` includes Supabase HTTP/WebSocket, LogiVN API/WS endpoints, maps providers, QR providers, and Vercel live.

### Missing

- No `app/manifest.ts`.
- No `/public/manifest.json` or `/public/manifest.webmanifest` for the app.
- No `public/sw.js` or generated service worker source.
- No `navigator.serviceWorker.register` call.
- No Workbox dependency or `next-pwa` dependency.
- No shared PWA hooks/components under `components/pwa`, `hooks/pwa`, or `lib/pwa`.
- No install prompt handling for Chromium `beforeinstallprompt`.
- No standalone/display-mode detection.
- No global offline, reconnect, update available, or service worker rollback UX.
- No Web Push subscription schema, VAPID env contract, push send service, unsubscribe flow, or notification audit trail for browser push.

### Clarification

The existing `public/customer/order-flow/manifest*.json` and `public/onboarding/flow/manifest*.json` files are asset manifests for generated images, not the web app manifest.

## Runtime And Routing Findings

### `proxy.ts`

`proxy.ts` is high-risk for PWA because it owns auth/session repair and tenant routing:

- Redirects protected `/dashboard/**` pages to login when Supabase/session/smoke auth cookies are absent.
- Repairs oversized or invalid Supabase cookies and sets `Cache-Control: no-store` on repair responses.
- Rewrites tenant subdomains to `/r/[tenantSlug]`, `/r/[tenantSlug]/table/**`, and `/r/[tenantSlug]/reserve`.
- Rewrites `staff.logivn.com` routes to staff login flows.
- Bypasses session refresh for `/api/**`, `/auth/**`, public dashboard auth paths without cookies, staff public paths, server actions, prefetch, and RSC requests.
- Returns `204` with `Cache-Control: no-store` for dashboard prefetch requests.
- Excludes `_next/static`, `_next/image`, `favicon.ico`, and image assets from proxy matching.

Implication: service worker must not second-guess auth redirects, must not cache proxy repair responses, and must not serve stale dashboard/API responses.

### Root Metadata

`lib/seo/metadata.ts` currently configures icons, Open Graph, Twitter metadata, robots, and canonical URLs. It does not yet configure PWA-specific metadata such as manifest link, theme color, apple web app hints, or startup behavior.

`app/layout.tsx` mounts root HTML/body and includes an inline theme bootstrap for `admin-theme`. A PWA registration component can be mounted here, but should be tiny, client-only, and safe when JavaScript is disabled.

### Security Headers

`next.config.ts` is a central edit point for Phase 2:

- Add `manifest-src 'self'` to CSP.
- Consider explicit no-cache headers for `/sw.js` and manifest route/file so updates are not stuck behind stale browser/CDN behavior.
- Preserve current `connect-src` for Supabase realtime, VPS websocket, maps, QR providers, and Vercel live.
- Do not loosen `frame-src`, `object-src`, or `frame-ancestors` for PWA.

## Route Surface Classification

### Public Marketing And SEO

Likely safe for static/runtime document caching after Phase 2 validation:

- `/`
- `/demo`
- `/pricing`
- `/waitlist` page HTML only, not POST API
- `/blog`
- `/blog/[slug]`
- `/giai-phap`
- `/giai-phap/[slug]`
- `/so-sanh`
- `/so-sanh/[slug]`
- `/dia-phuong`
- `/dia-phuong/[slug]`
- `/feed.xml`
- `/llms.txt`
- `/robots.txt`
- `/sitemap.xml`

Notes:

- Many of these routes use `revalidate = 3600` or static generation.
- Marketing APIs such as `/api/marketing/events` and `/api/marketing/waitlist` are not cacheable even though the pages are public.

### Customer Public But Operationally Dynamic

Treat as app shell/cache-light, not full HTML/data precache by default:

- `/r/[restaurantSlug]`
- `/r/[restaurantSlug]/table/[tableId]`
- `/r/[restaurantSlug]/reserve`

Findings:

- These pages are `force-dynamic` and `noIndex`.
- `app/r/[restaurantSlug]/page.tsx` and table routes use `getCachedPublicMenu`, but page output still depends on tenant status, online ordering, table access token, reservation settings, promotions, delivery configuration, and runtime behavior.
- `getCachedPublicMenu` returns public business data including restaurant name, slug, logo, address, store lat/lng, hotline, contact email, online ordering settings, delivery settings, fee settings, branches, promotions, categories, items, and modifiers.
- This data may be public by product design, but it is tenant-scoped and business-sensitive enough that browser Cache Storage should only cache it after a product/privacy decision.

Recommended Phase 2 stance:

- Cache static JS/CSS/images required for these routes.
- Provide offline shell with clear stale/offline copy.
- Do not cache order history, active order state, reservation state, table token responses, payment state, or customer profile data.

### Owner Dashboard And Staff Operations

Default no browser Cache Storage for HTML/data:

- `/dashboard/**`
- `/dashboard/staff/**`
- `/dashboard/staff/mobile`
- `/staff/change-password`

Findings:

- Dashboard pages are mostly `force-dynamic`.
- `app/dashboard/layout.tsx` is `noIndex`.
- Dashboard auth uses Supabase cookies, `getSessionProfile`, server-side auth checks, and dashboard API session guards.
- Staff offline attendance queue already exists in `features/attendance/hooks/use-offline-attendance-queue.ts`; it stores a bounded GPS-only local queue in localStorage and syncs through admin attendance APIs.

Recommended Phase 2 stance:

- Do not cache dashboard/staff HTML or API JSON in service worker.
- Allow installability and app shell assets only.
- Any staff background sync should be a later phase with idempotency, auth, device trust, queue limits, and audit rules reviewed separately.

### Platform Admin

Default deny:

- `/platform-control/**`
- internal platform admin host rewrites handled by `proxy.ts`

Reason: platform admin routes are internal/security-sensitive and should not be part of PWA cache/install campaign until a separate admin-specific security review exists.

### API Routes

Default deny for service worker caching:

- `/api/**`

High-risk groups:

- `/api/admin/**`
- `/api/internal/**`
- `/api/cron/**`
- `/api/billing/webhook`
- `/api/realtime/token`
- `/api/orders/**`
- `/api/remote-orders/**`
- `/api/reservations/**`
- `/api/ai/**`
- `/api/copilotkit`
- `/api/onboarding/ai/**`
- `/api/maps/**`
- `/api/marketing/**`
- `/api/location/**`
- `/api/restaurants/slug`
- `/api/restaurants/[restaurantSlug]/delivery-quote`
- `/api/restaurants/[restaurantSlug]/reservations/availability`
- `/api/service-requests`
- `/api/delivery/fee`

Even public-looking GET APIs should stay Network Only in Phase 2. Some include rate limits, live data, location/map provider calls, availability calculations, delivery quotes, marketing lead capture, health checks, or tenant-bound operational data.

## Cache Policy Recommendation

### Default Policy

Use deny-by-default in the service worker:

- Do not cache non-GET requests.
- Do not cache any request with `Authorization` header.
- Do not cache any request carrying Supabase auth/session cookies, dashboard smoke cookies, or auth-flow cookies.
- Do not cache `/api/**`.
- Do not cache `/auth/**`.
- Do not cache `/dashboard/**`.
- Do not cache `/platform-control/**`.
- Do not cache `/staff/change-password`.
- Do not cache URLs with token-like query parameters such as `token`, `code`, `t`, `next`, `checkout`, `payment`, `reservationId`, `orderId`, `session`, `state`, or `otp` unless explicitly audited.
- Do not cache external Supabase, VPS websocket/API, maps, QR, or payment provider calls.
- Respect app-level `cache: "no-store"` calls by ensuring service worker routing excludes those URLs.

### Safe Allowlist For Phase 2

Precache or Cache First:

- `/_next/static/**`
- `/favicon.ico`
- `/favicon-48x48.png`
- `/icon-192.png`
- `/icon.png`
- `/apple-icon.png`
- `/brand/logivn/**`
- `/customer/order-flow/*.png`
- `/onboarding/flow/*.png`
- `/dashboard-background-desktop.png`
- `/dashboard-background-mobile.png`
- `/manifest.json` or `/manifest.webmanifest` if file-based
- static offline fallback page/assets if created

Runtime Network First or Stale While Revalidate after validation:

- public marketing HTML listed above
- public RSS/LLM text routes with existing cache headers

Runtime Network Only:

- all APIs in Phase 2
- dashboard/staff/platform admin HTML
- auth routes
- customer order/reservation state URLs

### Future Allowlist Candidates

Only after separate privacy/product review:

- public menu snapshots for `/r/[restaurantSlug]`
- public restaurant logo/menu item images from Supabase Storage if bucket/object policy is public and URLs are not signed
- public reservation preference options if response contains no customer/booking data

## Security Risks And Mitigations

### P0: Authenticated data cache leak

Risk: service worker caches dashboard HTML or `/api/admin/**` JSON, then serves stale private tenant data after logout, account switch, or tenant switch.

Mitigation:

- Deny cache for `/dashboard/**`, `/api/**`, `/auth/**`, and requests with auth cookies/headers.
- Add automated tests for cache policy matching.
- Manually inspect Cache Storage after login, dashboard navigation, logout, and reload.

### P0: Payment/order/reservation stale state

Risk: customer sees stale VietQR/payment/order/reservation status or service worker replays wrong checkout state.

Mitigation:

- Network Only for `/api/orders/**`, `/api/remote-orders/**`, `/api/reservations/**`, `/api/delivery/fee`, and delivery/reservation availability endpoints.
- Do not implement background sync for order/payment/reservation in Phase 2.
- Keep existing `cache: "no-store"` fetches effective.

### P0: Tenant routing mismatch

Risk: cached tenant HTML from one slug/subdomain is served for another tenant due to service worker route matching.

Mitigation:

- Do not cache tenant-specific `/r/**` HTML in Phase 2.
- Cache only common shell/static assets.
- If future menu snapshot caching is needed, key by full URL and tenant slug, with short TTL and explicit privacy signoff.

### P1: Stuck or broken service worker after deploy

Risk: stale service worker serves old assets after a deploy and users see blank/broken app.

Mitigation:

- Version caches.
- Delete old caches on activate.
- Serve `/sw.js` with no-cache headers.
- Add update available UI and a documented unregister/rollback path.
- Avoid precaching route HTML that changes frequently.

### P1: Push notification consent and tenant isolation

Risk: browser push sends notification to wrong role/device/tenant, or lacks unsubscribe/audit/rate limit.

Mitigation:

- Do not implement push in Phase 2.
- First design schema for push subscriptions with user, restaurant, role, device, endpoint hash, permission state, revoked_at, last_seen_at.
- Gate by explicit user consent and provide unsubscribe.
- Integrate with existing Telegram/operational event layer only after event routing is auditable.

### P1: Background Sync overreach

Risk: background sync duplicates staff attendance, order mutation, or payment confirmation.

Mitigation:

- Do not add generic background sync in Phase 2.
- Keep existing staff offline attendance queue as the only offline mutation path until a separate audit confirms idempotency and auth/device trust.

## Platform Notes

### Android

- Chromium browsers can show install prompt when manifest/service worker/installability criteria pass.
- Push is generally available after permission and service worker registration.
- Phase 2 can support install CTA through `beforeinstallprompt` where available.

### iPhone And iPad

- Install flow is manual through Safari Share > Add to Home Screen.
- Do not show Chromium-style install prompt on iOS.
- Web Push requires installed Home Screen web app and explicit permission.
- Phase 2 should provide an accurate guide, not promise one-tap install or universal push.

### Windows

- Chrome and Edge can install PWA when manifest/service worker are valid.
- Push depends on browser permission and service worker support.

### macOS

- Chrome and Edge support PWA install flows.
- Safari/Add to Dock behavior depends on macOS/Safari version.
- Push behavior depends on browser/version/permission and should be documented as a capability matrix.

## Phase 2 Recommended Scope

Implement only:

- `app/manifest.ts` or `public/manifest.webmanifest`.
- Icon audit/generation for required sizes: 72, 96, 128, 144, 152, 180, 192, 384, 512.
- `components/pwa/service-worker-register.tsx` or equivalent tiny client component.
- `public/sw.js` with conservative deny-by-default policy.
- `lib/pwa/cache-policy.ts` with unit-testable allowlist/denylist helpers.
- Optional `app/offline/page.tsx` or static offline fallback with no private data.
- Metadata updates in `lib/seo/metadata.ts` and/or `app/layout.tsx`.
- Header/CSP updates in `next.config.ts` for `manifest-src 'self'`, service worker no-cache, manifest content type/cache behavior.
- `docs/PWA_GUIDE.md` and `docs/PWA_DEPLOYMENT_CHECKLIST.md` updates if implementation proceeds.

Do not implement in Phase 2:

- Web Push.
- Background Sync for orders/payments/reservations/staff.
- Dashboard data caching.
- Customer order/reservation state caching.
- Install campaigns across dashboard/staff/onboarding.
- Analytics dashboard for installs.
- Mobile UX rewrite.

## Candidate File Changes For Phase 2

- `app/manifest.ts`
- `app/offline/page.tsx`
- `app/layout.tsx`
- `lib/seo/metadata.ts`
- `lib/pwa/cache-policy.ts`
- `lib/pwa/cache-policy.test.ts`
- `components/pwa/service-worker-register.tsx`
- `components/pwa/pwa-update-toast.tsx`
- `public/sw.js`
- `public/icons/*`
- `next.config.ts`
- `docs/PWA_GUIDE.md`
- `docs/PWA_DEPLOYMENT_CHECKLIST.md`

## Acceptance Criteria For Phase 2

- Manifest is valid and exposed at the expected URL.
- Required icons exist and are referenced correctly.
- Service worker registers only in production-like browser contexts and fails silently when unsupported.
- Service worker never caches `/api/**`, `/auth/**`, `/dashboard/**`, `/platform-control/**`, staff password routes, Supabase/VPS realtime, payment/order/reservation mutation routes, or requests with auth headers/cookies.
- Cache Storage after authenticated dashboard navigation contains only allowlisted static assets.
- Logout/login/session refresh still works.
- Tenant subdomain rewrite and `/r/[slug]` routes still work online.
- Offline mode shows a clear fallback rather than a blank page.
- Update available flow can reload intentionally and does not force reload mid-checkout/payment.
- Rollback/unregister steps are documented.

## Validation Plan

### Check Tier

Use for documentation-only or metadata-only changes:

- `git diff --check`
- `npm run lint` if code changed
- targeted tests for changed helpers, for example `npm run test -- lib/pwa/cache-policy.test.ts` if supported by the test runner

### Verify Tier

Required for service worker/cache/header/auth changes:

- `npm run lint`
- `npm run build`
- targeted cache-policy tests
- Lighthouse PWA check on `/`, `/download` when created, `/dashboard/login`, and one customer `/r/[slug]` route
- Browser install smoke on Chrome/Edge desktop
- Android Chrome install smoke if device/browser available
- iOS Safari manual Add to Home Screen guide check if device available
- Auth regression: login, dashboard refresh, logout, session cleared flow, invalid/expired session repair
- Cache Storage inspection after public route, customer route, dashboard route, and logout
- Offline smoke: public shell works; dashboard/private data is not exposed
- Service worker update test: version bump, old cache cleanup, update toast, unregister fallback

## Release And Rollback Notes

- Ship service worker behind the smallest possible policy first.
- Serve `sw.js` with no-cache headers to reduce stuck worker risk.
- Keep a documented unregister path, for example a temporary client-side cleanup component or console runbook for `navigator.serviceWorker.getRegistrations()` plus Cache Storage cleanup.
- Avoid precaching route HTML in the first PWA release.
- Do not introduce new env vars for push/VAPID until the push phase begins.
- If a production deploy causes stale asset issues, immediate rollback should include disabling registration and bumping SW/cache version to purge old caches.

## Final Recommendation

Proceed to Phase 2 only as a conservative PWA foundation patch. The first production-safe goal is installability plus safe static asset caching, not full offline operations. Push notification, dashboard install campaigns, background sync, and offline-first business data should remain blocked until their own architecture and security review are complete.
