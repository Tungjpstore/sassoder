#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch
require_command docker

SERVICE="${1:-}"
BILLIONMAIL_INSTALL_DIR="${BILLIONMAIL_INSTALL_DIR:-/opt/BillionMail}"

case "${SERVICE}" in
  postfix|dovecot|rspamd|webmail|core) ;;
  *) log_error "Usage: $0 postfix|dovecot|rspamd|webmail|core"; exit 1 ;;
esac

cd "${BILLIONMAIL_INSTALL_DIR}"
DOCKER_COMPOSE="$(compose_cmd)"
COMPOSE_SERVICE="${SERVICE}-billionmail"

confirm_or_exit "Restart BillionMail service ${COMPOSE_SERVICE}?"
${DOCKER_COMPOSE} restart "${COMPOSE_SERVICE}"
${DOCKER_COMPOSE} ps "${COMPOSE_SERVICE}"
