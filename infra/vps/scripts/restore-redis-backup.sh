#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups}
REDIS_VOLUME=${REDIS_VOLUME:-logivn_redis-data}
CONFIRM_VALUE=${CONFIRM_VALUE:-restore-logivn-redis}
EXPLICIT_DRY_RUN=false
WORK_DIR=""

usage() {
  cat <<'USAGE'
Usage:
  infra/vps/scripts/restore-redis-backup.sh [--dry-run] <backup.tgz|redis-data.tgz>

Safe by default. To restore for real:
  CONFIRM_RESTORE=restore-logivn-redis infra/vps/scripts/restore-redis-backup.sh /opt/logivn/backups/20260101T000000Z.tgz

The restore stops Redis-dependent services, creates a pre-restore Redis volume
backup, replaces the Redis Docker volume contents, restarts the stack, and runs
local validation.
USAGE
}

log() {
  printf '[logivn-restore] %s\n' "$*"
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "--dry-run" ]; then
  EXPLICIT_DRY_RUN=true
  shift
fi

BACKUP_ARCHIVE=${1:-}
if [ -z "$BACKUP_ARCHIVE" ]; then
  usage >&2
  exit 2
fi

if [ ! -f "$BACKUP_ARCHIVE" ]; then
  printf 'Backup archive not found: %s\n' "$BACKUP_ARCHIVE" >&2
  exit 2
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" "$@"
}

check_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing command: %s\n' "$1" >&2
    exit 1
  }
}

extract_redis_archive() {
  local archive="$1"
  local work_dir="$2"

  if tar tzf "$archive" | grep -Eq '(^|/)redis-data\.tgz$'; then
    tar xzf "$archive" -C "$work_dir"
    local nested
    nested="$(find "$work_dir" -type f -name redis-data.tgz | head -1)"
    if [ -z "$nested" ]; then
      printf 'redis-data.tgz was not found after extracting %s\n' "$archive" >&2
      exit 1
    fi
    printf '%s\n' "$nested"
    return
  fi

  if tar tzf "$archive" >/dev/null; then
    printf '%s\n' "$archive"
    return
  fi

  printf 'Invalid tar.gz archive: %s\n' "$archive" >&2
  exit 1
}

dry_run_archive() {
  local redis_archive="$1"
  log "Dry run archive inspection: $redis_archive"
  tar tzf "$redis_archive" | sed -n '1,40p'
}

restore_archive() {
  local redis_archive="$1"
  local pre_restore="$BACKUP_ROOT/pre-restore-redis-$(date -u +%Y%m%dT%H%M%SZ).tgz"

  if [ "${CONFIRM_RESTORE:-}" != "$CONFIRM_VALUE" ]; then
    printf 'Refusing destructive restore. Set CONFIRM_RESTORE=%s to continue.\n' "$CONFIRM_VALUE" >&2
    exit 3
  fi

  if [ ! -f "$ENV_FILE" ]; then
    printf 'Env file not found: %s\n' "$ENV_FILE" >&2
    exit 2
  fi

  mkdir -p "$BACKUP_ROOT"
  log "Stopping Redis-dependent services"
  compose stop gateway socket ai-service image-service worker telegram-bot redis-exporter redis >/dev/null

  log "Creating pre-restore Redis volume backup: $pre_restore"
  docker run --rm \
    -v "$REDIS_VOLUME:/data:ro" \
    -v "$BACKUP_ROOT:/backup" \
    alpine:3.20 \
    tar czf "/backup/$(basename "$pre_restore")" -C /data .
  chmod 600 "$pre_restore"

  log "Replacing Redis volume contents"
  docker run --rm \
    -v "$REDIS_VOLUME:/data" \
    alpine:3.20 \
    sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} \;'
  docker run --rm \
    -v "$REDIS_VOLUME:/data" \
    -v "$(dirname "$redis_archive"):/restore:ro" \
    alpine:3.20 \
    tar xzf "/restore/$(basename "$redis_archive")" -C /data

  log "Starting stack after restore"
  compose up -d redis redis-exporter gateway socket ai-service image-service worker telegram-bot >/dev/null

  APP_ROOT="$APP_ROOT" ENV_FILE="$ENV_FILE" "$VPS_DIR/scripts/validate.sh" --local-only
  log "Redis restore complete. Pre-restore backup: $pre_restore"
}

main() {
  check_command docker
  check_command tar

  WORK_DIR="$(mktemp -d)"
  trap 'rm -rf "$WORK_DIR"' EXIT

  local redis_archive
  redis_archive="$(extract_redis_archive "$BACKUP_ARCHIVE" "$WORK_DIR")"
  dry_run_archive "$redis_archive"

  if [ "$EXPLICIT_DRY_RUN" = true ] || [ "${CONFIRM_RESTORE:-}" != "$CONFIRM_VALUE" ]; then
    log "Dry run complete. No Redis data was changed."
    return
  fi

  restore_archive "$redis_archive"
}

main "$@"
