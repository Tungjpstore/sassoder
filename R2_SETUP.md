# Cloudflare R2 Backup Setup

## Bucket

Create a private bucket, for example:

```txt
logivn-backups
```

Do not enable public bucket access for backup data. Cloudflare documents public buckets as exposing bucket contents directly to the Internet, which is not appropriate for encrypted production backups that still contain customer data metadata.

## Preferred Adapter: Worker Gateway

Use the Cloudflare Worker gateway when the operator account can deploy Workers but should not mint long-lived R2 S3 keys for the VPS. The gateway binds directly to the private `logivn-backups` bucket and requires `Authorization: Bearer <BACKUP_R2_GATEWAY_TOKEN>` for every endpoint.

Deploy from the repo root:

```bash
export CLOUDFLARE_ACCOUNT_ID="ef250a88911fd24073cb73d1c07e0218"
openssl rand -base64 48 > /tmp/logivn-backup-r2-gateway-token
npx wrangler secret put BACKUP_R2_GATEWAY_TOKEN \
  --config infra/cloudflare/backup-r2-gateway/wrangler.jsonc < /tmp/logivn-backup-r2-gateway-token
npx wrangler deploy --config infra/cloudflare/backup-r2-gateway/wrangler.jsonc
```

Configure the VPS:

```env
BACKUP_STORAGE_ADAPTER=worker
BACKUP_R2_GATEWAY_URL=https://logivn-backup-r2-gateway.<account-subdomain>.workers.dev
BACKUP_R2_GATEWAY_TOKEN=<same generated token>
R2_BUCKET=logivn-backups
BACKUP_R2_PREFIX=logivn
```

Smoke test:

```bash
printf 'logivn-r2-smoke' > /tmp/logivn-r2-smoke.txt
curl -fsS -X PUT "$BACKUP_R2_GATEWAY_URL/objects/logivn/prod/smoke/gateway.txt" \
  -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary @/tmp/logivn-r2-smoke.txt
curl -fsSI "$BACKUP_R2_GATEWAY_URL/objects/logivn/prod/smoke/gateway.txt" \
  -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN"
curl -fsS "$BACKUP_R2_GATEWAY_URL/objects?prefix=logivn/prod/smoke/" \
  -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN"
curl -fsS -X DELETE "$BACKUP_R2_GATEWAY_URL/objects/logivn/prod/smoke/gateway.txt" \
  -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN"
```

## Future Adapter: S3-Compatible Credentials

This is not part of the current production path. Keep it only as an expansion option if LogiVN later needs a portable S3-compatible adapter.

## Endpoint And Region

The S3-compatible endpoint format is:

```txt
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Use `auto` for `R2_REGION` and the S3-compatible client's region value.

## API Token

Create a bucket-scoped token for backup operations. Keep it separate from app asset tokens.

Minimum operational capability:

- put object
- get/head object
- list object
- delete object for retention cleanup

Store the credentials only in server/VPS env:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=logivn-backups
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_REGION=auto
BACKUP_R2_PREFIX=logivn
```

## Supabase Storage Payload

Storage payload export is encrypted and uploaded as `storage_payload` artifacts. It runs for `weekly`, `monthly`, and `manual` backups by default; daily backups still upload the bucket manifest only.

```env
BACKUP_STORAGE_PAYLOAD_ENABLED=auto
BACKUP_STORAGE_PAYLOAD_MODES=weekly,monthly,manual
BACKUP_STORAGE_BUCKETS=
BACKUP_STORAGE_EXCLUDE_BUCKETS=
BACKUP_STORAGE_LIST_LIMIT=1000
BACKUP_STORAGE_MAX_OBJECTS=50000
BACKUP_STORAGE_MAX_BYTES=0
```

Use `BACKUP_STORAGE_BUCKETS` to include only critical buckets, or `BACKUP_STORAGE_EXCLUDE_BUCKETS` to skip generated/public asset buckets. `BACKUP_STORAGE_MAX_BYTES=0` means no byte cap.

## Future S3-Compatible Smoke Test

Run this only if `BACKUP_STORAGE_ADAPTER=s3` is enabled later and the ops host has an S3-compatible CLI installed. Do not install this tooling for the default Worker gateway path.

```bash
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

aws --endpoint-url "$R2_ENDPOINT" s3api head-bucket --bucket "$R2_BUCKET"
aws --endpoint-url "$R2_ENDPOINT" s3api put-object \
  --bucket "$R2_BUCKET" \
  --key "logivn/prod/smoke/$(date -u +%Y%m%dT%H%M%SZ).txt" \
  --body /etc/hostname
```

## Lifecycle

The backup executor performs prefix cleanup, but configure bucket lifecycle too as a second guardrail. Suggested rules:

- `logivn/prod/*/daily/`: expire after 7 to 14 days
- `logivn/prod/*/weekly/`: expire after 56 to 70 days
- `logivn/prod/*/monthly/`: expire after 365 to 400 days
- abort incomplete multipart uploads after 7 days

Cloudflare R2 lifecycle rules can be managed in the dashboard or Wrangler. R2 lifecycle behavior may remove objects within a delay window after expiration, so do not rely on lifecycle timing as the only retention signal.

## References

- R2 overview: https://developers.cloudflare.com/r2/
- S3 API compatibility for future adapters: https://developers.cloudflare.com/r2/api/s3/api/
- Object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/
