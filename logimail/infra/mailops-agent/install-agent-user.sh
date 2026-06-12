#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  log_error "Run as root or with sudo on the VPS."
  exit 1
fi

AGENT_USER="${LOGIMAIL_AGENT_USER:-mailagent}"
LOGIMAIL_INSTALL_ROOT="${LOGIMAIL_INSTALL_ROOT:-/opt/logimail}"

if id "${AGENT_USER}" >/dev/null 2>&1; then
  log_info "User ${AGENT_USER} already exists."
else
  confirm_or_exit "Create system user ${AGENT_USER}?"
  useradd --system --create-home --shell /bin/bash "${AGENT_USER}"
fi

mkdir -p /etc/logimail
chmod 750 /etc/logimail

log_warn "Review sudoers-mailagent and replace /opt/logimail if your install path differs: ${LOGIMAIL_INSTALL_ROOT}"
log_warn "Install manually with: visudo -cf sudoers-mailagent && cp sudoers-mailagent /etc/sudoers.d/logimail-mailagent && chmod 440 /etc/sudoers.d/logimail-mailagent"
