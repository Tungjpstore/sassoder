#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch

BILLIONMAIL_INSTALL_DIR="${BILLIONMAIL_INSTALL_DIR:-/opt/BillionMail}"

log_info "Disk"
df -h /

if command -v free >/dev/null 2>&1; then
  log_info "Memory"
  free -h
fi

if command -v docker >/dev/null 2>&1 && [ -d "${BILLIONMAIL_INSTALL_DIR}" ]; then
  cd "${BILLIONMAIL_INSTALL_DIR}"
  DOCKER_COMPOSE="$(compose_cmd)"
  ${DOCKER_COMPOSE} ps
else
  log_warn "Docker or BillionMail directory not available."
fi

for port in 25 465 587 143 993 80 443; do
  if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -qE ":${port}$"; then
    log_info "Port ${port} listening"
  else
    log_warn "Port ${port} not listening locally"
  fi
done
