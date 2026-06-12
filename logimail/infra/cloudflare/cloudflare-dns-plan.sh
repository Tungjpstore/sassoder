#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/cloudflare-common.sh"

cf_require

log_info "Planning Cloudflare DNS for ${LOGIMAIL_DOMAIN}. No changes will be made."

while IFS=$'\t' read -r type name content proxied priority; do
  response="$(cf_get_records "${type}" "${name}")"
  count="$(printf '%s' "${response}" | jq '.result | length')"
  if [ "${count}" = "0" ]; then
    log_info "MISSING ${type} ${name} -> ${content} proxied=${proxied} priority=${priority:-n/a}"
  else
    log_warn "EXISTS ${type} ${name}; bootstrap will skip."
    printf '%s\n' "${response}" | jq -r '.result[] | "  id=\(.id) content=\(.content) proxied=\(.proxied // "n/a")"'
  fi
done < <(safe_dns_plan)

log_info "DKIM is not planned until DKIM_PUBLIC_KEY is supplied from BillionMail bm show-record/UI."
