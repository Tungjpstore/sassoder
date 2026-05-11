# Service-Role Boundary Policy

Date: 2026-05-10

Purpose:
- Keep Supabase service-role access away from request entrypoints by default.
- Make tenant isolation easier to review as LogiVN grows.
- Prevent route handlers and server actions from accumulating unrestricted data access.

## Decision

Application entrypoints under `app/` must not import `@/lib/supabase/admin` directly.

Allowed exception:
- `app/api/health/route.ts`, because it is an operational health probe and does not perform tenant-scoped domain reads or writes.

Tenant-facing and owner-facing work should enter through:
- `services/*`
- future domain repositories with explicit tenant-scoped methods
- cron/platform-admin code where cross-tenant access is intentional

## Rationale

LogiVN is multi-tenant. Direct service-role usage in route handlers makes it too easy for future work to bypass RLS and miss a `restaurant_id` constraint. Keeping service-role usage behind services or repositories gives reviewers a smaller surface to inspect and gives the architecture a path toward narrower policy methods.

## Guardrail

`npm run infra:check` now fails if an `app/` file directly imports the admin Supabase client outside the health-check allowlist.

This is not the final tenant-isolation architecture. It is a low-risk guardrail that prevents the boundary from getting worse while larger service/repository decomposition happens incrementally.
