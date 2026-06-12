#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

require_env LOGIMAIL_MAIL_HOSTNAME
require_command docker

BILLIONMAIL_INSTALL_DIR="${BILLIONMAIL_INSTALL_DIR:-/opt/BillionMail}"
cd "${BILLIONMAIL_INSTALL_DIR}"

DOCKER_COMPOSE="$(compose_cmd)"
${DOCKER_COMPOSE} ps

for service in postfix-billionmail dovecot-billionmail rspamd-billionmail pgsql-billionmail redis-billionmail webmail-billionmail core-billionmail; do
  if ${DOCKER_COMPOSE} ps --services --filter status=running | grep -q "^${service}$"; then
    log_info "${service} running"
  else
    log_warn "${service} is not reported as running"
  fi
done

if command -v openssl >/dev/null 2>&1; then
  log_info "Testing IMAPS TLS handshake for ${LOGIMAIL_MAIL_HOSTNAME}:993"
  timeout 8 openssl s_client -connect "${LOGIMAIL_MAIL_HOSTNAME}:993" -servername "${LOGIMAIL_MAIL_HOSTNAME}" </dev/null >/dev/null 2>&1 || log_warn "IMAPS TLS handshake failed or timed out."
fi

log_info "Run bm default and bm show-record inside ${BILLIONMAIL_INSTALL_DIR} for upstream details."
