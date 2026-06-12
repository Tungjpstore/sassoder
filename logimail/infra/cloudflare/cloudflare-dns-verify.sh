#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require

log_info "Verifying Cloudflare records and public DNS for ${LOGIMAIL_DOMAIN}."

while IFS=$'\t' read -r type name content proxied priority; do
  response="$(cf_get_records "${type}" "${name}")"
  count="$(printf '%s' "${response}" | jq '.result | length')"
  if [ "${count}" = "0" ]; then
    log_warn "Cloudflare missing ${type} ${name}"
    continue
  fi
  actual_proxied="$(printf '%s' "${response}" | jq -r '.result[0].proxied // "n/a"')"
  if is_mail_transport_name "${name}" && [ "${actual_proxied}" != "false" ]; then
    log_error "Cloudflare proxy must be disabled for ${name}."
    exit 1
  fi
  log_info "Cloudflare has ${type} ${name} proxied=${actual_proxied}"
done < <(safe_dns_plan)

if command -v dig >/dev/null 2>&1; then
  dig +short "mail.${LOGIMAIL_DOMAIN}" A || true
  dig +short "${LOGIMAIL_DOMAIN}" MX || true
  dig +short "${LOGIMAIL_DOMAIN}" TXT || true
  dig +short "_dmarc.${LOGIMAIL_DOMAIN}" TXT || true
else
  log_warn "dig not found; public DNS verification skipped."
fi
