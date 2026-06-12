#!/usr/bin/env bash
set -euo pipefail

log_info() {
  printf '[INFO] %s\n' "$*"
}

log_warn() {
  printf '[WARN] %s\n' "$*" >&2
}

log_error() {
  printf '[ERROR] %s\n' "$*" >&2
}

require_env() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      log_error "Missing required env: ${name}"
      exit 1
    fi
  done
}

require_command() {
  local name
  for name in "$@"; do
    if ! command -v "${name}" >/dev/null 2>&1; then
      log_error "Missing required command: ${name}"
      exit 1
    fi
  done
}

confirm_or_exit() {
  local prompt="${1:-Confirm?}"
  if [ "${LOGIMAIL_ASSUME_YES:-}" = "1" ]; then
    log_warn "LOGIMAIL_ASSUME_YES=1, confirmation bypassed: ${prompt}"
    return 0
  fi
  printf '%s [y/N] ' "${prompt}"
  read -r answer
  case "${answer}" in
    y|Y|yes|YES) return 0 ;;
    *) log_warn "Cancelled."; exit 1 ;;
  esac
}

check_kill_switch() {
  local kill_switch="${LOGIMAIL_AGENT_KILL_SWITCH:-/etc/logimail/agent-disabled}"
  if [ -f "${kill_switch}" ]; then
    log_error "MailOps kill switch is active: ${kill_switch}"
    exit 2
  fi
}

compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    printf 'docker-compose'
  elif docker compose version >/dev/null 2>&1; then
    printf 'docker compose'
  else
    log_error "Docker Compose is not available."
    exit 1
  fi
}

redact() {
  local value="${1:-}"
  if [ -z "${value}" ]; then
    printf '<empty>'
  else
    printf '<redacted:%s>' "${#value}"
  fi
}
