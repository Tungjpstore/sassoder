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

backup_runtime_data() {
  if [ "$RUN_BACKUP" = "false" ]; then
    log "Skipping runtime backup before deploy"
    return
  fi

  if [ "$RUN_BACKUP" = "auto" ] && ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q redis >/dev/null 2>&1; then
    log "Skipping runtime backup before first deploy"
    return
  fi

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

  log "Syncing NGINX reverse-proxy routes"
  sudo -n cp "$source" "$target"
  sudo -n ln -sf "$target" /etc/nginx/sites-enabled/logivn-vps.conf
  sudo -n nginx -t
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
