#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch
require_command docker

POSTFIX_CONTAINER="${POSTFIX_CONTAINER:-billionmail-postfix-billionmail-1}"

if ! docker ps --format '{{.Names}}' | grep -q "^${POSTFIX_CONTAINER}$"; then
  log_error "Postfix container not running: ${POSTFIX_CONTAINER}"
  exit 1
fi

docker exec "${POSTFIX_CONTAINER}" postqueue -p || docker exec "${POSTFIX_CONTAINER}" mailq
