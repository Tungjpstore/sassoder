#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require
require_env CF_RECORD_TYPE CF_RECORD_NAME CF_RECORD_CONTENT LOGIMAIL_CONFIRM_UPDATE

if [ "${LOGIMAIL_CONFIRM_UPDATE}" != "I_UNDERSTAND_DNS_RISK" ]; then
  log_error "Set LOGIMAIL_CONFIRM_UPDATE=I_UNDERSTAND_DNS_RISK to update an existing DNS record."
  exit 1
fi

CF_RECORD_PROXIED="${CF_RECORD_PROXIED:-false}"
CF_RECORD_PRIORITY="${CF_RECORD_PRIORITY:-}"

if is_mail_transport_name "${CF_RECORD_NAME}" && [ "${CF_RECORD_PROXIED}" != "false" ]; then
  log_error "Denied: mail/smtp/imap hostnames must stay DNS only."
  exit 1
fi

response="$(cf_get_records "${CF_RECORD_TYPE}" "${CF_RECORD_NAME}")"
count="$(printf '%s' "${response}" | jq '.result | length')"
if [ "${count}" = "0" ]; then
  log_error "Record not found: ${CF_RECORD_TYPE} ${CF_RECORD_NAME}"
  exit 1
fi
if [ "${count}" != "1" ]; then
  log_error "Multiple records found. Update manually after review."
  exit 1
fi

mkdir -p .cloudflare-backups
backup_path=".cloudflare-backups/${CF_RECORD_TYPE}-${CF_RECORD_NAME}-$(date +%Y%m%d-%H%M%S).json"
printf '%s\n' "${response}" > "${backup_path}"
chmod 600 "${backup_path}"

record_id="$(printf '%s' "${response}" | jq -r '.result[0].id')"
log_warn "Backed up existing record to ${backup_path}"
confirm_or_exit "Update ${CF_RECORD_TYPE} ${CF_RECORD_NAME}?"
cf_update_record "${record_id}" "${CF_RECORD_TYPE}" "${CF_RECORD_NAME}" "${CF_RECORD_CONTENT}" "${CF_RECORD_PROXIED}" "${CF_RECORD_PRIORITY}" >/dev/null
log_info "Record updated."
