# LogiMail UI Handoff

LogiMail web UI is a real-data Next.js interface for the LogiMail Supabase schema, security-code signup/reset flow, approval request queues, and MailOps surface. It intentionally keeps Cloudflare, BillionMail, SMTP/IMAP, VPS scripts, restore flows, and destructive actions behind server-side API boundaries rather than calling them directly from the browser.

## Design Direction

- Product: internal email platform and MailOps cockpit for LogiVN.
- Visual reference: Google Stitch LogiMail frames, adapted into the current Next.js app.
- Style: compact Gmail-like mail client, Cloudflare-like DNS operations, restrained DevOps cockpit.
- Palette: deep emerald primary, warm orange warning/accent, ivory/soft gray background, white surfaces.
- Shape: 8px cards and controls, subtle borders, minimal shadows, no logistics imagery.

## Routes

Core app routes:

- `/dashboard`
- `/mail`, `/mail/inbox`, `/mail/sent`, `/mail/drafts`, `/mail/spam`, `/mail/trash`, `/mail/compose`, `/mail/message/[id]`
- `/mailboxes`, `/mailboxes/new`, `/mailboxes/[id]`
- `/domains`, `/domains/new`, `/domains/[id]`, `/domains/[id]/dns`, `/domains/[id]/deliverability`
- `/ops`, `/ops/health`, `/ops/dns-check`, `/ops/mail-queue`, `/ops/backups`, `/ops/agent`, `/ops/logs`
- `/team`, `/team/invites`
- `/settings/profile`, `/settings/workspace`, `/settings/security`, `/settings/api-keys`, `/settings/notifications`
- `/auth/login`, `/auth/register`, `/auth/invite`, `/auth/forgot-password`, `/onboarding`

Compatibility redirects remain for existing backend-doc URLs:

- `/dashboard/domains` -> `/domains`
- `/dashboard/domains/[id]` -> `/domains/[id]`
- `/dashboard/mailboxes` -> `/mailboxes`
- `/dashboard/mailboxes/[id]` -> `/mailboxes/[id]`
- `/dashboard/dns` -> `/domains/logivn-com/dns`
- `/dashboard/ops` -> `/ops`
- `/dashboard/team` -> `/team`
- `/dashboard/settings` -> `/settings/security`

## Component System

Main reusable components live in `src/components/logimail-ui.tsx`:

- `PageHeader`
- `StatusBadge`
- `MetricCard`
- `HealthCard`
- `ActionCard`
- `DNSRecordCard`
- `CopyableRecordRow`
- `MailboxCard`
- `MailboxUsageBar`
- `PermissionTable`
- `ActivityTimeline`
- `EmptyState`
- `QueueStatusCard`
- `BackupStatusCard`
- `AgentPolicyCard`
- `SecurityChecklist`
- `FormField`
- `SafetyNotice`

Shell components live in `src/components/logimail-shell.tsx`:

- `AppShell`
- desktop sidebar
- topbar with global search/status/user controls
- mobile bottom navigation

Danger confirmation UX lives in `src/components/confirm-danger-modal.tsx`.

## Real Data

Operational UI data is loaded from `src/lib/logimail-data.ts` with Supabase Auth cookies and the `logimail` schema. The main surfaces read real rows for:

- workspaces and membership
- domains and DNS plans
- domain approval requests
- mailboxes and permissions
- mailbox approval requests
- one-time security code state for admin/bot surfaces
- audit/activity logs
- quotas and basic usage metadata

Mutation flows call authenticated Next API routes under `/api/logimail/*`. Production nginx keeps `/api/logimail/health` on the lightweight ops API service and routes the remaining product API paths to the Next.js app.

Auth is intentionally email-provider style:

- Register uses `localPart@verified-domain` plus password, not a generic SaaS profile form.
- The suffix comes from approved, active domains with registration enabled; `LOGIMAIL_DOMAIN` is the production fallback for `logivn.com`.
- Public registration posts to `/api/logimail/auth/register` with `localPart`, `domain`, one-time `securityCode`, and password confirmation. The server consumes exactly one active code, provisions the BillionMail mailbox, then creates a confirmed Supabase Auth user and metadata rows.
- Forgot password posts to `/api/logimail/auth/reset-password` with the same email suffix control, a one-time `securityCode`, and new password confirmation.
- Login only uses full internal email and password. Google OAuth is not exposed in the LogiMail auth UI.

Mail views use the native LogiMail client: server-side IMAP reads folders/messages, SMTP sends mail, and BillionMail/RoundCube remains only the underlying mail-server/webmail fallback.

## Backend Integration Points

The UI assumes the existing API boundary documented in `docs/pwa-supabase.md`:

- Supabase Auth verifies user JWTs server-side.
- Supabase metadata lives in schema `logimail`.
- DNS automation starts as dry-run and safe plan generation.
- Mailbox create returns `providerSync=pending_billionmail` until BillionMail sync is connected.
- Backup, report, and restart operations stay server-side and write audit logs best-effort.
- Dangerous API calls require explicit confirmation, such as `x-logimail-confirm: I_UNDERSTAND_LOGIMAIL_RISK`.

## Safety Rules Reflected In UI

- DNS rows include Copy and Check controls.
- Cloudflare proxy warning is visible for SMTP/IMAP hostnames.
- PTR/rDNS is shown as VPS-provider managed, not Cloudflare managed.
- Backup and restore screens show explicit restore warnings.
- Agent actions are split into Allowed, Requires confirmation, and Denied.
- Secrets and tokens are never shown; UI uses masked/server-side language.
- Destructive actions open confirmation modals and require server-side confirmation headers before any real backend mutation.

## Mobile PWA Support

- Responsive app shell collapses sidebar and adds mobile bottom navigation.
- Inbox becomes list-first on small screens.
- Tables are hidden on mobile where card/list equivalents exist.
- Manifest and service worker cache the main UI shell routes only, not API responses or raw email data.

## Validation

Run from `logimail/apps/logimail-web`:

```bash
npm run typecheck
npm run build
```

Run full LogiMail checks from `logimail/` when release-sensitive backend changes are included:

```bash
npm run check
```
