#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require

log_info "Bootstrapping missing safe DNS records for ${LOGIMAIL_DOMAIN}. Existing records are skipped."

while IFS=$'\t' read -r type name content proxied priority; do
  if is_mail_transport_name "${name}" && [ "${proxied}" != "false" ]; then
    log_error "Denied: mail transport hostname cannot be proxied: ${name}"
    exit 1
  fi

  response="$(cf_get_records "${type}" "${name}")"
  count="$(printf '%s' "${response}" | jq '.result | length')"
  if [ "${count}" != "0" ]; then
    log_warn "Skip existing ${type} ${name}."
    continue
  fi

  log_info "Creating ${type} ${name}"
  cf_create_record "${type}" "${name}" "${content}" "${proxied}" "${priority:-}" >/dev/null
done < <(safe_dns_plan)

log_info "Bootstrap complete. Run cloudflare-dns-verify.sh and external mail tests."
