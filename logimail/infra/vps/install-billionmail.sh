#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/../lib/common.sh"

require_env LOGIMAIL_DOMAIN LOGIMAIL_MAIL_HOSTNAME
require_command git docker

random_alnum() {
  local length="$1"
  LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom 2>/dev/null | head -c "${length}" || true
}

BILLIONMAIL_REPO_URL="${BILLIONMAIL_REPO_URL:-https://github.com/Billionmail/BillionMail.git}"
BILLIONMAIL_BRANCH="${BILLIONMAIL_BRANCH:-dev}"
BILLIONMAIL_INSTALL_DIR="${BILLIONMAIL_INSTALL_DIR:-/opt/BillionMail}"
ADMIN_USERNAME="${BILLIONMAIL_ADMIN_USERNAME:-logimailadmin}"
SAFE_PATH="${BILLIONMAIL_SAFE_PATH:-$(random_alnum 16)}"
BILLIONMAIL_HTTP_PORT="${BILLIONMAIL_HTTP_PORT:-8081}"
BILLIONMAIL_HTTPS_PORT="${BILLIONMAIL_HTTPS_PORT:-8443}"
BILLIONMAIL_SQL_PORT="${BILLIONMAIL_SQL_PORT:-127.0.0.1:25432}"
BILLIONMAIL_REDIS_PORT="${BILLIONMAIL_REDIS_PORT:-127.0.0.1:26379}"

if ! printf '%s' "${SAFE_PATH}" | grep -qE '^[A-Za-z0-9]{5,64}$'; then
  log_error "BILLIONMAIL_SAFE_PATH must be alphanumeric and 5-64 characters."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  log_error "Run as root or with sudo on the VPS."
  exit 1
fi

if [ -d "${BILLIONMAIL_INSTALL_DIR}" ]; then
  log_warn "${BILLIONMAIL_INSTALL_DIR} already exists. No overwrite."
else
  confirm_or_exit "Clone BillionMail ${BILLIONMAIL_BRANCH} into ${BILLIONMAIL_INSTALL_DIR}?"
  git clone --depth 1 --branch "${BILLIONMAIL_BRANCH}" "${BILLIONMAIL_REPO_URL}" "${BILLIONMAIL_INSTALL_DIR}"
fi

cd "${BILLIONMAIL_INSTALL_DIR}"

if [ ! -f .env ]; then
  cp env_init .env
  chmod 600 .env
else
  log_warn ".env already exists. Existing file preserved."
fi

if [ -z "${BILLIONMAIL_ADMIN_PASSWORD:-}" ]; then
  BILLIONMAIL_ADMIN_PASSWORD="$(random_alnum 24)"
  log_warn "Generated admin password. Save it from /root/logimail-billionmail-admin.txt on the VPS."
fi

sed -i.bak \
  -e "s|^ADMIN_USERNAME=.*|ADMIN_USERNAME=${ADMIN_USERNAME}|" \
  -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${BILLIONMAIL_ADMIN_PASSWORD}|" \
  -e "s|^SafePath=.*|SafePath=${SAFE_PATH}|" \
  -e "s|^BILLIONMAIL_HOSTNAME=.*|BILLIONMAIL_HOSTNAME=${LOGIMAIL_MAIL_HOSTNAME}|" \
  -e "s|^HTTP_PORT=.*|HTTP_PORT=${BILLIONMAIL_HTTP_PORT}|" \
  -e "s|^HTTPS_PORT=.*|HTTPS_PORT=${BILLIONMAIL_HTTPS_PORT}|" \
  -e "s|^SQL_PORT=.*|SQL_PORT=${BILLIONMAIL_SQL_PORT}|" \
  -e "s|^REDIS_PORT=.*|REDIS_PORT=${BILLIONMAIL_REDIS_PORT}|" \
  -e "s|^TZ=.*|TZ=${LOGIMAIL_TIMEZONE:-Asia/Ho_Chi_Minh}|" \
  .env

if grep -q '^reverse_proxy_domain=' .env; then
  sed -i.bak -e "s|^reverse_proxy_domain=.*|reverse_proxy_domain=https://${LOGIMAIL_MAIL_HOSTNAME}|" .env
else
  printf 'reverse_proxy_domain=https://%s\n' "${LOGIMAIL_MAIL_HOSTNAME}" >> .env
fi

# In the shared LogiVN VPS layout, public 80/443 stay owned by the existing
# Nginx entrypoint. Keep BillionMail web/admin ports reachable only from
# localhost; SMTP/IMAP ports remain public mail transport ports.
cp docker-compose.yml docker-compose.yml.logimail.bak
sed -i \
  -e 's|"${HTTP_PORT:-80}:${HTTP_PORT:-80}"|"127.0.0.1:${HTTP_PORT:-80}:${HTTP_PORT:-80}"|' \
  -e 's|"${HTTPS_PORT:-443}:${HTTPS_PORT:-443}"|"127.0.0.1:${HTTPS_PORT:-443}:${HTTPS_PORT:-443}"|' \
  docker-compose.yml

cat > /root/logimail-billionmail-admin.txt <<EOF
BillionMail internal HTTP URL: http://127.0.0.1:${BILLIONMAIL_HTTP_PORT}/${SAFE_PATH}
BillionMail internal HTTPS URL: https://127.0.0.1:${BILLIONMAIL_HTTPS_PORT}/${SAFE_PATH}
Public LogiMail dashboard: https://${LOGIMAIL_MAIL_HOSTNAME}/dashboard
Public RoundCube path after Nginx: https://${LOGIMAIL_MAIL_HOSTNAME}/roundcube/
Username: ${ADMIN_USERNAME}
Password: ${BILLIONMAIL_ADMIN_PASSWORD}
Install dir: ${BILLIONMAIL_INSTALL_DIR}
HTTP_PORT: ${BILLIONMAIL_HTTP_PORT}
HTTPS_PORT: ${BILLIONMAIL_HTTPS_PORT}
EOF
chmod 600 /root/logimail-billionmail-admin.txt

DOCKER_COMPOSE="$(compose_cmd)"
confirm_or_exit "Start BillionMail containers with ${DOCKER_COMPOSE}?"
${DOCKER_COMPOSE} up -d

log_info "BillionMail started. Run: cd ${BILLIONMAIL_INSTALL_DIR} && bash bm.sh default"
log_info "RoundCube path from upstream compose: /roundcube/"
log_warn "On the shared LogiVN VPS, keep BillionMail admin internal or expose the exact SafePath only after adding a protected Nginx route."
