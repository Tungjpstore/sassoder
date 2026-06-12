#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

require_env LOGIMAIL_DOMAIN LOGIMAIL_MAIL_HOSTNAME LOGIMAIL_VPS_IP

LOGIMAIL_DEPLOYMENT_MODE="${LOGIMAIL_DEPLOYMENT_MODE:-shared-logivn-vps}"
LOGIMAIL_WEB_PORT="${LOGIMAIL_WEB_PORT:-3000}"
LOGIMAIL_API_PORT="${LOGIMAIL_API_PORT:-8787}"
BILLIONMAIL_HTTP_PORT="${BILLIONMAIL_HTTP_PORT:-8081}"
BILLIONMAIL_HTTPS_PORT="${BILLIONMAIL_HTTPS_PORT:-8443}"
BILLIONMAIL_SQL_PORT="${BILLIONMAIL_SQL_PORT:-25432}"
BILLIONMAIL_REDIS_PORT="${BILLIONMAIL_REDIS_PORT:-26379}"

log_info "LogiMail VPS precheck for ${LOGIMAIL_MAIL_HOSTNAME}"
log_info "Architecture: $(uname -m)"
log_info "Kernel: $(uname -sr)"

if [ "$(getconf LONG_BIT)" != "64" ]; then
  log_error "BillionMail requires a 64-bit system."
  exit 1
fi

case "$(uname -m)" in
  x86_64|aarch64) log_info "CPU architecture supported by BillionMail installer." ;;
  *) log_warn "BillionMail installer supports x86_64/aarch64; verify manually before install." ;;
esac

if command -v free >/dev/null 2>&1; then
  free -h
fi

df -h /

port_is_listening() {
  local port="$1"
  command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -qE ":${port}$"
}

check_free_port() {
  local port="$1"
  local label="$2"
  if port_is_listening "${port}"; then
    log_warn "Port ${port} is already listening: ${label}."
  else
    log_info "Port ${port} appears free locally: ${label}."
  fi
}

for port in 25 465 587 110 143 993 995; do
  check_free_port "${port}" "BillionMail SMTP/IMAP/POP transport"
done

if [ "${LOGIMAIL_DEPLOYMENT_MODE}" = "shared-logivn-vps" ]; then
  log_info "Shared LogiVN VPS mode: ports 80/443 may already belong to the existing Nginx TLS entrypoint."
else
  check_free_port 80 "BillionMail or public reverse proxy HTTP"
  check_free_port 443 "BillionMail or public reverse proxy HTTPS"
fi

check_free_port "${LOGIMAIL_WEB_PORT}" "LogiMail PWA upstream"
check_free_port "${LOGIMAIL_API_PORT}" "LogiMail API upstream"
check_free_port "${BILLIONMAIL_HTTP_PORT}" "BillionMail HTTP upstream for Nginx /roundcube/"
check_free_port "${BILLIONMAIL_HTTPS_PORT}" "BillionMail internal HTTPS/admin upstream"
check_free_port "${BILLIONMAIL_SQL_PORT##*:}" "BillionMail Postgres loopback"
check_free_port "${BILLIONMAIL_REDIS_PORT##*:}" "BillionMail Redis loopback"

if command -v docker >/dev/null 2>&1; then
  log_info "Docker found: $(docker --version)"
else
  log_warn "Docker not found. Run install-docker.sh after reviewing it."
fi

if command -v dig >/dev/null 2>&1; then
  log_info "Current A ${LOGIMAIL_MAIL_HOSTNAME}: $(dig +short "${LOGIMAIL_MAIL_HOSTNAME}" A | tr '\n' ' ')"
else
  log_warn "dig not found; DNS checks will be limited."
fi

log_info "Manual checks still required: provider outbound port 25, PTR/rDNS, security group."
log_info "Current public VPS target expected for LogiVN VPS hosts: ${LOGIMAIL_VPS_IP}"
