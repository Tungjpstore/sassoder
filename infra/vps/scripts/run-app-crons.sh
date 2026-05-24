#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
JOB=${1:-all}
APP_URL=${LOGIVN_APP_CRON_BASE_URL:-}
CRON_TIMEOUT_SECONDS=${LOGIVN_APP_CRON_TIMEOUT_SECONDS:-70}

log() {
  printf '[logivn-app-cron] %s\n' "$*"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

cron_url() {
  local path="$1"
  local base="${APP_URL:-${NEXT_PUBLIC_APP_URL:-https://logivn.com}}"
  printf '%s%s\n' "${base%/}" "$path"
}

run_cron_path() {
  local label="$1"
  local path="$2"
  local url
  url="$(cron_url "$path")"

  log "running $label"
  curl -fsS \
    --retry 2 \
    --retry-delay 5 \
    --max-time "$CRON_TIMEOUT_SECONDS" \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$url" >/dev/null
  log "$label OK"
}

main() {
  load_env

  if [ "${LOGIVN_VPS_APP_CRONS_ENABLED:-false}" != "true" ]; then
    if [ "${LOGIVN_VPS_APP_CRONS_LOG_SKIPS:-false}" = "true" ]; then
      log "skipped: LOGIVN_VPS_APP_CRONS_ENABLED is not true"
    fi
    exit 0
  fi

  if [ -z "${CRON_SECRET:-}" ]; then
    printf 'CRON_SECRET is required when LOGIVN_VPS_APP_CRONS_ENABLED=true\n' >&2
    exit 2
  fi

  case "$JOB" in
    reports)
      run_cron_path reports /api/cron/reports
      ;;
    ai-ops)
      run_cron_path ai-ops /api/cron/ai-ops
      ;;
    reservations-expire|reservations)
      run_cron_path reservations-expire /api/cron/reservations/expire
      ;;
    subscriptions)
      run_cron_path subscriptions /api/cron/subscriptions
      ;;
    all)
      run_cron_path reports /api/cron/reports
      run_cron_path ai-ops /api/cron/ai-ops
      run_cron_path reservations-expire /api/cron/reservations/expire
      run_cron_path subscriptions /api/cron/subscriptions
      ;;
    *)
      printf 'Unsupported app cron job: %s\n' "$JOB" >&2
      exit 64
      ;;
  esac
}

main "$@"
