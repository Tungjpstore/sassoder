# LogiVN PWA Implementation Prompt

Tai lieu nay tong hop prompt da dan va nghien cuu hien trang repo de tao mot prompt san sang giao cho agent trien khai PWA production cho LogiVN.

## Can Cu Ky Thuat

- Repo hien tai dung Next.js App Router, React, TypeScript, Tailwind, Supabase, Vercel va VPS hybrid.
- `package.json` dang dung Next.js `16.2.6`, React `19.2.5`.
- `next.config.ts` da co security headers va CSP, trong do `worker-src 'self' blob:` dang cho phep service worker/web worker cung origin.
- `app/layout.tsx` dung metadata tap trung tu `lib/seo/metadata.ts`; icon co ban da co trong metadata.
- `public/` da co `favicon.ico`, `favicon-48x48.png`, `apple-icon.png`, `icon-192.png`, `icon.png`, va nhieu brand assets LogiVN.
- Chua thay PWA manifest/service worker chinh thuc cho app.
- Repo dung `proxy.ts`, Supabase auth cookie/session guard, dashboard owner route `/dashboard`, staff route `/staff`, customer QR/reservation route `/r/[restaurantSlug]`, va nhieu API nhay cam duoi `/api/**`.
- Da co offline attendance queue rieng cho staff GPS, nen PWA offline caching khong duoc tu y mo rong sang payroll/staff/payment/order mutation neu chua audit.

## Nghien Cuu Nhanh

- Next.js App Router ho tro PWA qua `app/manifest.ts` hoac file manifest tinh, service worker trong `public/sw.js`, client registration va Web Push flow neu can.
- PWA can manifest, service worker, HTTPS, offline/cache strategy va UX cai dat phu hop tung trinh duyet.
- `beforeinstallprompt` khong phai API cross-browser on dinh; dung cho Chromium, khong duoc gia dinh no hoat dong tren iOS Safari.
- iOS/iPadOS Web Push chi kha dung voi web app da duoc them vao Home Screen va co user permission.
- Workbox co san cac chien luoc `CacheFirst`, `NetworkFirst`, `StaleWhileRevalidate`, nhung voi app SaaS co auth phai mac dinh deny cache va chi whitelist endpoint an toan.

Nguon chinh: Next.js PWA guide, MDN PWA docs, MDN `beforeinstallprompt`, Chrome Workbox strategies, WebKit iOS/iPadOS Web Push.

## Van De Cua Prompt Goc

- Pham vi qua lon: audit, PWA foundation, offline-first, push, download center, install campaign, analytics, mobile UX va performance bi gom vao mot lan trien khai.
- Chua tach surface theo rui ro: marketing/public, customer QR, owner dashboard, staff, admin/internal API co yeu cau cache va bao mat khac nhau.
- Cache strategy con nguy hiem: `API Network First`, dashboard snapshot, lich su gan nhat chua co whitelist/blacklist cu the.
- Push notification duoc mo ta nhu ho tro dong nhat tren moi nen tang, trong khi Android/Chromium, iOS Safari, Windows, macOS co gioi han khac nhau.
- Chua bat buoc rollback/unregister service worker, cache versioning, update detection va kiem tra cache leak.
- Chua co acceptance criteria theo phase; deliverables nhieu nhung chua co diem dung an toan.
- Chua gan workflow validation cua repo: `check` cho thay doi hep, `verify` cho service worker/cache/push/auth/headers.

## Prompt San Sang Su Dung

```md
# ROLE

Ban la Principal PWA Architect + Principal Next.js Engineer + Senior Mobile/Web Platform Engineer + Security Engineer + SaaS Product Architect.

Nhiem vu cua ban la audit, thiet ke va trien khai PWA production cho LogiVN tren codebase hien tai. Khong tao demo, khong tao vi du mau, khong tao code song song. Moi thay doi phai ton trong kien truc hien co va phai co validation ro rang.

# PROJECT CONTEXT

Ten du an: LogiVN

Linh vuc: SaaS van hanh quan cafe, tra sua, nha hang tai Viet Nam.

Stack hien tai:
- Next.js App Router
- React
- TypeScript
- Tailwind
- Supabase
- PostgreSQL
- Vercel
- VPS Hybrid
- QR Ordering
- VietQR Payment
- Online Ordering
- Reservation
- Staff Management
- Inventory
- Telegram Bot
- Logibot AI

Surface chinh:
- Marketing/public routes: `/`, blog, pricing, solution/local pages.
- Customer routes: `/r/[restaurantSlug]`, `/r/[restaurantSlug]/reserve`, table/QR ordering flows.
- Owner dashboard: `/dashboard/**`.
- Staff routes: `/staff/**`, `/dashboard/staff/mobile`.
- Admin/internal APIs: `/api/admin/**`, `/api/internal/**`, orders, reservations, billing, Telegram, maps, AI.

Kien truc hien co can ton trong:
- `next.config.ts` co security headers/CSP.
- `app/layout.tsx` dung metadata tap trung tu `lib/seo/metadata.ts`.
- Repo dung `proxy.ts` cho auth/session/tenant routing.
- Supabase auth cookie/session, realtime websocket va Telegram queue khong duoc bi regression.
- `public/` da co icon/brand assets LogiVN co the audit va tai su dung neu dat chuan.

# HARD RULES

- Lam viec theo tung phase nho, khong gom tat ca vao mot patch lon.
- Bat dau bang audit hien trang va viet `docs/PWA_AUDIT_REPORT.md` truoc khi them service worker phuc tap.
- Khong cache token, refresh token, session, Supabase auth cookies, bearer auth, payroll, payment, PII, staff sensitive data, order mutation response, reservation mutation response.
- Mac dinh deny cache cho toan bo `/api/**`; chi whitelist endpoint public da audit.
- Khong cache authenticated dashboard/admin/staff HTML neu chua chung minh an toan.
- Khong lam hong login, logout, session refresh, tenant routing, Supabase realtime, Telegram notifications, Vercel/VPS hybrid behavior.
- Khong hua push/cai dat hoat dong dong nhat tren moi nen tang. Moi thu khong duoc browser ho tro phai la progressive enhancement co fallback.
- Khong spam install banner. Phai co platform detection, standalone detection va dismissal state.
- Sau moi phase, chay workflow validation phu hop: `check` cho thay doi hep, `verify` cho service worker/cache/push/auth/headers/release-risk.

# PHASE 1 - DISCOVERY AND PWA AUDIT

Audit cac file va flow sau:
- `package.json`
- `next.config.ts`
- `app/layout.tsx`
- `lib/seo/metadata.ts`
- `proxy.ts`
- `public/` icons va brand assets
- auth/session Supabase
- dashboard/staff/customer routes
- API nhay cam
- CSP, headers, Vercel/VPS deployment assumptions
- current offline/realtime/notification flows

Sinh `docs/PWA_AUDIT_REPORT.md` gom:
- Hien trang PWA.
- Route/API duoc phep cache.
- Route/API bi cam cache.
- Rui ro auth/session/cache leak.
- Rui ro platform install/push.
- De xuat phase implementation va validation.

Acceptance criteria:
- Co cache allowlist/denylist ro rang.
- Co danh sach file can sua.
- Co rui ro release va rollback notes.

# PHASE 2 - PWA FOUNDATION

Trien khai PWA foundation nho va an toan:
- Manifest dung `app/manifest.ts` hoac `/public/manifest.json`, chon cach phu hop voi repo.
- Metadata/linking phu hop voi Next.js App Router.
- Icon system day du neu source logo dat chuan.
- Service worker registration bang client component/hook rieng.
- `public/sw.js` hoac build pipeline tuong duong, nhung phai de deploy tren Vercel an toan.
- Navigation fallback co kiem soat, khong lam lo private page.
- Update detection va update available UI co the dismiss/reload.
- Cache versioning va cleanup old caches.
- Document unregister/rollback path.

Manifest yeu cau:
- `name`: `LogiVN`
- `short_name`: `LogiVN`
- `description`: `Nền tảng vận hành quán cafe và nhà hàng thông minh.`
- `display`: `standalone`
- `orientation`: `portrait-primary`
- `scope`: `/`
- `start_url`: `/dashboard/login?source=pwa_launch`
- `theme_color`: theo brand LogiVN sau khi audit mau hien co
- `background_color`: trang
- `categories`: `business`, `productivity`, `food`

Icon yeu cau:
- 72, 96, 128, 144, 152, 180, 192, 384, 512.
- favicon.
- apple-touch-icon.
- maskable icon neu tao duoc tu logo chinh thuc.
- monochrome icon neu phu hop.

Acceptance criteria:
- Lighthouse PWA installability pass tren Chromium voi route public.
- App co manifest hop le.
- Service worker khong cache response nhay cam.
- Logout/login/session refresh van hoat dong.

# PHASE 3 - INSTALL UX AND DOWNLOAD CENTER

Tao:
- `/download`
- `/download/android`
- `/download/ios`
- `/download/windows`
- `/download/mac`

Yeu cau UX:
- Trang dau tien la download/install center that, khong phai landing page chung chung.
- CTA phu hop platform.
- Luon co lua chon thu cong neu detection sai.
- Chromium: dung `beforeinstallprompt` neu available.
- iOS/iPadOS: huong dan Safari Share > Add to Home Screen; khong hien fake install prompt.
- Windows: huong dan Chrome/Edge install.
- macOS: huong dan Chrome/Edge install va Safari/Add to Dock neu browser/platform ho tro.
- Hide/doi CTA khi da o standalone/display-mode.
- Luu dismissal state de tranh lap lai qua nhieu.

Copy chinh:
- Title: `Tải ứng dụng LogiVN`
- Description: `Biến LogiVN thành ứng dụng trên điện thoại, máy tính bảng và máy tính của bạn chỉ trong vài giây.`
- Loi ich: nhan don tuc thi, thong bao thoi gian thuc, mo bang 1 cham, on dinh hon, trai nghiem nhu app.

Acceptance criteria:
- Android/Windows/macOS Chromium co CTA install neu browser cho phep.
- iOS hien guide thu cong ro rang.
- `/download` co fallback chon platform thu cong.

# PHASE 4 - APP SHELL STATES

Them cac state dung chung neu chua co:
- splash/loading state
- skeleton loading
- offline state
- reconnect state
- update available state

Khong duoc xuat hien man hinh trang tren critical routes neu data dang load.

Tap trung truoc:
- owner dashboard shell
- staff mobile shell
- customer QR order shell
- download/install routes

Acceptance criteria:
- Offline mode hien thong diep ro: `Bạn đang ngoại tuyến. Dữ liệu có thể không phải mới nhất.`
- Reconnect state tu cap nhat khi online lai.
- Update available UI khong ep reload giua thao tac thanh toan/order.

# PHASE 5 - CACHE STRATEGY WITH SECURITY ALLOWLIST

Default deny:
- No cache cho `/api/**` tru khi co allowlist ro.
- No cache cho request co `Authorization` header, Supabase auth cookie, dashboard smoke cookie, session cookie, mutation method (`POST`, `PUT`, `PATCH`, `DELETE`).
- No cache cho dashboard/admin/staff authenticated HTML.
- No cache cho payment, payroll, billing, order/reservation mutation, staff attendance sensitive flows.

Allowed cache sau audit:
- static assets
- icons
- manifest
- selected brand images
- selected public marketing pages
- selected public menu/restaurant data neu khong co PII/payment/staff/tenant leakage

Chien luoc goi y:
- Static assets: Cache First.
- Brand/images public: Stale While Revalidate.
- Public menu read-only allowlisted data: Cache First hoac Stale While Revalidate voi TTL ro.
- Public pages: Network First hoac navigation fallback co kiem soat.
- Authenticated data: Network Only mac dinh.

Service worker phai:
- version caches
- delete old caches on activate
- handle broken deploy/cache mismatch
- co rollback/unregister documentation
- khong intercept Supabase websocket/realtime theo cach gay loi

Acceptance criteria:
- Cache Storage chi chua asset trong allowlist.
- Dashboard/API nhay cam khong xuat hien trong Cache Storage.
- Offline customer public shell/menu hoat dong trong pham vi da whitelist.
- Auth/session regression test pass.

# PHASE 6 - PUSH NOTIFICATION ARCHITECTURE FIRST

Truoc khi implement push, viet thiet ke trong `docs/PUSH_NOTIFICATION_GUIDE.md`:
- VAPID/env requirements.
- Subscription database schema/migration.
- User/role/device mapping.
- Consent flow.
- Unsubscribe/revoke flow.
- Event/topic mapping.
- Rate limit, retry, audit log.
- Telegram integration boundary.
- Unsupported platform fallback.

Events mong muon:
- Owner: new order, successful payment, support request, table state, reservation.
- Staff: shift assignment/change, attendance, internal notification.
- Inventory: low stock.

Platform notes:
- Android Chromium: push sau permission va service worker registration.
- iOS/iPadOS: Web Push chi cho installed Home Screen web app va user permission.
- Windows/macOS: tuy browser va permission.

Acceptance criteria:
- Push gated by explicit consent.
- Co unsubscribe.
- Co audit/rate limit.
- Telegram behavior khong regression.
- Khong gui notification nhay cam len thiet bi sai user/tenant.

# PHASE 7 - INSTALL PROMOTION AND ANALYTICS

Chi lam sau khi install foundation on dinh.

Them:
- Dashboard install banner neu chua standalone va chua dismissed.
- Staff install campaign trong khu vuc staff neu phu hop.
- Onboarding optional install step sau khi tao quan thanh cong.
- Missed order campaign chi sau khi push/event telemetry du tin cay.

Analytics track:
- download page view
- install CTA view
- install prompt opened
- install click
- install success/appinstalled
- dismissal
- standalone launches
- platform/browser

Acceptance criteria:
- CTA khong spam.
- Tracking khong thu PII khong can thiet.
- Dashboard analytics co metric theo platform neu co scope.

# PHASE 8 - MOBILE UX AND PERFORMANCE VERIFY

Audit mobile rieng, khong tron vao PWA foundation neu patch qua lon:
- dashboard
- orders
- menu
- tables
- reservation
- inventory
- staff
- reports/settings
- Logibot AI

Mobile requirements:
- no horizontal scroll
- no broken modal/overflow
- touch target >= 44px
- text khong bi truncate vo ly hoac overlap
- loading/error/empty/offline states day du

Performance targets:
- Lighthouse PWA >= 95
- Performance >= 90
- Accessibility >= 90
- Best Practices >= 95
- SEO >= 90

# DELIVERABLES

Tao/cap nhat tuy phase:
- `app/manifest.ts` hoac `public/manifest.json`
- `public/icons/*`
- `public/sw.js` hoac equivalent generated SW
- `components/pwa/*`
- `components/install/*`
- `components/download/*`
- `hooks/pwa/*`
- `hooks/install/*`
- `lib/pwa/*`
- `app/download/*`
- `docs/PWA_AUDIT_REPORT.md`
- `docs/PWA_GUIDE.md`
- `docs/OFFLINE_GUIDE.md`
- `docs/PUSH_NOTIFICATION_GUIDE.md`
- `docs/INSTALL_GUIDE.md`
- `docs/PWA_DEPLOYMENT_CHECKLIST.md`

# VALIDATION

Check tier cho phase hep:
- `npm run lint`
- `npm run build`
- targeted tests neu code lien quan co test
- manual smoke route da sua

Verify tier bat buoc neu sua service worker, cache, push, auth, headers, install analytics hoac release-sensitive behavior:
- build/lint
- Lighthouse PWA/performance/accessibility tren `/`, `/download`, `/dashboard/login`, mot customer QR route
- install test tren desktop Chrome/Edge va Android Chrome neu co thiet bi
- iOS Safari manual guide test neu co thiet bi
- offline test: public shell/menu trong allowlist hoat dong; private data khong lo qua cache
- auth regression: login, logout, refresh, expired session
- Cache Storage inspection: chi co whitelist assets/data
- rollback test: cache version bump, old cache cleanup, unregister fallback

# FINAL REQUIREMENT

Muc tieu la bien LogiVN thanh PWA cai dat duoc tren Android, iPhone/iPad, Windows va macOS bang mot codebase duy nhat, voi trai nghiem gan native nhung van an toan cho SaaS multi-tenant. Uu tien theo thu tu:
1. Security
2. Auth/session correctness
3. Cache safety
4. Maintainability
5. Performance
6. User experience
7. Business conversion

Khong duoc tiep tuc sang phase tiep theo neu phase hien tai chua co acceptance criteria va validation result ro rang.
```

## De Xuat Su Dung

Nen giao prompt nay theo cach hai buoc:

1. Yeu cau agent chay **Phase 1 - Discovery and PWA Audit** truoc, chi tao `docs/PWA_AUDIT_REPORT.md` va ke hoach phase 2.
2. Sau khi audit on, moi cho phep agent thuc hien **Phase 2 - PWA Foundation** voi patch nho va `verify` day du.

Voi repo hien tai, khong nen cho agent thuc hien tat ca 8 phase trong mot lan vi service worker/cache/push co the anh huong auth, thanh toan, order, staff va tenant routing.
