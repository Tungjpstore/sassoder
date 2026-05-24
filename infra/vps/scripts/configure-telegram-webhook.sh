#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
TELEGRAM_SERVICE_URL=${TELEGRAM_SERVICE_URL:-http://127.0.0.1:3600}

log() {
  printf '[logivn-telegram-webhook] %s\n' "$*"
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    printf '%s is required in %s\n' "$name" "$ENV_FILE" >&2
    exit 2
  fi
}

main() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'Env file not found: %s\n' "$ENV_FILE" >&2
    exit 2
  fi

  load_env
  require_env LOGIVN_INTERNAL_API_KEY
  require_env TELEGRAM_BOT_TOKEN
  require_env TELEGRAM_WEBHOOK_SECRET
  require_env TELEGRAM_WEBHOOK_URL

  case "$TELEGRAM_WEBHOOK_URL" in
    *"/webhooks/telegram/$TELEGRAM_WEBHOOK_SECRET")
      ;;
    *)
      printf 'TELEGRAM_WEBHOOK_URL must end with /webhooks/telegram/%s\n' "$TELEGRAM_WEBHOOK_SECRET" >&2
      exit 2
      ;;
  esac

  log "checking local telegram readiness"
  curl -fsS --max-time 10 "$TELEGRAM_SERVICE_URL/ready" >/dev/null

  log "setting Telegram webhook"
  curl -fsS \
    --max-time 20 \
    -X POST \
    -H "x-logivn-internal-key: $LOGIVN_INTERNAL_API_KEY" \
    "$TELEGRAM_SERVICE_URL/webhook/set" >/dev/null

  log "webhook configured"
}

main "$@"
