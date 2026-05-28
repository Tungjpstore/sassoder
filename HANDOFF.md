# LogiVN Project Handoff

Generated: 2026-05-09
Last updated: 2026-05-17

## Project Overview

LogiVN is a multi-tenant SaaS for Vietnamese cafe and restaurant operations.

Core product scope:

- QR ordering for restaurant tables
- Online ordering for pickup and delivery
- Reservations with deposits
- VietQR and cash hybrid payments
- Owner dashboard at `/dashboard`
- DevOps Control Center at `admin.logivn.com`
- AI-native assistant layer via CopilotKit, Qwen and xAI
- Supabase PostgreSQL/Auth/Realtime
- Vercel deployment
- Cloudflare R2 planned for media storage

Workspace:

`/Users/tunbee27/Documents/New project`

Current branch:

`codex/p0-production-clean`

Latest engineering update:

- 2026-05-17: Git worktree hygiene pass completed. Stale `/private/tmp` worktree metadata was pruned, the active worktree is clean, and branch/worktree tracking docs were added: `WORKTREE_MAP.md`, `ACTIVE_BRANCHES.md`, `MIGRATION_LOG.md`, and `RELEASE_NOTES.md`.
- 2026-05-17: Current release commit is `531a181 chore: consolidate LogiVN production release`; branch is ahead of `origin/codex/p0-production-clean` by 1 commit and `git push --dry-run origin codex/p0-production-clean` succeeded during audit.
- 2026-05-16: platform RBAC foundation completed locally, not deployed.
- Migration added: `supabase/migrations/20260516165000_platform_admin_rbac_foundation.sql`.
- Build hardening added: root layout no longer fetches Google Fonts at build time; it uses CSS font stacks to avoid CI/build network flakiness.
- Latest local validation passed: `git diff --check`, `npm run lint`, `npx tsc --noEmit --pretty false --incremental false`, `npm test`, `NEXT_PRIVATE_BUILD_WORKER=0 npm run build`.

## Project Architecture

Primary stack:

- Next.js App Router
- TypeScript
- TailwindCSS v4
- Supabase PostgreSQL/Auth/Realtime
- CopilotKit
- Qwen API as primary AI provider
- xAI/Grok as secondary or reasoning provider
- Vercel for deployment

Main structure:

- `app/`: Next.js App Router routes and API handlers
- `components/`: UI components and dashboard/customer surfaces
- `lib/`: shared utilities, Supabase clients, AI router, SEO config, auth helpers
- `services/`: server-side business logic
- `types/`: shared TypeScript types and Supabase generated types
- `supabase/`: schema and seed files
- `scripts/seo/`: SEO automation scripts
- `reports/seo/`: generated SEO reports
- `.github/workflows/`: CI workflows

Important route groups:

- `/`: public landing page
- `/pricing`: public pricing page
- `/dashboard`: restaurant owner dashboard
- `/dashboard/login`: owner login
- `/dashboard/register`: owner registration/onboarding
- `/dashboard/settings`: restaurant settings and subscription management
- `/dashboard/orders`: restaurant order operations
- `/dashboard/online`: online ordering management
- `/dashboard/reservations`: reservation management
- `admin.logivn.com`: platform/dev control plane
- `/r/[restaurantSlug]`: customer online ordering
- `/r/[restaurantSlug]/table/[tableId]`: customer table QR ordering

## Completed Features

- Multi-tenant database schema with restaurants, users, tables, menu categories, menu items, orders, order items, payment logs, promotions, reservations and subscription foundations.
- Dashboard route split from admin:
  - `/dashboard` is for restaurant owners.
  - `admin.logivn.com` is for LogiVN platform/dev management.
- Platform RBAC foundation:
  - roles: owner, ops, billing, content, support, readonly
  - server-side permission guards for platform refresh, content, billing, tenant and user mutations
  - user-scoped sessions, session events, revocation-ready table design and actor-aware audit logs
  - bootstrap password fallback remains only before the first platform admin user is created; existing legacy cookies still parse as owner sessions to avoid surprise lockout
- Landing page and pricing page with SEO metadata.
- QR/table ordering foundation.
- Online ordering foundation.
- Reservation flow foundation with deposit/payment lifecycle.
- Subscription/plan entitlement foundation.
- LogiBot/CopilotKit integration repaired for Qwen-compatible API base URL.
- AI tool-calling foundation added for:
  - menu search
  - best seller lookup
  - sales summary
  - peak-hour analysis
  - payment issue detection
  - promotion campaign generation
  - customer combo building
- AI response loop cleaned so internal tool outputs are not shown directly in the chat UI.
- SEO automation foundation added:
  - deterministic SEO audit
  - agentic SEO audit
  - Lighthouse CI wrapper
  - GitHub SEO CI workflow
- Antigravity duplicate artifacts cleaned:
  - all `* 2*` copy files removed
  - `.gitignore` and `tsconfig.json` updated to prevent duplicate artifacts from re-entering checks

## Validation Already Passed

Latest completed checks:

- `git diff --check`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run seo:audit` → `100/100`
- `npm run seo:agentic` → `80/100`
- `npm run build`
- `npx lhci assert --config=lighthouserc.cjs`
- `npm audit --audit-level=high`

Audit note:

- No high/critical vulnerabilities were found.
- Moderate warnings remain from transitive dependencies in CopilotKit/LHCI:
  - `@copilotkit/react-ui` → `react-syntax-highlighter/refractor/prismjs`
  - `@lhci/cli` → `inquirer/tmp`
- Do not run `npm audit fix --force` casually because npm proposes breaking downgrades.

## Important Files

Dashboard and shell:

- `components/dashboard/app-shell.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/settings/page.tsx`
- `lib/dashboard-access.ts`

Subscription and billing:

- `services/subscription-service.ts`
- `app/pricing/page.tsx`

AI:

- `services/ai-service.ts`
- `app/api/copilotkit/route.ts`
- `lib/ai/providers/registry.ts`
- `lib/ai/providers/openai-compatible.ts`
- `lib/ai/router/types.ts`
- `lib/ai/tools/executor.ts`
- `lib/ai/tools/menu.tool.ts`
- `lib/ai/tools/orders.tool.ts`
- `lib/ai/tools/payment.tool.ts`
- `lib/ai/tools/analytics.tool.ts`
- `lib/ai/tools/customer.tool.ts`

Customer/order flows:

- `app/r/[restaurantSlug]/page.tsx`
- `app/r/[restaurantSlug]/table/[tableId]/page.tsx`
- `app/api/orders/route.ts`
- `app/api/remote-orders/route.ts`
- `app/api/reservations/route.ts`

SEO:

- `components/seo/site-json-ld.tsx`
- `lib/seo/config.ts`
- `lib/seo/metadata.ts`
- `app/robots.ts`
- `app/sitemap.ts`
- `app/llms.txt/route.ts`
- `scripts/seo/foundation-audit.mjs`
- `scripts/seo/agentic-audit.mjs`
- `scripts/seo/run-lhci.mjs`
- `lighthouserc.cjs`
- `.github/workflows/seo-ci.yml`

Database:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `types/supabase.ts`

Landing:

- `components/landing/logivn-landing.tsx`
- `app/layout.tsx`
- `app/globals.css`

## Design Rules

Brand identity:

- Deep Green: `#0F4D3A`
- Warm Orange: `#F28C28`
- Ivory: `#FFF7EB`
- Charcoal: `#2B2B2B`
- Sage: `#A9C5A1`

Dashboard style direction:

- Minimal Futuristic SaaS UI
- Neo-minimalism
- Inter as the primary font
- Clean panels
- Thin borders
- High whitespace
- Low shadow
- Data-first, operational UX

Interaction rules:

- Do not dump all settings/content onto one page.
- Use drawer, popup or detail panels for secondary content.
- When the user clicks a region, show only that region.
- Dashboard overview should show key operational status and quick actions only.
- Customer UI should be mobile-first, compact, fast and action-oriented.
- AI UI must not feel like a generic chatbot popup.
- AI should provide contextual actions tied to real data.

Avoid:

- Heavy decorative clutter inside dashboard pages
- Large blocks of instructional text
- Nested cards inside cards
- Full-page forms when a drawer/modal would be clearer
- Exposing internal AI tool names or raw tool output in chat UI

## API Structure

Copilot/AI:

- `POST /api/copilotkit`
- `POST /api/admin/ai/assistant`
- `POST /api/admin/ai/branding`
- `POST /api/admin/ai/image`
- `POST /api/admin/ai/menu-ocr`
- `POST /api/admin/ai/setup-draft`
- `POST /api/admin/ai/setup-plan`

Owner dashboard orders:

- `GET /api/admin/orders`
- `POST /api/admin/orders/[orderId]/accept`
- `POST /api/admin/orders/[orderId]/cancel`
- `POST /api/admin/orders/[orderId]/complete`
- `POST /api/admin/orders/[orderId]/confirm-payment`
- `POST /api/admin/orders/[orderId]/delivery-status`
- `POST /api/admin/orders/[orderId]/timer`

Owner reservations:

- `GET/POST /api/admin/reservations`
- `POST /api/admin/reservations/[reservationId]/cancel`
- `POST /api/admin/reservations/[reservationId]/confirm-deposit`
- `POST /api/admin/reservations/[reservationId]/no-show`
- `POST /api/admin/reservations/[reservationId]/seat`

Customer dine-in orders:

- `POST /api/orders`
- `GET /api/orders/[orderId]`
- `POST /api/orders/[orderId]/checkout`
- `POST /api/orders/[orderId]/paid`
- `GET /api/orders/history`

Customer online orders:

- `POST /api/remote-orders`
- `GET /api/remote-orders/[orderId]`
- `POST /api/remote-orders/[orderId]/paid`
- `GET /api/remote-orders/history`

Customer reservations:

- `POST /api/reservations`
- `GET /api/reservations/[reservationId]`
- `POST /api/reservations/[reservationId]/paid`
- `GET /api/restaurants/[restaurantSlug]/reservations/availability`

Delivery/location:

- `GET /api/restaurants/[restaurantSlug]/delivery-quote`
- `POST /api/admin/restaurant-geocode`

Cron:

- `GET /api/cron/reports`
- `GET /api/cron/reservations/expire`
- `GET /api/cron/subscriptions`

Health:

- `GET /api/health`

## Current Bugs And Risks

Known or recently reported issues that still need verification:

- Google OAuth login has repeatedly been reported broken. Needs full reproduction and auth audit.
- Subscription gate bug:
  - owner gets stuck at `/dashboard/settings?section=billing&gate=subscription`
  - UI says package expired or payment required despite showing many days remaining
  - likely involves `services/subscription-service.ts`, `lib/dashboard-access.ts` and `components/dashboard/app-shell.tsx`
- `/dashboard/settings` UI is still likely too dense and should be converted to strict one-section drawer/popup UX.
- AI setup flow is still not product-grade enough; current AI tools are only the foundation.
- Online ordering and reservations need complete end-to-end browser verification.
- Generated SEO reports under `reports/seo/` are currently ignored by `.gitignore`; decide later whether to commit selected reports as docs/artifacts.
- Current changes are not committed yet.

## Pending Tasks

High priority:

1. Reproduce and fix Google OAuth login end-to-end.
2. Fix subscription entitlement false-positive and redirect loop/gate behavior.
3. Refactor `/dashboard/settings` to strict drawer/popup UX.
4. Verify owner dashboard, QR order, online order, reservation and payment confirmation end-to-end.
5. Commit and push the current cleanup/AI/SEO changes after final review.

AI priority:

1. Turn AI setup into a guided step-by-step agent flow.
2. Return real action buttons/cards from AI results for owner and customer flows.
3. Ensure customer AI can suggest real menu items with add-to-cart actions.
4. Ensure owner AI can navigate, summarize real data and suggest operational actions without leaking tool internals.
5. Add better memory boundaries so tenant data never leaks across restaurants.

Commercial/SaaS priority:

1. Complete Pro/Premium upgrade, downgrade and renewal logic.
2. Add clean billing page and plan comparison UX.
3. Add reminders before plan expiry.
4. Add anti-abuse rules for free trial and subscription payment confirmation.
5. Add platform admin controls for suspending/deleting restaurants without exposing private restaurant revenue/order details.

SEO priority:

1. Connect Firecrawl MCP when credentials/tooling are ready.
2. Connect Google Search Console MCP/data when credentials are ready.
3. Feed real crawl/GSC data into `scripts/seo/agentic-audit.mjs`.
4. Add FAQ schema to pricing after final copy is approved.
5. Add official `sameAs` links after brand social profiles are live.

## Recommended Next Thread Flow

Start with a focused bug pass:

1. Reproduce `/dashboard/login` Google OAuth failure.
2. Reproduce subscription gate false-positive with the current restaurant.
3. Patch auth/subscription first because they block commercial usage.
4. Refactor settings UI into drawer/popup sections.
5. Do an E2E pass:
   - owner login
   - owner registration
   - dashboard overview
   - order handling
   - VietQR confirmation
   - QR table customer order
   - online order
   - reservation
   - LogiBot owner assistant
   - LogiBot customer assistant
6. Run validation:
   - `git diff --check`
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run seo:audit`
   - `npm run seo:agentic`
   - Lighthouse checks where possible

## Git State Note

At the time this handoff was written, the working tree contains legitimate modified/untracked files from AI/SEO cleanup and Antigravity repair. They were validated locally, but not committed yet.
