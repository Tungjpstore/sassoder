#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}

MODE="daily"
CLAIM_MANUAL="false"
RESTORE_TEST_ONLY="false"
DRY_RUN="false"
MANUAL_ACTOR=${MANUAL_ACTOR:-manual}
MANUAL_REASON=${MANUAL_REASON:-manual backup requested}

if [ "${LOGIVN_BACKUP_SKIP_MAIN:-false}" != "true" ]; then
  while [ $# -gt 0 ]; do
    case "$1" in
      --daily) MODE="daily" ;;
      --weekly) MODE="weekly" ;;
      --monthly) MODE="monthly" ;;
      --manual) MODE="manual" ;;
      --claim-manual) MODE="manual"; CLAIM_MANUAL="true" ;;
      --restore-test) MODE="monthly"; RESTORE_TEST_ONLY="true" ;;
      --dry-run) DRY_RUN="true" ;;
      --actor) shift; MANUAL_ACTOR=${1:-manual} ;;
      --reason) shift; MANUAL_REASON=${1:-manual backup requested} ;;
      *) printf 'Unknown backup option: %s\n' "$1" >&2; exit 64 ;;
    esac
    shift
  done
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

BACKUP_ENABLED=${BACKUP_ENABLED:-true}
BACKUP_ENVIRONMENT=${BACKUP_ENVIRONMENT:-${LOGIVN_ENV:-prod}}
BACKUP_TIMEZONE=${BACKUP_TIMEZONE:-Asia/Ho_Chi_Minh}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups}
BACKUP_TEMP_DIR=${BACKUP_TEMP_DIR:-$BACKUP_ROOT/tmp}
BACKUP_STATE_DIR=${BACKUP_STATE_DIR:-$BACKUP_ROOT/state}
BACKUP_LOCK_FILE=${BACKUP_LOCK_FILE:-$BACKUP_STATE_DIR/backup.lock}
BACKUP_TEMP_TTL_HOURS=${BACKUP_TEMP_TTL_HOURS:-72}
BACKUP_KEEP_FAILED_TEMP=${BACKUP_KEEP_FAILED_TEMP:-true}
BACKUP_RETENTION_DAILY=${BACKUP_RETENTION_DAILY:-7}
BACKUP_RETENTION_WEEKLY=${BACKUP_RETENTION_WEEKLY:-8}
BACKUP_RETENTION_MONTHLY=${BACKUP_RETENTION_MONTHLY:-12}
BACKUP_RETENTION_MANUAL=${BACKUP_RETENTION_MANUAL:-14}
BACKUP_R2_PREFIX=${BACKUP_R2_PREFIX:-logivn}
BACKUP_ENCRYPTION_ITERATIONS=${BACKUP_ENCRYPTION_ITERATIONS:-200000}
BACKUP_POSTGRES_ENABLED=${BACKUP_POSTGRES_ENABLED:-true}
BACKUP_POSTGRES_DUMP_RUNNER=${BACKUP_POSTGRES_DUMP_RUNNER:-docker}
BACKUP_POSTGRES_DOCKER_IMAGE=${BACKUP_POSTGRES_DOCKER_IMAGE:-postgres:17-alpine}
BACKUP_RESTORE_TEST_DOCKER_IMAGE=${BACKUP_RESTORE_TEST_DOCKER_IMAGE:-postgis/postgis:17-3.5-alpine}
BACKUP_RESTORE_TEST_DOCKER_PLATFORM=${BACKUP_RESTORE_TEST_DOCKER_PLATFORM:-}
BACKUP_REDIS_ENABLED=${BACKUP_REDIS_ENABLED:-true}
BACKUP_VPS_CONFIGS_ENABLED=${BACKUP_VPS_CONFIGS_ENABLED:-true}
BACKUP_STORAGE_MANIFEST_ENABLED=${BACKUP_STORAGE_MANIFEST_ENABLED:-true}
BACKUP_STORAGE_PAYLOAD_ENABLED=${BACKUP_STORAGE_PAYLOAD_ENABLED:-auto}
BACKUP_STORAGE_PAYLOAD_MODES=${BACKUP_STORAGE_PAYLOAD_MODES:-weekly,monthly,manual}
BACKUP_APPLICATION_METADATA_ENABLED=${BACKUP_APPLICATION_METADATA_ENABLED:-true}
BACKUP_RESTORE_TEST_ENABLED=${BACKUP_RESTORE_TEST_ENABLED:-true}
BACKUP_RESTORE_TEST_MODE=${BACKUP_RESTORE_TEST_MODE:-docker}
BACKUP_RESTORE_TEST_SCHEMA=${BACKUP_RESTORE_TEST_SCHEMA:-public}
BACKUP_RESTORE_CRITICAL_TABLES=${BACKUP_RESTORE_CRITICAL_TABLES:-restaurants,orders,payment_logs,reservations}
BACKUP_RESTORE_TEST_STRICT=${BACKUP_RESTORE_TEST_STRICT:-false}
DEV_TELEGRAM_ALERTS_ENABLED=${DEV_TELEGRAM_ALERTS_ENABLED:-true}
R2_REGION=${R2_REGION:-auto}
R2_BUCKET=${R2_BUCKET:-logivn-backups}
R2_ENDPOINT=${R2_ENDPOINT:-}
BACKUP_R2_GATEWAY_URL=${BACKUP_R2_GATEWAY_URL:-}
BACKUP_R2_GATEWAY_TOKEN=${BACKUP_R2_GATEWAY_TOKEN:-}
BACKUP_STORAGE_ADAPTER=${BACKUP_STORAGE_ADAPTER:-}
SUPABASE_REST_URL=${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}
HOSTNAME_SAFE=$(hostname 2>/dev/null || printf 'logivn-vps')
RUN_DATE=$(TZ="$BACKUP_TIMEZONE" date +%F)
RUN_TIME=$(TZ="$BACKUP_TIMEZONE" date +%H%M%S)
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
WORK_DIR="$BACKUP_TEMP_DIR/$RUN_ID"
RETENTION_CLASS="$MODE"
JOB_ID=""
TOTAL_BYTES=0
ARTIFACT_COUNT=0
ARTIFACT_FAILURES=0
JOB_CHECKSUM_SEED=""
JOB_CHECKSUM=""
RETENTION_APPLIED=false
VERIFY_STATUS="pending"
CHECKSUM_STATUS="pending"
FAILURE_STEP=""
FAILURE_MESSAGE=""
LOCK_FD=9
BACKUP_LOCK_DIR=""

if [ "$MODE" != "daily" ] && [ "$MODE" != "weekly" ] && [ "$MODE" != "monthly" ] && [ "$MODE" != "manual" ]; then
  printf 'Invalid backup mode: %s\n' "$MODE" >&2
  exit 64
fi

if [ -z "$R2_ENDPOINT" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

BACKUP_R2_GATEWAY_URL=${BACKUP_R2_GATEWAY_URL%/}
if [ -z "$BACKUP_STORAGE_ADAPTER" ]; then
  BACKUP_STORAGE_ADAPTER="worker"
fi
case "$BACKUP_STORAGE_ADAPTER" in
  worker|gateway|r2-gateway|r2_gateway) BACKUP_STORAGE_ADAPTER="worker" ;;
  s3|r2) BACKUP_STORAGE_ADAPTER="s3" ;;
esac

mkdir -p "$BACKUP_TEMP_DIR" "$BACKUP_STATE_DIR" "$BACKUP_ROOT"

log() {
  printf '[logivn-backup] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

json_escape() {
  local value=${1:-}
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/}
  value=${value//$'\t'/ }
  printf '%s' "$value"
}

json_string() {
  printf '"%s"' "$(json_escape "${1:-}")"
}

json_number() {
  local value=${1:-0}
  if [[ "$value" =~ ^[0-9]+$ ]]; then printf '%s' "$value"; else printf '0'; fi
}

bool_json() {
  case "${1:-false}" in true|1|yes|on) printf 'true' ;; *) printf 'false' ;; esac
}

extract_json_string() {
  local json=$1
  local field=$2
  printf '%s' "$json" | sed -n "s/.*\"$field\":\"\([^\"]*\)\".*/\1/p" | head -n 1
}

supabase_ready() {
  [ -n "$SUPABASE_REST_URL" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]
}

csv_contains() {
  local csv=$1
  local needle=$2
  local item
  local -a items
  IFS=',' read -r -a items <<< "$csv"

  for item in "${items[@]}"; do
    item=${item//[[:space:]]/}
    if [ "$item" = "$needle" ]; then return 0; fi
  done

  return 1
}

should_backup_storage_payload() {
  case "$BACKUP_STORAGE_PAYLOAD_ENABLED" in
    true|1|yes|on) return 0 ;;
    false|0|no|off) return 1 ;;
    auto|"") csv_contains "$BACKUP_STORAGE_PAYLOAD_MODES" "$MODE" ;;
    *) csv_contains "$BACKUP_STORAGE_PAYLOAD_MODES" "$MODE" ;;
  esac
}

supabase_request() {
  local method=$1
  local path=$2
  local body=${3:-}
  local url="${SUPABASE_REST_URL%/}/rest/v1/$path"

  if ! supabase_ready; then
    return 9
  fi

  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$url" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      --data "$body"
  else
    curl -fsS -X "$method" "$url" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json"
  fi
}

storage_request() {
  local path=$1
  if ! supabase_ready; then
    return 9
  fi
  curl -fsS "${SUPABASE_REST_URL%/}/storage/v1/$path" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
}

record_event() {
  local event_type=$1
  local severity=$2
  local step=$3
  local message=$4
  if [ -z "$JOB_ID" ] || ! supabase_ready; then return 0; fi
  local body
  body=$(printf '{"job_id":%s,"event_type":%s,"severity":%s,"step":%s,"message":%s,"metadata":{"worker":%s,"mode":%s}}' \
    "$(json_string "$JOB_ID")" \
    "$(json_string "$event_type")" \
    "$(json_string "$severity")" \
    "$(json_string "$step")" \
    "$(json_string "$message")" \
    "$(json_string "$HOSTNAME_SAFE")" \
    "$(json_string "$MODE")")
  supabase_request POST "backup_events" "$body" >/dev/null 2>&1 || true
}

create_job() {
  if ! supabase_ready; then
    log "Supabase REST env missing; backup will run without DB job record"
    return 0
  fi

  local trigger_source="cron"
  local actor="system"
  if [ "$MODE" = "manual" ]; then
    trigger_source="manual"
    actor="$MANUAL_ACTOR"
  fi

  local body response id
  body=$(printf '{"environment":%s,"backup_type":"full","retention_class":%s,"status":"running","trigger_source":%s,"triggered_by":%s,"worker_id":%s,"storage_provider":"cloudflare-r2","storage_bucket":%s,"storage_prefix":%s,"started_at":%s,"encrypted":true,"summary":{"reason":%s,"timezone":%s},"metadata":{"script":"infra/vps/scripts/backup.sh","runId":%s}}' \
    "$(json_string "$BACKUP_ENVIRONMENT")" \
    "$(json_string "$RETENTION_CLASS")" \
    "$(json_string "$trigger_source")" \
    "$(json_string "$actor")" \
    "$(json_string "$HOSTNAME_SAFE")" \
    "$(json_string "$R2_BUCKET")" \
    "$(json_string "$BACKUP_R2_PREFIX/$BACKUP_ENVIRONMENT")" \
    "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" \
    "$(json_string "$MANUAL_REASON")" \
    "$(json_string "$BACKUP_TIMEZONE")" \
    "$(json_string "$RUN_ID")")

  response=$(supabase_request POST "backup_jobs" "$body" 2>/dev/null || true)
  id=$(extract_json_string "$response" "id")
  if [ -n "$id" ]; then
    JOB_ID="$id"
    log "Created backup job $JOB_ID"
  else
    log "Could not create backup job record; continuing"
  fi
}

claim_manual_job() {
  if ! supabase_ready; then
    log "Cannot claim manual backup: Supabase REST env missing"
    exit 0
  fi

  local body response id retention actor
  body=$(printf '{"p_worker_id":%s}' "$(json_string "$HOSTNAME_SAFE")")
  response=$(supabase_request POST "rpc/claim_next_backup_job" "$body" 2>/dev/null || true)
  id=$(extract_json_string "$response" "id")

  if [ -z "$id" ]; then
    log "No queued manual backup job"
    exit 0
  fi

  retention=$(extract_json_string "$response" "retention_class")
  actor=$(extract_json_string "$response" "triggered_by")
  JOB_ID="$id"
  RETENTION_CLASS=${retention:-manual}
  MANUAL_ACTOR=${actor:-manual}
  log "Claimed manual backup job $JOB_ID"
}

update_job_status() {
  local status=$1
  local error_step=${2:-}
  local error_message=${3:-}
  if [ -z "$JOB_ID" ] || ! supabase_ready; then return 0; fi

  local finished duration body query
  finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  duration=0
  if [ -n "${STARTED_EPOCH:-}" ]; then
    duration=$(( $(date +%s) - STARTED_EPOCH ))
    duration=$(( duration * 1000 ))
  fi

  body=$(printf '{"status":%s,"finished_at":%s,"duration_ms":%s,"file_size":%s,"artifact_count":%s,"checksum":%s,"checksum_status":%s,"verify_status":%s,"retention_applied":%s,"error_step":%s,"error_message":%s,"summary":{"artifactFailures":%s,"mode":%s,"retentionClass":%s,"r2Bucket":%s,"r2Prefix":%s},"metadata":{"worker":%s,"runId":%s,"timezone":%s}}' \
    "$(json_string "$status")" \
    "$(json_string "$finished")" \
    "$(json_number "$duration")" \
    "$(json_number "$TOTAL_BYTES")" \
    "$(json_number "$ARTIFACT_COUNT")" \
    "$(json_string "${JOB_CHECKSUM:-}")" \
    "$(json_string "$CHECKSUM_STATUS")" \
    "$(json_string "$VERIFY_STATUS")" \
    "$(bool_json "$RETENTION_APPLIED")" \
    "$(json_string "$error_step")" \
    "$(json_string "$error_message")" \
    "$(json_number "$ARTIFACT_FAILURES")" \
    "$(json_string "$MODE")" \
    "$(json_string "$RETENTION_CLASS")" \
    "$(json_string "$R2_BUCKET")" \
    "$(json_string "$BACKUP_R2_PREFIX/$BACKUP_ENVIRONMENT")" \
    "$(json_string "$HOSTNAME_SAFE")" \
    "$(json_string "$RUN_ID")" \
    "$(json_string "$BACKUP_TIMEZONE")")
  query="backup_jobs?id=eq.$JOB_ID"
  supabase_request PATCH "$query" "$body" >/dev/null 2>&1 || true
}

record_artifact() {
  local artifact_type=$1
  local status=$2
  local object_key=$3
  local file_name=$4
  local file_size=$5
  local checksum=$6
  local signature=$7
  local error_message=${8:-}
  if [ -z "$JOB_ID" ] || ! supabase_ready; then return 0; fi

  local body
  body=$(printf '{"job_id":%s,"environment":%s,"artifact_type":%s,"status":%s,"storage_provider":"cloudflare-r2","storage_bucket":%s,"storage_path":%s,"storage_region":%s,"file_name":%s,"file_size":%s,"checksum":%s,"checksum_sha256":%s,"metadata_signature":%s,"encrypted":true,"compression":"artifact-specific","finished_at":%s,"error_message":%s,"metadata":{"retentionClass":%s,"storageAdapter":%s,"endpointConfigured":%s}}' \
    "$(json_string "$JOB_ID")" \
    "$(json_string "$BACKUP_ENVIRONMENT")" \
    "$(json_string "$artifact_type")" \
    "$(json_string "$status")" \
    "$(json_string "$R2_BUCKET")" \
    "$(json_string "$object_key")" \
    "$(json_string "$R2_REGION")" \
    "$(json_string "$file_name")" \
    "$(json_number "$file_size")" \
    "$(json_string "$checksum")" \
    "$(json_string "$checksum")" \
    "$(json_string "$signature")" \
    "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" \
    "$(json_string "$error_message")" \
    "$(json_string "$RETENTION_CLASS")" \
    "$(json_string "$BACKUP_STORAGE_ADAPTER")" \
    "$(storage_endpoint_configured_json)")
  supabase_request POST "backup_artifacts" "$body" >/dev/null 2>&1 || true
}

create_alert() {
  local alert_type=$1
  local severity=$2
  local title=$3
  local message=$4
  local rpo=${5:-high}
  if [ -z "$JOB_ID" ] || ! supabase_ready; then return 0; fi
  local body
  body=$(printf '{"job_id":%s,"alert_type":%s,"severity":%s,"status":"open","title":%s,"message":%s,"rpo_risk":%s,"metadata":{"worker":%s,"mode":%s}}' \
    "$(json_string "$JOB_ID")" \
    "$(json_string "$alert_type")" \
    "$(json_string "$severity")" \
    "$(json_string "$title")" \
    "$(json_string "$message")" \
    "$(json_string "$rpo")" \
    "$(json_string "$HOSTNAME_SAFE")" \
    "$(json_string "$MODE")")
  supabase_request POST "backup_alerts" "$body" >/dev/null 2>&1 || true
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    return 1
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_size() {
  if stat -c%s "$1" >/dev/null 2>&1; then
    stat -c%s "$1"
  else
    stat -f%z "$1"
  fi
}

validate_enabled() {
  if [ "$BACKUP_ENABLED" != "true" ]; then
    log "BACKUP_ENABLED is not true; exiting"
    exit 0
  fi
}

validate_runtime() {
  require_command openssl
  require_command curl
  require_command tar
  case "$BACKUP_STORAGE_ADAPTER" in
    worker)
      require_command node
      ;;
    s3)
      if [ "$DRY_RUN" != "true" ]; then require_command aws; fi
      ;;
    *)
      printf 'Invalid BACKUP_STORAGE_ADAPTER: %s\n' "$BACKUP_STORAGE_ADAPTER" >&2
      return 1
      ;;
  esac
  if [ "$BACKUP_POSTGRES_ENABLED" = "true" ] && [ "$RESTORE_TEST_ONLY" != "true" ]; then
    case "$BACKUP_POSTGRES_DUMP_RUNNER" in
      docker) require_command docker ;;
      local) require_command pg_dump ;;
      *) printf 'Invalid BACKUP_POSTGRES_DUMP_RUNNER: %s\n' "$BACKUP_POSTGRES_DUMP_RUNNER" >&2; return 1 ;;
    esac
  fi
  if [ "$BACKUP_RESTORE_TEST_ENABLED" = "true" ] && [ "$RESTORE_TEST_ONLY" = "true" ]; then
    case "$BACKUP_RESTORE_TEST_MODE" in
      docker|ephemeral)
        require_command docker
        ;;
      restore|list)
        case "$BACKUP_POSTGRES_DUMP_RUNNER" in
          docker) require_command docker ;;
          local) require_command pg_restore; if [ "$BACKUP_RESTORE_TEST_MODE" = "restore" ]; then require_command psql; fi ;;
          *) printf 'Invalid BACKUP_POSTGRES_DUMP_RUNNER: %s\n' "$BACKUP_POSTGRES_DUMP_RUNNER" >&2; return 1 ;;
        esac
        ;;
      *)
        printf 'Invalid BACKUP_RESTORE_TEST_MODE: %s\n' "$BACKUP_RESTORE_TEST_MODE" >&2
        return 1
        ;;
    esac
  fi
  if [ "$RESTORE_TEST_ONLY" != "true" ] && should_backup_storage_payload; then require_command node; fi

  local missing=()
  [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || missing+=(BACKUP_ENCRYPTION_KEY)
  [ -n "${BACKUP_METADATA_SIGNING_KEY:-}" ] || missing+=(BACKUP_METADATA_SIGNING_KEY)
  [ -n "${R2_BUCKET:-}" ] || missing+=(R2_BUCKET)
  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    [ -n "${BACKUP_R2_GATEWAY_URL:-}" ] || missing+=(BACKUP_R2_GATEWAY_URL)
    [ -n "${BACKUP_R2_GATEWAY_TOKEN:-}" ] || missing+=(BACKUP_R2_GATEWAY_TOKEN)
  else
    [ -n "${R2_ACCESS_KEY_ID:-}" ] || missing+=(R2_ACCESS_KEY_ID)
    [ -n "${R2_SECRET_ACCESS_KEY:-}" ] || missing+=(R2_SECRET_ACCESS_KEY)
    [ -n "${R2_ENDPOINT:-}" ] || missing+=(R2_ENDPOINT)
  fi
  if [ "$RESTORE_TEST_ONLY" != "true" ] && should_backup_storage_payload; then
    [ -n "$SUPABASE_REST_URL" ] || missing+=(SUPABASE_URL)
    [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || missing+=(SUPABASE_SERVICE_ROLE_KEY)
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    local missing_text
    missing_text=$(printf '%s ' "${missing[@]}")
    missing_text=${missing_text% }
    printf 'Missing backup env: %s\n' "$missing_text" >&2
    return 1
  fi

  if [ "$BACKUP_STORAGE_ADAPTER" = "s3" ]; then
    export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    export AWS_DEFAULT_REGION="$R2_REGION"
  fi
}

acquire_local_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$BACKUP_LOCK_FILE"
    if ! flock -n 9; then
      log "Another backup is running; exiting"
      exit 0
    fi
    return 0
  fi

  BACKUP_LOCK_DIR="${BACKUP_LOCK_FILE}.dir"
  if ! mkdir "$BACKUP_LOCK_DIR" 2>/dev/null; then
    log "Another backup is running; exiting"
    exit 0
  fi
}

release_local_lock() {
  if [ -n "${BACKUP_LOCK_DIR:-}" ]; then rm -rf "$BACKUP_LOCK_DIR"; fi
}

cleanup_old_temp() {
  find "$BACKUP_TEMP_DIR" -mindepth 1 -maxdepth 1 -type d -mmin "+$((BACKUP_TEMP_TTL_HOURS * 60))" -print -exec rm -rf {} + >/dev/null 2>&1 || true
}

sanitize_env_file() {
  local source=$1
  local target=$2
  if [ ! -f "$source" ]; then
    printf '# %s not found on this host\n' "$source" > "$target"
    return 0
  fi
  awk '
    BEGIN { IGNORECASE = 1 }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key=$0; sub(/=.*/, "", key);
      if (key ~ /(SECRET|TOKEN|PASSWORD|PASS|KEY|PRIVATE|CREDENTIAL|DATABASE_URL|REDIS_URL|WEBHOOK_SECRET|SESSION|PEPPER)/) {
        print key "=";
      } else {
        print;
      }
      next
    }
    { print "# stripped: non-standard env line" }
  ' "$source" > "$target"
}

encrypt_file() {
  local source=$1
  local encrypted="$source.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter "$BACKUP_ENCRYPTION_ITERATIONS" -md sha256 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$source" \
    -out "$encrypted"
  rm -f "$source"
  printf '%s' "$encrypted"
}

sign_metadata() {
  local metadata_file=$1
  openssl dgst -sha256 -hmac "$BACKUP_METADATA_SIGNING_KEY" "$metadata_file" | awk '{print $NF}'
}

write_metadata_file() {
  local artifact_type=$1
  local object_key=$2
  local encrypted_file=$3
  local checksum=$4
  local metadata_file=$5
  local size_bytes
  size_bytes=$(file_size "$encrypted_file")
  cat > "$metadata_file" <<EOF
{
  "schemaVersion": "logivn.backup.metadata.v1",
  "jobId": "${JOB_ID:-local-$RUN_ID}",
  "environment": "$(json_escape "$BACKUP_ENVIRONMENT")",
  "retentionClass": "$(json_escape "$RETENTION_CLASS")",
  "artifactType": "$(json_escape "$artifact_type")",
  "storageProvider": "cloudflare-r2",
  "bucket": "$(json_escape "$R2_BUCKET")",
  "objectKey": "$(json_escape "$object_key")",
  "fileName": "$(json_escape "$(basename "$encrypted_file")")",
  "sizeBytes": $size_bytes,
  "sha256": "$(json_escape "$checksum")",
  "encrypted": true,
  "encryption": {
    "algorithm": "AES-256-CBC",
    "kdf": "PBKDF2-SHA256",
    "iterations": $BACKUP_ENCRYPTION_ITERATIONS
  },
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "createdBy": "$(json_escape "$HOSTNAME_SAFE")"
}
EOF
}

object_key_for() {
  local artifact_type=$1
  local file_name=$2
  printf '%s/%s/%s/%s/%s/%s' "$BACKUP_R2_PREFIX" "$BACKUP_ENVIRONMENT" "$artifact_type" "$RETENTION_CLASS" "$RUN_DATE" "$file_name"
}

storage_endpoint_configured_json() {
  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    bool_json "${BACKUP_R2_GATEWAY_URL:+true}"
  else
    bool_json "${R2_ENDPOINT:+true}"
  fi
}

gateway_object_url() {
  local key=$1
  printf '%s/objects/%s' "$BACKUP_R2_GATEWAY_URL" "$key"
}

gateway_auth_header() {
  printf 'Authorization: Bearer %s' "$BACKUP_R2_GATEWAY_TOKEN"
}

put_object() {
  local object_key=$1
  local source_file=$2
  local content_type=${3:-application/octet-stream}
  local checksum=${4:-}
  local artifact_type=${5:-}
  local signature=${6:-}

  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    local -a headers
    headers=(-H "$(gateway_auth_header)" -H "Content-Type: $content_type")
    [ -n "$checksum" ] && headers+=(-H "X-Backup-Sha256: $checksum")
    [ -n "${JOB_ID:-}" ] && headers+=(-H "X-Backup-Job-Id: $JOB_ID")
    [ -n "$artifact_type" ] && headers+=(-H "X-Backup-Artifact-Type: $artifact_type")
    [ -n "$signature" ] && headers+=(-H "X-Backup-Metadata-Signature: $signature")
    curl -fsS -X PUT "$(gateway_object_url "$object_key")" \
      "${headers[@]}" \
      --data-binary "@$source_file" >/dev/null
    return 0
  fi

  local -a args
  args=(--endpoint-url "$R2_ENDPOINT" s3api put-object --bucket "$R2_BUCKET" --key "$object_key" --body "$source_file")
  [ -n "$content_type" ] && args+=(--content-type "$content_type")
  if [ -n "$checksum" ] || [ -n "$artifact_type" ] || [ -n "$signature" ]; then
    args+=(--metadata "sha256=$checksum,backup-job-id=${JOB_ID:-local},artifact-type=$artifact_type,metadata-signature=$signature")
  fi
  aws "${args[@]}" >/dev/null
}

head_object_size() {
  local object_key=$1

  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    curl -fsSI -H "$(gateway_auth_header)" "$(gateway_object_url "$object_key")" \
      | awk 'tolower($1) == "content-length:" { gsub("\r", "", $2); print $2; exit }'
    return 0
  fi

  aws --endpoint-url "$R2_ENDPOINT" s3api head-object \
    --bucket "$R2_BUCKET" \
    --key "$object_key" \
    --query ContentLength \
    --output text
}

get_object() {
  local object_key=$1
  local output_file=$2

  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    curl -fsS -H "$(gateway_auth_header)" "$(gateway_object_url "$object_key")" -o "$output_file"
    return 0
  fi

  aws --endpoint-url "$R2_ENDPOINT" s3api get-object --bucket "$R2_BUCKET" --key "$object_key" "$output_file" >/dev/null
}

delete_object() {
  local object_key=$1

  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    curl -fsS -X DELETE -H "$(gateway_auth_header)" "$(gateway_object_url "$object_key")" >/dev/null
    return 0
  fi

  aws --endpoint-url "$R2_ENDPOINT" s3api delete-object --bucket "$R2_BUCKET" --key "$object_key" >/dev/null
}

list_objects_for_prefix() {
  local prefix=$1

  if [ "$BACKUP_STORAGE_ADAPTER" = "worker" ]; then
    node - "$prefix" <<'NODE'
(async () => {
  const prefix = process.argv[2] || "";
  const baseUrl = process.env.BACKUP_R2_GATEWAY_URL;
  const token = process.env.BACKUP_R2_GATEWAY_TOKEN;
  let cursor = null;

  do {
    const url = new URL(`${baseUrl}/objects`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`R2 gateway list failed with HTTP ${response.status}`);
    }

    const body = await response.json();
    for (const object of body.objects || []) {
      process.stdout.write(`${object.uploaded}\t${object.key}\t${object.size}\n`);
    }
    cursor = body.truncated && body.cursor ? body.cursor : null;
  } while (cursor);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
    return 0
  fi

  aws --endpoint-url "$R2_ENDPOINT" s3api list-objects-v2 \
    --bucket "$R2_BUCKET" \
    --prefix "$prefix" \
    --output json \
    | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const parsed = input.trim() ? JSON.parse(input) : {};
  for (const object of parsed.Contents || []) {
    process.stdout.write(`${object.LastModified}\t${object.Key}\t${object.Size}\n`);
  }
});
'
}

upload_artifact() {
  local artifact_type=$1
  local source_file=$2
  local encrypted_file checksum size_bytes object_key metadata_file signature remote_size metadata_key signature_key
  encrypted_file=$(encrypt_file "$source_file")
  checksum=$(sha256_file "$encrypted_file")
  size_bytes=$(file_size "$encrypted_file")
  object_key=$(object_key_for "$artifact_type" "$(basename "$encrypted_file")")
  metadata_file="$encrypted_file.metadata.json"
  write_metadata_file "$artifact_type" "$object_key" "$encrypted_file" "$checksum" "$metadata_file"
  signature=$(sign_metadata "$metadata_file")
  printf '%s\n' "$signature" > "$metadata_file.sig"
  metadata_key="$object_key.metadata.json"
  signature_key="$object_key.metadata.sig"

  if [ "$DRY_RUN" = "true" ]; then
    log "DRY RUN: would upload $object_key ($size_bytes bytes)"
    record_artifact "$artifact_type" "created" "$object_key" "$(basename "$encrypted_file")" "$size_bytes" "$checksum" "$signature"
    return 0
  fi

  log "Uploading $artifact_type to R2: $object_key"
  put_object "$object_key" "$encrypted_file" "application/octet-stream" "$checksum" "$artifact_type" "$signature"
  put_object "$metadata_key" "$metadata_file" "application/json"
  put_object "$signature_key" "$metadata_file.sig" "text/plain"

  remote_size=$(head_object_size "$object_key")

  if [ "$remote_size" != "$size_bytes" ]; then
    ARTIFACT_FAILURES=$((ARTIFACT_FAILURES + 1))
    record_artifact "$artifact_type" "failed" "$object_key" "$(basename "$encrypted_file")" "$size_bytes" "$checksum" "$signature" "R2 size mismatch: $remote_size != $size_bytes"
    return 1
  fi

  TOTAL_BYTES=$((TOTAL_BYTES + size_bytes))
  ARTIFACT_COUNT=$((ARTIFACT_COUNT + 1))
  JOB_CHECKSUM_SEED="${JOB_CHECKSUM_SEED}${checksum}"
  JOB_CHECKSUM=$(printf '%s' "$JOB_CHECKSUM_SEED" | openssl dgst -sha256 | awk '{print $NF}')
  CHECKSUM_STATUS="ok"
  VERIFY_STATUS="ok"
  record_artifact "$artifact_type" "verified" "$object_key" "$(basename "$encrypted_file")" "$size_bytes" "$checksum" "$signature"
  record_event "artifact_uploaded" "info" "$artifact_type" "Uploaded and verified $artifact_type artifact"
}

postgres_dump_url_args() {
  if [ -n "${DATABASE_URL:-}" ]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi

  if [ -n "${SUPABASE_DB_HOST:-}" ] && [ -n "${SUPABASE_DB_USER:-}" ] && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
    printf 'postgresql://%s:%s@%s:%s/%s' \
      "$SUPABASE_DB_USER" \
      "$SUPABASE_DB_PASSWORD" \
      "$SUPABASE_DB_HOST" \
      "${SUPABASE_DB_PORT:-5432}" \
      "${SUPABASE_DB_NAME:-postgres}"
    return 0
  fi

  return 1
}

backup_postgres() {
  [ "$BACKUP_POSTGRES_ENABLED" = "true" ] || return 0
  record_event "artifact_started" "info" "postgres" "Starting PostgreSQL custom-format dump"
  local dump_file db_url
  dump_file="$WORK_DIR/postgres_${RUN_TIME}.dump"
  db_url=$(postgres_dump_url_args) || {
    printf 'DATABASE_URL or SUPABASE_DB_* env is required for Postgres backup\n' >&2
    return 1
  }

  if [ "$BACKUP_POSTGRES_DUMP_RUNNER" = "docker" ]; then
    docker run --rm \
      -e DATABASE_URL="$db_url" \
      -v "$WORK_DIR:/backup" \
      "$BACKUP_POSTGRES_DOCKER_IMAGE" \
      sh -c 'pg_dump --dbname "$DATABASE_URL" -F c --no-owner --no-acl --file "$1"' \
      sh "/backup/$(basename "$dump_file")"
  else
    pg_dump --dbname "$db_url" -F c --no-owner --no-acl --file "$dump_file"
  fi
  upload_artifact "postgres" "$dump_file"
}

backup_redis() {
  [ "$BACKUP_REDIS_ENABLED" = "true" ] || return 0
  record_event "artifact_started" "info" "redis" "Starting Redis AOF/RDB backup"
  local redis_archive
  redis_archive="$WORK_DIR/redis_aof_${RUN_TIME}.tar.gz"

  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" BGSAVE >/dev/null || true
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" BGREWRITEAOF >/dev/null || true
  sleep 3
  docker run --rm \
    -v logivn_redis-data:/data:ro \
    -v "$WORK_DIR:/backup" \
    alpine:3.20 \
    tar czf "/backup/$(basename "$redis_archive")" -C /data .
  upload_artifact "redis" "$redis_archive"
}

backup_vps_configs() {
  [ "$BACKUP_VPS_CONFIGS_ENABLED" = "true" ] || return 0
  record_event "artifact_started" "info" "vps_configs" "Starting sanitized VPS config backup"
  local config_dir archive
  config_dir="$WORK_DIR/vps-configs"
  archive="$WORK_DIR/vps_configs_${RUN_TIME}.tar.gz"
  mkdir -p "$config_dir"

  sanitize_env_file "$ENV_FILE" "$config_dir/env.template"
  cp -a "$VPS_DIR/docker-compose.yml" "$config_dir/docker-compose.yml"
  cp -a "$VPS_DIR/nginx" "$config_dir/nginx"
  cp -a "$VPS_DIR/redis/redis.conf" "$config_dir/redis.conf" 2>/dev/null || true
  cp -a "$VPS_DIR/scripts" "$config_dir/scripts"
  cp -a /etc/cron.d/logivn-vps "$config_dir/cron-logivn-vps" 2>/dev/null || true
  cp -a /etc/nginx/sites-available/logivn-vps.conf "$config_dir/nginx-active.conf" 2>/dev/null || true
  chmod -R go-rwx "$config_dir"
  tar czf "$archive" -C "$config_dir" .
  upload_artifact "vps_configs" "$archive"
}

backup_storage_manifest() {
  [ "$BACKUP_STORAGE_MANIFEST_ENABLED" = "true" ] || return 0
  record_event "artifact_started" "info" "storage_manifest" "Starting Supabase Storage manifest backup"
  local manifest buckets payload_active
  manifest="$WORK_DIR/supabase_storage_manifest_${RUN_TIME}.json"
  buckets="[]"
  payload_active=false
  if should_backup_storage_payload; then payload_active=true; fi
  if supabase_ready; then
    buckets=$(storage_request "bucket" 2>/dev/null || printf '[]')
  fi
  cat > "$manifest" <<EOF
{
  "schemaVersion": "logivn.storage-manifest.v1",
  "capturedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$(json_escape "$BACKUP_ENVIRONMENT")",
  "source": "supabase-storage",
  "adapterStatus": "manifest-plus-optional-payload",
  "syncTarget": "cloudflare-r2",
  "payloadBackup": {
    "enabled": "$(json_escape "$BACKUP_STORAGE_PAYLOAD_ENABLED")",
    "modes": "$(json_escape "$BACKUP_STORAGE_PAYLOAD_MODES")",
    "activeForRun": $payload_active
  },
  "buckets": $buckets,
  "note": "Object payload backup writes storage_payload artifacts for configured modes."
}
EOF
  upload_artifact "storage_manifest" "$manifest"
}

backup_storage_payload() {
  if ! should_backup_storage_payload; then return 0; fi
  record_event "artifact_started" "info" "storage_payload" "Starting Supabase Storage object payload backup"
  local export_dir manifest archive summary
  export_dir="$WORK_DIR/storage-payload"
  manifest="$WORK_DIR/storage_payload_manifest_${RUN_TIME}.json"
  archive="$WORK_DIR/storage_payload_${RUN_TIME}.tar.gz"

  mkdir -p "$export_dir"
  log "Exporting Supabase Storage object payloads for $MODE backup"
  if ! summary=$(node "$REPO_ROOT/scripts/infra/supabase-storage-export.mjs" --out "$export_dir" --manifest "$manifest"); then
    FAILURE_STEP="storage_payload"
    FAILURE_MESSAGE="Supabase Storage payload export failed"
    return 1
  fi

  cp "$manifest" "$export_dir/manifest.json"
  tar czf "$archive" -C "$export_dir" .
  log "Supabase Storage payload export totals: ${summary:-unknown}"
  upload_artifact "storage_payload" "$archive"
}

backup_application_metadata() {
  [ "$BACKUP_APPLICATION_METADATA_ENABLED" = "true" ] || return 0
  record_event "artifact_started" "info" "application_metadata" "Starting application metadata manifest backup"
  local manifest backup_settings platform_settings cron_logs
  manifest="$WORK_DIR/application_metadata_${RUN_TIME}.json"
  backup_settings="[]"
  platform_settings="[]"
  cron_logs="[]"
  if supabase_ready; then
    backup_settings=$(supabase_request GET "backup_settings?select=key,value,updated_at,updated_by" 2>/dev/null || printf '[]')
    platform_settings=$(supabase_request GET "platform_settings?select=key,updated_at,updated_by" 2>/dev/null || printf '[]')
    cron_logs=$(supabase_request GET "cron_run_logs?select=job_key,status,started_at,duration_ms&order=started_at.desc&limit=20" 2>/dev/null || printf '[]')
  fi
  cat > "$manifest" <<EOF
{
  "schemaVersion": "logivn.application-metadata.v1",
  "capturedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$(json_escape "$BACKUP_ENVIRONMENT")",
  "includes": ["backup_settings", "platform_settings_metadata", "cron_run_logs_recent"],
  "backupSettings": $backup_settings,
  "platformSettingsMetadata": $platform_settings,
  "cronRunLogsRecent": $cron_logs
}
EOF
  upload_artifact "application_metadata" "$manifest"
}

apply_retention_for_class() {
  local retention_class=$1
  local days=$2
  local cutoff prefix uploaded key size
  prefix="$BACKUP_R2_PREFIX/$BACKUP_ENVIRONMENT/"
  cutoff=$(date -u -d "$days days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"$days"d +%Y-%m-%dT%H:%M:%SZ)

  if [ "$DRY_RUN" = "true" ]; then
    log "DRY RUN: would prune R2 objects older than $cutoff for class $retention_class"
    return 0
  fi

  while IFS=$'\t' read -r uploaded key size; do
    [ -n "$key" ] || continue
    [[ "$key" == *"/$retention_class/"* ]] || continue
    if [[ "$uploaded" > "$cutoff" ]]; then continue; fi
    delete_object "$key" || true
  done < <(list_objects_for_prefix "$prefix" 2>/dev/null || true)
}

apply_retention() {
  record_event "retention_started" "info" "retention" "Applying backup retention"
  apply_retention_for_class daily "$BACKUP_RETENTION_DAILY"
  apply_retention_for_class weekly "$((BACKUP_RETENTION_WEEKLY * 7))"
  apply_retention_for_class monthly "$((BACKUP_RETENTION_MONTHLY * 31))"
  apply_retention_for_class manual "$BACKUP_RETENTION_MANUAL"
  RETENTION_APPLIED=true
  record_event "retention_completed" "info" "retention" "Retention cleanup completed"
}

latest_postgres_object_key() {
  list_objects_for_prefix "$BACKUP_R2_PREFIX/$BACKUP_ENVIRONMENT/postgres/" 2>/dev/null \
    | awk -F '\t' '$2 ~ /\.enc$/ { if ($1 >= latest) { latest=$1; key=$2 } } END { if (key != "") print key }' \
    || true
}

record_restore_test() {
  local status=$1
  local source_path=$2
  local message=$3
  local schema_verified=${4:-false}
  local row_count_verified=${5:-false}
  local critical_verified=${6:-false}
  if ! supabase_ready; then return 0; fi
  local body
  body=$(printf '{"job_id":%s,"environment":%s,"status":%s,"triggered_by":%s,"source_storage_path":%s,"target_database":%s,"started_at":%s,"finished_at":%s,"schema_verified":%s,"row_count_verified":%s,"critical_tables_verified":%s,"verification_summary":{"message":%s,"mode":%s},"error_message":%s}' \
    "$( [ -n "$JOB_ID" ] && json_string "$JOB_ID" || printf 'null' )" \
    "$(json_string "${RESTORE_TEST_ENVIRONMENT:-staging}")" \
    "$(json_string "$status")" \
    "$(json_string "$HOSTNAME_SAFE")" \
    "$(json_string "$source_path")" \
    "$(json_string "${RESTORE_TEST_DATABASE_NAME:-staging}")" \
    "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" \
    "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" \
    "$(bool_json "$schema_verified")" \
    "$(bool_json "$row_count_verified")" \
    "$(bool_json "$critical_verified")" \
    "$(json_string "$message")" \
    "$(json_string "$BACKUP_RESTORE_TEST_MODE")" \
    "$(json_string "$([ "$status" = "failed" ] && printf '%s' "$message" || true)")")
  supabase_request POST "backup_restore_tests" "$body" >/dev/null 2>&1 || true
}

pg_restore_list_to_file() {
  local dump_file=$1
  local list_file=$2

  if [ "$BACKUP_POSTGRES_DUMP_RUNNER" = "docker" ]; then
    docker run --rm \
      -v "$WORK_DIR:/restore" \
      "$BACKUP_POSTGRES_DOCKER_IMAGE" \
      pg_restore --list "/restore/$(basename "$dump_file")" > "$list_file"
    return $?
  fi

  pg_restore --list "$dump_file" > "$list_file"
}

pg_restore_database() {
  local dump_file=$1
  local target_url=$2

  if [ "$BACKUP_POSTGRES_DUMP_RUNNER" = "docker" ]; then
    docker run --rm \
      -e RESTORE_TEST_DATABASE_URL="$target_url" \
      -v "$WORK_DIR:/restore" \
      "$BACKUP_POSTGRES_DOCKER_IMAGE" \
      sh -c 'pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_TEST_DATABASE_URL" "$1"' \
      sh "/restore/$(basename "$dump_file")"
    return $?
  fi

  pg_restore --clean --if-exists --no-owner --no-acl --dbname "$target_url" "$dump_file"
}

restore_critical_table_names() {
  local csv=${BACKUP_RESTORE_CRITICAL_TABLES:-}
  local item
  local -a items
  IFS=',' read -r -a items <<< "$csv"

  for item in "${items[@]}"; do
    item=${item//[[:space:]]/}
    [ -n "$item" ] || continue
    if [[ ! "$item" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      printf 'Invalid critical restore table name: %s\n' "$item" >&2
      return 1
    fi
    printf '%s\n' "$item"
  done
}

restore_test_schema_name() {
  local schema=${BACKUP_RESTORE_TEST_SCHEMA:-public}
  schema=${schema//[[:space:]]/}
  if [[ ! "$schema" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    printf 'Invalid restore test schema name: %s\n' "$schema" >&2
    return 1
  fi
  printf '%s' "$schema"
}

psql_query_restore_database() {
  local target_url=$1
  local sql=$2

  if [ "$BACKUP_POSTGRES_DUMP_RUNNER" = "docker" ]; then
    local -a docker_args=(--rm)
    if [ -n "$BACKUP_RESTORE_TEST_DOCKER_PLATFORM" ]; then
      docker_args+=(--platform "$BACKUP_RESTORE_TEST_DOCKER_PLATFORM")
    fi
    docker run "${docker_args[@]}" \
      -e RESTORE_TEST_DATABASE_URL="$target_url" \
      "$BACKUP_RESTORE_TEST_DOCKER_IMAGE" \
      sh -c 'psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"' \
      sh "$sql"
    return $?
  fi

  psql "$target_url" -v ON_ERROR_STOP=1 -At -c "$sql"
}

verify_remote_restore_database() {
  local target_url=$1
  local expected_count=0 found_count=0 exists schema table missing=""

  schema=$(restore_test_schema_name)

  while IFS= read -r table; do
    expected_count=$((expected_count + 1))
    exists=$(psql_query_restore_database "$target_url" "select count(*) from information_schema.tables where table_schema = '$schema' and table_name = '$table';" | tail -n 1)
    if [ "$exists" != "1" ]; then
      if [ -n "$missing" ]; then missing="$missing,"; fi
      missing="$missing$table"
      continue
    fi
    found_count=$((found_count + 1))
    psql_query_restore_database "$target_url" "select count(*) from $schema.$table;" >/dev/null
  done < <(restore_critical_table_names)

  if [ "$expected_count" -eq 0 ]; then
    printf 'BACKUP_RESTORE_CRITICAL_TABLES must contain at least one table\n' >&2
    return 1
  fi

  if [ -n "$missing" ]; then
    printf 'Critical table verification failed: missing %s (expected %s, found %s)\n' "$missing" "$expected_count" "$found_count" >&2
    return 1
  fi
}

docker_restore_psql() {
  local container=$1
  local password=$2
  local sql=$3
  docker exec -e PGPASSWORD="$password" "$container" \
    psql -h 127.0.0.1 -p 5432 -U postgres -d restore_test -v ON_ERROR_STOP=1 -At -c "$sql"
}

docker_restore_container_running() {
  local container=$1
  [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" = "true" ]
}

log_docker_restore_container_logs() {
  local container=$1
  printf 'Ephemeral restore container logs follow:\n' >&2
  docker logs --tail 80 "$container" >&2 || true
}

remove_docker_restore_container() {
  local container=$1
  local include_logs=${2:-false}
  if [ "$include_logs" = "true" ]; then
    log_docker_restore_container_logs "$container"
  fi
  docker rm -f "$container" >/dev/null 2>&1 || true
}

bootstrap_docker_restore_database() {
  local container=$1
  local password=$2

  docker exec -i -e PGPASSWORD="$password" "$container" \
    psql -h 127.0.0.1 -p 5432 -U postgres -d restore_test -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
drop extension if exists postgis cascade;
create extension postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create schema if not exists realtime;
create schema if not exists storage;
create schema if not exists vault;

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticator nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  create type public.business_type as enum ('CAFE', 'RESTAURANT', 'FAST_FOOD', 'BAR', 'OTHER');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum ('pending', 'ordering', 'waiting_payment', 'waiting_confirm', 'paid', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_log_status as enum ('pending', 'waiting_confirm', 'confirmed', 'failed', 'cancelled', 'refunded');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum ('QR', 'CASH');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.restaurant_platform_status as enum ('active', 'suspended', 'deleted');
exception when duplicate_object then null;
end $$;
SQL
}

verify_docker_restore_database() {
  local container=$1
  local password=$2
  local expected_count=0 found_count=0 exists schema table missing=""

  schema=$(restore_test_schema_name)

  while IFS= read -r table; do
    expected_count=$((expected_count + 1))
    exists=$(docker_restore_psql "$container" "$password" "select count(*) from information_schema.tables where table_schema = '$schema' and table_name = '$table';" | tail -n 1)
    if [ "$exists" != "1" ]; then
      if [ -n "$missing" ]; then missing="$missing,"; fi
      missing="$missing$table"
      continue
    fi
    found_count=$((found_count + 1))
    docker_restore_psql "$container" "$password" "select count(*) from $schema.$table;" >/dev/null
  done < <(restore_critical_table_names)

  if [ "$expected_count" -eq 0 ]; then
    printf 'BACKUP_RESTORE_CRITICAL_TABLES must contain at least one table\n' >&2
    return 1
  fi

  if [ -n "$missing" ]; then
    printf 'Critical table verification failed: missing %s (expected %s, found %s)\n' "$missing" "$expected_count" "$found_count" >&2
    return 1
  fi
}

run_docker_restore_database() {
  local dump_file=$1
  local container password ready=false attempt schema
  local -a docker_args=(-d)
  container="logivn-restore-test-${RUN_ID//[^A-Za-z0-9_.-]/-}"
  password=$(openssl rand -hex 24)
  schema=$(restore_test_schema_name)
  if [ -n "$BACKUP_RESTORE_TEST_DOCKER_PLATFORM" ]; then
    docker_args+=(--platform "$BACKUP_RESTORE_TEST_DOCKER_PLATFORM")
  fi

  docker rm -f "$container" >/dev/null 2>&1 || true
  if ! docker run "${docker_args[@]}" \
    --name "$container" \
    -e POSTGRES_PASSWORD="$password" \
    -e POSTGRES_DB=restore_test \
    "$BACKUP_RESTORE_TEST_DOCKER_IMAGE" >/dev/null; then
    return 1
  fi

  for attempt in $(seq 1 60); do
    if docker exec -e PGPASSWORD="$password" "$container" pg_isready -h 127.0.0.1 -p 5432 -U postgres -d restore_test >/dev/null 2>&1; then
      ready=true
      break
    fi
    if ! docker_restore_container_running "$container"; then
      log_docker_restore_container_logs "$container"
      printf 'Ephemeral restore database container exited before becoming ready\n' >&2
      docker rm -f "$container" >/dev/null 2>&1 || true
      return 1
    fi
    sleep 1
  done

  if [ "$ready" != "true" ]; then
    remove_docker_restore_container "$container" true
    printf 'Ephemeral restore database did not become ready\n' >&2
    return 1
  fi

  if ! docker exec -e PGPASSWORD="$password" "$container" \
    psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c "select 1 from pg_database where datname = 'restore_test';" | grep -qx '1'; then
    if ! docker exec -e PGPASSWORD="$password" "$container" createdb -h 127.0.0.1 -p 5432 -U postgres restore_test; then
      remove_docker_restore_container "$container" true
      return 1
    fi
  fi

  if ! bootstrap_docker_restore_database "$container" "$password"; then
    remove_docker_restore_container "$container" true
    return 1
  fi

  if ! docker cp "$dump_file" "$container:/tmp/restore-test-postgres.dump"; then
    remove_docker_restore_container "$container" true
    return 1
  fi

  local table
  local -a table_args=()
  while IFS= read -r table; do
    table_args+=(--table="$table")
  done < <(restore_critical_table_names)

  if [ "${#table_args[@]}" -eq 0 ]; then
    printf 'BACKUP_RESTORE_CRITICAL_TABLES must contain at least one table\n' >&2
    remove_docker_restore_container "$container"
    return 1
  fi

  local schema_restore_args=(--schema="$schema" --schema-only --no-owner --no-acl "${table_args[@]}" -h 127.0.0.1 -p 5432 -U postgres -d restore_test /tmp/restore-test-postgres.dump)
  if ! docker exec -e PGPASSWORD="$password" "$container" pg_restore "${schema_restore_args[@]}"; then
    if ! docker_restore_container_running "$container"; then
      remove_docker_restore_container "$container" true
      return 1
    fi
    if [ "$BACKUP_RESTORE_TEST_STRICT" = "true" ]; then
      remove_docker_restore_container "$container" true
      return 1
    fi
    log "Ephemeral critical-table schema restore reported non-critical pg_restore warnings; restoring critical table data"
  fi

  local data_restore_args=(--schema="$schema" --data-only --disable-triggers --no-owner --no-acl "${table_args[@]}" -h 127.0.0.1 -p 5432 -U postgres -d restore_test /tmp/restore-test-postgres.dump)
  if ! docker exec -e PGPASSWORD="$password" "$container" pg_restore "${data_restore_args[@]}"; then
    remove_docker_restore_container "$container" true
    return 1
  fi

  if ! verify_docker_restore_database "$container" "$password"; then
    remove_docker_restore_container "$container" true
    return 1
  fi

  remove_docker_restore_container "$container"
}

run_restore_test() {
  [ "$BACKUP_RESTORE_TEST_ENABLED" = "true" ] || return 0
  record_event "restore_test_started" "info" "restore_test" "Starting restore test pipeline"
  local object_key encrypted dump_file list_file
  object_key=${BACKUP_RESTORE_TEST_SOURCE:-$(latest_postgres_object_key)}

  if [ -z "$object_key" ] || [ "$object_key" = "None" ]; then
    record_restore_test "skipped" "" "No Postgres backup object found for restore test"
    return 0
  fi

  encrypted="$WORK_DIR/restore-test-postgres.dump.enc"
  dump_file="$WORK_DIR/restore-test-postgres.dump"
  list_file="$WORK_DIR/restore-test-list.txt"
  get_object "$object_key" "$encrypted"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter "$BACKUP_ENCRYPTION_ITERATIONS" -md sha256 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$encrypted" \
    -out "$dump_file"
  pg_restore_list_to_file "$dump_file" "$list_file"

  case "$BACKUP_RESTORE_TEST_MODE" in
    docker|ephemeral)
      if run_docker_restore_database "$dump_file"; then
        record_restore_test "success" "$object_key" "Restore test completed in an ephemeral Docker Postgres database for critical tables" true true true
      else
        record_restore_test "failed" "$object_key" "Ephemeral Docker Postgres restore failed critical-table verification" true false false
        return 1
      fi
      ;;
    restore)
      if [ -z "${RESTORE_TEST_DATABASE_URL:-}" ]; then
        record_restore_test "skipped" "$object_key" "RESTORE_TEST_DATABASE_URL is required for restore mode" true false false
        return 0
      fi
      if pg_restore_database "$dump_file" "$RESTORE_TEST_DATABASE_URL" && verify_remote_restore_database "$RESTORE_TEST_DATABASE_URL"; then
        record_restore_test "success" "$object_key" "Restore test completed against staging database" true true true
      else
        record_restore_test "failed" "$object_key" "Staging database restore failed critical-table verification" true false false
        return 1
      fi
      ;;
    list)
      record_restore_test "success" "$object_key" "pg_restore --list succeeded; set BACKUP_RESTORE_TEST_MODE=docker for full ephemeral restore" true false false
      ;;
    *)
      printf 'Invalid BACKUP_RESTORE_TEST_MODE: %s\n' "$BACKUP_RESTORE_TEST_MODE" >&2
      return 1
      ;;
  esac

  record_event "restore_test_completed" "info" "restore_test" "Restore test pipeline completed"
}

telegram_token() {
  printf '%s' "${BACKUP_TELEGRAM_BOT_TOKEN:-${PLATFORM_TELEGRAM_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}}"
}

telegram_chat_id() {
  printf '%s' "${DEV_TELEGRAM_CHAT_ID:-${PLATFORM_TELEGRAM_ADMIN_CHAT_ID:-${TELEGRAM_ADMIN_CHAT_ID:-}}}"
}

send_telegram_report() {
  local status=$1
  local title=$2
  local detail=$3
  if [ "$DEV_TELEGRAM_ALERTS_ENABLED" != "true" ]; then return 0; fi
  local token chat icon message
  token=$(telegram_token)
  chat=$(telegram_chat_id)
  [ -n "$token" ] && [ -n "$chat" ] || return 0

  icon="✅"
  if [ "$status" = "failed" ]; then icon="🚨"; elif [ "$status" = "warn" ]; then icon="⚠️"; fi
  message=$(cat <<EOF
$icon $title

Environment: $BACKUP_ENVIRONMENT
Mode: $MODE / $RETENTION_CLASS
Artifacts: $ARTIFACT_COUNT
Uploaded: $TOTAL_BYTES bytes
Checksum: $CHECKSUM_STATUS
Verify: $VERIFY_STATUS
Retention: daily $BACKUP_RETENTION_DAILY / weekly $BACKUP_RETENTION_WEEKLY / monthly $BACKUP_RETENTION_MONTHLY
Job: ${JOB_ID:-local-$RUN_ID}
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)

$detail
EOF
)
  local body
  body=$(printf '{"chat_id":%s,"text":%s,"disable_web_page_preview":true}' "$(json_string "$chat")" "$(json_string "$message")")
  curl -fsS -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -H "Content-Type: application/json" \
    --data "$body" >/dev/null 2>&1 || true
}

on_error() {
  local exit_code=$?
  local line_no=${BASH_LINENO[0]:-unknown}
  FAILURE_STEP=${FAILURE_STEP:-line_$line_no}
  FAILURE_MESSAGE=${FAILURE_MESSAGE:-Backup failed with exit code $exit_code at line $line_no}
  ARTIFACT_FAILURES=$((ARTIFACT_FAILURES + 1))
  VERIFY_STATUS=${VERIFY_STATUS:-failed}
  log "$FAILURE_MESSAGE"
  record_event "backup_failed" "critical" "$FAILURE_STEP" "$FAILURE_MESSAGE"
  update_job_status "failed" "$FAILURE_STEP" "$FAILURE_MESSAGE"
  create_alert "backup_failed" "critical" "BACKUP FAILED" "$FAILURE_MESSAGE" "high"
  send_telegram_report "failed" "BACKUP FAILED" "$FAILURE_MESSAGE"
  if [ "$BACKUP_KEEP_FAILED_TEMP" != "true" ]; then rm -rf "$WORK_DIR"; fi
  exit "$exit_code"
}

run_backup_pipeline() {
  STARTED_EPOCH=$(date +%s)
  mkdir -p "$WORK_DIR"
  record_event "backup_started" "info" "start" "Backup pipeline started"
  backup_postgres
  backup_redis
  backup_vps_configs
  backup_storage_manifest
  backup_storage_payload
  backup_application_metadata
  apply_retention
  if [ "$MODE" = "monthly" ]; then run_restore_test; fi

  local final_status="success"
  if [ "$ARTIFACT_FAILURES" -gt 0 ]; then final_status="warn"; fi
  update_job_status "$final_status"
  record_event "backup_completed" "info" "finish" "Backup pipeline completed"
  send_telegram_report "$final_status" "Backup hoàn tất" "Backup đã upload R2, metadata đã ký và object đã verify bằng kiểm tra kích thước từ storage adapter."
  rm -rf "$WORK_DIR"
}

main() {
  trap on_error ERR
  trap release_local_lock EXIT
  validate_enabled
  cleanup_old_temp
  acquire_local_lock

  if [ "$CLAIM_MANUAL" = "true" ]; then
    require_command curl
    claim_manual_job
  fi

  validate_runtime

  if [ "$RESTORE_TEST_ONLY" = "true" ]; then
    create_job
    STARTED_EPOCH=$(date +%s)
    mkdir -p "$WORK_DIR"
    run_restore_test
    update_job_status "success"
    send_telegram_report "success" "Restore test hoàn tất" "Restore test pipeline đã hoàn tất."
    rm -rf "$WORK_DIR"
    exit 0
  fi

  if [ -z "$JOB_ID" ]; then
    create_job
  fi

  run_backup_pipeline
}

if [ "${LOGIVN_BACKUP_SKIP_MAIN:-false}" != "true" ]; then
  main "$@"
fi
