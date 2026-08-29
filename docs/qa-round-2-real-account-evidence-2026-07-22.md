# QA Round 2 Evidence - Local Candidate And Real Accounts

Date: 2026-07-22

Status: **PARTIAL / NO-GO**

Scope excludes `logimail/`. Credentials, access tokens, account identifiers, tenant UUIDs and personal data are intentionally redacted. The local candidate ran on `127.0.0.1:3127` and used the existing Supabase data only for controlled QA markers. No VPS restart, deployment, migration apply, commit or push was performed.

## Candidate And Runtime Gate

- Candidate build passed with Next.js 16.2.6, TypeScript and 160 generated routes.
- Candidate was compared against the Git index excluding `logimail`, `node_modules` and `.vercel`.
- Only the 20 intended Round 1 hydration/staff-date files differed from the index; the unrehearsed owner/financial migrations were absent.
- `.env.local` and `.next` were removed from the upload candidate before inspection. The build artifact was restored only inside the temporary local runner and was moved out again after runtime use.
- No secret pattern was added by the changed files; no source symlink escaped the candidate root.
- Vercel preview was not used: the CLI is authenticated to the wrong scope, the existing preview is Deployment-Protection gated, and Preview/Supabase environment isolation is not proven.
- Production remains **NO-GO**.

## Evidence 1 - Owner Creates Manager With Blank Date

- Persona: randomly selected usable owner on an active subscription.
- Action: opened `/dashboard/staff`, used the real `Invite staff` flow, entered a unique `QA-R1-MANAGER-*` name, selected `manager`, and left optional date-of-birth, phone and address fields blank.
- Before evidence: zero `staff_members` rows matched the marker.
- UI evidence: form accepted the blank date as empty and enabled submission; success dialog returned a generated employee code and temporary PWA credentials.
- Database evidence: exactly one staff row was created with `role_code=manager` and `date_of_birth=NULL`; the linked user ID was present.
- Result: **PASS for the blank-date regression fix on the local candidate**.

## Evidence 2 - Manager Boundary Failure

- Persona: the manager account created in Evidence 1, authenticated through a direct Supabase OTP link without exposing credentials.
- Action: opened the real dashboard staff page and settings pages.
- Observed: staff page loaded without React `#418`; billing page rendered the full `Gói LogiVN` flow, payment history links, renewal action and current plan information.
- Observed: the `Thanh toán` settings section exposed the bank-code, bank-account, bank-account-name fields and the `Lưu thông tin VietQR` action.
- Expected: manager may use ordinary settings but must be denied billing, receiving-bank and owner mutations.
- Result: **FAIL / P0 candidate**. The manager boundary is still bypassed in the runtime path. The missing production `restaurants.owner_user_id` column confirms the owner-boundary migration is not deployed, but the UI/API must also enforce explicit owner-only checks.
- No financial value, bank field or owner record was changed.

## Evidence 3 - Kitchen Pickup Order Lifecycle

- Persona: randomly selected usable kitchen account on an active subscription.
- Customer action: opened the real public ordering page, added one available menu item, selected `Đến lấy` (pickup), used a synthetic QA phone number and a unique `QA-R1-KITCHEN-*` name/note, then submitted the real checkout.
- DB evidence before staff action: one marker order existed with `status=pending`, `fulfillment_type=PICKUP`, `payment_status=unpaid`.
- Kitchen action: opened the real kitchen display, selected `Nhận đơn`, then `Xong món`.
- DB evidence after staff action: order progressed through the kitchen path and finished as `status=completed` with `accepted_at` and `served_at`; one order item was present.
- Browser evidence: kitchen display showed the marker order, then the queue returned to zero. No React `#418` or hydration mismatch was observed.
- Cleanup: exact marker order and its order item were deleted; post-cleanup queries returned zero order rows and zero item rows. Two immutable `audit_logs` rows and two `staff_activity_logs` rows remain as the expected evidence trail for accept/complete and are reconciled to the deleted QA order ID.
- Residual finding: after the successful mutation, the kitchen UI showed `Mất kết nối`. Runtime logs confirmed that the operational event bus and VPS realtime publish were skipped because the local candidate had no gateway/`LOGIVN_WS_*` URL or `LOGIVN_INTERNAL_API_KEY`. This needs an isolated staging/VPS websocket health check.
- Result: **PASS for the tested kitchen state transition; FAIL for realtime operational readiness**.

## Evidence 4 - Waiter Staff App And Stale Attendance

- Persona: the only currently usable waiter account on an active subscription.
- Action: opened the real staff mobile route and attempted the real navigation boundaries.
- Observed: staff mobile loaded without React `#418`; billing and admin staff URLs redirected back to staff mobile rather than exposing owner/admin pages.
- Observed: the account is blocked by an unfinished attendance session from 2026-05-19; the device is locked and the `Vào ca` action is unavailable. The UI offers `Báo quản lý xử lý ca mở`.
- Result: **PASS for tested route boundaries; FAIL / P1 operational finding for stale attendance/device lock recovery**.
- No historical attendance row or manager request was modified.

## Cleanup Reconciliation

- The QA manager Auth account was first soft-deleted, then a hard-delete attempt failed with a generic database error. The exact public `staff_members` and `users` rows were deleted with service-role cleanup and verified absent.
- The Auth user remains a deleted/tombstoned record because the hard delete is blocked by an unknown database dependency. This must be reconciled through a controlled Auth/DB cleanup runbook before claiming zero residue.
- The QA pickup order and child item were deleted and verified absent. Four immutable operational audit rows are retained and reconciled by the exact deleted QA order ID.
- Browser session was cleared and the QA tab finalized. No QA marker remains in the tested public tables queried by exact ID/marker.

## Missing Persona Coverage

- Current active accounts expose owner, manager, waiter and kitchen personas. No usable active cashier or delivery account was found in the queried tenant set, so those personas remain unverified rather than being simulated.
- No owner-boundary or financial migration was applied because production lacks `restaurants.owner_user_id` and PostgreSQL rehearsal is still unavailable.

## Round 2 Decision

Round 2 provides useful real-account evidence for the local candidate but does not close the release gate. The manager billing/VietQR escalation, stale attendance recovery, realtime disconnect and unresolved Auth hard-delete residue remain open. Next work must first fix the manager boundary and establish isolated PostgreSQL/Preview evidence before expanding payment, reservation, QR, inventory and delivery mutations.
