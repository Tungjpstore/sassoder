#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
PLATFORM_TELEGRAM_SERVICE_URL=${PLATFORM_TELEGRAM_SERVICE_URL:-http://127.0.0.1:3650}

log() {
  printf '[logivn-platform-telegram-webhook] %s\n' "$*"
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
  require_env PLATFORM_TELEGRAM_BOT_TOKEN
  require_env PLATFORM_TELEGRAM_WEBHOOK_SECRET
  require_env PLATFORM_TELEGRAM_WEBHOOK_URL

  case "$PLATFORM_TELEGRAM_WEBHOOK_URL" in
    *"/webhooks/platform-telegram/$PLATFORM_TELEGRAM_WEBHOOK_SECRET")
      ;;
    *)
      printf 'PLATFORM_TELEGRAM_WEBHOOK_URL must end with /webhooks/platform-telegram/%s\n' "$PLATFORM_TELEGRAM_WEBHOOK_SECRET" >&2
      exit 2
      ;;
  esac

  log "checking local platform telegram readiness"
  curl -fsS --max-time 10 "$PLATFORM_TELEGRAM_SERVICE_URL/ready" >/dev/null

  log "setting Platform Telegram webhook"
  curl -fsS \
    --max-time 20 \
    -X POST \
    -H "x-logivn-internal-key: $LOGIVN_INTERNAL_API_KEY" \
    "$PLATFORM_TELEGRAM_SERVICE_URL/webhook/set" >/dev/null

  log "platform webhook configured"
}

main "$@"
