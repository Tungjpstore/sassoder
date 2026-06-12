#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require

MAIL_HOST="${LOGIMAIL_MAIL_HOSTNAME:-mail.${LOGIMAIL_DOMAIN}}"
DKIM_SELECTOR="${DKIM_SELECTOR:-default}"
DKIM_DOMAIN="${DKIM_DOMAIN:-${LOGIMAIL_DOMAIN}}"
DKIM_NAME="${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}"

log_info "Read-only Cloudflare DNS report for LogiMail cutover. No changes will be made."

report_record() {
  local type="$1"
  local name="$2"
  local response count
  response="$(cf_get_records "${type}" "${name}")"
  count="$(printf '%s' "${response}" | jq '.result | length')"

  if [ "${count}" = "0" ]; then
    log_warn "MISSING ${type} ${name}"
    return 0
  fi

  log_info "EXISTS ${type} ${name} (${count})"
  printf '%s\n' "${response}" | jq -r '.result[] | "  id=\(.id) type=\(.type) name=\(.name) content=\(.content) proxied=\(.proxied // "n/a") priority=\(.priority // "n/a")"'
}

report_record A "${MAIL_HOST}"
report_record MX "${LOGIMAIL_DOMAIN}"
report_record TXT "${LOGIMAIL_DOMAIN}"
report_record TXT "_dmarc.${LOGIMAIL_DOMAIN}"
report_record TXT "${DKIM_NAME}"

log_warn "MX/SPF changes affect existing email routing. Back up records before using update-confirmed flow."
