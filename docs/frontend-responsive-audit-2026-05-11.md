# LogiVN Frontend Responsive Audit

Date: 2026-05-11

Scope:

- Public landing and pricing routes
- Dashboard shell and operational dashboard pages
- Customer dine-in ordering at `/r/[restaurantSlug]/table/[tableId]`
- Customer remote ordering at `/r/[restaurantSlug]`
- Shared overlays, drawers, toast, AI entry points, and mobile navigation

Reference:

- `HANDOFF.md`
- Vercel Web Interface Guidelines, fetched 2026-05-11
- Source scan of `app/`, `components/`, `lib/customer/`
- Local UX/mobile scripts were run, but their output scanned `.next` build artifacts and is treated as noisy supporting evidence only.

## Executive Assessment

The frontend is feature-rich and the core route boundaries are in place, but responsive behavior is uneven. The strongest mobile experience is the newer remote ordering flow; the weakest points are fixed-width customer surfaces, compact touch targets, dashboard tables that depend on desktop grids, and multiple fixed overlays competing for the same mobile screen area.

The immediate risk is not one single broken component. It is the accumulation of small desktop-first assumptions:

- phone-frame max widths applied before mobile breakpoints
- 32-40px icon/action buttons on primary mobile flows
- bottom-fixed docks without consistent safe-area padding
- dashboard operational tables that collapse visually but still carry desktop-width grid assumptions
- fixed AI/toast/action layers with independent z-index and placement rules
- global page overflow not explicitly clipped at the viewport

## P0 Findings - Mobile Layout Integrity

### Customer Dine-In Frame Was Width-Locked On Mobile

Files:

- `components/customer/order-client.tsx`

Impact:

The dine-in flow used `max-w-[390px]` at all breakpoints. On common 414-430px devices, the app rendered narrower than the viewport and fixed actions aligned to the artificial 390px frame instead of the real screen. This made the UI feel clipped and reduced usable horizontal space.

Status:

- Fixed in this batch by making the customer phone frame full width on mobile and only applying the 390px frame from `sm`.

### Bottom Dock Lacked Safe-Area Padding

Files:

- `components/customer/order-client.tsx`
- `components/dashboard/toast-provider.tsx`

Impact:

Bottom actions and toasts could sit too close to the iOS home indicator or browser bottom chrome. This is especially risky for payment and submit actions.

Status:

- Fixed in this batch for dine-in bottom dock and dashboard toast stack using `env(safe-area-inset-bottom)`.

### Touch Targets Were Below Mobile Minimums

Files:

- `components/customer/order-client.tsx`
- `components/customer/remote-order-client.tsx`
- `components/dashboard/dashboard-nav.tsx`
- `components/dashboard/dark-mode-toggle.tsx`
- `components/dashboard/live-action-center.tsx`
- `components/dashboard/shared-drawer.tsx`
- `components/ui/button.tsx`

Impact:

Several primary mobile controls were 32-40px. This misses the 44px iOS minimum and causes accidental taps in dense customer/order flows.

Status:

- Fixed the highest-impact shared/customer/dashboard controls in this batch.
- Remaining decorative/status icons below 44px are acceptable if not interactive.
- Some page-specific dashboard icon buttons should still be normalized as follow-up work.

### Global Horizontal Overflow Was Not Guarded

Files:

- `app/globals.css`
- `components/dashboard/app-shell.tsx`

Impact:

Tables, charts, long restaurant names, copied URLs, QR URLs, and AI panels can create accidental horizontal scroll. On mobile this often presents as content cut off or the page shifting sideways.

Status:

- Fixed in this batch with viewport-level `overflow-x: clip` and dashboard shell `overflow-x-clip`.
- Follow-up still needed for individual wide table/card components so content scrolls inside the intended container instead of relying on global clipping.

## P1 Findings - Dashboard Responsive Structure

### Operational Tables Still Carry Desktop Grid Assumptions

Files:

- `components/dashboard/orders-board.tsx`
- `components/dashboard/menu-workspace.tsx`
- `components/dashboard/payments-workspace.tsx`
- `components/dashboard/promotions-workspace.tsx`
- `components/dashboard/staff-workspace.tsx`
- `components/dashboard/ordering-settings-form.tsx`

Impact:

Many surfaces hide desktop headers on mobile, but the underlying row layouts still depend on complex desktop grid columns at larger breakpoints. When content is long, the layout can still become cramped or clipped before the desktop breakpoint.

Recommendation:

- Introduce a shared `ResponsiveDataList` pattern:
  - mobile: stacked card rows with label/value pairs
  - tablet/desktop: grid/table rows
  - per-row actions in a bottom/right action cluster
- Apply to orders, payments, menu, promotions, staff, and fee tier rows.

### Fixed Overlays Compete On Small Screens

Files:

- `components/customer/customer-ai-assistant.tsx`
- `components/customer/order-client.tsx`
- `components/customer/remote-order-client.tsx`
- `components/dashboard/live-action-center.tsx`
- `components/dashboard/toast-provider.tsx`
- `components/ai/dashboard-copilot-layer.tsx`

Impact:

Toast, LogiBot, live action notice, cart dock, and bottom actions use independent fixed positions. On small screens and during checkout/payment, these layers can cover each other.

Recommendation:

- Define a shared mobile overlay stack with CSS variables:
  - `--mobile-bottom-action-height`
  - `--mobile-toast-bottom`
  - `--mobile-ai-bottom`
  - `--mobile-safe-bottom`
- Route customer AI buttons through the same stack instead of hard-coded `bottom-[92px]`.

### Dashboard Header Has Limited Mobile Budget

Files:

- `components/dashboard/app-shell.tsx`
- `components/dashboard/dashboard-nav.tsx`
- `components/dashboard/live-action-center.tsx`

Impact:

The mobile dashboard header contains logo, action center, theme toggle, logout, and a horizontally scrolling nav. It now meets touch target better, but the header can still become visually heavy on small screens.

Recommendation:

- Move secondary header controls into a compact "More" menu on mobile.
- Keep only live action center and one primary account/menu button visible.

## P2 Findings - Polish And Robustness

### iOS Input Zoom Risk

Files:

- `app/globals.css`

Impact:

Many forms use small text classes. iOS Safari zooms focused inputs below 16px, which can make layouts appear broken.

Status:

- Fixed in this batch by setting mobile form controls to `16px` at viewport width below 768px.

### Long Content Needs Consistent Containment

Files:

- `components/dashboard/ordering-settings-form.tsx`
- `components/dashboard/online-workspace.tsx`
- `components/customer/remote-payment-receipt.tsx`
- `components/customer/order-client.tsx`
- `components/customer/remote-order-client.tsx`

Impact:

Restaurant names, addresses, URLs, item names, bank transfer content, and notes can exceed expected width.

Recommendation:

- Use `min-w-0`, `break-words`, `truncate`, or `line-clamp-*` deliberately on every row that can render tenant/customer text.
- Convert long code/URL blocks to `overflow-x-auto` instead of `overflow-hidden`.

### Reduced Motion And Animation Coverage Is Incomplete

Files:

- `app/globals.css`
- dashboard and customer components using `animate-*`, `transition`, custom keyframes

Impact:

Most transitions are light, but the app should consistently honor `prefers-reduced-motion`, especially on customer mobile flows where bottom sheets and payment screens are frequently used.

Recommendation:

- Add global reduced-motion rules for custom animations.
- Avoid introducing new layout-affecting animation; use opacity/transform only.

## Fixes Applied In This Batch

- Added global viewport overflow guard.
- Added mobile input font-size guard to prevent iOS focus zoom.
- Made dine-in and remote customer phone frames full-width on mobile.
- Added safe-area bottom padding to dine-in bottom dock and dashboard toasts.
- Increased high-impact customer and dashboard action buttons to 44px minimum.
- Increased dashboard mobile nav item height to 44px and added horizontal overscroll containment.
- Changed dashboard shell from broad `overflow-hidden` to `overflow-x-clip`.

## Follow-Up Checklist

- [ ] Add shared mobile overlay stack variables and migrate LogiBot/toast/cart/live-action placements.
- [ ] Create `ResponsiveDataList` and migrate orders/payments/menu/promotions/staff rows.
- [ ] Convert long URL/code blocks to `overflow-x-auto` with copy action.
- [ ] Review page-specific icon-only dashboard buttons still at 40px.
- [ ] Add a browser-based responsive smoke test for 390px, 414px, 430px, 768px, and 1024px viewports.
- [ ] Add screenshots or Playwright once the project includes a browser automation dependency.
