#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

require_env LOGIMAIL_RESTORE_ARCHIVE
require_command tar sha256sum mktemp

if [ ! -f "${LOGIMAIL_RESTORE_ARCHIVE}" ]; then
  log_error "Archive not found: ${LOGIMAIL_RESTORE_ARCHIVE}"
  exit 1
fi

TMP_DIR=""

cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

checksum_file_for() {
  local archive_path="$1"
  if [ -n "${LOGIMAIL_RESTORE_CHECKSUM:-}" ]; then
    printf '%s' "${LOGIMAIL_RESTORE_CHECKSUM}"
  else
    printf '%s.sha256' "${archive_path}"
  fi
}

verify_checksum_for_file() {
  local archive_path="$1"
  local checksum_path="$2"
  local expected_hash actual_hash

  if [ ! -f "${checksum_path}" ]; then
    log_warn "No checksum file found for ${archive_path}."
    return 0
  fi

  read -r expected_hash _ < "${checksum_path}"
  actual_hash="$(sha256sum "${archive_path}")"
  actual_hash="${actual_hash%% *}"

  if [ -z "${expected_hash}" ] || [ "${expected_hash}" != "${actual_hash}" ]; then
    log_error "Checksum mismatch: ${archive_path}"
    exit 1
  fi

  log_info "Checksum verified: ${checksum_path}"
}

is_encrypted_archive() {
  case "${LOGIMAIL_RESTORE_ARCHIVE}" in
    *.enc) return 0 ;;
  esac

  case "${LOGIMAIL_RESTORE_ENCRYPTED:-}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

list_archive_contents() {
  local archive_path="$1"
  log_info "Listing archive contents only. No restore writes will happen."
  tar -tzf "${archive_path}" | sed -n '1,200p'
}

verify_decrypted_plain_checksum() {
  local decrypted_path="$1"
  local plain_checksum_path="${LOGIMAIL_RESTORE_PLAIN_CHECKSUM:-${LOGIMAIL_RESTORE_ARCHIVE%.enc}.sha256}"

  if [ -f "${plain_checksum_path}" ]; then
    verify_checksum_for_file "${decrypted_path}" "${plain_checksum_path}"
  else
    log_warn "No decrypted tar checksum found. Set LOGIMAIL_RESTORE_PLAIN_CHECKSUM to verify the inner archive."
  fi
}

if is_encrypted_archive; then
  require_env LOGIMAIL_BACKUP_ENCRYPTION_KEY
  require_command openssl

  verify_checksum_for_file "${LOGIMAIL_RESTORE_ARCHIVE}" "$(checksum_file_for "${LOGIMAIL_RESTORE_ARCHIVE}")"

  TMP_DIR="$(mktemp -d)"
  DECRYPTED_ARCHIVE="${TMP_DIR}/logimail-restore.tar.gz"

  log_info "Encrypted archive detected. Decrypting to temporary dry-run path."
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass env:LOGIMAIL_BACKUP_ENCRYPTION_KEY \
    -in "${LOGIMAIL_RESTORE_ARCHIVE}" \
    -out "${DECRYPTED_ARCHIVE}"

  chmod 600 "${DECRYPTED_ARCHIVE}"
  verify_decrypted_plain_checksum "${DECRYPTED_ARCHIVE}"
  list_archive_contents "${DECRYPTED_ARCHIVE}"
  exit 0
fi

verify_checksum_for_file "${LOGIMAIL_RESTORE_ARCHIVE}" "$(checksum_file_for "${LOGIMAIL_RESTORE_ARCHIVE}")"
list_archive_contents "${LOGIMAIL_RESTORE_ARCHIVE}"
