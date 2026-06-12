#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch

REPORT_FILE="${LOGIMAIL_REPORT_FILE:-/tmp/logimail-daily-report.txt}"

{
  printf 'LogiMail daily report %s\n' "$(date -Iseconds)"
  printf '\n== Health ==\n'
  "${SCRIPT_DIR}/healthcheck.sh" || true
  printf '\n== DNS ==\n'
  "${SCRIPT_DIR}/check-dns.sh" || true
  printf '\n== Queue ==\n'
  "${SCRIPT_DIR}/check-mail-queue.sh" || true
} > "${REPORT_FILE}"

log_info "Report written: ${REPORT_FILE}"

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  require_command curl
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$(sed -n '1,120p' "${REPORT_FILE}")" >/dev/null
  log_info "Telegram report sent."
else
  log_warn "Telegram env missing; report not sent."
fi
