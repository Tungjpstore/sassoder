#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  log_error "Run as root or with sudo on the VPS."
  exit 1
fi

SSH_PORT="${SSH_PORT:-22}"
PORTS=("${SSH_PORT}" 25 465 587 110 143 993 995 80 443)

confirm_or_exit "Apply firewall allowlist for SSH and BillionMail mail/web ports?"

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${SSH_PORT}/tcp"
  for port in 25 465 587 110 143 993 995 80 443; do
    ufw allow "${port}/tcp"
  done
  ufw default deny incoming
  ufw --force enable
  ufw reload
elif command -v firewall-cmd >/dev/null 2>&1; then
  systemctl enable firewalld
  systemctl start firewalld
  for port in "${PORTS[@]}"; do
    firewall-cmd --permanent --zone=public --add-port="${port}/tcp"
  done
  firewall-cmd --reload
else
  log_error "Neither ufw nor firewall-cmd found. Configure provider firewall manually."
  exit 1
fi

log_info "Firewall updated. Verify provider security group separately."
