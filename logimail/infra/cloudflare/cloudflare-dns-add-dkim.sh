#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require
require_env DKIM_PUBLIC_KEY

DKIM_DOMAIN="${DKIM_DOMAIN:-${LOGIMAIL_DOMAIN}}"
DKIM_SELECTOR="${DKIM_SELECTOR:-default}"
DKIM_NAME="${DKIM_SELECTOR}._domainkey.${DKIM_DOMAIN}"

if [[ "${DKIM_PUBLIC_KEY}" != v=DKIM1* ]]; then
  log_error "DKIM_PUBLIC_KEY must start with v=DKIM1. Get the single-line TXT value from BillionMail."
  exit 1
fi

response="$(cf_get_records TXT "${DKIM_NAME}")"
count="$(printf '%s' "${response}" | jq '.result | length')"
if [ "${count}" != "0" ]; then
  log_warn "DKIM record already exists: ${DKIM_NAME}. No overwrite. Use cloudflare-dns-update-confirmed.sh after backup if needed."
  exit 0
fi

log_info "Creating DKIM TXT ${DKIM_NAME}"
cf_create_record TXT "${DKIM_NAME}" "${DKIM_PUBLIC_KEY}" false "" >/dev/null
log_info "DKIM record created."
