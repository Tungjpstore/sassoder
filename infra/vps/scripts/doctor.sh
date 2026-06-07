#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=${APP_ROOT:-/opt/logivn}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
STRICT_OPTIONAL=false

if [ "${1:-}" = "--strict-optional" ]; then
  STRICT_OPTIONAL=true
fi

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

is_set() {
  local name="$1"
  [ -n "${!name:-}" ]
}

check_group() {
  local label="$1"
  local required="$2"
  shift 2
  local missing=()
  local present=()

  for name in "$@"; do
    if is_set "$name"; then
      present+=("$name")
    else
      missing+=("$name")
    fi
  done

  printf '[logivn-doctor] %s configured: %s/%s\n' "$label" "${#present[@]}" "$(( ${#present[@]} + ${#missing[@]} ))"
  if [ "${#missing[@]}" -gt 0 ]; then
    printf '[logivn-doctor] %s missing: %s\n' "$label" "${missing[*]}"
  fi

  if [ "$required" = "required" ] && [ "${#missing[@]}" -gt 0 ]; then
    return 1
  fi

  if [ "$required" = "optional" ] && [ "$STRICT_OPTIONAL" = true ] && [ "${#missing[@]}" -gt 0 ]; then
    return 1
  fi

  return 0
}

check_app_cron_mode() {
  if [ "${LOGIVN_VPS_APP_CRONS_ENABLED:-false}" = "true" ]; then
    if ! is_set CRON_SECRET; then
      printf '[logivn-doctor] app-crons missing: CRON_SECRET\n'
      return 1
    fi
    printf '[logivn-doctor] app-crons enabled: true\n'
  else
    printf '[logivn-doctor] app-crons enabled: false\n'
  fi
}

check_telegram_webhook_url() {
  if ! is_set TELEGRAM_WEBHOOK_URL || ! is_set TELEGRAM_WEBHOOK_SECRET; then
    return 0
  fi

  case "$TELEGRAM_WEBHOOK_URL" in
    *"/webhooks/telegram/$TELEGRAM_WEBHOOK_SECRET")
      return 0
      ;;
    *)
      printf '[logivn-doctor] telegram warning: TELEGRAM_WEBHOOK_URL should end with /webhooks/telegram/$TELEGRAM_WEBHOOK_SECRET\n'
      return 1
      ;;
  esac
}

check_platform_telegram_webhook_url() {
  if ! is_set PLATFORM_TELEGRAM_WEBHOOK_URL || ! is_set PLATFORM_TELEGRAM_WEBHOOK_SECRET; then
    return 0
  fi

  case "$PLATFORM_TELEGRAM_WEBHOOK_URL" in
    *"/webhooks/platform-telegram/$PLATFORM_TELEGRAM_WEBHOOK_SECRET")
      return 0
      ;;
    *)
      printf '[logivn-doctor] platform telegram warning: PLATFORM_TELEGRAM_WEBHOOK_URL should end with /webhooks/platform-telegram/$PLATFORM_TELEGRAM_WEBHOOK_SECRET\n'
      return 1
      ;;
  esac
}

check_alert_routing() {
  if is_set ALERT_WEBHOOK_FORWARD_URL; then
    if is_set ALERT_WEBHOOK_FORWARD_TOKEN; then
      printf '[logivn-doctor] alert routing: Dev Telegram + external forward configured\n'
    else
      printf '[logivn-doctor] alert routing: Dev Telegram + external forward without bearer token\n'
    fi
  else
    printf '[logivn-doctor] alert routing: Dev Telegram fallback via platform.telegram.notifications\n'
  fi
}

check_notification_routing() {
  local push_target="Dev Telegram fallback"
  local email_target="Dev Telegram fallback"
  if is_set PUSH_NOTIFICATION_WEBHOOK_URL; then push_target="external webhook"; fi
  if is_set EMAIL_NOTIFICATION_WEBHOOK_URL; then email_target="external webhook"; fi
  printf '[logivn-doctor] notifications routing: push=%s email=%s\n' "$push_target" "$email_target"
}

check_systemd_timer() {
  local unit="$1"
  local enabled=""
  local active=""

  enabled=$(systemctl is-enabled "$unit" 2>/dev/null || true)
  active=$(systemctl is-active "$unit" 2>/dev/null || true)
  printf '[logivn-doctor] systemd timer %s: enabled=%s active=%s\n' "$unit" "${enabled:-unknown}" "${active:-unknown}"
  [ "$enabled" = "enabled" ] && [ "$active" = "active" ]
}

check_backup_scheduler() {
  local failed=0
  local cron_file=/etc/cron.d/logivn-vps

  if [ -f "$cron_file" ]; then
    printf '[logivn-doctor] backup scheduler cron: installed %s\n' "$cron_file"
    grep -q 'backup.sh --daily' "$cron_file" || { printf '[logivn-doctor] backup scheduler cron missing daily entry\n'; failed=1; }
    grep -q 'backup.sh --claim-manual' "$cron_file" || { printf '[logivn-doctor] backup scheduler cron missing manual claim entry\n'; failed=1; }
  else
    printf '[logivn-doctor] backup scheduler cron missing: %s\n' "$cron_file"
    failed=1
  fi

  if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
    printf '[logivn-doctor] backup scheduler systemd: unavailable; cron remains the scheduler of record\n'
    return "$failed"
  fi

  check_systemd_timer logivn-backup-daily.timer || failed=1
  check_systemd_timer logivn-backup-manual-claim.timer || failed=1
  return "$failed"
}

main() {
  if [ ! -f "$ENV_FILE" ]; then
    printf 'Env file not found: %s\n' "$ENV_FILE" >&2
    exit 2
  fi

  load_env
  local failed=0

  check_group core required \
    LOGIVN_INTERNAL_API_KEY REDIS_PASSWORD NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY GF_SECURITY_ADMIN_PASSWORD || failed=1

  check_group monitoring optional \
    BULL_BOARD_PASSWORD || failed=1

  check_group ai optional \
    DASHSCOPE_API_KEY XAI_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY || failed=1

  check_group telegram optional \
    TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET TELEGRAM_WEBHOOK_URL TELEGRAM_CALLBACK_SECRET TELEGRAM_CONNECT_TOKEN_SECRET || failed=1

  check_group platform-telegram optional \
    PLATFORM_TELEGRAM_BOT_TOKEN PLATFORM_TELEGRAM_WEBHOOK_SECRET PLATFORM_TELEGRAM_WEBHOOK_URL PLATFORM_TELEGRAM_SESSION_SECRET || failed=1

  check_notification_routing || failed=1
  check_alert_routing || failed=1
  check_backup_scheduler || failed=1

  check_app_cron_mode || failed=1
  check_telegram_webhook_url || failed=1
  check_platform_telegram_webhook_url || failed=1

  if [ "$failed" -eq 0 ]; then
    printf '[logivn-doctor] OK\n'
  else
    printf '[logivn-doctor] incomplete\n'
  fi

  exit "$failed"
}

main "$@"
