#!/usr/bin/env bash
set -euo pipefail

# Build immutable LogiMail releases, then atomically switch only symlinks.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

LOGIMAIL_RELEASE_ROOT="${LOGIMAIL_RELEASE_ROOT:-/opt/logimail/releases}"
LOGIMAIL_CURRENT_LINK="${LOGIMAIL_CURRENT_LINK:-/opt/logimail/current}"
LOGIMAIL_ROLLBACK_LINK="${LOGIMAIL_ROLLBACK_LINK:-/opt/logimail/rollback}"
LOGIMAIL_RELEASE_OWNER="${LOGIMAIL_RELEASE_OWNER:-logimail}"
LOGIMAIL_RELEASE_GROUP="${LOGIMAIL_RELEASE_GROUP:-logimail}"
LOGIMAIL_ENV_FILE="${LOGIMAIL_ENV_FILE:-/etc/logimail/logimail.env}"
LOGIMAIL_RELEASE_RESTART_SERVICES="${LOGIMAIL_RELEASE_RESTART_SERVICES:-0}"
LOGIMAIL_RELEASE_MAX_COUNT="${LOGIMAIL_RELEASE_MAX_COUNT:-20}"
LOGIMAIL_RELEASE_MIN_FREE_MB="${LOGIMAIL_RELEASE_MIN_FREE_MB:-4096}"

usage() {
  cat <<'EOF'
Usage:
  release-logimail.sh stage <source-directory> [release-id]
  release-logimail.sh activate <release-id>
  release-logimail.sh rollback
  release-logimail.sh status

stage builds an immutable artifact below /opt/logimail/releases. It never changes
the active release. activate and rollback only switch the current/rollback
symlinks; service restarts require LOGIMAIL_RELEASE_RESTART_SERVICES=1.
Staging refuses to run when LOGIMAIL_RELEASE_MAX_COUNT (default 20) or
LOGIMAIL_RELEASE_MIN_FREE_MB (default 4096) retention guards are exceeded.
EOF
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_error "This command must run as root so it can manage /opt/logimail symlinks."
    exit 1
  fi
}

validate_release_id() {
  local release_id="$1"
  if ! [[ "${release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$ ]]; then
    log_error "Invalid release id. Use 3-128 letters, digits, dots, underscores, or dashes."
    exit 1
  fi
}

path_inside_release_root() {
  local path="$1" root resolved
  root="$(cd "${LOGIMAIL_RELEASE_ROOT}" && pwd -P)"
  resolved="$(readlink -f "${path}")"
  [ "${resolved}" != "${root}" ] && [[ "${resolved}" == "${root}/"* ]]
}

release_count() {
  find "${LOGIMAIL_RELEASE_ROOT}" -mindepth 1 -maxdepth 1 -type d -print | wc -l | awk '{print $1}'
}

release_preflight() {
  local count available_kb min_free_mb
  if ! [[ "${LOGIMAIL_RELEASE_MAX_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
    log_error "LOGIMAIL_RELEASE_MAX_COUNT must be a positive integer."
    exit 1
  fi
  if ! [[ "${LOGIMAIL_RELEASE_MIN_FREE_MB}" =~ ^[0-9]+$ ]]; then
    log_error "LOGIMAIL_RELEASE_MIN_FREE_MB must be a non-negative integer."
    exit 1
  fi

  count="$(release_count)"
  if [ "${count}" -ge "${LOGIMAIL_RELEASE_MAX_COUNT}" ]; then
    log_error "Release retention guard reached: ${count} artifacts exist (max ${LOGIMAIL_RELEASE_MAX_COUNT}). Remove an old release explicitly before staging another."
    exit 1
  fi

  available_kb="$(df -Pk "${LOGIMAIL_RELEASE_ROOT}" | awk 'NR==2 {print $4}')"
  min_free_mb="${LOGIMAIL_RELEASE_MIN_FREE_MB}"
  if [ -z "${available_kb}" ] || [ "${available_kb}" -lt $((min_free_mb * 1024)) ]; then
    log_error "Release disk guard failed: less than ${min_free_mb} MiB is available below ${LOGIMAIL_RELEASE_ROOT}."
    exit 1
  fi
}

acquire_release_lock() {
  # Lock the release-root directory itself so an unprivileged user cannot
  # replace a predictable lock file with a symlink before a root deployment.
  if ! exec 9<"${LOGIMAIL_RELEASE_ROOT}"; then
    log_error "Cannot open release root for deployment locking: ${LOGIMAIL_RELEASE_ROOT}"
    exit 1
  fi
  if ! flock -n 9; then
    log_error "Another LogiMail release operation is already running."
    exit 1
  fi
}

release_path() {
  local release_id="$1"
  validate_release_id "${release_id}"
  printf '%s/%s' "${LOGIMAIL_RELEASE_ROOT}" "${release_id}"
}

atomic_link() {
  local target="$1" link="$2" temp_link
  temp_link="${link}.next.$$"
  rm -f -- "${temp_link}"
  ln -s "${target}" "${temp_link}"
  mv -Tf -- "${temp_link}" "${link}"
}

current_target() {
  if [ -L "${LOGIMAIL_CURRENT_LINK}" ] && path_inside_release_root "${LOGIMAIL_CURRENT_LINK}"; then
    readlink -f "${LOGIMAIL_CURRENT_LINK}"
  else
    return 1
  fi
}

restart_services_if_requested() {
  case "${LOGIMAIL_RELEASE_RESTART_SERVICES}" in
    1|true|yes|on)
      require_command systemctl
      systemctl restart logimail-api.service
      systemctl restart logimail-push-worker.service
      systemctl restart logimail-web.service
      systemctl --no-pager --full is-active logimail-api.service logimail-push-worker.service logimail-web.service
      ;;
    *)
      log_warn "Symlink switched; services were not restarted. Set LOGIMAIL_RELEASE_RESTART_SERVICES=1 after preflight."
      ;;
  esac
}

env_keyset_hash() {
  if [ -r "${LOGIMAIL_ENV_FILE}" ]; then
    awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' "${LOGIMAIL_ENV_FILE}" | LC_ALL=C sort -u | sha256sum | awk '{print $1}'
  else
    printf 'unavailable'
  fi
}

load_public_build_env() {
  local key value

  if [ -r "${LOGIMAIL_ENV_FILE}" ]; then
    while IFS='=' read -r key value; do
      case "${key}" in
        NEXT_PUBLIC_*) export "${key}=${value%$'\r'}" ;;
      esac
    done < "${LOGIMAIL_ENV_FILE}"
  fi

  require_env NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
}

migrations_hash() {
  local source_dir="$1"
  if [ -d "${source_dir}/supabase/migrations" ]; then
    # Hash relative paths so the manifest is stable regardless of the staging
    # directory used to build an otherwise identical source tree.
    (
      cd "${source_dir}"
      find supabase/migrations -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
    )
  else
    printf 'none'
  fi
}

write_manifest() {
  local source_dir="$1" destination="$2" release_id="$3" git_sha lock_hash
  git_sha="unknown"
  if git -C "${source_dir}" rev-parse --verify HEAD >/dev/null 2>&1; then
    git_sha="$(git -C "${source_dir}" rev-parse HEAD)"
  fi
  lock_hash="$(sha256sum "${destination}/package-lock.json" | awk '{print $1}')"

  {
    printf 'release_id=%s\n' "${release_id}"
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'source_git_sha=%s\n' "${git_sha}"
    printf 'node_version=%s\n' "$(node --version)"
    printf 'npm_version=%s\n' "$(npm --version)"
    printf 'package_lock_sha256=%s\n' "${lock_hash}"
    printf 'migrations_sha256=%s\n' "$(migrations_hash "${source_dir}")"
    # This records only environment variable names, never values or secrets.
    printf 'environment_keyset_sha256=%s\n' "$(env_keyset_hash)"
  } > "${destination}/RELEASE_MANIFEST.txt"
  chmod 0444 "${destination}/RELEASE_MANIFEST.txt"
}

stage_release() {
  local source_dir="$1" release_id="${2:-}" destination
  require_root
  require_command rsync npm node git sha256sum find xargs chmod chown ln df flock

  if [ ! -d "${source_dir}" ] || [ ! -f "${source_dir}/package-lock.json" ]; then
    log_error "Source directory must be a LogiMail checkout with package-lock.json: ${source_dir}"
    exit 1
  fi
  source_dir="$(cd "${source_dir}" && pwd -P)"
  mkdir -p "${LOGIMAIL_RELEASE_ROOT}"
  acquire_release_lock
  release_preflight
  if [ -z "${release_id}" ]; then
    release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "${source_dir}" rev-parse --short=12 HEAD 2>/dev/null || printf 'nogit')"
  fi
  validate_release_id "${release_id}"
  destination="$(release_path "${release_id}")"
  if [ -e "${destination}" ]; then
    log_error "Release already exists and is immutable: ${destination}"
    exit 1
  fi

  mkdir -p "${destination}"
  rsync -a --delete \
    --exclude '.git' --exclude '.env' --exclude '.env.*' --exclude 'node_modules' --exclude '.next' \
    --exclude 'coverage' --exclude 'tmp' --exclude '.DS_Store' --exclude '._*' --exclude '__MACOSX' \
    "${source_dir}/" "${destination}/"

  (
    cd "${destination}"
    # Browser Supabase configuration is compiled into the Next.js bundle.
    # Export only explicitly public values; server-only secrets stay unexported.
    load_public_build_env
    npm ci
    # npm may keep Next inside the web workspace while eslint-config-next is
    # hoisted. Expose the same package at the workspace root for release checks.
    if [ ! -e node_modules/next ] && [ -d apps/logimail-web/node_modules/next ]; then
      ln -s ../apps/logimail-web/node_modules/next node_modules/next
    fi
    npm run check
    npm --workspace @logivn/logimail-web run build
  )
  write_manifest "${source_dir}" "${destination}" "${release_id}"

  # A release becomes read-only only after every build artifact is present.
  chown -R "${LOGIMAIL_RELEASE_OWNER}:${LOGIMAIL_RELEASE_GROUP}" "${destination}"
  chmod -R a-w "${destination}"
  log_info "Immutable release staged: ${destination}"
  log_info "Manifest: ${destination}/RELEASE_MANIFEST.txt"
}

activate_release() {
  local release_id="$1" destination old_target
  require_root
  require_command flock
  acquire_release_lock
  destination="$(release_path "${release_id}")"
  if [ ! -f "${destination}/RELEASE_MANIFEST.txt" ] || ! path_inside_release_root "${destination}"; then
    log_error "Refusing to activate a release without a manifest inside ${LOGIMAIL_RELEASE_ROOT}."
    exit 1
  fi
  old_target="$(current_target || true)"
  if [ -n "${old_target}" ]; then
    atomic_link "${old_target}" "${LOGIMAIL_ROLLBACK_LINK}"
  fi
  atomic_link "${destination}" "${LOGIMAIL_CURRENT_LINK}"
  log_info "Current LogiMail release: ${destination}"
  restart_services_if_requested
}

rollback_release() {
  local rollback_target old_target
  require_root
  require_command flock
  acquire_release_lock
  if [ ! -L "${LOGIMAIL_ROLLBACK_LINK}" ] || ! path_inside_release_root "${LOGIMAIL_ROLLBACK_LINK}"; then
    log_error "No valid rollback release is available."
    exit 1
  fi
  rollback_target="$(readlink -f "${LOGIMAIL_ROLLBACK_LINK}")"
  old_target="$(current_target || true)"
  atomic_link "${rollback_target}" "${LOGIMAIL_CURRENT_LINK}"
  if [ -n "${old_target}" ]; then
    atomic_link "${old_target}" "${LOGIMAIL_ROLLBACK_LINK}"
  fi
  log_warn "Rolled back LogiMail to: ${rollback_target}"
  restart_services_if_requested
}

show_status() {
  printf 'release_root=%s\n' "${LOGIMAIL_RELEASE_ROOT}"
  printf 'current=%s\n' "$(current_target || printf '<none>')"
  if [ -L "${LOGIMAIL_ROLLBACK_LINK}" ] && path_inside_release_root "${LOGIMAIL_ROLLBACK_LINK}"; then
    printf 'rollback=%s\n' "$(readlink -f "${LOGIMAIL_ROLLBACK_LINK}")"
  else
    printf 'rollback=<none>\n'
  fi
}

case "${1:-}" in
  stage) [ "$#" -ge 2 ] || { usage; exit 1; }; stage_release "$2" "${3:-}" ;;
  activate) [ "$#" -eq 2 ] || { usage; exit 1; }; activate_release "$2" ;;
  rollback) [ "$#" -eq 1 ] || { usage; exit 1; }; rollback_release ;;
  status) [ "$#" -eq 1 ] || { usage; exit 1; }; show_status ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
