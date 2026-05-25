# Telegram Operations Layer

## What Changed

Telegram is now wired as an operational event consumer, not a dashboard-only setup tool.

Business services emit tenant-scoped operational events to the VPS gateway. The gateway records the event, routes it through BullMQ, and the Telegram worker fans out compact action cards to connected owners/staff with branch and permission filtering.

## Covered Event Surface

- Orders: `order.created`, `order.confirmed`, `order.completed`, `order.cancelled`, `order.delivery_status_changed`
- Payments: `payment.waiting_confirm`, `payment.received`
- Reservations: `reservation.created`, `reservation.deposit_submitted`, `reservation.confirmed`, `reservation.rejected`, `reservation.cancelled`, `reservation.checked_in`, `reservation.seated`, `reservation.no_show`, `reservation.rescheduled`
- Service requests: `service_request.created`, `service_request.resolved`
- Existing ops alerts: `inventory.low`, `sla.warning`, `platform.alert`

## Action Rules

- `order.created`: confirm, cancel, view
- `order.confirmed`: mark done, view
- `payment.waiting_confirm`: confirm, amount mismatch, view
- `reservation.created`: reject, view
- `reservation.deposit_submitted`: confirm deposit, reject, view
- `service_request.created`: resolve, view

Every mutation still flows through signed Telegram callback tokens, one-time database claims, connection matching, branch scope checks, and live staff permission validation in the internal Next.js action API.

## Next Upgrade Path

1. Add SLA scanner on VPS workers so overdue orders generate `sla.warning` without waiting for Dashboard traffic.
2. Add delivery assignment cards for courier allocation and handoff notes.
3. Add staff workspace cards for attendance exceptions, shift swap approvals, overtime approvals, and kitchen tasks.
4. Add owner-dev/platform cards from Sentry/Better Stack/Alertmanager via `platform.alert` with severity routing.
5. Add automation rules: "if order delayed 10 minutes", "if VietQR waiting 5 minutes", "if reservation deposit not paid before hold expiry".

## Release Notes

New event types are backward compatible. If the gateway has not been deployed yet, Next.js publish calls degrade to a logged `gateway_rejected` result instead of blocking customer/order requests. Deploy order should still be:

1. VPS shared/gateway/telegram services.
2. Configure Telegram webhook if secrets changed.
3. Vercel production deployment.
4. Telegram smoke tests from Dashboard.
