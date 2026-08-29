# Platform admin and MFA rollout

This runbook is scoped to LogiMail. It prevents the `platform_role` migration
from locking out the current control-plane operator while keeping workspace
roles out of global admin authorization.

## Order of operations

1. Apply `supabase/migrations/20260722120000_logimail_p0_security_hardening.sql`.
2. Apply `supabase/migrations/20260722141519_logimail_atomic_send_quota.sql`.
3. Before deploying the new web build, bootstrap an already verified operator:

   ```bash
   LOGIMAIL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
   LOGIMAIL_BOOTSTRAP_ADMIN_NAME="LogiMail Admin" \
   node --env-file=/etc/logimail/logimail.env \
     apps/logimail-web/scripts/grant-admin.mjs '<temporary-password>'
   ```

   The script writes `profiles.platform_role=platform_owner`, trusted Auth
   app metadata, and an audit event. It never derives platform access from
   `profiles.role` or `workspace_members.role`.

4. Confirm at least one platform owner exists before switching traffic:

   ```sql
   select id, email, platform_role, account_status
   from logimail.profiles
   where platform_role in ('platform_admin', 'platform_owner');
   ```

5. Keep `LOGIMAIL_ADMIN_MFA_MODE=enrolled` for the first rollout. This gates
   write/dangerous console actions only for accounts that already have a
   verified MFA factor. After every platform admin has enrolled and completed
   an AAL2 sign-in, change the value to `required` and restart the web service.

## Backfill behavior

The P0 migration only backfills a platform role when trusted Auth app metadata
already contains `platform_admin` or `platform_owner`; it records
`logimail.platform_role_backfilled`. It does not promote workspace owners.

## Rollback

If the web build must be rolled back, leave the platform role and mailbox
session-version columns in place. The previous build can ignore additive
columns. Set `LOGIMAIL_ADMIN_MFA_MODE=enrolled` (or `off` temporarily only
under incident approval) rather than deleting roles or reverting the migration.
