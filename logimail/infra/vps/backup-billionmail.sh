#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

check_kill_switch
require_command tar sha256sum date flock

BILLIONMAIL_INSTALL_DIR="${BILLIONMAIL_INSTALL_DIR:-/opt/BillionMail}"
LOGIMAIL_BACKUP_DIR="${LOGIMAIL_BACKUP_DIR:-/var/backups/logimail}"
LOGIMAIL_BACKUP_REMOTE="${LOGIMAIL_BACKUP_REMOTE:-disabled}"
LOGIMAIL_ENV="${LOGIMAIL_ENV:-prod}"
LOGIMAIL_BACKUP_RETENTION_DAYS="${LOGIMAIL_BACKUP_RETENTION_DAYS:-14}"
BACKUP_STORAGE_ADAPTER="${BACKUP_STORAGE_ADAPTER:-worker}"
BACKUP_R2_PREFIX="${BACKUP_R2_PREFIX:-logimail}"
BACKUP_R2_GATEWAY_URL="${BACKUP_R2_GATEWAY_URL:-}"
BACKUP_R2_GATEWAY_TOKEN="${BACKUP_R2_GATEWAY_TOKEN:-}"
BACKUP_NAME="billionmail-$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="${LOGIMAIL_BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
MANIFEST_PATH="${LOGIMAIL_BACKUP_DIR}/${BACKUP_NAME}.manifest.txt"
PARTIAL_BACKUP_PATH="${BACKUP_PATH}.partial.$$"

if ! [[ "${LOGIMAIL_BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
  log_error "LOGIMAIL_BACKUP_RETENTION_DAYS must be a non-negative integer."
  exit 1
fi

cleanup_partial_backup() {
  rm -f -- "${PARTIAL_BACKUP_PATH}"
}

prune_expired_backups() {
  local archive base

  # Only touch the complete, date-named artifacts owned by this backup routine.
  while IFS= read -r -d '' archive; do
    base="${archive%.tar.gz}"
    log_info "Removing expired local backup: ${archive}"
    rm -f -- \
      "${archive}" \
      "${archive}.sha256" \
      "${archive}.enc" \
      "${archive}.enc.sha256" \
      "${base}.manifest.txt"
  done < <(find "${LOGIMAIL_BACKUP_DIR}" -maxdepth 1 -type f -name 'billionmail-[0-9]*.tar.gz' -mtime "+${LOGIMAIL_BACKUP_RETENTION_DAYS}" -print0)
}

remote_enabled() {
  case "${LOGIMAIL_BACKUP_REMOTE}" in
    r2|r2-gateway|r2_gateway|worker|enabled|true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

gateway_put_object() {
  local object_key="$1"
  local file_path="$2"
  local content_type="${3:-application/octet-stream}"
  curl -fsS -X PUT "${BACKUP_R2_GATEWAY_URL%/}/objects/${object_key}" \
    -H "Authorization: Bearer ${BACKUP_R2_GATEWAY_TOKEN}" \
    -H "Content-Type: ${content_type}" \
    --data-binary "@${file_path}" >/dev/null
}

upload_encrypted_remote() {
  if ! remote_enabled; then
    log_warn "Remote backup disabled. Local backup only."
    return 0
  fi

  if [ "${BACKUP_STORAGE_ADAPTER}" != "worker" ]; then
    log_error "Only BACKUP_STORAGE_ADAPTER=worker is supported for LogiMail remote backup."
    exit 1
  fi

  require_env LOGIMAIL_BACKUP_ENCRYPTION_KEY BACKUP_R2_GATEWAY_URL BACKUP_R2_GATEWAY_TOKEN
  require_command openssl curl

  local encrypted_path="${BACKUP_PATH}.enc"
  local encrypted_sha_path="${encrypted_path}.sha256"
  local object_prefix object_key manifest_key sha_key

  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
    -pass env:LOGIMAIL_BACKUP_ENCRYPTION_KEY \
    -in "${BACKUP_PATH}" \
    -out "${encrypted_path}"

  sha256sum "${encrypted_path}" > "${encrypted_sha_path}"
  chmod 600 "${encrypted_path}" "${encrypted_sha_path}"

  object_prefix="${BACKUP_R2_PREFIX%/}/${LOGIMAIL_ENV}/billionmail"
  object_key="${object_prefix}/${BACKUP_NAME}.tar.gz.enc"
  manifest_key="${object_key}.manifest.txt"
  sha_key="${object_key}.sha256"

  log_info "Uploading encrypted backup to R2 gateway: ${object_key}"
  gateway_put_object "${object_key}" "${encrypted_path}" "application/octet-stream"
  gateway_put_object "${manifest_key}" "${MANIFEST_PATH}" "text/plain"
  gateway_put_object "${sha_key}" "${encrypted_sha_path}" "text/plain"
  log_info "Encrypted remote backup uploaded."
}

if [ "$(id -u)" -ne 0 ]; then
  log_error "Run as root or with sudo so backup can read mail volumes."
  exit 1
fi

mkdir -p "${LOGIMAIL_BACKUP_DIR}"
chmod 700 "${LOGIMAIL_BACKUP_DIR}"

# A timer retry must never race another backup and prune its sidecar files.
exec 9>"${LOGIMAIL_BACKUP_DIR}/.billionmail-backup.lock"
if ! flock -n 9; then
  log_error "Another BillionMail backup is already running."
  exit 1
fi
trap cleanup_partial_backup EXIT

if [ ! -d "${BILLIONMAIL_INSTALL_DIR}" ]; then
  log_error "BillionMail install dir not found: ${BILLIONMAIL_INSTALL_DIR}"
  exit 1
fi

components=(
  .env
  docker-compose.yml
  postgresql-data
  redis-data
  rspamd-data
  vmail-data
  postfix-data
  webmail-data
  core-data
  ssl
  ssl-self-signed
  conf
  logs
)
include_args=()

for component in "${components[@]}"; do
  if [ -e "${BILLIONMAIL_INSTALL_DIR}/${component}" ]; then
    include_args+=("${component}")
  else
    log_warn "Backup component missing, skipped: ${component}"
  fi
done

if [ "${#include_args[@]}" -eq 0 ]; then
  log_error "No BillionMail backup components found."
  exit 1
fi

tar --warning=no-file-changed --ignore-failed-read -czf "${PARTIAL_BACKUP_PATH}" \
  -C "${BILLIONMAIL_INSTALL_DIR}" \
  "${include_args[@]}"

# Detect a damaged or half-written gzip before publishing an artifact name.
tar -tzf "${PARTIAL_BACKUP_PATH}" >/dev/null
mv -f -- "${PARTIAL_BACKUP_PATH}" "${BACKUP_PATH}"
sha256sum "${BACKUP_PATH}" > "${BACKUP_PATH}.sha256"

{
  printf 'name=%s\n' "${BACKUP_NAME}"
  printf 'install_dir=%s\n' "${BILLIONMAIL_INSTALL_DIR}"
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'archive=%s\n' "$(basename "${BACKUP_PATH}")"
  printf 'archive_sha256=%s\n' "$(cut -d ' ' -f 1 "${BACKUP_PATH}.sha256")"
  printf 'retention_days=%s\n' "${LOGIMAIL_BACKUP_RETENTION_DAYS}"
  printf 'components=\n'
  printf '%s\n' "${include_args[@]}"
} > "${MANIFEST_PATH}"
chmod 600 "${BACKUP_PATH}" "${BACKUP_PATH}.sha256" "${MANIFEST_PATH}"

log_info "Backup created: ${BACKUP_PATH}"
log_info "Manifest created: ${MANIFEST_PATH}"
upload_encrypted_remote
prune_expired_backups
log_warn "Restore requires the matching LOGIMAIL_BACKUP_ENCRYPTION_KEY. Keep it outside the R2 bucket."
