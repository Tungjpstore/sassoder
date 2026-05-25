#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="$REPO_ROOT/infra/vps"
APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
LOCAL_ONLY=false
CONFIG_ONLY=false

if [ "${1:-}" = "--local-only" ]; then
  LOCAL_ONLY=true
fi

log() {
  printf '[logivn-validate] %s\n' "$*"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

check_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing command: %s\n' "$1" >&2
    exit 1
  }
}

check_url() {
  local url="$1"
  local label="$2"
  curl -fsS --max-time 10 "$url" >/dev/null
  log "$label OK"
}

check_domain_dns() {
  local host="$1"
  if command -v dig >/dev/null 2>&1; then
    log "$host DNS: $(dig +short "$host" | tr '\n' ' ')"
  fi
}

main() {
  if [ "$LOCAL_ONLY" = true ] && [ ! -f "$ENV_FILE" ]; then
    ENV_FILE="$VPS_DIR/.env.example"
    CONFIG_ONLY=true
  fi

  load_env
  check_command docker
  check_command curl

  log "System"
  uname -a
  if command -v free >/dev/null 2>&1; then
    free -h
  elif command -v vm_stat >/dev/null 2>&1; then
    vm_stat | head -8
  fi
  df -h /
  command -v ufw >/dev/null 2>&1 && ufw status || true
  command -v fail2ban-client >/dev/null 2>&1 && fail2ban-client status sshd || true

  log "Docker services"
  if [ "$CONFIG_ONLY" = true ]; then
    docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" config >/dev/null
    log "compose config OK"
    log "Config-only validation complete"
    return
  fi

  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" ps
  docker compose --env-file "$ENV_FILE" -f "$VPS_DIR/docker-compose.yml" exec -T redis redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping | grep -q PONG
  log "redis OK"

  check_url http://127.0.0.1:3100/health gateway
  check_url http://127.0.0.1:3200/health socket
  check_url http://127.0.0.1:3300/health ai-service
  check_url http://127.0.0.1:3400/health image-service
  check_url http://127.0.0.1:3500/health worker
  check_url http://127.0.0.1:3600/health telegram-bot
  check_url http://127.0.0.1:3001 uptime-kuma
  check_url http://127.0.0.1:3002/grafana/api/health grafana
  check_url http://127.0.0.1:9090/-/ready prometheus
  check_url http://127.0.0.1:5540 redisinsight
  check_url http://127.0.0.1:9093/-/ready alertmanager

  if [ "$LOCAL_ONLY" = false ]; then
    for host in api.logivn.com ws.logivn.com worker.logivn.com monitor.logivn.com; do
      check_domain_dns "$host"
      check_url "https://$host/health" "$host HTTPS"
    done
  fi

  log "Validation complete"
}

main "$@"
