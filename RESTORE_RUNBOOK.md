# LogiVN Restore Runbook

## Prerequisites

Run restore from a controlled ops host with `curl`, `node`, `openssl`, `pg_restore`, and `psql` installed. The production path uses the Cloudflare Worker R2 gateway, not AWS services. The VPS scheduled restore test uses `BACKUP_RESTORE_TEST_MODE=docker`, which restores the archive into an ephemeral Postgres container, verifies critical app tables in `BACKUP_RESTORE_TEST_SCHEMA`, and removes the container after schema and row-count checks pass.

Required env:

```bash
export BACKUP_R2_GATEWAY_URL="https://logivn-backup-r2-gateway.<account-subdomain>.workers.dev"
export BACKUP_R2_GATEWAY_TOKEN="..."
export BACKUP_ENCRYPTION_KEY="..."
export BACKUP_METADATA_SIGNING_KEY="..."
export RESTORE_TEST_DATABASE_URL="postgresql://...staging..."
export BACKUP_RESTORE_TEST_MODE="docker"
export BACKUP_RESTORE_TEST_SCHEMA="public"
export BACKUP_RESTORE_CRITICAL_TABLES="restaurants,orders,payments,reservations"
export BACKUP_RESTORE_TEST_STRICT="false"
```

Helper functions:

```bash
r2_get() {
  local key=$1
  local out=$2
  curl -fsS "$BACKUP_R2_GATEWAY_URL/objects/$key" \
    -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN" \
    -o "$out"
}

r2_list_postgres() {
  curl -fsS "$BACKUP_R2_GATEWAY_URL/objects?prefix=logivn/prod/postgres/" \
    -H "Authorization: Bearer $BACKUP_R2_GATEWAY_TOKEN" \
    | node -e '
        let input = "";
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const body = JSON.parse(input);
          for (const object of body.objects || []) {
            if (object.key.endsWith(".enc")) {
              process.stdout.write(`${object.uploaded}\t${object.size}\t${object.key}\n`);
            }
          }
        });
      '
}
```

## Select Backup

```bash
r2_list_postgres | sort | tail -10
```

Pick the newest backup whose metadata exists and whose job row is `success` or `warn` with all critical artifacts verified.

## Download And Verify

```bash
OBJECT_KEY="logivn/prod/postgres/daily/YYYY-MM-DD/postgres_HHMMSS.dump.enc"
r2_get "$OBJECT_KEY" postgres.dump.enc
r2_get "$OBJECT_KEY.metadata.json" postgres.dump.enc.metadata.json
r2_get "$OBJECT_KEY.metadata.sig" postgres.dump.enc.metadata.sig

sha256sum postgres.dump.enc
grep '"sha256"' postgres.dump.enc.metadata.json

EXPECTED_SIG=$(tr -d '[:space:]' < postgres.dump.enc.metadata.sig)
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

The automated VPS restore test should be run first because it does not require a staging database and never points at production:

```bash
APP_ROOT=/opt/logivn /opt/logivn/app/infra/vps/scripts/backup.sh --restore-test
```

For a dedicated staging database, switch to `BACKUP_RESTORE_TEST_MODE=restore` and set `RESTORE_TEST_DATABASE_URL` to the approved non-production target. Keep `BACKUP_RESTORE_TEST_STRICT=false` for ephemeral Docker checks because managed Supabase dumps can include extension or platform objects that are irrelevant to app-owned `public` tables; set it to `true` only when the restore target has all required platform extensions.

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
# Download with r2_get, verify metadata/signature, decrypt as above.
tar tzf redis_aof.tar.gz | head
# Restore into the Redis Docker volume only during a maintenance window.
```

## Supabase Storage Payload Restore

Storage payload backups are tar archives after decrypting the `storage_payload` artifact. Use them to inspect or re-upload bucket objects after Postgres ownership and tenant records have been restored.

```bash
OBJECT_KEY="logivn/prod/storage_payload/weekly/YYYY-MM-DD/storage_payload_HHMMSS.tar.gz.enc"
# Download with r2_get, verify metadata/signature, and decrypt as above.
tar tzf storage_payload.tar.gz | head -40
mkdir -p storage_payload_restore
tar xzf storage_payload.tar.gz -C storage_payload_restore
head -80 storage_payload_restore/manifest.json
```

Files are stored under `buckets/<encoded bucket>/<encoded object path>`. Re-upload only the approved buckets, and keep the manifest with the incident record.

## VPS Config Restore

```bash
OBJECT_KEY="logivn/prod/vps_configs/daily/YYYY-MM-DD/vps_configs_HHMMSS.tar.gz.enc"
# Download with r2_get, verify metadata/signature, and decrypt as above.
tar tzf vps_configs.tar.gz
```

Apply configs manually and compare diffs before replacing live files.

## Future S3-Compatible Adapter

If LogiVN later adds `BACKUP_STORAGE_ADAPTER=s3`, install and configure an S3-compatible CLI on the ops host for that adapter only. The current production runbook intentionally avoids AWS services and AWS credentials.
