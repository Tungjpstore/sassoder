#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch
require_env LOGIMAIL_DOMAIN

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  "${SCRIPT_DIR}/../cloudflare/cloudflare-dns-verify.sh"
  exit 0
fi

if ! command -v dig >/dev/null 2>&1; then
  log_error "dig not found and Cloudflare env missing."
  exit 1
fi

dig +short "mail.${LOGIMAIL_DOMAIN}" A || true
dig +short "${LOGIMAIL_DOMAIN}" MX || true
dig +short "${LOGIMAIL_DOMAIN}" TXT || true
dig +short "_dmarc.${LOGIMAIL_DOMAIN}" TXT || true
