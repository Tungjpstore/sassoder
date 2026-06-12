# LogiMail UI real-data routing deploy - 20260610T141926Z

## Scope

- Completed the interrupted `mail.logivn.com` production verification after the UI/real-data deploy.
- Fixed production routing so authenticated LogiMail product API routes reach the Next.js app instead of the lightweight ops API service.
- Kept `/api/logimail/health` on `logimail-api` for independent operational health checks.

## Files updated

- `infra/vps/nginx-mail-logivn.conf.example`
- `README_DEPLOYMENT.md`
- `apps/logimail-web/README_UI.md`
- `apps/logimail-web/scripts/smoke-api-routes.ts`

## Production change

- Backed up nginx config to `/root/logimail-backups/nginx-mail-logivn-before-next-api-20260610T141652Z.conf`.
- Installed the updated `mail-logivn.conf` on the VPS.
- Ran `nginx -t` successfully.
- Reloaded `nginx` successfully.
- Synced the changed source files into `/opt/logimail`.
- Updated the UI handoff doc from the old prototype-data language to the current real-data Supabase/approval-flow architecture.

## Validation

Local `/Users/tunbee27/Documents/New project/logimail`:

```text
npm run check -> passed
```

Production `/opt/logimail`:

```text
npm run check -> passed
```

Public smoke checks after nginx reload:

```text
GET  /api/logimail/health              -> 200 ok=true, service=logimail-api
GET  /dashboard                        -> 307 auth gate
GET  /auth/login                       -> 200
GET  /domains/new                      -> 307 auth gate
GET  /mailboxes/new                    -> 307 auth gate
GET  /roundcube/                       -> 200
POST /api/logimail/domains/request     -> 401 unauthorized without Supabase JWT
POST /api/logimail/mailboxes/request   -> 401 unauthorized without Supabase JWT
```

Service status after deploy:

```text
logimail-web.service -> active
logimail-api.service -> active
nginx                -> active
```

Journal check after reload showed no new `logimail-web` or `logimail-api` errors.

Prototype-data scan after documentation cleanup:

```text
apps/logimail-web/src -> no mock/fake data references
apps/logimail-web/README_UI.md -> no mock/fake data references
apps/logimail-web/scripts/smoke-api-routes.ts -> fake-token only for auth-boundary negative test
```
