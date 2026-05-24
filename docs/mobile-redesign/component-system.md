# Mobile Component System

## Buttons

- Primary: deep green, 56px minimum for key operational action.
- Secondary: solid ivory surface, green text, 44px minimum.
- Ghost: text/icon only for low-risk utility actions.
- Danger: warm danger surface until confirmation, solid danger only for final destructive action.
- Icon-only: 44x44 minimum with accessible label.
- Loading: spinner plus unchanged label or explicit `Đang xử lý`.
- Disabled: visible but muted, with reason in adjacent helper text when business-critical.

## Cards

- Order card: bill id, table/channel, main items, SLA age, payment badge, urgent action.
- Payment card: large amount, payment method, bill id, customer/table, timestamp, VietQR state.
- Table card: name, area, capacity, QR state, bill amount, service timer.
- Menu item card: image, name, price, tags, availability, topping count.
- Analytics card: one KPI, trend sparkline, short interpretation.
- Staff card: avatar, role, attendance, shift, request state, call/message.
- AI card: contextual insight, evidence line, one safe action, one dismiss action.

## States

- Loading: skeletons shaped like final cards, no blank white screens.
- Empty: one reason plus one next action.
- Error: human-readable cause, retry action, no technical stack text.
- Offline: persistent banner and per-action queued indicator.
- Pending sync: local state is visually distinct from success.
- Success: brief toast, card state updates immediately after server confirmation.

## Navigation

- Bottom nav: `Tổng quan`, `Đơn hàng`, `Bàn/Bếp`, `Báo cáo`, `Thêm`.
- FAB: quick operational actions only; it must sit above the safe area and bottom nav.
- Bottom sheet: detail and confirmation surfaces.
- Full-screen modal: only for complex edit flows.

## Inputs

- Search: 44px minimum, clear icon, scoped placeholder.
- Phone: Vietnamese-friendly formatting, accepts spaces.
- Quantity stepper: large tap targets, no tiny plus/minus.
- Filters: segmented chips first, advanced filters inside sheet.
