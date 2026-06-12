#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_DIR="$APP_ROOT/backups/deploy/$(date -u +%Y%m%dT%H%M%SZ)"
RUN_BACKUP=auto
BUILD_PULL=false

log() {
  printf '[logivn-deploy] %s\n' "$*"
}

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    mkdir -p "$APP_ROOT"
    cp "$VPS_DIR/.env.example" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    printf 'Created %s from template. Fill production secrets, then rerun deploy.\n' "$ENV_FILE" >&2
    exit 2
  fi
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  RUN_BACKUP=${LOGIVN_DEPLOY_BACKUP_ENABLED:-auto}
  BUILD_PULL=${LOGIVN_DOCKER_BUILD_PULL:-false}
}

backup_current_config() {
  mkdir -p "$BACKUP_DIR"
  cp -a "$ENV_FILE" "$BACKUP_DIR/env.backup"
  cp -a "$COMPOSE_FILE" "$BACKUP_DIR/docker-compose.yml"
  if [ -d /etc/nginx/sites-available ]; then
    cp -a /etc/nginx/sites-available "$BACKUP_DIR/nginx-sites-available" 2>/dev/null || true
  fi
}

backup_env_ready() {
  [ "${BACKUP_ENABLED:-true}" = "true" ] || return 1
  [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || return 1
  [ -n "${BACKUP_METADATA_SIGNING_KEY:-}" ] || return 1

  local adapter=${BACKUP_STORAGE_ADAPTER:-}
  if [ -z "$adapter" ]; then
    adapter=worker
  fi

  case "$adapter" in
    worker|gateway|r2-gateway|r2_gateway)
      [ -n "${BACKUP_R2_GATEWAY_URL:-}" ] || return 1
      [ -n "${BACKUP_R2_GATEWAY_TOKEN:-}" ] || return 1
      ;;
    s3|r2)
      [ -n "${R2_ACCESS_KEY_ID:-}" ] || return 1
      [ -n "${R2_SECRET_ACCESS_KEY:-}" ] || return 1
      [ -n "${R2_ENDPOINT:-${R2_ACCOUNT_ID:-}}" ] || return 1
      ;;
    *)
      return 1
      ;;
  esac

  if [ "${BACKUP_POSTGRES_ENABLED:-true}" = "true" ]; then
    [ -n "${DATABASE_URL:-}" ] || { [ -n "${SUPABASE_DB_HOST:-}" ] && [ -n "${SUPABASE_DB_USER:-}" ] && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; } || return 1
  fi
}

ensure_postgres_backup_runner() {
  if [ "${BACKUP_POSTGRES_ENABLED:-true}" != "true" ]; then
    return 0
  fi

  local runner=${BACKUP_POSTGRES_DUMP_RUNNER:-docker}
  local image=${BACKUP_POSTGRES_DOCKER_IMAGE:-postgres:17-alpine}

  if [ "$runner" = "docker" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      printf 'docker is required for Docker-based Postgres backup runner.\n' >&2
      return 1
    fi

    if ! docker image inspect "$image" >/dev/null 2>&1; then
      log "Pulling PostgreSQL backup image $image"
      docker pull "$image"
    fi
    return 0
  fi

  if [ "$runner" != "local" ]; then
    printf 'Invalid BACKUP_POSTGRES_DUMP_RUNNER: %s\n' "$runner" >&2
    return 1
  fi

  if command -v pg_dump >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    printf 'pg_dump is required for Postgres backup, and apt-get is unavailable to install postgresql-client.\n' >&2
    return 1
  fi

  if ! sudo -n true >/dev/null 2>&1; then
    printf 'pg_dump is required for Postgres backup, and passwordless sudo is unavailable to install postgresql-client.\n' >&2
    return 1
  fi

  log "Installing PostgreSQL client tools for runtime backup"
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql-client
}

backup_runtime_data() {
  if [ "$RUN_BACKUP" = "false" ]; then
    log "Skipping runtime backup before deploy"
    return
  fi

  if [ "$RUN_BACKUP" = "auto" ] && ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q redis >/dev/null 2>&1; then
    log "Skipping runtime backup before first deploy"
    return
  fi

  if [ "$RUN_BACKUP" = "auto" ] && ! backup_env_ready; then
    log "Skipping runtime backup before deploy; backup env is not complete yet"
    return
  fi

  ensure_postgres_backup_runner

  log "Running runtime backup before deploy"
  APP_ROOT="$APP_ROOT" ENV_FILE="$ENV_FILE" "$VPS_DIR/scripts/backup.sh"
}

validate_compose() {
  log "Validating docker compose config"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
}

deploy_compose() {
  if [ "$BUILD_PULL" = "true" ]; then
    log "Building images with pull"
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --pull
  else
    log "Building images"
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
  fi

  log "Starting services"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
}

sync_nginx_config() {
  if [ "${LOGIVN_DEPLOY_MANAGE_NGINX:-true}" != "true" ]; then
    log "Skipping NGINX config sync"
    return
  fi

  if [ ! -d /etc/nginx/sites-available ] || ! command -v nginx >/dev/null 2>&1; then
    log "Skipping NGINX config sync; NGINX is not installed on this host"
    return
  fi

  if ! sudo -n true >/dev/null 2>&1; then
    log "Skipping NGINX config sync; passwordless sudo is not available"
    return
  fi

  local source="$VPS_DIR/nginx/logivn-ssl.conf.template"
  local target="/etc/nginx/sites-available/logivn-vps.conf"
  local confd_target="/etc/nginx/conf.d/logivn-vps.conf"

  log "Syncing NGINX reverse-proxy routes"
  sudo -n cp "$source" "$target"
  sudo -n ln -sf "$target" /etc/nginx/sites-enabled/logivn-vps.conf
  sudo -n nginx -t

  if ! sudo -n nginx -T 2>/dev/null | grep -q 'location /webhooks/platform-telegram/'; then
    if [ -d /etc/nginx/conf.d ]; then
      log "sites-enabled is not active in nginx -T; installing fallback conf.d route file"
      sudo -n cp "$source" "$confd_target"
      if ! sudo -n nginx -t >/dev/null 2>&1 || ! sudo -n nginx -T 2>/dev/null | grep -q 'location /webhooks/platform-telegram/'; then
        sudo -n rm -f "$confd_target"
        sudo -n nginx -t >/dev/null 2>&1 || true
        printf 'NGINX config sync did not activate /webhooks/platform-telegram/ route\n' >&2
        return 1
      fi
    else
      printf 'NGINX config sync did not activate /webhooks/platform-telegram/ route\n' >&2
      return 1
    fi
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo -n systemctl reload nginx
  else
    sudo -n nginx -s reload
  fi
}

reload_monitoring_configs() {
  log "Reloading monitoring services"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart prometheus alertmanager >/dev/null
}

wait_for_health() {
  local path="$1"
  local label="$2"
  local attempts=40

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$path" >/dev/null 2>&1; then
      log "$label is healthy"
      return
    fi
    sleep 3
  done

  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
  printf '%s did not become healthy: %s\n' "$label" "$path" >&2
  exit 1
}

post_deploy_checks() {
  wait_for_health "http://127.0.0.1:3100/health" "gateway"
  wait_for_health "http://127.0.0.1:3200/health" "socket"
  wait_for_health "http://127.0.0.1:3300/health" "ai-service"
  wait_for_health "http://127.0.0.1:3400/health" "image-service"
  wait_for_health "http://127.0.0.1:3500/health" "worker"
  wait_for_health "http://127.0.0.1:3600/health" "telegram-bot"
  wait_for_health "http://127.0.0.1:3650/health" "platform-telegram-bot"
}

reconcile_grafana_admin_password() {
  if [ -z "${GF_SECURITY_ADMIN_PASSWORD:-}" ]; then
    return
  fi

  log "Reconciling Grafana admin password"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T grafana grafana cli admin reset-admin-password "$GF_SECURITY_ADMIN_PASSWORD" >/dev/null
}

main() {
  require_env_file
  load_env
  backup_current_config
  backup_runtime_data
  validate_compose
  deploy_compose
  sync_nginx_config
  reload_monitoring_configs
  post_deploy_checks
  reconcile_grafana_admin_password
  docker image prune -f --filter "until=168h" >/dev/null || true
  log "Deployment complete. Config backup: $BACKUP_DIR"
}

main "$@"
