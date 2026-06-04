# Cloudflare R2 Backup Setup

## Bucket

Create a private bucket, for example:

```txt
logivn-backups
```

Do not enable public bucket access for backup data. Cloudflare documents public buckets as exposing bucket contents directly to the Internet, which is not appropriate for encrypted production backups that still contain customer data metadata.

## Endpoint And Region

The S3-compatible endpoint format is:

```txt
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Use `auto` for `R2_REGION` / `AWS_DEFAULT_REGION`.

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

## AWS CLI Smoke Test

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

Cloudflare R2 lifecycle rules can be managed in the dashboard, Wrangler, or S3 API. R2 lifecycle behavior may remove objects within a delay window after expiration, so do not rely on lifecycle timing as the only retention signal.

## References

- R2 overview: https://developers.cloudflare.com/r2/
- S3 API compatibility: https://developers.cloudflare.com/r2/api/s3/api/
- Object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/
