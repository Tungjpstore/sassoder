# LogiVN Mobile Redesign

Scope: mobile web/PWA only. Desktop layouts at `lg` and above stay intact.

## Design Direction

- Open Design v0.8 direction: blend `uber` operational clarity, `cafe` warmth, and restrained `stripe` SaaS precision. See `open-design-mobile-system.md`.
- Operational first: every screen starts with the state that needs action now.
- One-hand use: primary actions are 56px or taller, near the lower half when possible.
- Realtime clarity: connected, syncing, offline, pending, and failed sync states must be visible without becoming noisy.
- Vietnamese F&B fit: warm ivory base, deep green primary, orange urgency, compact Vietnamese copy.
- No dense desktop tables on mobile: use cards, grouped lists, segmented controls, and bottom sheets.

## File Structure

- Mobile Overview: snapshot-first owner dashboard, mobile-only under `lg`.
- Orders: realtime card board with SLA, payment state, channel, and grouped urgency.
- Kitchen: high-contrast cards with timers, station groups, modifiers, and large actions.
- Tables: mobile-first table grid, QR/bill bottom sheet, status color.
- Payments: VietQR-centric queue with amount, method, mismatch/expired/pending states.
- Menu: item cards with image preview, availability toggle, category chips, quick edit.
- Inventory: low-stock priority, quick stock update, ingredient cards, usage trend.
- Staff: employee cards, role badges, attendance, shift approvals, call/message.
- Analytics: KPI snapshots, mini charts, insight blocks, top items, peak hours.
- Reservations: timeline/list hybrid, deposit/no-show/table allocation states.
- AI Assistant: floating contextual assistant, suggestions, smart summaries, safe actions.
- Settings: mobile sections, account/payment/integration cards, destructive actions separated.
- Component System: see `component-system.md`.
- Responsive Specs: see `responsive-specs.md`.

## Interaction Rules

- Swipe actions are progressive enhancement; visible buttons remain available.
- Bottom sheets handle table detail, QR, bill split/merge, payment confirmation, and quick edit.
- Sticky segmented tabs replace wide desktop filters.
- Optimistic actions must show `Đang đồng bộ` until server confirmation.
- Offline actions enter a queued state and never look fully successful before sync.
