# Staff Operations Release Checklist

This checklist is for the deployment thread. Do not deploy HR changes until the shared repo checks are green.

## Scope

- Staff management dashboard
- Staff mobile workspace
- Leave, shift swap, and overtime request workflows
- Approval side effects for leave, swap, and overtime
- Payroll-ready timesheet summary
- AI HR Assistant insights

## Required Migration

Apply this migration before production traffic uses the new request workflow:

- `supabase/migrations/20260516113906_staff_request_workflows.sql`

It expands `attendance_approval_requests.request_type` to include:

- `leave_request`
- `shift_swap`
- existing `overtime`

It also adds indexes for staff/type/status and branch/type/status request lookup.

### Migration Order

- Run this migration before deploying HR code that creates `leave_request` or `shift_swap` rows.
- If deploy is done in one window, apply the migration first, then roll the app deployment.
- This migration reuses the existing `attendance_approval_requests` table, so no new public table exposure is required.
- Supabase note: verify existing RLS and service-role paths still cover `attendance_approval_requests` for the new request types. New Supabase tables may need explicit Data API exposure, but this change does not add a new table.

### Rollback Notes

- The constraint change is additive and safe for current overtime/manual attendance request types.
- If code is rolled back after users submit leave or shift swap requests, old UI may not render those request types well. Treat that as operational degradation, not expected data corruption.
- Do not remove the new request types from the check constraint while production rows with `leave_request` or `shift_swap` still exist.
- If a code rollback is required, keep the migration in place and hide the new workflows at the UI/feature flag layer until a follow-up fix ships.

## Production Environment

Confirm these are present in the target Vercel/Supabase environment before deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `STAFF_PIN_PEPPER`

Required only when the related production path is enabled:

- `CRON_SECRET` for AI/Ops cron or scheduled HR/ops checks.
- `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, and related email sender env when HR notifications are routed through email.

## Request Payload Conventions

All request workflows use `attendance_approval_requests.requested_payload`.

### Leave Request

```json
{
  "leaveType": "paid | unpaid | sick | emergency | other",
  "leaveTypeLabel": "Nghỉ phép có lương",
  "fromDate": "2026-05-18",
  "toDate": "2026-05-19",
  "payrollImpact": "paid_leave | unpaid_leave"
}
```

Approval effect:

- scheduled/confirmed/swapped shift assignments in the date range are cancelled
- paid and unpaid leave days are included in timesheet summary

### Shift Swap

```json
{
  "shiftAssignmentId": "uuid",
  "shiftId": "uuid",
  "shiftName": "Ca tối",
  "scheduledDate": "2026-05-18",
  "startTime": "18:00",
  "endTime": "22:30",
  "targetStaffMemberId": "uuid | null",
  "targetStaffName": "Nguyen Van A | null",
  "currentStatus": "scheduled"
}
```

Approval effect:

- validates target staff conflict when `targetStaffMemberId` exists
- marks assignment as swapped
- transfers `staff_member_id` to target staff when available

### Overtime

```json
{
  "overtimeDate": "2026-05-18",
  "overtimeMinutes": 90,
  "payrollImpact": "overtime_payable"
}
```

Approval effect:

- approved overtime without an attendance log is included in timesheet summary
- CSV export includes approved overtime minutes

## Manual QA

- Staff mobile: submit leave request, shift swap request, and overtime request.
- Staff mobile: shift swap can optionally choose a target staff member.
- Admin dashboard: create a request on behalf of a staff member.
- Admin dashboard: approve and reject each request type.
- Admin dashboard: verify approval appears in activity log and notifications.
- Reports: verify AI HR Assistant cards navigate to the right HR screen.
- Timesheet export: verify approved overtime and leave columns are populated.

## Release Checks

Run after parallel feature threads are merged:

```bash
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
```

Known non-HR blockers should be resolved in their owning threads before production deploy.

## Production Smoke Test

Run after the deployment thread applies the migration and deploys the merged app:

- Open staff dashboard and confirm staff list, quick filters, and HR cockpit load.
- Submit leave, shift swap, and overtime requests from staff mobile.
- Approve and reject one request of each type from the admin dashboard.
- Confirm approved leave updates affected shift assignments and timesheet leave totals.
- Confirm approved shift swap moves the assignment to the target staff when selected.
- Confirm approved overtime appears in timesheet summary and CSV export.
- Confirm activity log records the request lifecycle.
- Confirm notification center shows schedule/request changes.
- Confirm AI HR Assistant cards render without blocking the HR dashboard when insight data is empty.
- Confirm realtime attendance/request updates appear in another browser session without refresh.
