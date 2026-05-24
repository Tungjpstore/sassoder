#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
BACKUP_ROOT=${BACKUP_ROOT:-$APP_ROOT/backups}
BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
RETENTION_DAYS=${RETENTION_DAYS:-14}

log() {
  printf '[logivn-backup] %s\n' "$*"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

backup_configs() {
  mkdir -p "$BACKUP_DIR/config"
  cp -a "$ENV_FILE" "$BACKUP_DIR/config/env" 2>/dev/null || true
  cp -a "$VPS_DIR/docker-compose.yml" "$BACKUP_DIR/config/docker-compose.yml"
  cp -a "$VPS_DIR/nginx" "$BACKUP_DIR/config/nginx"
  cp -a /etc/nginx/sites-available/logivn-vps.conf "$BACKUP_DIR/config/nginx-active.conf" 2>/dev/null || true
  chmod -R go-rwx "$BACKUP_DIR/config"
}

backup_redis() {
  log "Backing up Redis volume"
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" exec -T redis redis-cli -a "$REDIS_PASSWORD" BGSAVE >/dev/null || true
  sleep 3
  docker run --rm \
    -v logivn_redis-data:/data:ro \
    -v "$BACKUP_DIR:/backup" \
    alpine:3.20 \
    tar czf /backup/redis-data.tgz -C /data .
}

backup_logs_sample() {
  mkdir -p "$BACKUP_DIR/logs"
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" ps > "$BACKUP_DIR/logs/docker-ps.txt" || true
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" logs --tail=300 > "$BACKUP_DIR/logs/docker-tail.log" || true
}

prune_old_backups() {
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -print -exec rm -rf {} +
}

main() {
  load_env
  mkdir -p "$BACKUP_DIR"
  backup_configs
  backup_redis
  backup_logs_sample
  tar czf "$BACKUP_DIR.tgz" -C "$BACKUP_ROOT" "$(basename "$BACKUP_DIR")"
  rm -rf "$BACKUP_DIR"
  chmod 600 "$BACKUP_DIR.tgz"
  prune_old_backups
  log "Backup complete: $BACKUP_DIR.tgz"
}

main "$@"
