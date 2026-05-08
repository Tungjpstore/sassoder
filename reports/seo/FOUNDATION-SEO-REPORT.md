# LogiVN SEO Foundation Report

Generated: 2026-05-08T10:02:50.581Z
Score: 100/100

| Area | Status | Confidence | Finding | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| crawlability | PASS | CONFIRMED | Production robots route exists. | app/robots.ts exists | Keep private SaaS, dashboard, auth and API routes blocked. |
| indexing | PASS | CONFIRMED | Production sitemap route exists. | app/sitemap.ts exists | Keep sitemap focused on indexable marketing URLs until tenant SEO policy is explicit. |
| geo | PASS | CONFIRMED | AI search guidance file exists. | app/llms.txt/route.ts exists | Update llms.txt when product positioning, pricing or public pages change. |
| indexing | PASS | CONFIRMED | Dashboard route group has noindex metadata. | app/dashboard/layout.tsx exists and imports noIndexMetadata | Do not override this in child dashboard routes. |
| schema | PASS | CONFIRMED | Organization, WebSite and SoftwareApplication JSON-LD are emitted server-side. | components/seo/site-json-ld.tsx exists and uses next-seo JSON-LD helpers | Validate schema in CI after every schema change. |
| validation | PASS | CONFIRMED | Lighthouse CI thresholds are configured for SEO, performance and accessibility. | lighthouserc.cjs exists | Keep thresholds aligned with release risk. |
