# Principal Architecture Audit - LogiVN

Date: 2026-05-10

Scope:
- Structural review of the repository as a whole
- Deep read of core layers: `app/`, `components/`, `lib/`, `services/`, `supabase/`, `docs/`
- Validation snapshot from local checks

Repository snapshot:
- Approximate non-generated file count reviewed at structure level: 1,357
- Core app surfaces present: owner dashboard, customer ordering, platform admin, AI, billing, maps, SEO, cron

Initial validation snapshot:
- `npm run lint`: pass
- `npx tsc --noEmit`: pass
- `npm run build`: pass
- `npm run infra:check`: fail
- `node --test services/payment-log-service.test.ts lib/supabase/cookie-guards.test.ts`: fail
- `./node_modules/.bin/tsx --test services/payment-log-service.test.ts lib/supabase/cookie-guards.test.ts`: pass

Remediation progress:
- 2026-05-10 hardening pass 1 added a canonical `npm test` script for existing TypeScript tests.
- 2026-05-10 hardening pass 1 synced `.env.example` with the env keys discovered by `npm run infra:check`.
- 2026-05-10 hardening pass 1 removed the duplicate `components/customer/order-client 2.tsx` artifact.
- 2026-05-10 hardening pass 2 moved billing transition checks into the canonical TypeScript test runner.
- 2026-05-10 hardening pass 2 added focused coverage for subscription access windows, renewals, upgrades, trial conversion, expiry recovery, and downgrade rejection.
- 2026-05-10 hardening pass 2 added source hygiene detection to `npm run infra:check` for duplicate Finder-style artifacts.
- 2026-05-10 hardening pass 3 added idempotency and tenant-scoped payload coverage for order payment and reservation deposit audit logs.
- 2026-05-10 hardening pass 4 added entitlement and server feature gate coverage for Pro/Premium access, trials, quota exhaustion, and locked Premium features.
- 2026-05-10 hardening pass 5 added an `app/` service-role boundary guardrail to `npm run infra:check` and documented the policy in `docs/security/service-role-boundary.md`.
- Current status after hardening pass 5: `npm test`, `npm run infra:check`, `npm run billing:test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Executive Summary

LogiVN is no longer an MVP-only codebase. It is a real modular monolith for a multi-tenant restaurant SaaS with meaningful product depth across:

- tenant-aware routing
- restaurant operations
- customer QR/online ordering
- reservations and deposits
- subscription and entitlement logic
- AI orchestration
- platform admin control plane
- maps/delivery
- SEO/content acquisition

The architecture direction is broadly correct for current scale. The project is strongest where it behaves like a disciplined product platform:

- thin route handlers
- meaningful service layer
- strong TypeScript coverage
- Supabase RLS foundations
- explicit entitlement and feature-gating concepts
- production buildability

The main concern is not lack of product surface. The main concern is that the codebase is growing faster than its operational and architectural guardrails. The biggest risks now are:

1. weak automated validation for critical commercial flows
2. a prolonged billing bridge between legacy and v2 models
3. broad service-role usage inside hot tenant-facing paths
4. oversized core modules that are accumulating too many responsibilities

My overall assessment:

- Product maturity: strong beta / commercial pilot ready
- Architecture maturity: good modular-monolith foundation
- Operational confidence: medium
- Release confidence without stronger tests: medium-low

## Findings

### [High] There is no canonical automated test contract for the most business-critical flows

Why it matters:
- The project already handles auth, billing, order lifecycle, reservation deposits, AI usage accounting, and multi-tenant routing.
- For a SaaS with payment and entitlement logic, "lint + typecheck + build" is not enough protection.
- The current state makes regressions in login, subscription gating, payment confirmation, and customer flows more likely to escape into production.

Evidence:
- Initial audit state: `package.json:5-23` defined no `test` script and no standard test pipeline for app behavior.
- Initial audit state: `services/payment-log-service.test.ts:1-3` used relative ESM imports that failed under the default Node test command without runner-specific support.
- Initial audit state: `lib/supabase/cookie-guards.test.ts:1-12` used the `@/` alias and therefore also failed under plain `node --test`.
- Current remediation: `npm test` now runs `tsx --test services/**/*.test.ts lib/**/*.test.ts`.
- Current remediation: `lib/billing/subscription-transitions.test.ts` covers the highest-risk billing transition edge cases.
- Current remediation: `lib/billing/entitlements.test.ts` covers subscription feature gate policy for Pro/Premium, trial, and quota states.
- Current remediation: `services/payment-log-service.test.ts` covers duplicate-safe payment/deposit audit logging.
- Remaining gap: auth, full subscription gating redirects, QR ordering, remote ordering, and reservation deposits still need E2E/integration coverage.

What exposes the risk:
- Any change in auth, cookie handling, subscription gate logic, payment transitions, or server actions can compile successfully and still break runtime behavior.

Recommendation:
- Keep the first-class `npm test` contract as the local and CI baseline.
- Keep TypeScript tests standardized on one runner for TS + path aliases.
- Add E2E coverage for:
  - email OTP signup/login
  - Google OAuth callback path
  - subscription gate and billing renewal
  - QR dine-in order
  - remote order + delivery quote
  - reservation + deposit confirmation

### [High] Billing is in bridge mode between legacy and v2 models, which creates real consistency risk

Why it matters:
- Billing now appears in two overlapping worlds: legacy SaaS billing tables and billing v2 tables.
- The code is handling cutover by mirroring state between the two systems.
- This is a good migration strategy for safety, but a dangerous steady state if it lasts too long.

Evidence:
- `services/subscription-service.ts:607-645` reads billing v2 bridge state opportunistically.
- `services/subscription-service.ts:671-767` records usage against v2 quota tables.
- `services/subscription-service.ts:777-938` mirrors legacy payment requests into billing v2 records.
- `services/subscription-service.ts:940-1050` mirrors final payment state back into billing v2.

What exposes the risk:
- renew vs upgrade vs downgrade edge cases
- retry paths
- operator-confirmed payments
- partial failure during dual writes
- future schema evolution where one side changes faster than the other

Recommendation:
- Treat the bridge as temporary infrastructure, not a long-term architecture.
- Define an explicit cutover milestone:
  - source of truth
  - backfill completion criteria
  - parity dashboard
  - deletion plan for legacy write paths
- After parity is proven, remove dual-write behavior quickly.

### [High] Tenant isolation still depends too much on application discipline because service-role access is broad

Why it matters:
- LogiVN is explicitly multi-tenant.
- In a multi-tenant SaaS, the most dangerous class of defect is an accidental cross-tenant read or mutation.
- RLS helps, but the codebase also relies heavily on a global service-role client.

Evidence:
- `lib/supabase/admin.ts:1-20` exposes a shared service-role Supabase client for unrestricted server-side access.
- `services/order-service.ts:1-12` pulls service-role access into one of the hottest tenant-facing domains.
- `services/ai-service.ts:1-40` does the same inside the AI orchestration layer, which already spans many data scopes.

What exposes the risk:
- a missed `restaurant_id` filter
- a future helper added without tenant scoping
- AI snapshot queries expanding scope during new feature work

Recommendation:
- Keep service-role access for:
  - platform admin
  - cron
  - reconciliation
  - explicit cross-tenant jobs
- Keep `app/` entrypoints from importing the admin Supabase client directly.
- For tenant-facing flows, move toward a repository/policy layer with narrow methods like:
  - `ordersRepo.listForRestaurant(restaurantId, ...)`
  - `billingRepo.getSubscriptionSnapshot(restaurantId)`
  - `aiContextRepo.getOwnerSnapshot(restaurantId, scope)`
- Make tenant scoping implicit in those repos instead of re-implemented ad hoc.

Current remediation:
- `npm run infra:check` now fails if `app/` imports the admin Supabase client directly outside the health-check allowlist.
- `docs/security/service-role-boundary.md` records the boundary decision and migration direction.

### [Medium] Several core modules are now carrying too many responsibilities and are becoming architectural choke points

Why it matters:
- Modular monoliths work best when modules have clear ownership and bounded reasons to change.
- Some of the most important files now mix orchestration, data access, policy, formatting, provider config, caching, and runtime control.
- This increases regression risk and slows onboarding.

Evidence:
- `services/ai-service.ts:3-40` already imports routing, memory, tool execution, prompt assembly, setup readiness, billing usage, and provider concerns in one module.
- `services/subscription-service.ts:607-1050` spans entitlement resolution, usage accounting, legacy/v2 bridging, payment mirror logic, and email reminder behavior.
- `app/dashboard/actions.ts:1-84` centralizes many unrelated server actions across auth, menu, tables, subscriptions, restaurant settings, delivery, and staff.
- `app/dashboard/settings/page.tsx:46-101` already models multiple operational domains in one page surface and continues to grow.

What exposes the risk:
- small feature requests landing in giant files
- harder code review because change impact becomes non-local
- merge contention across unrelated workstreams

Recommendation:
- Split by use case, not by abstract utility:
  - `services/billing/entitlement-service.ts`
  - `services/billing/payment-request-service.ts`
  - `services/billing/usage-ledger-service.ts`
  - `services/ai/owner-assistant-service.ts`
  - `services/ai/customer-assistant-service.ts`
  - `app/dashboard/actions/auth-actions.ts`
  - `app/dashboard/actions/menu-actions.ts`
  - `app/dashboard/actions/billing-actions.ts`

### [Medium] The operational contract is drifting from the codebase, especially around environment configuration

Why it matters:
- The repository includes a good infra-contract checker, which is the right idea.
- That checker currently fails, which means environment documentation is no longer keeping up with implementation.
- This hurts onboarding, CI confidence, and deployment safety.

Evidence:
- `scripts/infra/check.mjs:75-93` compares discovered env usage against `.env.example`.
- `scripts/infra/check.mjs:158-173` fails hard when undeclared env keys are found.
- `.env.example:80-124` contains older SEO/Search Console placeholders, but the current implementation now expects additional Firecrawl, GSC, KV, and related env keys that are not represented there.

What exposes the risk:
- new environment setup
- CI/CD onboarding
- preview deployment debugging
- production rollback under pressure

Recommendation:
- Bring `.env.example` back into sync immediately.
- Group env vars by domain:
  - auth
  - billing
  - maps
  - AI
  - SEO automation
  - admin/ops
- Make `infra:check` part of the normal green path, not a known failing side gate.

### [Low] Architecture documentation is mixed with Codex scaffolding documentation, which weakens product onboarding

Why it matters:
- The repository has a real product architecture story, but the top-level `ARCHITECTURE.md` is currently about Codex Kit scaffolding rather than LogiVN itself.
- New engineers can easily mistake tool-scaffold architecture for application architecture.

Evidence:
- `ARCHITECTURE.md:1-16` documents Codex Kit structure, not the LogiVN product system.

Recommendation:
- Rename the current file to something like `CODEX_KIT_ARCHITECTURE.md`.
- Add a true product architecture doc that covers:
  - system context
  - tenant model
  - owner/admin/customer surfaces
  - service boundaries
  - billing architecture
  - data domains
  - runtime integrations

### [Low] Repository hygiene still shows a few duplicate or misleading artifacts

Why it matters:
- This is not a production blocker.
- It is, however, a signal that cleanup is lagging behind delivery.

Evidence:
- `components/customer/order-client 2.tsx:1-40` is a duplicate artifact that should not exist in a disciplined production repo.

Recommendation:
- Remove duplicate carryover files.
- Keep the source hygiene check in `npm run infra:check` so stray duplicate artifacts do not accumulate again.

## What Is Already Strong

### 1. Multi-tenant routing and session handling

The tenant-routing story is real, not decorative.

Evidence:
- `proxy.ts:1-143`
- `lib/tenant-domain.ts:1-24`
- `lib/supabase/server.ts:1-125`

Strengths:
- wildcard-subdomain rewriting
- root-domain canonicalization
- auth cookie repair and cookie-header budget defense
- shared tenant-domain cookie handling

### 2. Thin HTTP layer with meaningful service boundaries

Most API routes are small and delegate correctly.

Evidence:
- `app/api/admin/orders/route.ts`
- `app/api/admin/ai/assistant/route.ts`
- `app/api/ai/customer-assistant/route.ts`

Strengths:
- route handlers mostly do validation, auth, and delegation
- domain logic generally lives outside route files

### 3. Strong product breadth for current stage

LogiVN already has meaningful coverage across:
- dashboard operations
- QR dine-in ordering
- remote ordering
- reservation/deposit flow
- platform admin
- AI assistant layer
- maps and delivery
- SEO landing/blog foundation

This breadth is uncommon for a project that still builds cleanly as a single deployable app.

### 4. Good security instincts

Evidence:
- `next.config.ts`
- `lib/security/request-origin.ts`
- `lib/auth-rate-limit.ts`
- `docs/security/2026-05-05-eight-layer-audit.md`

Strengths:
- CSP and security headers
- same-origin request checks for sensitive paths
- rate limiting
- explicit thinking about tenant isolation and payment abuse

### 5. The billing and entitlement direction is strategically correct

Even with bridge risk, the long-term direction is good.

Strengths:
- feature gates
- quota tracking
- trial usage accounting
- UI entitlement model
- migration-aware cutover posture instead of a reckless rewrite

## Domain Maturity Assessment

| Domain | Maturity | Notes |
| --- | --- | --- |
| Multi-tenant routing | Strong | Good host rewrite and cookie handling |
| Owner dashboard | Strong beta | Broad surface, but settings/actions are getting dense |
| Customer ordering | Strong beta | QR and remote flows are substantial |
| Auth/onboarding | Medium-strong | Real flow coverage, needs E2E confidence |
| Billing/entitlements | Medium | Architecturally ambitious, operationally in cutover |
| AI layer | Medium | Well designed foundation, still high-change territory |
| Maps/delivery | Medium-strong | Better than typical MVP implementations |
| SEO/content | Strong foundation | Good GTM thinking and CI support |
| Testing | Medium-low | Canonical runner plus billing, entitlement, and payment log coverage added; E2E coverage still missing |
| Infra contract | Medium-strong | Checker is green after env contract sync |

## What Is Missing To Reach Production-Hardened Architecture

1. First-class test pipeline for critical flows
2. Billing v2 cutover completion and legacy bridge retirement
3. Narrower repository/policy boundaries for tenant-facing service-role usage
4. Decomposition of oversized modules
5. Clean env contract with green infra checks
6. A true product architecture doc for humans, not just agent tooling

## Recommended Roadmap

### P0 - Next 1 to 2 weeks

- Keep `npm test` and `infra:check` green in local and CI.
- Expand focused unit/integration coverage around tenant, payment, and entitlement boundaries.
- Add E2E coverage for:
  - login/register/verify
  - subscription gate
  - order create/pay/confirm
  - reservation/deposit

### P1 - Next 2 to 4 weeks

- Split `subscription-service.ts` into bounded billing services.
- Split `ai-service.ts` into owner/customer/setup-oriented services.
- Break `app/dashboard/actions.ts` into domain-specific action modules.
- Reduce service-role exposure in tenant-facing flows with explicit repositories.

### P2 - Next 1 to 2 months

- Complete billing v2 cutover and remove legacy dual-write paths.
- Add richer observability around:
  - entitlement decisions
  - AI usage/quota events
  - payment transitions
  - cross-domain admin actions
- Publish a proper product architecture document and system map.

## Final Assessment

LogiVN is a promising and unusually complete modular monolith for its stage. The codebase already contains many of the right platform instincts:

- typed boundaries
- explicit entitlement thinking
- multi-surface product architecture
- tenant-aware routing
- meaningful security posture

The project does not need a rewrite.

It needs hardening.

If the next phase focuses on validation, billing cutover, tenant-boundary tightening, and decomposition of the largest modules, this codebase can stay healthy while continuing to ship features.
