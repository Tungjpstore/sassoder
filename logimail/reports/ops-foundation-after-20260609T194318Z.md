# LogiMail Ops Foundation Report

Generated at: 2026-06-09T19:43:18Z

## Scope Completed

This report records the approved production foundation work for LogiMail on `mail.logivn.com`.

Completed changes:

- Ran the LogiMail Supabase MVP migration on Supabase project `tfhqatvevbrbzaaqjhfa` (`qr-restaurant-saas`).
- Exposed the Supabase Data API schema/table surface needed by LogiMail metadata.
- Added Cloudflare exact DNS record `A mail.logivn.com -> 103.199.19.144` with proxy disabled (`DNS only`).
- Set GreenCloud IPv4 reverse DNS/PTR for `103.199.19.144` to `mail.logivn.com`.

Explicitly unchanged:

- Root MX for `logivn.com` remains on Cloudflare Email Routing.
- Root SPF remains `v=spf1 include:_spf.mx.cloudflare.net ~all`.
- Root DMARC/DKIM cutover records were not changed.
- BillionMail containers were not installed or started in this pass.

## Supabase

Project:

```text
ref:    tfhqatvevbrbzaaqjhfa
name:   qr-restaurant-saas
region: ap-southeast-1
```

Migration applied:

```text
logimail/supabase/migrations/20260609000000_logimail_mvp_schema.sql
```

Verification summary from `supabase db query --linked`:

- Schemas exist: `logimail`, `logimail_private`.
- `logimail` tables exist: `audit_logs`, `domains`, `email_send_logs`, `mailbox_permissions`, `mailboxes`, `profiles`, `quotas`, `workspace_members`, `workspaces`.
- RLS is enabled on all 9 `logimail` tables.
- `rls_disabled` returned `[]`.
- Policy count for `logimail`: `18`.
- No `anon` grants were present for `logimail` or `logimail_private` tables.
- `authenticated` and `service_role` table grants exist for the `logimail` metadata tables.

Supabase Data API dashboard state after save:

```text
3 of 5 schemas exposed
69 of 150 tables exposed
41 of 80 functions exposed
```

Data API changes:

- Added exposed schema `logimail`.
- Did not expose `logimail_private`.
- Added the 9 `logimail.*` metadata tables to the exposed table list.

REST smoke checks using local Supabase keys:

```text
GET /rest/v1/profiles?select=id&limit=1 with Accept-Profile: logimail and service role -> 200 []
GET /rest/v1/profiles?select=id&limit=1 with Accept-Profile: logimail and anon key -> 401 permission denied for schema logimail
```

## Cloudflare DNS

Cloudflare dashboard table after save showed:

```text
mail.logivn.com A 103.199.19.144 DNS only Auto
```

Public DNS verification:

```text
dig +short mail.logivn.com A
103.199.19.144
```

Root mail routing remained unchanged:

```text
dig +short logivn.com MX
50 route1.mx.cloudflare.net.
95 route3.mx.cloudflare.net.
16 route2.mx.cloudflare.net.
```

Root TXT remained unchanged for SPF:

```text
"v=spf1 include:_spf.mx.cloudflare.net ~all"
```

## GreenCloud rDNS / PTR

GreenCloud Network panel after update showed the IPv4 row:

```text
103.199.19.144 mail.logivn.com 103.199.16.1 255.255.252.0 8.8.8.8 8.8.4.4
```

Resolver checks at report time:

```text
dig @1.1.1.1 +short -x 103.199.19.144 -> mail.logivn.com.
dig @8.8.8.8 +short -x 103.199.19.144 -> mail.logivn.com.
dig +short -x 103.199.19.144          -> no answer yet
dig @9.9.9.9 +short -x 103.199.19.144 -> no answer yet
```

PTR is configured in the provider panel and visible on major resolvers `1.1.1.1` and `8.8.8.8`; some resolvers were still propagating at the time of this report.

## VPS Smoke

SSH smoke check:

```text
host: vps01.logivn.com
sudo: passwordless sudo ok
uptime: up 16 days
```

Mail/BillionMail planned ports checked in the smoke command had no active listeners at this stage, matching the fact that BillionMail was not started yet.

## Remaining Before Mail Cutover

Do these only after a separate cutover window and verification plan:

- Install and start BillionMail in shared-VPS mode.
- Add `logivn.com` domain inside BillionMail and create the first internal mailboxes.
- Generate DKIM from BillionMail and add the exact DKIM TXT record.
- Verify outbound port 25 with the provider and live SMTP tests.
- Create `postmaster@logivn.com` and `abuse@logivn.com`.
- Test inbound/outbound mail with Gmail Show Original.
- Only after successful tests, change root MX/SPF/DMARC away from Cloudflare Email Routing.
