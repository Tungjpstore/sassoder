# LogiVN Open Design Mobile System

Source direction: Open Design v0.8 local catalog, adapted from `uber`, `cafe`, and restrained `stripe` references.

Scope: dashboard mobile/PWA only, below `1024px`. Desktop layouts remain owned by the existing dashboard styles.

## Product Feel

- Control-room mobile app for Vietnamese F&B operations.
- Warm cafe base, deep green command surfaces, orange urgency, compact SaaS hierarchy.
- Dense enough for a running shift, but every tap target stays comfortable.
- Cards communicate status first, decoration second.

## Tokens

- Canvas: `#FFF7EB`
- Surface: `#FFFDF8`
- Soft surface: `#F8F2E9`
- Primary: `#0F4D3A`
- Primary strong: `#0A382B`
- Accent / urgency: `#F28C28`
- Text: `#26312B`
- Muted: `#68746B`
- Line: `rgba(15, 77, 58, 0.14)`

Runtime CSS tokens live under `.open-design-mobile` in `app/globals.css`.

## Mobile Shell

- Bottom nav remains five destinations: Tổng quan, Đơn hàng, Bàn/Bếp, Báo cáo, Thêm.
- FAB is fixed left above bottom nav for quick actions.
- LogiBot is fixed right above bottom nav.
- Both controls are equal size and separated so they cannot overlap on 375px screens.
- Content bottom padding accounts for nav, home indicator, FAB, and chat entry.

## Screen Pattern

- Overview: store status, revenue, urgent KPI strip, alerts, action dock, AI insight, order watch list.
- Orders: sticky status command row, KPI cards, urgent-first order cards instead of mobile tables.
- Kitchen: high-contrast queue lanes, big counts, large refresh/action targets.
- Tables: status grid, QR readiness, bottom-sheet detail.
- Payments/Menu/Inventory/Staff/Analytics/Reservations/AI/Settings: shared cards, segmented controls, mobile list rows, and state pills.

## Implementation Rules

- Add mobile behavior through `@media (max-width: 1023px)` and `.open-design-mobile`.
- Do not change business logic or desktop information architecture.
- Hide dense desktop-only supporting panels with `.dashboard-mobile-hide`.
- Use existing data components and turn their mobile representation into cards with CSS hooks.
- Respect `prefers-reduced-motion`; transitions stay 150-250ms and use transform/opacity.
