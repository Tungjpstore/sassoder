# LogiVN Restore Runbook

## Prerequisites

Run restore from a controlled ops host with `aws`, `openssl`, `pg_restore`, and `psql` installed.

Required env:

```bash
export R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
export R2_BUCKET="logivn-backups"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export BACKUP_ENCRYPTION_KEY="..."
export BACKUP_METADATA_SIGNING_KEY="..."
export RESTORE_TEST_DATABASE_URL="postgresql://...staging..."
```

## Select Backup

```bash
aws --endpoint-url "$R2_ENDPOINT" s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "logivn/prod/postgres/" \
  --query 'sort_by(Contents[?ends_with(Key, `.enc`)], &LastModified)[-10].[LastModified,Key,Size]' \
  --output table
```

Pick the newest backup whose metadata exists and whose job row is `success` or `warn` with all critical artifacts verified.

## Download And Verify

```bash
OBJECT_KEY="logivn/prod/postgres/daily/YYYY-MM-DD/postgres_HHMMSS.dump.enc"
aws --endpoint-url "$R2_ENDPOINT" s3api get-object --bucket "$R2_BUCKET" --key "$OBJECT_KEY" postgres.dump.enc
aws --endpoint-url "$R2_ENDPOINT" s3api get-object --bucket "$R2_BUCKET" --key "$OBJECT_KEY.metadata.json" postgres.dump.enc.metadata.json
aws --endpoint-url "$R2_ENDPOINT" s3api get-object --bucket "$R2_BUCKET" --key "$OBJECT_KEY.metadata.sig" postgres.dump.enc.metadata.sig

sha256sum postgres.dump.enc
grep '"sha256"' postgres.dump.enc.metadata.json

EXPECTED_SIG=$(cat postgres.dump.enc.metadata.sig | tr -d '[:space:]')
ACTUAL_SIG=$(openssl dgst -sha256 -hmac "$BACKUP_METADATA_SIGNING_KEY" postgres.dump.enc.metadata.json | awk '{print $NF}')
test "$EXPECTED_SIG" = "$ACTUAL_SIG"
```

If checksum or signature mismatches, stop and select another backup.

## Decrypt

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in postgres.dump.enc \
  -out postgres.dump

pg_restore --list postgres.dump | head -40
```

## Staging Restore

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$RESTORE_TEST_DATABASE_URL" \
  postgres.dump

psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('restaurants','orders','payments','reservations','users','audit_logs')
order by table_name;
SQL
```

Run app smoke checks against staging before touching production.

## Production Restore Gate

Production restore requires:

- staging restore passed
- selected object key, checksum, and metadata signature recorded
- explicit incident lead approval
- platform audit log entry
- rollback copy of current production state when technically possible

Production command is the same `pg_restore` shape but points at the approved production maintenance target. Keep services in maintenance mode while restoring.

## Redis Restore

Redis is not the source of truth. Restore only when queue/retry continuity is needed.

```bash
OBJECT_KEY="logivn/prod/redis/daily/YYYY-MM-DD/redis_aof_HHMMSS.tar.gz.enc"
# Download, verify metadata, decrypt as above.
tar tzf redis_aof.tar.gz | head
# Restore into the Redis Docker volume only during a maintenance window.
```

## Supabase Storage Payload Restore

Storage payload backups are tar archives after decrypting the `storage_payload` artifact. Use them to inspect or re-upload bucket objects after Postgres ownership and tenant records have been restored.

```bash
OBJECT_KEY="logivn/prod/storage_payload/weekly/YYYY-MM-DD/storage_payload_HHMMSS.tar.gz.enc"
# Download, verify metadata/signature, and decrypt as above.
tar tzf storage_payload.tar.gz | head -40
mkdir -p storage_payload_restore
tar xzf storage_payload.tar.gz -C storage_payload_restore
cat storage_payload_restore/manifest.json | head -80
```

Files are stored under `buckets/<encoded bucket>/<encoded object path>`. Re-upload only the approved buckets, and keep the manifest with the incident record.

## VPS Config Restore

```bash
OBJECT_KEY="logivn/prod/vps_configs/daily/YYYY-MM-DD/vps_configs_HHMMSS.tar.gz.enc"
# Download, verify metadata, decrypt as above.
tar tzf vps_configs.tar.gz
```

Apply configs manually and compare diffs before replacing live files.
