# LogiMail domain and DNS onboarding v2

## Safety contract

- A workspace may request multiple domains, but a domain already active or pending anywhere in LogiMail is rejected.
- Every request receives a unique TXT challenge at `_logimail-challenge.<domain>`.
- Admin approval fails closed until the ownership TXT has been observed through public DNS.
- Cloudflare zone IDs and DNS plans are server-managed. Client-supplied `zoneId`, `targetDomain`, or `planned` values are rejected.
- `GET /api/logimail/admin/domains/:id/dns-provision` is read-only and returns the zone, record-ID diff, policy findings, preview digest, and rollback preview.
- `POST /api/logimail/admin/domains/:id/dns-provision` requires the latest `expectedPreviewDigest`. A changed DNS snapshot returns `409` and performs no write.
- Duplicate SPF, DMARC, MTA-STS, or conflicting records block automation. LogiMail never guesses which production record should be deleted.
- No production DNS change was applied as part of this implementation.

## User flow

1. `POST /api/logimail/domains/request` with `workspaceId`, `domain`, and optional `mailHostname`.
2. Publish the returned `ownershipRecord` exactly as shown.
3. `POST /api/logimail/domains/request/:requestId/ownership` until the response is `ready_for_admin_approval`.
4. Admin reviews the request and approves it.
5. Admin loads the DNS preview, reviews record IDs and findings, then confirms using the preview digest.
6. Run the auth check after propagation. It validates SPF cardinality, exact active DKIM key and RSA strength, DMARC policy/reporting, MTA-STS DNS plus HTTPS policy, TLS-RPT, MX, and PTR.

## Cloudflare configuration

Required server environment:

- `CLOUDFLARE_API_TOKEN`: token limited to Zone Read and DNS Edit for managed customer zones.
- `LOGIMAIL_VPS_IP`: IPv4 used by the generated mail-host A and SPF records.
- `CLOUDFLARE_ZONE_ID`: optional legacy fallback only. Multi-domain discovery looks up the matching active zone by name and validates domain scope.

The token must not be exposed as `NEXT_PUBLIC_*`. For organizations that do not want DNS Edit, a Zone Read token still supports inventory/preview but confirmation will fail closed at Cloudflare.

## Generated baseline

- Mail host `A` with Cloudflare proxy disabled when the mail host belongs to the managed domain. A shared host such as `mail.logivn.com` is referenced by MX but is never written into a customer's zone.
- Root `MX` to the domain mail host.
- One SPF record for LogiMail's MX and sending IP.
- DMARC in monitoring mode with aggregate reports and failure reporting enabled.
- MTA-STS TXT policy signal.
- TLS-RPT aggregate report record.
- Active DKIM selector is added separately after generating or importing an RSA key of at least 2048 bits.

MTA-STS is only healthy when `https://mta-sts.<domain>/.well-known/mta-sts.txt` serves a valid policy containing `version`, `mode`, `mx`, and `max_age`. DNS automation does not create that HTTPS endpoint or alter Vercel domains implicitly.

## Rollback metadata

Every successful confirmation returns and audits ordered rollback actions:

- `delete_created`: delete a record created in the change, using its returned Cloudflare record ID.
- `restore_updated`: restore the complete previous record body using its original record ID.

Rollback is metadata only in this release. It is intentionally not executed automatically because a second operator or provider may have changed DNS after the apply.

## Database impact

No schema migration is required. Ownership state and challenge details use the existing `domain_requests.metadata`; the existing `risk_flags` array carries `ownership_unverified`; DNS plans continue to use `domain_requests.dns_plan`.

Older pending requests without ownership metadata cannot be approved. Recreate those requests to issue a challenge, or perform a separately audited manual migration after verifying ownership.
