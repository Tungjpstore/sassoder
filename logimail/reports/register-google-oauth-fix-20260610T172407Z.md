# LogiMail register and Google OAuth fix - 20260610T172407Z

## Scope

- Restored a visible public registration flow for LogiMail.
- Replaced the old `/register -> /auth/invite` redirect with the real registration view.
- Added `/auth/register` as the canonical registration route.
- Added an email/password signup form that creates a Supabase Auth user and, when a session is available, posts a LogiMail account approval request to `/api/logimail/account/request`.
- Added Google OAuth entry from the registration form and kept Google login on the login form.
- Added a login-page link to the registration route.

## Files updated

- `apps/logimail-web/src/components/auth-forms.tsx`
- `apps/logimail-web/src/components/logimail-pages.tsx`
- `apps/logimail-web/src/app/auth/register/page.tsx`
- `apps/logimail-web/src/app/register/page.tsx`
- `apps/logimail-web/src/styles/globals.css`
- `apps/logimail-web/scripts/smoke-api-routes.ts`
- `README_DEPLOYMENT.md`
- `apps/logimail-web/README_UI.md`

## Production deploy

- Staged from `/opt/logimail` into `/tmp/logimail-register-release`.
- Applied only the auth/register patch files to staging.
- Ran production staging checks and build before swap.
- Backed up existing source to `/root/logimail-backups/source-before-register-oauth-20260610T172407Z.tgz`.
- Swapped staging into `/opt/logimail`.
- Restarted `logimail-api.service` and `logimail-web.service`.

## Validation

Local:

```text
npm run check -> passed
next build --webpack -> produced BUILD_ID mwa5yy9aaZjUKAPYKL9Lp
Playwright on local next start:
  /auth/register shows title, email/password fields, Google button
  /auth/login shows registration link
  Google OAuth redirects to accounts.google.com
```

Production staging:

```text
npm run check -> passed
next build --webpack -> produced BUILD_ID h2KPrEfWBbygarif76Sj-
```

Production after deploy:

```text
GET /auth/register        -> 200
GET /register             -> 200
GET /auth/login           -> 200
GET /api/logimail/health  -> 200 ok=true
logimail-web.service      -> active
logimail-api.service      -> active
nginx                     -> active
npm run check in /opt/logimail -> passed
```

Production Playwright:

```text
/auth/register has visible registration form: title=true, emailInputs=1, passwordInputs=2, Google button=1
/auth/login has register link: true
mobile width check: scrollWidth=390, innerWidth=390
Google OAuth redirect host: accounts.google.com
```

Screenshot:

```text
/Users/tunbee27/Documents/New project/.codex-artifacts/logimail-ui/register-prod-mobile-20260611.png
```
