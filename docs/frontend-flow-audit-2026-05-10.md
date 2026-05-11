# LogiVN Frontend Flow Audit

Date: 2026-05-10
Role: Principal Software Architect
Scope: Next.js App Router frontend routes, customer ordering flows, dashboard operations flows, admin shell, shared UI primitives, accessibility, performance, maintainability.

## Executive Summary

The frontend has a strong product foundation: public marketing, customer menu/order, dashboard operations, platform admin, billing, maps, and AI assistant layers are already separated by route boundaries. The app also shows good production hygiene with App Router server components, Suspense in key dashboard pages, dynamic loading for map libraries, mobile-first customer ordering patterns, and deployment readiness.

The biggest frontend risks are not missing screens. They are interaction quality and long-term maintainability:

- Dialogs, drawers, toasts, and map editors need stronger accessibility contracts.
- Customer order clients have become monolithic and should be decomposed before adding more checkout/payment features.
- Several global or duplicated assets can increase route cost, especially CopilotKit CSS, map CSS imports, and icon barrel imports.
- Some operator flows keep critical state only in component state, making reload/back/share behavior weaker than the rest of the architecture.

## Route Coverage

Public and marketing:

- `app/page.tsx`
- `app/pricing/page.tsx`
- `app/blog/page.tsx`
- `app/blog/[slug]/page.tsx`
- `app/verify-email/page.tsx`

Customer ordering:

- `app/r/[restaurantSlug]/page.tsx`
- `app/r/[restaurantSlug]/reserve/page.tsx`
- `app/r/[restaurantSlug]/table/[tableId]/page.tsx`

Dashboard:

- `app/dashboard/page.tsx`
- `app/dashboard/orders/page.tsx`
- `app/dashboard/menu/page.tsx`
- `app/dashboard/tables/page.tsx`
- `app/dashboard/staff/page.tsx`
- `app/dashboard/settings/page.tsx`
- `app/dashboard/online/page.tsx`
- `app/dashboard/payments/page.tsx`
- `app/dashboard/promotions/page.tsx`
- `app/dashboard/reservations/page.tsx`
- `app/dashboard/kitchen/page.tsx`
- `app/dashboard/analytics/page.tsx`
- `app/dashboard/onboarding/page.tsx`
- `app/dashboard/setup/page.tsx`
- `app/dashboard/login/page.tsx`
- `app/dashboard/register/page.tsx`
- `app/dashboard/forgot-password/page.tsx`
- `app/dashboard/reset-password/page.tsx`
- `app/dashboard/verify-email/page.tsx`

Platform admin:

- `app/admin/[[...path]]/page.tsx`

## What Is Working Well

- Route groups are clear: marketing, customer, tenant dashboard, and platform admin are not mixed together.
- App Router server components are used for route-level data loading, with Suspense on important dashboard screens such as the overview and orders pages.
- Customer ordering UX is mobile-first, with sticky action areas, cart persistence, idempotency guards, and order history polling.
- Settings uses URL-backed `section` navigation, which is the right direction for deep-linkable operational flows.
- Map-heavy JavaScript is dynamically imported in the map components, reducing immediate JS pressure.
- Global CSS already includes focus-visible, reduced-motion, safe-area, and mobile touch handling foundations.
- Production smoke checks after deploy returned HTTP 200 for `/`, `/pricing`, `/dashboard/login`, `/admin`, and the health endpoint.

## Principal Findings

### P1 - Modal and Drawer Accessibility Is Incomplete

References:

- `components/dashboard/shared-drawer.tsx:52`
- `components/dashboard/shared-drawer.tsx:93`
- `components/dashboard/online-workspace.tsx:304`
- `components/dashboard/online-workspace.tsx:423`
- `app/dashboard/settings/page.tsx:1143`
- `app/dashboard/settings/page.tsx:1200`

Risk:

Keyboard and screen-reader users can lose context inside overlays. Some overlays use `role="dialog"` and `aria-modal`, but focus trapping, initial focus, focus restoration, and Escape handling are inconsistent. Online workspace includes overlay-style UI that does not consistently declare dialog semantics.

Recommendation:

Create one shared dashboard modal/drawer primitive that owns:

- `role="dialog"` and `aria-modal`
- labelled title binding
- initial focus
- focus trap
- focus restoration
- Escape close behavior
- background inert behavior where supported

Then migrate `shared-drawer`, online workspace drawers, and settings detail overlays to that primitive.

### P1 - Toasts Are Not Announced To Assistive Technology

References:

- `components/dashboard/toast-provider.tsx:62`
- `components/dashboard/toast-provider.tsx:87`
- `components/dashboard/toast-provider.tsx:75`
- `components/dashboard/toast-provider.tsx:83`

Risk:

Success and failure feedback for dashboard actions may be invisible to screen-reader users. The close button is icon-only without an accessible label.

Recommendation:

Add a live region contract:

- Use `role="status"` or `aria-live="polite"` for normal toasts.
- Use `role="alert"` or assertive live region behavior only for destructive or blocking errors.
- Add `aria-label` to dismiss buttons.
- Mark decorative icons as `aria-hidden`.

### P1 - Customer Checkout Forms Need Mobile And Autofill Semantics

References:

- `components/customer/remote-order-client.tsx:1265`
- `components/customer/remote-order-client.tsx:1283`
- `components/customer/remote-order-client.tsx:1350`
- `components/customer/remote-order-client.tsx:1353`
- `components/customer/order-client.tsx:1331`
- `components/customer/order-client.tsx:1335`
- `components/customer/order-client.tsx:1541`
- `components/customer/order-client.tsx:1548`

Risk:

The most important mobile customer path does not consistently expose `name`, `autoComplete`, `type`, `inputMode`, or accessible search naming. This hurts autofill, mobile keyboard selection, analytics/debuggability, and accessibility.

Recommendation:

Standardize customer form fields with reusable primitives:

- customer name: `name`, `autoComplete="name"`
- phone: `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`
- search: explicit label or `aria-label`
- delivery notes: `name`, appropriate autocomplete behavior

### P1 - Delivery Zone Map Editing Is Pointer-First

References:

- `components/maps/delivery-area-editor.tsx:150`
- `components/maps/delivery-area-editor.tsx:160`

Risk:

Delivery area polygon points expose `role="button"` and `tabIndex`, but the interaction is effectively pointer-only. Keyboard users cannot make equivalent edits with arrow keys or coordinate controls.

Recommendation:

Add keyboard-edit support for selected points:

- Arrow keys move the active point.
- Shift or Alt changes precision.
- Delete removes the active point when safe.
- A coordinate list fallback allows exact editing.

### P2 - Global And Duplicated Frontend Assets Can Inflate Route Cost

References:

- `next.config.ts:23`
- `next.config.ts:54`
- `app/layout.tsx:5`
- `components/customer/route-mini-map.tsx:3`
- `components/location/customer-delivery-location-picker.tsx:3`
- `components/maps/delivery-zone-map-editor.tsx:3`
- `components/maps/store-location-picker.tsx:3`
- `components/maps/store-delivery-map-preview.tsx:3`

Risk:

The project imports many icons from `lucide-react`, but `next.config.ts` does not configure package import optimization. CopilotKit CSS is globally imported from the root layout, so AI UI styles can affect every public and customer route. Maplibre CSS is imported in multiple map components.

Recommendation:

- Add `experimental.optimizePackageImports` for high-use packages such as `lucide-react`, after validating build compatibility.
- Move CopilotKit CSS closer to AI/dashboard boundaries if the library allows it.
- Centralize map CSS loading through a map shell or route-level boundary so it is intentional and non-duplicated.

### P2 - Customer Order Clients Are Too Large For Safe Iteration

References:

- `components/customer/order-client.tsx`
- `components/customer/remote-order-client.tsx`

Risk:

The customer order clients combine cart state, category filtering, checkout, payment, delivery quote, history, reorder, local storage, timers, and rendering. This increases regression risk each time checkout, delivery, or payment behavior changes.

Recommendation:

Split by behavior, not by visual fragments:

- `useCustomerCart`
- `useCheckoutContact`
- `useDeliveryQuote`
- `useOrderHistory`
- `CheckoutPanel`
- `CartSummary`
- `MenuBrowser`
- `OrderStatusTimeline`

Prefer a typed reducer or small state machine for checkout transitions before adding more payment or promotion states.

### P2 - Orders Page Has Overlapping Data Fetch Paths

References:

- `app/dashboard/orders/page.tsx:29`
- `app/dashboard/orders/page.tsx:37`
- `components/dashboard/live-action-center.tsx:228`
- `components/dashboard/live-action-center.tsx:249`
- `components/dashboard/orders-board.tsx:349`
- `components/dashboard/orders-board.tsx:412`

Risk:

The server route loads orders for the board, while the live action center also fetches orders and service requests, and the board hydrates courier state after mount. This is not a production blocker, but it creates duplicated network work and more state synchronization surfaces.

Recommendation:

Introduce a small server-provided operations summary or shared client store for order/service request counts and realtime updates. Keep full order lists owned by `OrdersBoard`.

Update 2026-05-10:

`/dashboard/orders` now fetches orders and open service requests in parallel on the server and hydrates `AdminLiveActionCenter` with that data. The action center skips its duplicate initial client fetch when hydrated, while realtime and visibility refreshes still reload the full operational stream for consistency.

### P2 - Operational UI State Is Not Consistently URL-Backed

References:

- `components/dashboard/orders-board.tsx:333`
- `components/dashboard/orders-board.tsx:347`
- `components/dashboard/online-workspace.tsx:304`
- `components/dashboard/online-workspace.tsx:423`
- `app/dashboard/settings/page.tsx`

Risk:

Settings has a good URL-backed `section` pattern, but orders filters, selected drawers, and online workspace panels are mostly local state. Operators lose context on refresh/back navigation, and support/debugging cannot share exact UI state.

Recommendation:

Extend the settings pattern to operational surfaces:

- orders: status filter, search query, selected order id
- online workspace: selected view, selected order, selected service request
- menu/tables where applicable: active item id and edit mode

### P3 - Native Confirm And Prompt Dialogs Break Product Consistency

References:

- `components/dashboard/orders-board.tsx:419`
- `components/dashboard/orders-board.tsx:423`
- `components/dashboard/menu-workspace.tsx:663`
- `components/dashboard/promotions-workspace.tsx:444`
- `components/dashboard/tables-workspace.tsx:704`
- `components/dashboard/staff-workspace.tsx:290`

Risk:

Native browser dialogs are not aligned with the product design system, are hard to style, have weaker accessibility affordances, and cannot include rich context or undo actions.

Recommendation:

Create a shared `ConfirmDialog` primitive using the same accessible modal contract from P1. Use it for destructive actions and operational confirmations.

## Frontend Improvement Checklist

### Phase 1 - Accessibility Contract

- [x] Add accessible live-region behavior to dashboard toasts.
- [x] Add accessible labels to icon-only toast controls.
- [x] Create a shared modal/drawer primitive with focus trap and focus restoration.
- [x] Migrate `shared-drawer` to the primitive.
- [x] Migrate online workspace overlay and drawer behavior to the primitive.
- [x] Add customer form autofill, input mode, and search naming fixes.

### Phase 2 - Performance And Route Boundaries

- [x] Validate `experimental.optimizePackageImports` for `lucide-react`.
- [x] Measure current route JS/CSS output with production build analysis.
- [x] Move CopilotKit CSS out of root layout if supported.
- [x] Centralize Maplibre CSS loading.
- [x] Keep AI assistant layers behind dashboard/client boundaries.

### Phase 3 - State Flow Hardening

- [ ] Split customer order clients into cart, checkout, delivery quote, history, and render modules.
- [x] Extract shared customer cart state logic for dine-in and remote ordering clients.
- [x] Add unit coverage for cart quantity, note, and reorder state transitions.
- [x] Extract checkout/payment/delivery-quote screen transitions into a shared reducer.
- [x] Add reducer-level tests for checkout, payment, and delivery-quote transitions.
- [x] Hydrate live action center from server-provided orders/service requests to remove duplicate initial fetches.
- [ ] Introduce a lean operations summary DTO if live action payload size becomes a measured issue.
- [x] URL-back selected orders, filters, and online workspace drawers.

### Phase 4 - Product Polish

- [x] Replace `window.confirm` and `window.prompt` with a shared confirmation dialog.
- [x] Add keyboard editing support to delivery-zone polygon controls.
- [x] Review `transition-all` usage and replace with property-specific transitions.
- [x] Add skip-link support at the root layout or dashboard shell.

## Recommended Next Changes

The safest next implementation batch is small and high impact:

1. Split customer order clients behind small render modules after the state boundaries are stable.
2. Introduce hooks for history/realtime subscription so customer clients stop owning network, realtime, and rendering in one file.
3. Measure whether the action center needs a smaller operations summary DTO after real merchant data grows.
4. Keep URL-backed state patterns consistent when new dashboard drawers are added.

This sequence improves production UX without rewriting core flows or changing API contracts.

Progress note, 2026-05-10:

- Completed toast live-region and dismiss-label fixes.
- Completed customer checkout/mobile form semantics for the audited customer order surfaces.
- Completed keyboard editing support for delivery-zone polygon points.
- Validated through current Next.js 16.2.2 docs that `lucide-react` is already optimized by default, so no redundant config was added.
- Upgraded `DashboardDrawer` with initial focus, focus trap, Escape close, and focus restoration.
- Migrated online workspace QR/orders side drawers to `DashboardDrawer` and gave the fullscreen settings overlay dialog semantics plus focus trapping.
- Added a root skip link and main-content focus target.
- Replaced audited `transition-all` usage with property-specific transitions.
- Added shared dialog focus management and a reusable confirmation dialog.
- Replaced destructive native confirmations in orders, menu, promotions, tables, and staff flows.
- Removed remaining native `window.prompt` usage by moving online ordering settings edits inline and showing a copy fallback message.
- Moved CopilotKit CSS from root layout into the AI provider boundary.
- Centralized Maplibre CSS through `components/maps/maplibre-gl-styles.ts`.
- Measured current production static output from `.next/static`: largest generated JS chunks are roughly 1.6 MB uncompressed; CSS chunks are roughly 24 KB, 72 KB, 84 KB, and 196 KB uncompressed.
- URL-backed orders filters/search/selected order and online workspace panels with query params.
- Validation passed: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Local production smoke passed: `/`, `/pricing`, `/dashboard/login`, `/api/health` returned HTTP 200.

## Audit Notes

Static review combined route inventory, targeted source reads, and automated frontend heuristics. The automated UX scan was noisy because it included generated `.next` output, so findings in this document are based on source-level confirmation rather than raw scan counts.

External design/a11y reference consulted: Vercel Web Interface Guidelines, `https://github.com/vercel-labs/web-interface-guidelines`.
